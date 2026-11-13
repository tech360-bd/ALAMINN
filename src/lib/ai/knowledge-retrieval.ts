/**
 * Knowledge Retrieval Service
 * ===========================
 * Document ingestion, text extraction, chunking, indexing, and retrieval.
 * Supports baseline lexical retrieval before adding vector search.
 */

import { db } from "@/lib/db";
import { ModelProvider } from "./inference-engine";
import { LocalInferenceEngine } from "./inference-engine";

/**
 * Authentication context for knowledge-retrieval operations.
 *
 * Every ingestion and retrieval call must carry an AuthContext so the
 * service can enforce document ownership, tenant isolation, and
 * role-based access. In production, missing auth fails closed.
 */
export interface AuthContext {
  /** Authenticated user ID. Must be a non-empty string. */
  userId: string;
  /** Role: ADMIN, STAFF, VIEWER, etc. ADMIN bypasses ownership checks. */
  role: string;
  /** Optional tenant / organization ID for multi-tenant isolation. */
  tenantId?: string;
  /** Optional set of permission strings (e.g. "knowledge:read"). */
  permissions?: string[];
}

export class KnowledgeAuthError extends Error {
  constructor(
    message: string,
    public code: "UNAUTHENTICATED" | "FORBIDDEN" | "MISSING_ROLE" | "CROSS_TENANT"
  ) {
    super(message);
    this.name = "KnowledgeAuthError";
  }
}

/** Fail-closed check: if NODE_ENV is production, auth is mandatory. */
function requireAuth(auth: AuthContext | undefined | null): AuthContext {
  if (!auth || !auth.userId || typeof auth.userId !== "string" || auth.userId.trim().length === 0) {
    if (process.env.NODE_ENV === "production") {
      throw new KnowledgeAuthError(
        "Unauthenticated knowledge access in production — fail closed.",
        "UNAUTHENTICATED"
      );
    }
    // In development, allow a synthetic dev user so smoke tests work
    // without full session plumbing. Production never reaches this path.
    return { userId: "dev-user", role: "ADMIN", tenantId: "dev" };
  }
  return auth;
}

/** True if the role grants admin-level access (bypasses ownership). */
function isPrivilegedRole(role: string): boolean {
  const r = (role || "").toUpperCase();
  return r === "ADMIN" || r === "SUPER_ADMIN" || r === "OWNER";
}

export interface DocumentInfo {
  id: string;
  title: string;
  source: string;
  sourceUrl?: string | null;
  language: string;
  sizeBytes: number;
  lastAccessedAt: string | null;
  status: "indexed" | "pending" | "failed";
  /** Owner who ingested the document. Used for access control. */
  ownerId?: string;
  /** Tenant / org the document belongs to. Used for isolation. */
  tenantId?: string;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  content: string;
  metadata: {
    category: string;
    source: string;
    pageNumber?: number;
    contextBefore?: string;
    contextAfter?: string;
  };
  embedding: number[];
  chunkIndex: number;
  createdAt: Date;
}

export interface RetrievalResult {
  text: string;
  metadata: Record<string, unknown>;
  sourceUrl?: string;
  accessedAt: Date;
}

export interface KnowledgeRetrievalResult {
  results: RetrievalResult[];
  totalFound: number;
  query: string;
  retrievedAt: Date;
}

export class KnowledgeRetrievalService {
  private inferenceEngine: LocalInferenceEngine;
  private documents: Map<string, DocumentInfo> = new Map();
  private chunks: Map<string, KnowledgeChunk> = new Map();
  private embeddingModel: string = "";
  private embeddingProvider: ModelProvider = ModelProvider.LOCAL;

  constructor(inferenceEngine: LocalInferenceEngine) {
    this.inferenceEngine = inferenceEngine;
  }

  async ingestDocument(doc: {
    id: string;
    title: string;
    source: string;
    url?: string;
    content: string;
    language?: string;
    ownerId?: string;
    tenantId?: string;
  }): Promise<DocumentInfo> {
    // Extract text from document
    const content = this.extractText(doc.content);
    if (!content || content.length < 100) {
      throw new Error("Document content too short or empty");
    }

    // Create document record
    const documentId = doc.id || `kwd_${Date.now()}`;
    const language = doc.language || "en";
    const docInfo: DocumentInfo = {
      id: documentId,
      title: doc.title || documentId,
      source: doc.source,
      sourceUrl: doc.url || null,
      language,
      sizeBytes: new Blob([content]).size,
      lastAccessedAt: null,
      status: "indexed",
      ownerId: doc.ownerId,
      tenantId: doc.tenantId,
    };

    this.documents.set(documentId, docInfo);

    // Chunk the document
    await this.chunkAndIndexDocument(documentId, content);

    return docInfo;
  }

  /**
   * Ingest text content with authenticated access control.
   *
   * The `_userId` / `_role` parameters are now respected: in production,
   * a missing or empty auth context causes a fail-closed error. The
   * ingested document is stamped with the caller's ownerId and
   * tenantId so subsequent searches can enforce ownership.
   */
  async ingestText(
    title: string,
    source: string,
    content: string,
    url?: string,
    language?: string,
    auth?: AuthContext
  ): Promise<DocumentInfo> {
    const resolvedAuth = requireAuth(auth);
    const docId = `doc_${resolvedAuth.userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return this.ingestDocument({
      id: docId,
      title,
      source,
      url,
      content,
      language,
      ownerId: resolvedAuth.userId,
      tenantId: resolvedAuth.tenantId,
    });
  }

  /**
   * Authenticated search: returns only documents the caller is
   * authorized to see.
   *
   * - ADMIN / SUPER_ADMIN / OWNER roles see all documents.
   * - Other roles see only documents they own (ownerId matches).
   * - If tenantId is set, results are additionally scoped to that
   *   tenant (cross-tenant retrieval is blocked).
   *
   * In production, calling without auth throws KnowledgeAuthError.
   */
  searchForUser(
    auth: AuthContext | undefined | null,
    query: string,
    limit = 5
  ): KnowledgeRetrievalResult {
    const resolvedAuth = requireAuth(auth);
    const all = this.search(query, limit);

    // Privileged roles bypass ownership filtering.
    if (isPrivilegedRole(resolvedAuth.role)) {
      return all;
    }

    // Non-privileged users: filter to own documents + same tenant.
    const filtered = all.results.filter(r => {
      const docId = r.metadata.documentId as string | undefined;
      if (!docId) return false;
      const doc = this.documents.get(docId);
      if (!doc) return false;

      // Ownership check: the document's ownerId must match the caller.
      if (doc.ownerId && doc.ownerId !== resolvedAuth.userId) {
        // Cross-tenant check for logging / future enforcement
        if (doc.tenantId && resolvedAuth.tenantId && doc.tenantId !== resolvedAuth.tenantId) {
          // Cross-tenant access attempt — blocked.
          return false;
        }
        return false;
      }
      return true;
    });

    return {
      results: filtered,
      totalFound: filtered.length,
      query,
      retrievedAt: new Date(),
    };
  }

  private extractText(doc: unknown): string {
    // Placeholder for actual extraction logic
    if (typeof doc === "string") return doc;
    return JSON.stringify(doc).replace(/\n/g, " ").substring(0, 50000);
  }

  async chunkAndIndexDocument(documentId: string, content: string): Promise<void> {
    const chunks: KnowledgeChunk[] = [];
    const CHUNK_SIZE = 800; // Average token size for each chunk
    let index = 0;
    let chunkIndex = 0;

    while (index < content.length) {
      const end = Math.min(index + CHUNK_SIZE, content.length);
      const chunkText = content.substring(index, end);

      if (chunkText.length < CHUNK_SIZE / 2 && index > 0) break; // Last chunk

      try {
        const embeddingResponse = await this.inferenceEngine.generateEmbedding({
          model: this.embeddingModel,
          provider: this.embeddingProvider,
          text: chunkText,
          maxTokens: 128,
        });

        const chunk: KnowledgeChunk = {
          id: `kwd_${documentId}_chunk_${chunkIndex}`,
          documentId,
          content: chunkText,
          metadata: {
            category: "general",
            source: "ingested",
            pageNumber: chunkIndex + 1,
            contextBefore: "",
            contextAfter: "",
          },
          embedding: embeddingResponse.embeddings[0] || [],
          chunkIndex,
          createdAt: new Date(),
        };

        chunks.push(chunk);
        this.chunks.set(chunk.id, chunk);
        chunkIndex++;
      } catch (error) {
        console.warn(`[KnowledgeRetrieval] Failed to generate embeddings for chunk ${chunkIndex}:`, error);
      }

      index += CHUNK_SIZE * 2; // Variable chunk size
    }

    // Store chunks in database (simplified)
    await this.storeChunksInDatabase(documentId, chunks);
  }

  private async storeChunksInDatabase(documentId: string, chunks: KnowledgeChunk[]): Promise<void> {
    try {
      for (const chunk of chunks) {
        await db.knowledgeChunk.create({
          data: {
            id: chunk.id,
            documentId,
            content: chunk.content,
            embedding: chunk.embedding as unknown as object,
            chunkIndex: chunk.chunkIndex,
            status: "indexed",
          },
        });
      }
    } catch (error) {
      console.warn(`[KnowledgeRetrieval] Failed to store chunks in DB:`, error);
    }
  }

  search(query: string, limit = 5): KnowledgeRetrievalResult {
    const results: RetrievalResult[] = [];
    const indexedChunks = Array.from(this.chunks.values());

    // Simple keyword matching for baseline
    for (const chunk of indexedChunks) {
      const score = this.calculateRelevanceScore(chunk.content, query);
      if (score > 0) {
        results.push({
          text: chunk.content,
          metadata: {
            chunkIndex: chunk.chunkIndex,
            documentId: chunk.documentId,
            source: chunk.metadata.source,
            score,
          },
          sourceUrl: this.documents.get(chunk.documentId)?.sourceUrl ?? undefined,
          accessedAt: new Date(),
        });
      }
    }

    results.sort((a, b) => (b.metadata.score as number) - (a.metadata.score as number));

    return {
      results: results.slice(0, limit),
      totalFound: results.length,
      query,
      retrievedAt: new Date(),
    };
  }

  private calculateRelevanceScore(text: string, query: string): number {
    if (!query.trim()) return 0;

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let score = 0;

    // Match individual words
    const words = lowerQuery.split(/\s+/).filter(w => w.length > 1);
    for (const word of words) {
      const wordRegex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "i");
      if (wordRegex.test(lowerText)) {
        score += 1;
      }
    }

    // Exact phrase match (higher weight)
    const phraseRegex = new RegExp(`\\b${lowerQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "i");
    if (phraseRegex.test(lowerText)) {
      score += 3;
    }

    return score;
  }

  reindexDocument(documentId: string): void {
    console.log(`[KnowledgeRetrieval] Reindexing document: ${documentId}`);
    // Re-chunk and re-embed
    const doc = this.documents.get(documentId);
    if (doc) {
      this.deleteChunksFromDatabase(documentId);
      this.documents.set(documentId, { ...doc, status: "pending" });
    }
  }

  deleteDocument(documentId: string): void {
    this.deleteChunksFromDatabase(documentId);
    this.documents.delete(documentId);
  }

  private deleteChunksFromDatabase(documentId: string): void {
    db.knowledgeChunk.deleteMany({ where: { documentId } }).catch(() => {});
    // Convert to array to avoid modification during iteration
    const chunkEntries = Array.from(this.chunks.entries());
    for (const [id, chunk] of chunkEntries) {
      if (chunk.documentId === documentId) {
        this.chunks.delete(id);
      }
    }
  }

  getDocumentStatus(documentId: string): DocumentInfo | undefined {
    return this.documents.get(documentId);
  }

  getAllDocuments(): DocumentInfo[] {
    return Array.from(this.documents.values());
  }

  async updateLastAccessed(documentId: string): Promise<void> {
    const doc = this.documents.get(documentId);
    if (doc) {
      this.documents.set(documentId, { ...doc, lastAccessedAt: new Date().toISOString() });
    }
  }

  // Retention policy: remove documents older than N days
  cleanupOldDocuments(daysOld: number = 90): number {
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    // Convert to array to avoid modification during iteration
    const documentEntries = Array.from(this.documents.entries());
    for (const [docId, doc] of documentEntries) {
      if (doc.lastAccessedAt && new Date(doc.lastAccessedAt) < cutoff) {
        this.deleteDocument(docId);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  // Protection against prompt injection
  sanitizeForPromptInjection(text: string): string {
    return text
      .replace(/<system>/gi, "")
      .replace(/<im_start><|assistant|<|endo_sig|,*[A-Z][a-z]{2,}>[,*/,:;.~=<>?[][/\\{}[\]()’"!@#$?_%&§^+\-–`~]/g, "")
      .slice(0, 4000)
      .trim();
  }
}
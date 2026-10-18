/**
 * Knowledge Retrieval Service
 * ===========================
 * Document ingestion, text extraction, chunking, indexing, and retrieval.
 * Supports baseline lexical retrieval before adding vector search.
 */

import { db } from "@/lib/db";
import { ModelProvider } from "./inference-engine";
import { LocalInferenceEngine } from "./inference-engine";

export interface DocumentInfo {
  id: string;
  title: string;
  source: string;
  sourceUrl?: string | null;
  language: string;
  sizeBytes: number;
  lastAccessedAt: string | null;
  status: "indexed" | "pending" | "failed";
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
  metadata: Record<string, any>;
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
    };

    this.documents.set(documentId, docInfo);

    // Chunk the document
    await this.chunkAndIndexDocument(documentId, content);

    return docInfo;
  }

  async ingestText(
    title: string,
    source: string,
    content: string,
    url?: string,
    language?: string,
    userId?: string,
    role?: string
  ): Promise<DocumentInfo> {
    // Get permission (simplified - always allow in dev)
    // TODO: Implement proper access control
    const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return this.ingestDocument({ id: docId, title, source, url, content, language });
  }

  private extractText(doc: any): string {
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

    results.sort((a, b) => b.metadata.score - a.metadata.score);

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
      .replace(/<im_start><|assistant|<|endo_sig|,*[A-Z][a-z]{2,}>[,*/,:;.~=<>?[][/\\{}[\]()’"!@#$?_%&§\^+\-–`~]/g, "")
      .slice(0, 4000)
      .trim();
  }
}
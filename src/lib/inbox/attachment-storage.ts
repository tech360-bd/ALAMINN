/**
 * Private attachment storage for the unified inbox.
 *
 * Files are stored outside `public/` with a server-generated random key, are
 * never served statically, and are validated by magic bytes before storage.
 * Access is mediated by an authenticated, RBAC-protected API route.
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import {
  validateFileSignature,
  verifyImage,
  CANONICAL_EXT,
} from "@/lib/upload-validation";

export const INBOX_ATTACHMENT_DIR = resolve(process.cwd(), "storage", "inbox-attachments");
export const MAX_INBOX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const ALLOWED = new Set(Object.keys(CANONICAL_EXT));

export type ValidatedAttachment = {
  storageKey: string;
  filename: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
};

export class AttachmentValidationError extends Error {
  constructor(message: string, public readonly code: string, public readonly status = 415) {
    super(message);
    this.name = "AttachmentValidationError";
  }
}

/** Validate bytes and derive a safe, random, non-public storage key. */
export async function prepareInboxAttachment(file: File): Promise<ValidatedAttachment> {
  if (file.size === 0) throw new AttachmentValidationError("Uploaded file is empty.", "empty_file", 400);
  if (file.size > MAX_INBOX_ATTACHMENT_BYTES) {
    throw new AttachmentValidationError("Attachment exceeds the 10 MB limit.", "file_too_large", 413);
  }
  const mimeType = (file.type || "").toLowerCase();
  if (!ALLOWED.has(mimeType)) {
    throw new AttachmentValidationError(`Unsupported attachment type "${mimeType || "unknown"}".`, "unsupported_type");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const signature = validateFileSignature(mimeType, buffer);
  if (!signature.ok) throw new AttachmentValidationError(signature.reason, "content_mismatch");
  if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mimeType)) {
    const decoded = await verifyImage(mimeType, buffer, sharp);
    if (!decoded) throw new AttachmentValidationError("Image bytes could not be decoded.", "invalid_image");
  }
  const originalName = (file.name || "attachment").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const storageKey = `${randomUUID()}${CANONICAL_EXT[mimeType]}`;
  return { storageKey, filename: originalName, mimeType, size: file.size, buffer };
}

/** Persist a validated attachment and return its server-side location. */
export async function storeInboxAttachment(file: File): Promise<Omit<ValidatedAttachment, "buffer">> {
  const prepared = await prepareInboxAttachment(file);
  await mkdir(INBOX_ATTACHMENT_DIR, { recursive: true, mode: 0o700 });
  const absolute = resolve(INBOX_ATTACHMENT_DIR, prepared.storageKey);
  if (!absolute.startsWith(INBOX_ATTACHMENT_DIR + "/")) {
    throw new AttachmentValidationError("Invalid storage path.", "path_invalid", 500);
  }
  await writeFile(absolute, prepared.buffer, { mode: 0o600, flag: "wx" });
  const { buffer: _buffer, ...metadata } = prepared;
  return metadata;
}

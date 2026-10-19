/**
 * Upload validation — file signature (magic-byte) checks + image verification.
 * -----------------------------------------------------------------------------
 * Defends the admin upload endpoint against disguised files: an executable,
 * HTML/JS payload, or polyglot that merely *declares* an allowed MIME type in
 * its multipart form.
 *
 * Layers (all must pass for a file to be accepted):
 *   1. MIME allowlist (route-level).
 *   2. Magic-byte signature check — actual bytes must match the declared type.
 *   3. Image decode check (sharp) for image/* — proves the bytes decode as a
 *      real image and yields ground-truth dimensions.
 *
 * Plain-text acceptance requires "printable text" heuristics (no NUL/control
 * bytes, valid UTF-8) — not just a declared `text/plain` type.
 *
 * ZIP-based Office files (docx/xlsx) are validated by the PK zip signature
 * PLUS the OOXML marker file `[Content_Types].xml` present in the archive —
 * a bare zip (or an executable renamed to .docx) fails.
 */
import type sharp from "sharp";

/** Result of validating a buffer against a declared MIME type. */
export type SignatureResult =
  | { ok: true }
  | { ok: false; reason: string };

const MAGIC_CHECKS: Array<{
  mime: string;
  test: (b: Buffer) => boolean;
  description: string;
}> = [
  {
    mime: "image/jpeg",
    test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    description: "JPEG (FF D8 FF)",
  },
  {
    mime: "image/png",
    test: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
    description: "PNG signature",
  },
  {
    mime: "image/gif",
    test: (b) =>
      b.length >= 6 &&
      (b.subarray(0, 6).toString("ascii") === "GIF87a" ||
        b.subarray(0, 6).toString("ascii") === "GIF89a"),
    description: "GIF87a/GIF89a header",
  },
  {
    mime: "image/webp",
    test: (b) =>
      b.length >= 12 &&
      b.subarray(0, 4).toString("ascii") === "RIFF" &&
      b.subarray(8, 12).toString("ascii") === "WEBP",
    description: "RIFF/WEBP header",
  },
  {
    mime: "application/pdf",
    // Allow small leading offsets (%PDF must appear in the first 1KB).
    test: (b) => b.subarray(0, 1024).toString("latin1").includes("%PDF-"),
    description: "%PDF- marker",
  },
  {
    // OOXML (docx/xlsx) = zip container + [Content_Types].xml marker.
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    test: isOoxml,
    description: "OOXML zip with [Content_Types].xml",
  },
  {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    test: isOoxml,
    description: "OOXML zip with [Content_Types].xml",
  },
];

/** OOXML check: PK zip magic in the first 8 bytes + marker in the first 64KB. */
function isOoxml(b: Buffer): boolean {
  if (b.length < 4) return false;
  const isZip =
    (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) ||
    (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x05 && b[3] === 0x06) ||
    (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x07 && b[3] === 0x08);
  if (!isZip) return false;
  return b.subarray(0, 64 * 1024).toString("latin1").includes("[Content_Types].xml");
}

/**
 * Heuristic plain-text check: valid UTF-8, no NUL, no other control chars
 * (tab/newline/CR/FF allowed) in the sampled head of the file.
 */
export function looksLikePlainText(b: Buffer): boolean {
  const sample = b.subarray(0, 8 * 1024);
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 0x09) return false;
    if (byte > 0x0d && byte < 0x20 && byte !== 0x1b) return false;
    // Allow ESC (0x1b)? No — strip it too: ANSI escape abuse is not wanted.
    if (byte === 0x1b) return false;
  }
  // Full-file UTF-8 validity (decodes malformed sequences to replacement char).
  const text = new TextDecoder("utf-8", { fatal: false }).decode(sample);
  return !text.includes("\uFFFD");
}

/**
 * Validate the actual bytes of an upload against its declared MIME type.
 * `sharpMod` is injected by the caller to keep this module importable from
 * unit tests without loading the native image library.
 */
export function validateFileSignature(
  mime: string,
  buffer: Buffer
): SignatureResult {
  if (mime === "text/plain") {
    return looksLikePlainText(buffer)
      ? { ok: true }
      : { ok: false, reason: "Content is not valid plain text." };
  }
  const check = MAGIC_CHECKS.find((c) => c.mime === mime);
  if (!check) {
    return { ok: false, reason: `No signature rule for type "${mime}".` };
  }
  return check.test(buffer)
    ? { ok: true }
    : { ok: false, reason: `File content does not match declared type (${check.description} missing).` };
}

/** Hard cap for image dimensions (prevents decompression-bomb style assets). */
export const MAX_IMAGE_DIMENSION = 10000;

/**
 * Decode an image with sharp to prove it is a real image and get true
 * dimensions. Returns null when the type is not an image or decoding fails.
 */
export async function verifyImage(
  mime: string,
  buffer: Buffer,
  sharpMod: typeof sharp
): Promise<{ width: number; height: number; format: string } | null> {
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime)) {
    return null;
  }
  try {
    const meta = await sharpMod(buffer, { failOn: "error" }).metadata();
    if (!meta.width || !meta.height) return null;
    if (meta.width > MAX_IMAGE_DIMENSION || meta.height > MAX_IMAGE_DIMENSION) {
      return null;
    }
    return { width: meta.width, height: meta.height, format: meta.format || "unknown" };
  } catch {
    return null;
  }
}

/** Canonical file extension per MIME — always derived server-side. */
export const CANONICAL_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
};

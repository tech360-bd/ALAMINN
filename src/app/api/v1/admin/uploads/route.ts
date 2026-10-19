import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ok, fail, writeAudit } from "@/lib/admin-api";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import {
  validateFileSignature,
  verifyImage,
  CANONICAL_EXT,
} from "@/lib/upload-validation";

export const dynamic = "force-dynamic";

/** Convert a string to a URL-safe slug (server-side copy of the client helper). */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// 10 MB hard cap.
const MAX_SIZE = 10 * 1024 * 1024;

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

const UPLOAD_DIR = resolve(process.cwd(), "public", "uploads");

/**
 * POST /api/v1/admin/uploads
 * Content-Type: multipart/form-data
 * Form fields:
 *   - file:   File (required) — image, PDF, Office doc, or text
 *   - altText:    string (optional)
 *   - category:   string (optional) — brand | portrait | project | article | case-study | general
 *   - width:      number (optional)
 *   - height:     number (optional)
 *
 * Writes the file to /public/uploads/<timestamp>-<slug>, creates a
 * MediaAsset row, and returns the asset. Audit-logged as `media.uploaded`.
 *
 * Permission: the existing /api/v1/admin/media routes use `resources.create`
 * for create operations — we reuse the same permission here so the upload
 * endpoint is consistent with the rest of the media API.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "resources.create");
  if (guard.denied) return guard.response;

  const form = await req.formData().catch(() => null);
  if (!form) return fail("Expected multipart/form-data request.");

  const file = form.get("file");
  if (!(file instanceof File)) {
    return fail("No file uploaded. Use a multipart form with a 'file' field.", ["missing_file"]);
  }

  if (file.size === 0) return fail("Uploaded file is empty.", ["empty_file"]);
  if (file.size > MAX_SIZE) {
    return fail(`File is too large. Maximum allowed is ${MAX_SIZE / 1024 / 1024} MB.`, ["file_too_large"], 413);
  }

  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED_MIME[mime]) {
    return fail(
      `Unsupported file type "${mime || "unknown"}". Allowed: ${Object.keys(ALLOWED_MIME).join(", ")}.`,
      ["unsupported_type"],
      415
    );
  }

  // Sanitize filename: keep the base name, slugify, then append the
  // canonical extension derived from the *validated* MIME type (server-side
  // only — the client-supplied extension is never trusted, which prevents
  // double-extension tricks like `shell.php.png` or `.svg` masquerade).
  const originalName = file.name || `upload${CANONICAL_EXT[mime]}`;
  const baseName = originalName
    .replace(/\.[^.]+$/, "") // strip extension
    .slice(0, 80); // cap length
  const ext = CANONICAL_EXT[mime] || `.${ALLOWED_MIME[mime]}`;
  const safeName = `${Date.now()}-${slugify(baseName) || "file"}${ext}`;

  // ── Content validation (magic bytes + image decode) ───────────────
  // The declared MIME type is untrusted: verify the actual bytes match.
  const buffer = Buffer.from(await file.arrayBuffer());
  const signature = validateFileSignature(mime, buffer);
  if (!signature.ok) {
    return fail(`Upload rejected: ${signature.reason}`, ["content_mismatch"], 415);
  }

  // For images, decode with sharp — proves the bytes are a real image and
  // yields ground-truth dimensions (client-supplied values are ignored).
  const image = await verifyImage(mime, buffer, sharp);
  if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime) && !image) {
    return fail(
      "Upload rejected: file declares an image type but its bytes do not decode as one.",
      ["invalid_image"],
      415
    );
  }
  const width = image?.width ?? null;
  const height = image?.height ?? null;

  // Ensure the upload directory exists.
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
  } catch (e) {
    console.error("[uploads] mkdir failed", e);
    return fail("Failed to prepare upload directory.", ["mkdir_failed"], 500);
  }

  const absPath = resolve(UPLOAD_DIR, safeName);
  // Defence in depth: the resolved path MUST stay inside the upload dir
  // (safeName is generated server-side, so this should always hold).
  if (!absPath.startsWith(UPLOAD_DIR + "/")) {
    return fail("Invalid storage path.", ["path_invalid"], 500);
  }
  try {
    await writeFile(absPath, buffer);
  } catch (e) {
    console.error("[uploads] writeFile failed", e);
    return fail("Failed to write uploaded file.", ["write_failed"], 500);
  }

  const url = `/uploads/${safeName}`;
  const altText = (form.get("altText") as string | null) || null;
  const category = (form.get("category") as string | null) || null;
  // Note: width/height come from server-side image decoding above —
  // client-supplied dimension fields are intentionally ignored.

  try {
    const asset = await db.mediaAsset.create({
      data: {
        filename: originalName,
        url,
        altText,
        mimeType: mime,
        size: file.size,
        width,
        height,
        category,
      },
    });
    await writeAudit(guard.session, "media.uploaded", "MediaAsset", asset.id, {
      filename: originalName,
      url,
      mimeType: mime,
      size: file.size,
    });
    return ok(
      {
        id: asset.id,
        url: asset.url,
        filename: asset.filename,
        mimeType: asset.mimeType,
        size: asset.size,
      },
      "File uploaded.",
      {},
      201
    );
  } catch (e) {
    console.error("[uploads] mediaAsset.create failed", e);
    return fail("Failed to record media asset.", [(e as Error).message], 500);
  }
}

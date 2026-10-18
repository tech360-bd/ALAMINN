/**
 * Upload content validation — magic-byte signature tests.
 * Verifies disguised files (executables/HTML renamed to image types) are
 * rejected and genuine file signatures are accepted.
 */
import { describe, it, expect } from "vitest";
import {
  validateFileSignature,
  looksLikePlainText,
} from "@/lib/upload-validation";

const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(64, 0x11),
]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32, 0x22),
]);
const GIF = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(32, 0x33)]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from("WEBPVP8 "),
  Buffer.alloc(16, 0x44),
]);
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(32, 0x55)]);
// Minimal OOXML-looking zip: local file header + central marker string.
const DOCX = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from("word/document.xml[Content_Types].xml"),
  Buffer.alloc(16, 0x66),
]);
const EXEC = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(64, 0x90)]);
const ELF = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(32, 0x00)]);
const HTML_SNIPE = Buffer.from("<script>alert(1)</script>");

describe("validateFileSignature — genuine files accepted", () => {
  it("accepts a real JPEG declared as image/jpeg", () => {
    expect(validateFileSignature("image/jpeg", JPEG)).toEqual({ ok: true });
  });
  it("accepts a real PNG declared as image/png", () => {
    expect(validateFileSignature("image/png", PNG)).toEqual({ ok: true });
  });
  it("accepts a real GIF declared as image/gif", () => {
    expect(validateFileSignature("image/gif", GIF)).toEqual({ ok: true });
  });
  it("accepts a real WebP declared as image/webp", () => {
    expect(validateFileSignature("image/webp", WEBP)).toEqual({ ok: true });
  });
  it("accepts a real PDF declared as application/pdf", () => {
    expect(validateFileSignature("application/pdf", PDF)).toEqual({ ok: true });
  });
  it("accepts an OOXML zip (docx marker) declared as docx", () => {
    expect(
      validateFileSignature(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        DOCX
      )
    ).toEqual({ ok: true });
  });
  it("accepts genuine plain text declared as text/plain", () => {
    expect(validateFileSignature("text/plain", Buffer.from("Hello world.\n"))).toEqual({
      ok: true,
    });
  });
});

describe("validateFileSignature — disguised files rejected", () => {
  it("rejects a Windows executable renamed to image/png", () => {
    const r = validateFileSignature("image/png", EXEC);
    expect(r.ok).toBe(false);
  });
  it("rejects an ELF binary renamed to image/jpeg", () => {
    expect(validateFileSignature("image/jpeg", ELF).ok).toBe(false);
  });
  it("rejects a plain zip renamed to .docx (no OOXML marker)", () => {
    const bareZip = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.alloc(64, 0x00),
    ]);
    expect(
      validateFileSignature(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        bareZip
      ).ok
    ).toBe(false);
  });
  it("rejects a PNG signature declared as image/webp (type confusion)", () => {
    expect(validateFileSignature("image/webp", PNG).ok).toBe(false);
  });
  it("rejects buffers with NUL bytes declared as text/plain", () => {
    expect(looksLikePlainText(Buffer.from("abc\0def"))).toBe(false);
  });
  it("rejects binary blobs with ANSI escape sequences declared as text/plain", () => {
    expect(looksLikePlainText(Buffer.from("a\x1b[31mred"))).toBe(false);
  });
  it("accepts printable HTML inside text/plain (served as text, never executed)", () => {
    expect(looksLikePlainText(HTML_SNIPE)).toBe(true);
  });
  it("has no signature rule for unknown MIME types", () => {
    expect(validateFileSignature("application/x-msdownload", EXEC).ok).toBe(false);
  });
});

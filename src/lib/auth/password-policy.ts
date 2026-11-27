/** Executive account passwords: preserve the existing 8-character minimum,
 * but never let bcrypt silently discard bytes past its 72-byte limit. Existing
 * hashes remain verifiable so accounts can sign in and change their password. */
export function validateAdminPassword(password: unknown): { code: string; message: string } | null {
  if (typeof password !== "string" || password.length === 0) return { code: "password_required", message: "Password is required." };
  if ([...password].length < 8) return { code: "password_too_short", message: "Password must be at least 8 characters." };
  if (Buffer.byteLength(password, "utf8") > 72) return { code: "password_too_long", message: "Password must be at most 72 UTF-8 bytes." };
  return null;
}

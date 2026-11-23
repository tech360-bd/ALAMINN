/**
 * Centralized, XSS-safe JSON-LD serializer.
 * --------------------------------------------------------------------
 * Standard `JSON.stringify` does NOT escape `<`, `>`, `&`, `\u2028`, or
 * `\u2029`. When its output is embedded inside `<script type="application/ld+json">`
 * via `dangerouslySetInnerHTML`, any untrusted or database-sourced string
 * containing `</script>` or `<!--` can close the `<script>` tag and
 * execute arbitrary HTML/JavaScript.
 *
 * `safeJsonLdStringify` and `serializeJsonLd` replace those characters
 * with standard JSON Unicode escape sequences (`\u003c`, `\u003e`,
 * `\u0026`, `\u2028`, `\u2029`), producing 100% valid JSON that can never
 * break out of a `<script>` element.
 */

export function safeJsonLdStringify(value: unknown): string {
  const raw = JSON.stringify(value) ?? "null";
  return raw
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function serializeJsonLd(
  objects: Record<string, unknown> | Record<string, unknown>[],
): string {
  const arr = Array.isArray(objects) ? objects : [objects];
  if (arr.length === 1) return safeJsonLdStringify(arr[0]);
  return safeJsonLdStringify({
    "@context": "https://schema.org",
    "@graph": arr,
  });
}

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { safeJsonLdStringify, serializeJsonLd } from "@/lib/json-ld";
import {
  buildUniversityJsonLd,
  buildCourseJsonLd as buildHsCourseJsonLd,
  buildScholarshipJsonLd,
  buildFaqJsonLd as buildHsFaqJsonLd,
  buildBreadcrumbJsonLd as buildHsBreadcrumbJsonLd,
  serializeJsonLd as hsSerializeJsonLd,
} from "@/lib/higher-study/seo";
import {
  buildCourseJsonLd as buildElCourseJsonLd,
  buildFaqJsonLd as buildElFaqJsonLd,
  buildBreadcrumbJsonLd as buildElBreadcrumbJsonLd,
  buildOrganizationJsonLd as buildElOrganizationJsonLd,
  serializeJsonLd as elSerializeJsonLd,
} from "@/lib/english-learning/seo";

const ROOT = resolve(__dirname, "../..");

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("Task 04 & Task 05 — XSS-Safe JSON-LD Serialization & React Rendering", () => {
  const XSS_PAYLOAD = '</script><script>window.__xss=1</script><!-- & \u2028 \u2029 -->';

  it("escapes <, >, &, U+2028, and U+2029 in safeJsonLdStringify and serializeJsonLd", () => {
    const raw = safeJsonLdStringify({
      name: XSS_PAYLOAD,
      nested: [XSS_PAYLOAD],
    });

    expect(raw).not.toContain("</script>");
    expect(raw).not.toContain("<script>");
    expect(raw).not.toContain("<");
    expect(raw).not.toContain(">");
    expect(raw).toContain("\\u003c/script\\u003e");
    expect(raw).toContain("\\u0026");
    expect(raw).toContain("\\u2028");
    expect(raw).toContain("\\u2029");

    // Must remain valid JSON that round-trips back to the original strings
    const parsed = JSON.parse(raw) as { name: string; nested: string[] };
    expect(parsed.name).toBe(XSS_PAYLOAD);
    expect(parsed.nested[0]).toBe(XSS_PAYLOAD);

    const graphStr = serializeJsonLd([{ title: XSS_PAYLOAD }]);
    expect(graphStr).not.toContain("</script>");
    expect(graphStr).not.toContain("<");
  });

  it("sanitizes Higher Study and English Learning SEO JSON-LD builders against script breakout", () => {
    const samples = [
      hsSerializeJsonLd(
        buildUniversityJsonLd({
          name: XSS_PAYLOAD,
          slug: "oxford",
          overview: XSS_PAYLOAD,
        } as never),
      ),
      hsSerializeJsonLd(
        buildHsCourseJsonLd({
          title: XSS_PAYLOAD,
          slug: "cs-msc",
          overview: XSS_PAYLOAD,
        } as never),
      ),
      hsSerializeJsonLd(
        buildScholarshipJsonLd({
          title: XSS_PAYLOAD,
          slug: "chevening",
          overview: XSS_PAYLOAD,
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-02T00:00:00Z"),
        } as never),
      ),
      hsSerializeJsonLd(
        buildHsFaqJsonLd([{ question: XSS_PAYLOAD, answer: XSS_PAYLOAD }]),
      ),
      hsSerializeJsonLd(
        buildHsBreadcrumbJsonLd([{ name: XSS_PAYLOAD, href: "/higher-study" }]),
      ),
      elSerializeJsonLd(
        buildElCourseJsonLd({
          title: XSS_PAYLOAD,
          slug: "ielts-prep",
          summary: XSS_PAYLOAD,
        } as never),
      ),
      elSerializeJsonLd(buildElOrganizationJsonLd()),
      elSerializeJsonLd(
        buildElFaqJsonLd([{ question: XSS_PAYLOAD, answer: XSS_PAYLOAD }]),
      ),
      elSerializeJsonLd(
        buildElBreadcrumbJsonLd([
          { name: XSS_PAYLOAD, href: "/english-learning" },
        ]),
      ),
    ];

    for (const serialized of samples) {
      expect(serialized).not.toContain("</script>");
      expect(serialized).not.toContain("<script>");
      expect(serialized).not.toContain("<");
      expect(JSON.parse(serialized)).toBeTruthy();
    }
  });

  it("verifies no file in src/ uses raw JSON.stringify inside dangerouslySetInnerHTML", () => {
    const files = collectTsFiles(join(ROOT, "src"));
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      if (content.includes("dangerouslySetInnerHTML")) {
        expect(
          content,
          `${file} must not pass raw JSON.stringify to dangerouslySetInnerHTML`,
        ).not.toMatch(/__html:\s*JSON\.stringify\(/);
      }
    }
  });

  it("verifies src/app/higher-study/page.tsx renders HomeSection title and description without dangerouslySetInnerHTML", () => {
    const pageContent = readFileSync(
      join(ROOT, "src/app/higher-study/page.tsx"),
      "utf8",
    );
    expect(pageContent).not.toContain("dangerouslySetInnerHTML={{ __html: title }}");
    expect(pageContent).not.toContain(
      "dangerouslySetInnerHTML={{ __html: description }}",
    );
  });
});

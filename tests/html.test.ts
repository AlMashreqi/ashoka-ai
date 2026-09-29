import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { extractHtml } from "../src/lib/crawl/html";

const fixture = readFileSync(resolve("tests/fixtures/department.html"), "utf8");
const url = new URL("https://www.ashoka.edu.in/department/department-of-cs/");

describe("extractHtml", () => {
  it("returns ordered headings, clean blocks, canonical URL, and link candidates", () => {
    const document = extractHtml(fixture, url);

    expect(document.title).toBe("Department of Computer Science | Ashoka University");
    expect(document.contentType).toBe("text/html");
    expect(document.canonicalUrl.href).toBe(url.href);
    expect(document.headings).toEqual(["Computer Science", "Programmes"]);
    expect(document.text).toContain("rigorous foundations");
    expect(document.text).not.toContain("Admissions Research About");
    expect(document.text).not.toContain("We use cookies");
    expect(document.text).not.toContain("window.analytics");
    expect(document.links.map((link) => link.href)).toEqual([
      "https://www.ashoka.edu.in/department/department-of-cs/faculty?utm_source=newsletter",
      "https://www.ashoka.edu.in/wp-content/uploads/course-list.pdf#page=2",
      "https://external.example/elsewhere",
    ]);
  });

  it("treats Cloudflare challenge markup as a failure", () => {
    expect(() => extractHtml("<title>Just a moment...</title><div id=cf-chl-widget></div>", url)).toThrow(
      /Cloudflare challenge/,
    );
  });

  it("normalizes approved canonical URLs and removes repeated or nested block text", () => {
    const document = extractHtml(`
      <link rel="canonical" href="/department/department-of-cs/?z=2&utm_source=x&a=1#team" />
      <main>
        <p>Repeated department text.</p><p>Repeated department text.</p>
        <ul><li>Parent item<ul><li>Child item</li></ul></li></ul>
      </main>
    `, url);

    expect(document.canonicalUrl.href).toBe(
      "https://www.ashoka.edu.in/department/department-of-cs/?a=1&z=2",
    );
    expect(document.blocks.map((block) => block.text)).toEqual([
      "Repeated department text.",
      "Parent item",
      "Child item",
    ]);
  });
});

import { describe, expect, it } from "vitest";

import { canonicalizeUrl, classifyUrl, type CrawlPolicy } from "../src/lib/crawl/url-policy";

const policy: CrawlPolicy = {
  baseUrl: new URL("https://www.ashoka.edu.in/department/department-of-cs/"),
  htmlPathPrefixes: ["/department/department-of-cs/"],
};

describe("canonicalizeUrl", () => {
  it("removes fragments and tracking parameters while sorting retained query parameters", () => {
    expect(
      canonicalizeUrl(
        "https://WWW.ashoka.edu.in:443//department///department-of-cs/?z=2&utm_source=test&a=1#faculty",
      ).href,
    ).toBe("https://www.ashoka.edu.in/department/department-of-cs/?a=1&z=2");
  });
});

describe("classifyUrl", () => {
  it("rejects external and unapproved HTML paths", () => {
    expect(classifyUrl(new URL("https://evil.example/cs"), policy, true)).toBe("reject");
    expect(classifyUrl(new URL("https://www.ashoka.edu.in/about"), policy, true)).toBe("reject");
  });

  it("does not trust a caller-supplied non-official policy origin", () => {
    expect(
      classifyUrl(
        new URL("https://evil.example/department/department-of-cs/"),
        { baseUrl: new URL("https://evil.example/department/department-of-cs/"), htmlPathPrefixes: ["/"] },
        false,
      ),
    ).toBe("reject");
  });

  it("accepts same-origin PDFs only when an accepted HTML page linked them", () => {
    const pdf = new URL("https://www.ashoka.edu.in/wp-content/a.pdf");

    expect(classifyUrl(pdf, policy, true)).toBe("pdf");
    expect(classifyUrl(pdf, policy, false)).toBe("reject");
  });
});

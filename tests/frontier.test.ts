import { describe, expect, it } from "vitest";

import { CrawlFrontier } from "../src/lib/crawl/frontier";

describe("CrawlFrontier", () => {
  it("enqueues a canonical URL only once", () => {
    const frontier = new CrawlFrontier();

    expect(frontier.add("https://www.ashoka.edu.in/department/department-of-cs/")).toBe(true);
    expect(
      frontier.add("https://www.ashoka.edu.in/department/department-of-cs/#faculty"),
    ).toBe(false);
    expect(
      frontier.add("https://www.ashoka.edu.in/department/department-of-cs/?utm_source=newsletter"),
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { createStatusHandler, getStatus, type StatusDependencies } from "../src/lib/status";

function deps(overrides: Partial<StatusDependencies> = {}): StatusDependencies {
  return {
    latestCrawl: async () => null,
    latestSuccessfulCrawl: async () => null,
    indexedPages: async () => 0,
    chunks: async () => 0,
    corpusRevision: async () => 0,
    ...overrides,
  };
}

describe("status", () => {
  it("aggregates an empty corpus without inventing a crawl result", async () => {
    await expect(getStatus(deps())).resolves.toEqual({ lastCrawl: null, lastSuccessfulCrawlAt: null, indexedPages: 0, chunks: 0, corpusRevision: 0 });
  });

  it("keeps a failed latest crawl distinct from the prior successful crawl", async () => {
    const failed = { status: "failed" as const, completedAt: "2026-09-29T10:00:00Z", attempted: 2, succeeded: 1, failed: 1, discarded: 0 };
    await expect(getStatus(deps({ latestCrawl: async () => failed, latestSuccessfulCrawl: async () => "2026-09-28T10:00:00Z", indexedPages: async () => 4, chunks: async () => 12, corpusRevision: async () => 7 }))).resolves.toEqual({ lastCrawl: failed, lastSuccessfulCrawlAt: "2026-09-28T10:00:00Z", indexedPages: 4, chunks: 12, corpusRevision: 7 });
  });

  it("reports a successful latest crawl through the safe status handler", async () => {
    const successful = { status: "success" as const, completedAt: "2026-09-29T10:00:00Z", attempted: 2, succeeded: 2, failed: 0, discarded: 0 };
    const handler = createStatusHandler(deps({ latestCrawl: async () => successful, latestSuccessfulCrawl: async () => successful.completedAt, indexedPages: async () => 2, chunks: async () => 8, corpusRevision: async () => 3 }));

    await expect((await handler()).json()).resolves.toEqual({ lastCrawl: successful, lastSuccessfulCrawlAt: successful.completedAt, indexedPages: 2, chunks: 8, corpusRevision: 3 });
  });
});

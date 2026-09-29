import { describe, expect, it } from "vitest";

import { runCrawlWithRecord } from "../src/lib/crawl-run";

describe("crawl run lifecycle", () => {
  it("finalizes a started run as failed when the crawl throws", async () => {
    const finished: unknown[] = [];
    await expect(runCrawlWithRecord({
      start: async () => "run-1",
      finish: async (_id, summary) => { finished.push(summary); },
      run: async () => { throw new Error("provider unavailable"); },
    })).rejects.toThrow("provider unavailable");

    expect(finished).toEqual([{ attempted: 0, succeeded: 0, failed: 1, skipped: 0, discarded: 0 }]);
  });
});

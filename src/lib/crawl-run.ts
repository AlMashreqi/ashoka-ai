import type { CrawlSummary } from "./crawl/crawler";

export interface CrawlRunDependencies {
  start(): Promise<string>;
  finish(id: string, summary: CrawlSummary): Promise<void>;
  run(): Promise<CrawlSummary>;
}

export async function runCrawlWithRecord(deps: CrawlRunDependencies): Promise<CrawlSummary> {
  const id = await deps.start();
  try {
    const summary = await deps.run();
    await deps.finish(id, summary);
    return summary;
  } catch (error) {
    await deps.finish(id, { attempted: 0, succeeded: 0, failed: 1, skipped: 0, discarded: 0 });
    throw error;
  }
}

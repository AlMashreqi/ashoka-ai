import { hasAdminCookie } from "../../../../lib/admin-session";
import { createAdminCrawlHandler } from "../../../../lib/admin-actions";
import { createProviders } from "../../../../lib/ai/factory";
import { getConfig } from "../../../../lib/config";
import { crawl, type CrawlSummary } from "../../../../lib/crawl/crawler";
import { runCrawlWithRecord } from "../../../../lib/crawl-run";
import { SupabaseStore } from "../../../../lib/indexing/store";
import { createServerSupabaseClient } from "../../../../lib/supabase/server";

async function runCrawl(maxPages: number): Promise<CrawlSummary> {
  const config = getConfig(process.env);
  const store = new SupabaseStore(createServerSupabaseClient(config), config.embeddingModel);
  return runCrawlWithRecord({
    start: () => store.startCrawlRun(),
    finish: (id, summary) => store.finishCrawlRun(id, summary),
    run: () => crawl({
      policy: { baseUrl: config.baseUrl, htmlPathPrefixes: config.htmlPathPrefixes },
      fetch: globalThis.fetch,
      storage: store,
      embedder: createProviders(config).embedder,
      clock: Date.now,
      delay: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
      requestsPerSecond: config.requestsPerSecond,
      maxPages,
      timeoutMs: config.crawlTimeoutMs,
      maxResponseBytes: config.maxResponseBytes,
      maxRetries: config.maxRetries,
      embeddingDimensions: config.embeddingDimensions,
      chunkOptions: { targetCharacters: 1_500, overlapCharacters: 200 },
    }),
  });
}

export async function POST(request: Request): Promise<Response> {
  const config = getConfig(process.env);
  return createAdminCrawlHandler({
    isAuthorized: (value) => hasAdminCookie(value.headers.get("cookie"), config.adminSecret),
    origin: new URL(request.url).origin,
    maxPages: config.maxPages,
    run: runCrawl,
  })(request);
}

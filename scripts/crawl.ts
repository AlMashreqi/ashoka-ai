import { createProviders } from "../src/lib/ai/factory";
import { crawl, type CrawlStorage } from "../src/lib/crawl/crawler";
import { runCrawlWithRecord } from "../src/lib/crawl-run";
import { getConfig } from "../src/lib/config";
import { SupabaseStore } from "../src/lib/indexing/store";
import { createServerSupabaseClient } from "../src/lib/supabase/server";
import { cliHelp, loadCliEnv } from "../src/lib/cli-env";

async function main() {
  if (cliHelp("crawl")) return;
  loadCliEnv();
  const config = getConfig(process.env);
  const dryRun = process.argv.includes("--dry-run");
  const providers = createProviders(config);
  const store = new SupabaseStore(createServerSupabaseClient(config), config.embeddingModel);
  const storage: CrawlStorage = dryRun
    ? { hasContent: async () => false, save: async () => undefined, recordFailure: async () => undefined, recordDiscarded: async () => undefined }
    : store;
  const run = () => crawl({
    policy: { baseUrl: config.baseUrl, htmlPathPrefixes: config.htmlPathPrefixes },
    fetch: globalThis.fetch,
    storage,
    embedder: dryRun
      ? { embed: async (inputs) => inputs.map(() => Array.from({ length: config.embeddingDimensions }, () => 0)) }
      : providers.embedder,
    clock: Date.now,
    delay: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    requestsPerSecond: config.requestsPerSecond,
    maxPages: config.maxPages,
    timeoutMs: config.crawlTimeoutMs,
    maxResponseBytes: config.maxResponseBytes,
    maxRetries: config.maxRetries,
    embeddingDimensions: config.embeddingDimensions,
    chunkOptions: { targetCharacters: 1_500, overlapCharacters: 200 },
  });
  const summary = dryRun ? await run() : await runCrawlWithRecord({ start: () => store.startCrawlRun(), finish: (id, value) => store.finishCrawlRun(id, value), run });
  console.log(`crawl ${dryRun ? "dry-run " : ""}completed: ${summary.succeeded} indexed, ${summary.skipped} skipped, ${summary.failed} failed`);
  if (summary.failed) process.exitCode = 1;
}

main().catch(() => {
  console.error("crawl failed");
  process.exitCode = 1;
});

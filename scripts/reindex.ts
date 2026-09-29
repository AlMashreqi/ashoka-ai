import { createProviders } from "../src/lib/ai/factory";
import { getConfig } from "../src/lib/config";
import { reindexAll } from "../src/lib/indexing/indexer";
import { SupabaseStore } from "../src/lib/indexing/store";
import { createServerSupabaseClient } from "../src/lib/supabase/server";
import { cliHelp, loadCliEnv } from "../src/lib/cli-env";

async function main() {
  if (cliHelp("reindex")) return;
  loadCliEnv();
  const config = getConfig(process.env);
  const providers = createProviders(config);
  const summary = await reindexAll({
    store: new SupabaseStore(createServerSupabaseClient(config), config.embeddingModel),
    embedder: providers.embedder,
    embeddingDimensions: config.embeddingDimensions,
    embeddingModel: config.embeddingModel,
    chunkOptions: { targetCharacters: 1_500, overlapCharacters: 200 },
  }, { maxPages: config.maxPages, dryRun: process.argv.includes("--dry-run") });
  console.log(`reindex completed: ${summary.indexed} indexed, ${summary.unchanged} unchanged, ${summary.failed} failed`);
  if (summary.failed) process.exitCode = 1;
}

main().catch(() => {
  console.error("reindex failed");
  process.exitCode = 1;
});

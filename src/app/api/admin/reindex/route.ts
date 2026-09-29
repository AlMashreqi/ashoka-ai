import { hasAdminCookie } from "../../../../lib/admin-session";
import { createAdminReindexHandler } from "../../../../lib/admin-actions";
import { createProviders } from "../../../../lib/ai/factory";
import { getConfig } from "../../../../lib/config";
import { reindexAll, type ReindexSummary } from "../../../../lib/indexing/indexer";
import { SupabaseStore } from "../../../../lib/indexing/store";
import { createServerSupabaseClient } from "../../../../lib/supabase/server";

async function runReindex(): Promise<ReindexSummary> {
  const config = getConfig(process.env);
  const providers = createProviders(config);
  return reindexAll({
    store: new SupabaseStore(createServerSupabaseClient(config), config.embeddingModel),
    embedder: providers.embedder,
    embeddingDimensions: config.embeddingDimensions,
    embeddingModel: config.embeddingModel,
    chunkOptions: { targetCharacters: 1_500, overlapCharacters: 200 },
  }, { maxPages: config.maxPages });
}

export async function POST(request: Request): Promise<Response> {
  const config = getConfig(process.env);
  return createAdminReindexHandler({
    isAuthorized: (value) => hasAdminCookie(value.headers.get("cookie"), config.adminSecret),
    origin: new URL(request.url).origin,
    run: runReindex,
  })(request);
}

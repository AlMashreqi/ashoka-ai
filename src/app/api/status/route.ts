import { getConfig } from "../../../lib/config";
import { createStatusHandler, type CrawlStatus, type StatusDependencies } from "../../../lib/status";
import { createServerSupabaseClient } from "../../../lib/supabase/server";

function fail(error: unknown): never {
  throw new Error(error instanceof Error ? error.message : "Supabase operation failed");
}

function asCrawl(row: Record<string, unknown> | null): CrawlStatus | null {
  if (!row) return null;
  return {
    status: row.status as CrawlStatus["status"],
    completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
    attempted: Number(row.pages_attempted ?? 0),
    succeeded: Number(row.pages_succeeded ?? 0),
    failed: Number(row.pages_failed ?? 0),
    discarded: Number(row.pages_discarded ?? 0),
  };
}

export function productionStatusDependencies(): StatusDependencies {
  const database = createServerSupabaseClient(getConfig(process.env));
  return {
    latestCrawl: async () => {
      const { data, error } = await database.from("crawl_runs").select("status,completed_at,pages_attempted,pages_succeeded,pages_failed,pages_discarded").eq("kind", "crawl").order("started_at", { ascending: false }).limit(1).maybeSingle();
      if (error) fail(error);
      return asCrawl(data);
    },
    latestSuccessfulCrawl: async () => {
      const { data, error } = await database.from("crawl_runs").select("completed_at").eq("kind", "crawl").eq("status", "success").order("completed_at", { ascending: false }).limit(1).maybeSingle();
      if (error) fail(error);
      return data?.completed_at ?? null;
    },
    indexedPages: async () => {
      const { count, error } = await database.from("source_pages").select("id", { count: "exact", head: true }).eq("crawl_status", "success");
      if (error) fail(error);
      return count ?? 0;
    },
    chunks: async () => {
      const { count, error } = await database.from("document_chunks").select("id", { count: "exact", head: true });
      if (error) fail(error);
      return count ?? 0;
    },
    corpusRevision: async () => {
      const { data, error } = await database.from("app_state").select("corpus_revision").eq("id", 1).maybeSingle();
      if (error) fail(error);
      return Number(data?.corpus_revision ?? 0);
    },
  };
}

export async function GET(): Promise<Response> {
  try {
    return await createStatusHandler(productionStatusDependencies())();
  } catch {
    return Response.json({ error: "Status unavailable" }, { status: 503 });
  }
}

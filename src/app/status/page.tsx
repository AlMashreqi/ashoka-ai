import { getStatus } from "../../lib/status";
import { productionStatusDependencies } from "../api/status/route";

export const dynamic = "force-dynamic";

async function loadStatus() {
  try {
    return await getStatus(productionStatusDependencies());
  } catch {
    return null;
  }
}

export default async function StatusPage() {
  const status = await loadStatus();
  if (!status) return <><h1>Index status</h1><p className="error">Status is temporarily unavailable.</p></>;
  return <><h1>Index status</h1><dl><dt>Last crawl</dt><dd>{status.lastCrawl?.status ?? "No crawl recorded"}</dd><dt>Discarded links</dt><dd>{status.lastCrawl?.discarded ?? 0}</dd><dt>Last successful crawl</dt><dd>{status.lastSuccessfulCrawlAt ?? "None"}</dd><dt>Indexed pages</dt><dd>{status.indexedPages}</dd><dt>Chunks</dt><dd>{status.chunks}</dd><dt>Corpus revision</dt><dd>{status.corpusRevision}</dd></dl></>;
}

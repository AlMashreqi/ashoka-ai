export interface CrawlStatus {
  status: "success" | "failed" | "running";
  completedAt: string | null;
  attempted: number;
  succeeded: number;
  failed: number;
  discarded: number;
}

export interface StatusDependencies {
  latestCrawl(): Promise<CrawlStatus | null>;
  latestSuccessfulCrawl(): Promise<string | null>;
  indexedPages(): Promise<number>;
  chunks(): Promise<number>;
  corpusRevision(): Promise<number>;
}

export interface SystemStatus {
  lastCrawl: CrawlStatus | null;
  lastSuccessfulCrawlAt: string | null;
  indexedPages: number;
  chunks: number;
  corpusRevision: number;
}

export async function getStatus(deps: StatusDependencies): Promise<SystemStatus> {
  const [lastCrawl, lastSuccessfulCrawlAt, indexedPages, chunks, corpusRevision] = await Promise.all([
    deps.latestCrawl(), deps.latestSuccessfulCrawl(), deps.indexedPages(), deps.chunks(), deps.corpusRevision(),
  ]);
  return { lastCrawl, lastSuccessfulCrawlAt, indexedPages, chunks, corpusRevision };
}

export function createStatusHandler(deps: StatusDependencies) {
  return async (): Promise<Response> => {
    try {
      return Response.json(await getStatus(deps));
    } catch {
      return Response.json({ error: "Status unavailable" }, { status: 503 });
    }
  };
}

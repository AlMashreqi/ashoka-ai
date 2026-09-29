export interface AdminCrawlDependencies {
  isAuthorized(request: Request): boolean;
  maxPages?: number;
  origin?: string;
  run(maxPages: number): Promise<unknown>;
}

export function createAdminCrawlHandler(deps: AdminCrawlDependencies) {
  return async (request: Request): Promise<Response> => {
    if (!deps.isAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (deps.origin && request.headers.get("origin") !== deps.origin) return Response.json({ error: "Forbidden" }, { status: 403 });
    try {
      return Response.json(await deps.run(deps.maxPages ?? 1));
    } catch {
      return Response.json({ error: "Crawl failed" }, { status: 500 });
    }
  };
}

export interface AdminReindexDependencies {
  isAuthorized(request: Request): boolean;
  origin?: string;
  run(): Promise<unknown>;
}

export function createAdminReindexHandler(deps: AdminReindexDependencies) {
  return async (request: Request): Promise<Response> => {
    if (!deps.isAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (deps.origin && request.headers.get("origin") !== deps.origin) return Response.json({ error: "Forbidden" }, { status: 403 });
    try {
      return Response.json(await deps.run());
    } catch {
      return Response.json({ error: "Re-index failed" }, { status: 500 });
    }
  };
}

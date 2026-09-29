export type FetchLike = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

export const CRAWLER_USER_AGENT = "CS-Department-Information-Assistant/0.1 (+local development; respectful crawler)";
export const CRAWLER_ACCEPT = "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8";

export function fetchPage(fetch: FetchLike, url: URL, timeoutMs: number): Promise<Response> {
  return fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: CRAWLER_ACCEPT,
      "User-Agent": CRAWLER_USER_AGENT,
    },
  });
}

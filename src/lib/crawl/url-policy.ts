export interface CrawlPolicy {
  baseUrl: URL;
  htmlPathPrefixes: string[];
}

const TRACKING_PARAMETER = /^(utm_[^=]*|fbclid|gclid|msclkid)$/i;
const OFFICIAL_ORIGIN = "https://www.ashoka.edu.in";

export function canonicalizeUrl(input: string): URL {
  const url = new URL(input);
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  url.hash = "";

  const parameters = [...url.searchParams.entries()]
    .filter(([name]) => !TRACKING_PARAMETER.test(name))
    .sort(([nameA, valueA], [nameB, valueB]) =>
      nameA === nameB ? valueA.localeCompare(valueB) : nameA.localeCompare(nameB),
    );
  url.search = "";
  for (const [name, value] of parameters) url.searchParams.append(name, value);
  return url;
}

function isUnderPrefix(pathname: string, prefix: string): boolean {
  const normalized = prefix.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  return pathname === normalized || pathname.startsWith(`${normalized}/`);
}

export function classifyUrl(
  candidate: URL,
  policy: CrawlPolicy,
  directlyLinked: boolean,
): "html" | "pdf" | "reject" {
  const url = canonicalizeUrl(candidate.href);
  if (url.protocol !== "https:" || url.origin !== OFFICIAL_ORIGIN || url.origin !== policy.baseUrl.origin) return "reject";
  if (/\.pdf$/i.test(url.pathname)) return directlyLinked ? "pdf" : "reject";
  return policy.htmlPathPrefixes.some((prefix) => isUnderPrefix(url.pathname, prefix))
    ? "html"
    : "reject";
}

import { canonicalizeUrl } from "./url-policy";

export class CrawlFrontier {
  private readonly seen = new Set<string>();

  add(input: string): boolean {
    const href = canonicalizeUrl(input).href;
    if (this.seen.has(href)) return false;
    this.seen.add(href);
    return true;
  }
}

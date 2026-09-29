import { chunkDocument, type ChunkOptions, type PendingChunk } from "./chunk";
import { fetchPage, type FetchLike } from "./fetch";
import { CrawlFrontier } from "./frontier";
import { extractHtml, type ExtractedDocument } from "./html";
import { extractPdf } from "./pdf";
import { canonicalizeUrl, classifyUrl, type CrawlPolicy } from "./url-policy";
import { documentHash } from "../indexing/document-hash";

type CandidateKind = "html" | "pdf";

export interface CrawlStorage {
  hasContent(url: URL, contentHash: string): Promise<boolean>;
  save(document: ExtractedDocument, chunks: PendingChunk[], embeddings: number[][], contentHash?: string): Promise<void>;
  recordFailure(url: URL, reason: string, contentType?: ExtractedDocument["contentType"]): Promise<void>;
  recordDiscarded(url: URL): Promise<void>;
  recordSuccess?(url: URL): Promise<void>;
}

export interface CrawlDependencies {
  policy: CrawlPolicy;
  fetch: FetchLike;
  storage: CrawlStorage;
  embedder: { embed(inputs: string[]): Promise<number[][]> };
  clock: () => number;
  delay: (milliseconds: number) => Promise<void>;
  requestsPerSecond: number;
  maxPages: number;
  timeoutMs: number;
  maxResponseBytes: number;
  maxRetries: number;
  embeddingDimensions: number;
  chunkOptions: ChunkOptions;
}

export interface CrawlSummary {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  discarded: number;
}

interface PendingUrl {
  url: URL;
  kind: CandidateKind;
  directlyLinked: boolean;
}

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

function retryAfter(response: Response, now: number): number {
  const value = response.headers.get("retry-after");
  if (!value) return 1_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? 1_000 : Math.max(0, date - now);
}

function expectedContentType(kind: CandidateKind, contentType: string): boolean {
  return kind === "html" ? /text\/html|application\/xhtml\+xml/i.test(contentType) : /application\/pdf/i.test(contentType);
}

async function readBodyWithinCap(response: Response, maxResponseBytes: number): Promise<Uint8Array> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxResponseBytes) throw new Error("response exceeds configured size cap");
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxResponseBytes) {
        await reader.cancel("response exceeds configured size cap");
        throw new Error("response exceeds configured size cap");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function crawl(deps: CrawlDependencies): Promise<CrawlSummary> {
  const summary: CrawlSummary = { attempted: 0, succeeded: 0, failed: 0, skipped: 0, discarded: 0 };
  const frontier = new CrawlFrontier();
  const queue: PendingUrl[] = [];
  let lastRequestAt: number | undefined;

  const enqueue = (url: URL, kind: CandidateKind, directlyLinked: boolean) => {
    const canonical = canonicalizeUrl(url.href);
    if (frontier.add(canonical.href)) queue.push({ url: canonical, kind, directlyLinked });
  };
  const seed = canonicalizeUrl(deps.policy.baseUrl.href);
  if (classifyUrl(seed, deps.policy, false) !== "html") {
    summary.failed += 1;
    await deps.storage.recordFailure(seed, "crawl seed rejected by policy", "text/html");
    return summary;
  }
  enqueue(seed, "html", false);

  const request = async (url: URL): Promise<Response> => {
    for (let attempt = 0; ; attempt += 1) {
      if (lastRequestAt !== undefined) {
        const minimumDelay = Math.ceil(1_000 / deps.requestsPerSecond);
        const remaining = minimumDelay - (deps.clock() - lastRequestAt);
        if (remaining > 0) await deps.delay(remaining);
      }
      const response = await fetchPage(deps.fetch, url, deps.timeoutMs);
      lastRequestAt = deps.clock();
      if ((response.status === 429 || response.status >= 500) && response.status < 600 && attempt < deps.maxRetries) {
        await deps.delay(retryAfter(response, deps.clock()));
        continue;
      }
      return response;
    }
  };

  while (queue.length && summary.attempted < deps.maxPages) {
    const pending = queue.shift()!;
    summary.attempted += 1;
    let current = pending.url;
    let duplicateRedirectTarget = false;

    try {
      let response: Response | undefined;
      for (let redirects = 0; redirects <= 5; redirects += 1) {
        response = await request(current);
        if (!REDIRECT_STATUS.has(response.status)) break;
        const location = response.headers.get("location");
        if (!location) throw new Error("redirect missing Location header");
        const target = canonicalizeUrl(new URL(location, current).href);
        const classification = classifyUrl(target, deps.policy, pending.directlyLinked);
        if (classification !== pending.kind) throw new Error("unsafe redirect target rejected");
        if (target.href === current.href) throw new Error("redirect loop");
        if (!frontier.add(target.href)) {
          duplicateRedirectTarget = true;
          break;
        }
        current = target;
        if (redirects === 5) throw new Error("too many redirects");
      }
      if (duplicateRedirectTarget) {
        summary.skipped += 1;
        continue;
      }
      if (!response) throw new Error("no response received");
      if (response.status === 403) throw new Error("Cloudflare challenge or access denied (403)");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const contentType = response.headers.get("content-type") ?? "";
      if (!expectedContentType(pending.kind, contentType)) throw new Error(`unexpected content type: ${contentType || "missing"}`);
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > deps.maxResponseBytes) {
        throw new Error("response exceeds configured size cap");
      }
      const bytes = await readBodyWithinCap(response, deps.maxResponseBytes);

      const document = pending.kind === "html"
        ? extractHtml(new TextDecoder().decode(bytes), current)
        : await extractPdf(bytes, current);
      if (pending.kind === "html" && classifyUrl(document.canonicalUrl, deps.policy, false) !== "html") {
        document.canonicalUrl = current;
      }
      if (!document.blocks.length || !document.text.trim()) throw new Error("empty extracted document");
      const contentHash = documentHash(document);
      if (pending.kind === "html") {
        for (const link of document.links) {
          const classification = classifyUrl(link, deps.policy, true);
          if (classification === "reject") { summary.discarded += 1; await deps.storage.recordDiscarded(link); }
          else enqueue(link, classification, true);
        }
      }
      if (await deps.storage.hasContent(document.canonicalUrl, contentHash)) {
        await deps.storage.recordSuccess?.(document.canonicalUrl);
        summary.skipped += 1;
        continue;
      }
      const chunks = chunkDocument(document, deps.chunkOptions);
      if (!chunks.length) throw new Error("empty chunk set");
      const embeddings = await deps.embedder.embed(chunks.map((chunk) => chunk.text));
      if (embeddings.length !== chunks.length || !embeddings.every((vector) => vector.length === deps.embeddingDimensions && vector.every(Number.isFinite))) {
        throw new Error(`embeddings must contain exactly ${deps.embeddingDimensions} finite values`);
      }
      await deps.storage.save(document, chunks, embeddings, contentHash);
      summary.succeeded += 1;

    } catch (error) {
      summary.failed += 1;
      await deps.storage.recordFailure(
        current,
        error instanceof Error ? error.message : "unknown crawl failure",
        pending.kind === "pdf" ? "application/pdf" : "text/html",
      );
    }
  }

  return summary;
}

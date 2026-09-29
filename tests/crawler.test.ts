import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { crawl, type CrawlDependencies } from "../src/lib/crawl/crawler";
import { extractHtml } from "../src/lib/crawl/html";
import { documentHash } from "../src/lib/indexing/document-hash";
import { SupabaseStore } from "../src/lib/indexing/store";

const baseUrl = new URL("https://www.ashoka.edu.in/department/department-of-cs/");
const duplicateHtml = readFileSync(resolve("tests/fixtures/department-duplicate-links.html"), "utf8");

function html(body: string, status = 200, headers: HeadersInit = {}): Response {
  return new Response(body, { status, headers: { "content-type": "text/html", ...headers } });
}

function pdf(body = "%PDF-test"): Response {
  return new Response(body, { headers: { "content-type": "application/pdf" } });
}

function createDeps(responses: Response[], overrides: Partial<CrawlDependencies> = {}) {
  const calls: string[] = [];
  const delays: number[] = [];
  const failures: Array<{ url: string; reason: string }> = [];
  const saved: string[] = [];
  const discarded: string[] = [];
  const deps: CrawlDependencies = {
    policy: { baseUrl, htmlPathPrefixes: [baseUrl.pathname] },
    fetch: async (input) => {
      calls.push(String(input));
      const response = responses.shift();
      if (!response) throw new Error("unexpected fetch");
      return response;
    },
    storage: {
      hasContent: async () => false,
      save: async (document) => {
        saved.push(document.canonicalUrl.href);
      },
      recordFailure: async (url, reason) => {
        failures.push({ url: url.href, reason });
      },
      recordDiscarded: async (url) => {
        discarded.push(url.href);
      },
    },
    embedder: { embed: async (inputs) => inputs.map(() => Array.from({ length: 768 }, () => 0)) },
    clock: () => 0,
    delay: async (milliseconds) => {
      delays.push(milliseconds);
    },
    requestsPerSecond: 1,
    maxPages: 10,
    timeoutMs: 1_000,
    maxResponseBytes: 1_000,
    maxRetries: 2,
    chunkOptions: { targetCharacters: 100, overlapCharacters: 10 },
    embeddingDimensions: 768,
    ...overrides,
  };
  return { deps, responses, calls, delays, failures, saved, discarded };
}

describe("crawl", () => {
  it("paces serial requests and sends an identifying browser-compatible request", async () => {
    const seenInit: RequestInit[] = [];
    const state = createDeps([html('<p>Department overview.</p><a href="/department/department-of-cs/faculty">Faculty</a>'), html("<p>Faculty</p>")], {
      fetch: async (input, init) => {
        seenInit.push(init ?? {});
        state.calls.push(String(input));
        return state.responses.shift()!;
      },
    });
    await crawl(state.deps);

    expect(state.calls).toHaveLength(2);
    expect(state.delays).toEqual([1_000]);
    expect(new Headers(seenInit[0].headers).get("user-agent")).toMatch(/CS-Department-Information-Assistant/);
    expect(new Headers(seenInit[0].headers).get("accept")).toMatch(/text\/html/);
  });

  it("retries 429 after Retry-After and bounds 5xx retries", async () => {
    const retry = createDeps([
      html("busy", 429, { "retry-after": "2" }),
      html("ready"),
    ]);
    await crawl(retry.deps);
    expect(retry.calls).toHaveLength(2);
    expect(retry.delays).toContain(2_000);

    const serverErrors = createDeps([html("bad", 503), html("bad", 503), html("bad", 503)]);
    const summary = await crawl(serverErrors.deps);
    expect(serverErrors.calls).toHaveLength(3);
    expect(summary.failed).toBe(1);
    expect(serverErrors.failures[0].reason).toMatch(/503/);
  });

  it("rejects oversized and wrong-content responses without indexing", async () => {
    const oversized = createDeps([html("x".repeat(20))], { maxResponseBytes: 10 });
    await crawl(oversized.deps);
    expect(oversized.saved).toEqual([]);
    expect(oversized.failures[0].reason).toMatch(/size/i);

    const wrongType = createDeps([new Response("plain", { headers: { "content-type": "text/plain" } })]);
    await crawl(wrongType.deps);
    expect(wrongType.saved).toEqual([]);
    expect(wrongType.failures[0].reason).toMatch(/content type/i);
  });

  it("rejects an unsafe redirect before consuming its body", async () => {
    const body = { read: false };
    const response = {
      status: 302,
      headers: new Headers({ location: "https://evil.example/steal" }),
      arrayBuffer: async () => {
        body.read = true;
        return new ArrayBuffer(0);
      },
    } as unknown as Response;
    const state = createDeps([response]);

    await crawl(state.deps);

    expect(body.read).toBe(false);
    expect(state.failures[0].reason).toMatch(/redirect/i);
  });

  it("fetches PDF tracking and fragment variants once", async () => {
    const state = createDeps([html(duplicateHtml), pdf()]);
    await crawl(state.deps);

    expect(state.calls).toEqual([
      baseUrl.href,
      "https://www.ashoka.edu.in/wp-content/uploads/course-list.pdf",
    ]);
  });

  it("skips unchanged content before embedding or storage", async () => {
    let embedded = 0;
    const source = "<p>unchanged</p>";
    let receivedHash = "";
    const state = createDeps([html(source)], {
      storage: {
        hasContent: async (_url, hash) => {
          receivedHash = hash;
          return true;
        },
        save: async () => undefined,
        recordFailure: async () => undefined,
        recordDiscarded: async () => undefined,
      },
      embedder: { embed: async () => { embedded += 1; return []; } },
    });

    const summary = await crawl(state.deps);

    expect(summary.skipped).toBe(1);
    expect(embedded).toBe(0);
    expect(receivedHash).toBe(documentHash(extractHtml(source, baseUrl)));
  });

  it("discovers children from unchanged HTML", async () => {
    const state = createDeps([html('<p>Seed</p><a href="/department/department-of-cs/child">Child</a>'), html("<p>Child</p>")], { storage: { hasContent: async () => true, save: async () => undefined, recordFailure: async () => undefined, recordDiscarded: async () => undefined } });
    await crawl(state.deps);
    expect(state.calls).toEqual([baseUrl.href, "https://www.ashoka.edu.in/department/department-of-cs/child"]);
  });

  it("replaces a matching page after a transient failure", async () => {
    const replacements: unknown[] = [];
    const store = new SupabaseStore({
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "page", crawl_status: "failed" }, error: null }) }) }) }),
      }),
      rpc: async (_name: string, args: unknown) => {
        replacements.push(args);
        return { error: null };
      },
    } as never, "configured-embedding-model");
    const state = createDeps([html("<p>Recovered content.</p>")], { storage: store });

    await expect(crawl(state.deps)).resolves.toMatchObject({ succeeded: 1, skipped: 0 });
    expect(replacements).toHaveLength(1);
  });

  it("never fetches external links and records them as discarded", async () => {
    const state = createDeps([html('<p>Department overview.</p><a href="https://evil.example/document">Nope</a>')]);
    await crawl(state.deps);

    expect(state.calls).toEqual([baseUrl.href]);
    expect(state.discarded).toEqual(["https://evil.example/document"]);
  });

  it("records 403 and challenge pages as failures without attempting a bypass", async () => {
    const forbidden = createDeps([html("forbidden", 403)]);
    await crawl(forbidden.deps);
    expect(forbidden.failures[0].reason).toMatch(/403|Cloudflare/);

    const challenge = createDeps([html("<title>Just a moment...</title><div>cf-chl</div>")]);
    await crawl(challenge.deps);
    expect(challenge.failures[0].reason).toMatch(/Cloudflare challenge/);
  });

  it("rejects an unsafe seed before fetching it", async () => {
    const state = createDeps([html("must not fetch")], {
      policy: {
        baseUrl: new URL("https://evil.example/department/department-of-cs/"),
        htmlPathPrefixes: ["/department/department-of-cs/"],
      },
    });

    const summary = await crawl(state.deps);

    expect(state.calls).toEqual([]);
    expect(summary.failed).toBe(1);
    expect(state.failures[0].reason).toMatch(/seed.*policy/i);
  });

  it("cancels a streaming body as soon as its byte cap is crossed", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("123456"));
        controller.enqueue(new TextEncoder().encode("789012"));
      },
      cancel() {
        cancelled = true;
      },
    });
    const state = createDeps([new Response(stream, { headers: { "content-type": "text/html" } })], {
      maxResponseBytes: 10,
    });

    await crawl(state.deps);

    expect(cancelled).toBe(true);
    expect(state.saved).toEqual([]);
    expect(state.failures[0].reason).toMatch(/size cap/);
  });

  it("does not fetch a redirect destination twice when it is already queued", async () => {
    const state = createDeps([
      html('<p>Department overview.</p><a href="/department/department-of-cs/redirect">Redirect</a><a href="/department/department-of-cs/target">Target</a>'),
      html("", 302, { location: "/department/department-of-cs/target" }),
      html("Target"),
    ]);

    await crawl(state.deps);

    expect(state.calls).toEqual([
      baseUrl.href,
      "https://www.ashoka.edu.in/department/department-of-cs/redirect",
      "https://www.ashoka.edu.in/department/department-of-cs/target",
    ]);
  });

  it("falls back to the fetched URL when an HTML canonical is outside policy", async () => {
    const state = createDeps([
      html('<link rel="canonical" href="/about?z=2&a=1#ignored" /><p>Department content.</p>'),
    ]);

    await crawl(state.deps);

    expect(state.saved).toEqual([baseUrl.href]);
  });

  it("rejects empty extracted documents and invalid vectors before storage", async () => {
    const empty = createDeps([html("")]);
    await crawl(empty.deps);
    expect(empty.saved).toEqual([]);
    expect(empty.failures[0].reason).toMatch(/empty/);

    const vectors = createDeps([html("<p>content</p>")], { embedder: { embed: async () => [[0]] } });
    await crawl(vectors.deps);
    expect(vectors.saved).toEqual([]);
    expect(vectors.failures[0].reason).toMatch(/768/);

    const count = createDeps([html("<p>content</p>")], { embedder: { embed: async () => [] } });
    await crawl(count.deps);
    expect(count.saved).toEqual([]);
    expect(count.failures[0].reason).toMatch(/768/);

    const nonFinite = createDeps([html("<p>content</p>")], {
      embedder: { embed: async () => [Array.from({ length: 768 }, () => Number.NaN)] },
    });
    await crawl(nonFinite.deps);
    expect(nonFinite.saved).toEqual([]);
    expect(nonFinite.failures[0].reason).toMatch(/finite/);
  });
});

import { describe, expect, it } from "vitest";

import { createChatHandler } from "../src/app/api/chat/route";
import { FALLBACK } from "../src/lib/rag/citations";

describe("POST /api/chat", () => {
  it("rejects invalid input and rate limits before cache or model work", async () => {
    let cacheReads = 0;
    const handler = createChatHandler({ checkRateLimit: async () => ({ allowed: false, remaining: 0, resetAt: "later" }), cache: { lookup: async () => { cacheReads += 1; return { cached: null, key: { questionHash: "key", corpusRevision: 1, retrievalSettings: { limit: 5, minScore: 0 } } }; }, set: async () => undefined }, answer: async () => ({ answer: "unused", sources: [] }) });
    expect((await handler(new Request("https://local", { method: "POST", body: "not json" }))).status).toBe(400);
    expect((await handler(new Request("https://local", { method: "POST", body: JSON.stringify({ question: "question" }) }))).status).toBe(429);
    const limited = await handler(new Request("https://local", { method: "POST", body: JSON.stringify({ question: "question" }) }));
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect(cacheReads).toBe(0);
  });

  it("returns cache hits without answer work and returns grounded fallback safely", async () => {
    let answers = 0;
    const cached = { answer: "Cached [1]", sources: [] };
    const handler = createChatHandler({ checkRateLimit: async () => ({ allowed: true, remaining: 9, resetAt: "later" }), cache: { lookup: async () => ({ cached: { result: cached, retrieval: [] }, key: { questionHash: "key", corpusRevision: 1, retrievalSettings: { limit: 5, minScore: 0 } } }), set: async () => undefined }, answer: async () => { answers += 1; return { answer: FALLBACK, sources: [] }; } });
    await expect((await handler(new Request("https://local", { method: "POST", body: JSON.stringify({ question: "  question " }) }))).json()).resolves.toEqual(cached);
    expect(answers).toBe(0);

    const fallbackHandler = createChatHandler({ checkRateLimit: async () => ({ allowed: true, remaining: 9, resetAt: "later" }), cache: { lookup: async () => ({ cached: null, key: { questionHash: "key", corpusRevision: 1, retrievalSettings: { limit: 5, minScore: 0 } } }), set: async () => undefined }, answer: async () => ({ answer: FALLBACK, sources: [] }) });
    await expect((await fallbackHandler(new Request("https://local", { method: "POST", body: JSON.stringify({ question: "question" }) }))).json()).resolves.toEqual({ answer: FALLBACK, sources: [] });

    const answer = { answer: "Grounded fact [1]", sources: [] };
    const cacheFailureHandler = createChatHandler({ checkRateLimit: async () => ({ allowed: true, remaining: 9, resetAt: "later" }), cache: { lookup: async () => ({ cached: null, key: { questionHash: "key", corpusRevision: 1, retrievalSettings: { limit: 5, minScore: 0 } } }), set: async () => { throw new Error("cache unavailable"); } }, answer: async () => answer });
    await expect((await cacheFailureHandler(new Request("https://local", { method: "POST", body: JSON.stringify({ question: "question" }) }))).json()).resolves.toEqual(answer);
  });
});

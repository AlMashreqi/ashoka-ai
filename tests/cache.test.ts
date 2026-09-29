import { describe, expect, it } from "vitest";

import { cacheKey, SupabaseAnswerCache } from "../src/lib/rag/cache";

describe("answer cache key", () => {
  it("normalizes questions and invalidates for revision, model, retrieval settings, and prompt version", () => {
    const base = { question: "  What  programmes? ", corpusRevision: 1, embeddingModel: "model-a", retrievalSettings: { limit: 5, minScore: 0 }, promptVersion: "v1" };
    expect(cacheKey(base)).toBe(cacheKey({ ...base, question: "What programmes?" }));
    expect(new Set([cacheKey(base), cacheKey({ ...base, corpusRevision: 2 }), cacheKey({ ...base, embeddingModel: "model-b" }), cacheKey({ ...base, retrievalSettings: { limit: 4, minScore: 0 } }), cacheKey({ ...base, promptVersion: "v2" })]).size).toBe(5);
  });

  it("writes successful answer sources and retrieval metadata with a TTL", async () => {
    let written: Record<string, unknown> | undefined;
    let options: Record<string, unknown> | undefined;
    const database = {
      from: (table: string) => table === "app_state"
        ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { corpus_revision: 3 }, error: null }) }) }) }
        : { upsert: async (value: Record<string, unknown>, valueOptions: Record<string, unknown>) => { written = value; options = valueOptions; return { error: null }; } },
    };
    const cache = new SupabaseAnswerCache(database, { embeddingModel: "model", retrievalSettings: { limit: 5, minScore: 0 }, promptVersion: "v1" }, 60);
    await cache.set("question", { answer: "Answer [1]", sources: [] }, [{ id: "chunk", sourcePageId: "source", sourceUrl: "https://www.ashoka.edu.in/department/department-of-cs/", sourceTitle: "Department", headingTrail: [], pageNumber: null, ordinal: 0, text: "evidence", contentHash: "hash", embedding: [], embeddingModel: "model", score: 1 }]);

    expect(written).toMatchObject({ corpus_revision: 3, answer: "Answer [1]", retrieval: [expect.objectContaining({ id: "chunk" })] });
    expect(Date.parse(String(written?.expires_at))).toBeGreaterThan(Date.now());
    expect(options).toEqual({ onConflict: "question_hash,corpus_revision,embedding_model,retrieval_settings,prompt_version" });
  });

  it("matches retrieval settings as JSONB when reading a non-expired entry", async () => {
    const filters: Array<[string, unknown]> = [];
    const database = {
      from: (table: string) => table === "app_state"
        ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { corpus_revision: 3 }, error: null }) }) }) }
        : { select: () => {
          const query = { eq: (field: string, value: unknown) => { filters.push([field, value]); return query; }, gt: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) };
          return query;
        } },
    };
    const cache = new SupabaseAnswerCache(database, { embeddingModel: "model", retrievalSettings: { limit: 5, minScore: 0 }, promptVersion: "v1" }, 60);
    await expect(cache.lookup("question")).resolves.toMatchObject({ cached: null });

    expect(filters).toContainEqual(["retrieval_settings", '{"limit":5,"minScore":0}']);
  });

  it("writes with the revision captured by its lookup", async () => {
    const writes: Record<string, unknown>[] = [];
    let revision = 1;
    const database = {
      from: (table: string) => table === "app_state"
        ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { corpus_revision: revision }, error: null }) }) }) }
        : {
          select: () => { const query = { eq: () => query, gt: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }; return query; },
          upsert: async (value: Record<string, unknown>) => { writes.push(value); return { error: null }; },
        },
    };
    const cache = new SupabaseAnswerCache(database as never, { embeddingModel: "model", retrievalSettings: { limit: 5, minScore: 0.6 }, promptVersion: "v1" }, 60);
    const { key } = await cache.lookup("question");
    revision = 2;
    await cache.set("question", { answer: "fact [1]", sources: [] }, [], key);
    expect(writes[0]).toMatchObject({ corpus_revision: 1 });
  });
});

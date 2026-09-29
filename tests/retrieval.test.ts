import { describe, expect, it } from "vitest";

import { fuseRanks, retrieve } from "../src/lib/rag/retrieve";
import type { RetrievedChunk } from "../src/lib/types";

function chunk(id: string, sourceUrl: string, lexicalRank?: number, semanticRank?: number): RetrievedChunk {
  return { id, sourcePageId: sourceUrl, sourceUrl, sourceTitle: "Official CS", headingTrail: [], pageNumber: null, ordinal: 0, text: id, contentHash: id, embedding: [], embeddingModel: "model", score: 0, lexicalRank, semanticRank };
}

function rpcRows(chunks: RetrievedChunk[]) {
  return chunks.map((item) => ({ id: item.id, source_page_id: item.sourcePageId, source_url: item.sourceUrl, source_title: item.sourceTitle, heading_trail: item.headingTrail, page_number: item.pageNumber, ordinal: item.ordinal, chunk_text: item.text, content_hash: item.contentHash, embedding_model: item.embeddingModel, lexical_rank: item.lexicalRank ?? null, semantic_rank: item.semanticRank ?? null, lexical_score: item.lexicalRank ? 1 : 0, semantic_similarity: 0 }));
}

describe("hybrid retrieval", () => {
  it("fuses literal lexical and semantic ranks deterministically", () => {
    expect(fuseRanks([chunk("lexical", "https://www.ashoka.edu.in/a", 1), chunk("both", "https://www.ashoka.edu.in/b", 2, 1)])
      .map(({ id, score }) => [id, Number(score.toFixed(6))]))
      .toEqual([["both", 0.032522], ["lexical", 0.016393]]);
  });

  it("keeps lexical-only proper nouns, removes duplicate content, limits sources to two, thresholds, and caps at five", async () => {
    const rows = [
      chunk("Rao", "https://www.ashoka.edu.in/faculty", 1),
      chunk("duplicate", "https://www.ashoka.edu.in/faculty", 2),
      chunk("third", "https://www.ashoka.edu.in/faculty", 3),
      chunk("two", "https://www.ashoka.edu.in/programmes", 1),
      chunk("three", "https://www.ashoka.edu.in/programmes", 2),
      chunk("four", "https://www.ashoka.edu.in/research", 1),
      chunk("five", "https://www.ashoka.edu.in/events", 1),
      chunk("six", "https://www.ashoka.edu.in/contact", 1),
    ];
    rows[1].contentHash = "Rao";
    let embeds = 0;
    const result = await retrieve("  Dr. Rao  ", {
      embedder: { embed: async (inputs) => { embeds += 1; expect(inputs).toEqual(["Dr. Rao"]); return [[0]]; } },
      database: { rpc: async () => ({ data: rpcRows(rows), error: null }) },
      limit: 5,
      minScore: 0,
    });

    expect(embeds).toBe(1);
    expect(result.map((item) => item.id)).toEqual(["five", "four", "Rao", "six", "two"]);
    expect(result.filter((item) => item.sourceUrl === "https://www.ashoka.edu.in/faculty")).toHaveLength(1);
    await expect(retrieve("question", { embedder: { embed: async () => [[0]] }, database: { rpc: async () => ({ data: [{ id: "weak", source_page_id: "weak", source_url: "https://www.ashoka.edu.in/a", source_title: "A", heading_trail: [], page_number: null, ordinal: 0, chunk_text: "weak", content_hash: "weak", embedding_model: "model", lexical_rank: null, semantic_rank: 1, lexical_score: 0, semantic_similarity: 0.01 }], error: null }) }, limit: 5, minScore: 0.02 })).resolves.toEqual([]);
    await expect(retrieve("question", { embedder: { embed: async () => [[0]] }, database: { rpc: async () => ({ data: [], error: null }) }, limit: 5, minScore: 0 })).resolves.toEqual([]);
  });

  it("does not embed blank or overlong normalized questions", async () => {
    let embeds = 0;
    const deps = { embedder: { embed: async () => { embeds += 1; return [[0]]; } }, database: { rpc: async () => ({ data: [], error: null }) }, limit: 5, minScore: 0 };
    await expect(retrieve("   ", deps)).resolves.toEqual([]);
    await expect(retrieve("x".repeat(501), deps)).resolves.toEqual([]);
    expect(embeds).toBe(0);
  });

  it("keeps lexical-only proper nouns but rejects unrelated semantic neighbors below the configured threshold", async () => {
    const args: Record<string, unknown>[] = [];
    const result = await retrieve("Rao", {
      embedder: { embed: async () => [[0]] },
      database: { rpc: async (_name, value) => {
        args.push(value);
        return { data: [
          { id: "lexical", source_page_id: "faculty", source_url: "https://www.ashoka.edu.in/faculty", source_title: "Faculty", heading_trail: [], page_number: null, ordinal: 0, chunk_text: "Dr Rao", content_hash: "lexical", embedding_model: "model", lexical_rank: 1, semantic_rank: null, lexical_score: 0.2, semantic_similarity: 0.1 },
          { id: "weak-semantic", source_page_id: "other", source_url: "https://www.ashoka.edu.in/other", source_title: "Other", heading_trail: [], page_number: null, ordinal: 0, chunk_text: "Unrelated", content_hash: "weak", embedding_model: "model", lexical_rank: null, semantic_rank: 1, lexical_score: 0, semantic_similarity: 0.59 },
          { id: "strong-semantic", source_page_id: "programmes", source_url: "https://www.ashoka.edu.in/programmes", source_title: "Programmes", heading_trail: [], page_number: null, ordinal: 0, chunk_text: "Relevant", content_hash: "strong", embedding_model: "model", lexical_rank: null, semantic_rank: 2, lexical_score: 0, semantic_similarity: 0.6 },
        ], error: null };
      } },
      limit: 5,
      minScore: 0.6,
    });
    expect(args[0].p_min_score).toBe(0.6);
    expect(result.map((item) => item.id)).toEqual(["lexical", "strong-semantic"]);
  });

  it("limits diversity by source page even when equivalent URLs differ", async () => {
    const result = await retrieve("question", { embedder: { embed: async () => [[0]] }, database: { rpc: async () => ({ data: [
      { id: "one", source_page_id: "same", source_url: "https://www.ashoka.edu.in/a", source_title: "A", heading_trail: [], page_number: null, ordinal: 0, chunk_text: "one", content_hash: "one", embedding_model: "model", lexical_rank: 1, semantic_rank: null, lexical_score: 1, semantic_similarity: 0 },
      { id: "two", source_page_id: "same", source_url: "https://www.ashoka.edu.in/a?x=1", source_title: "A", heading_trail: [], page_number: null, ordinal: 1, chunk_text: "two", content_hash: "two", embedding_model: "model", lexical_rank: 2, semantic_rank: null, lexical_score: 1, semantic_similarity: 0 },
      { id: "three", source_page_id: "same", source_url: "https://www.ashoka.edu.in/a?x=2", source_title: "A", heading_trail: [], page_number: null, ordinal: 2, chunk_text: "three", content_hash: "three", embedding_model: "model", lexical_rank: 3, semantic_rank: null, lexical_score: 1, semantic_similarity: 0 },
    ], error: null }) }, limit: 5, minScore: 0 });
    expect(result.map((item) => item.id)).toEqual(["one", "two"]);
  });
});

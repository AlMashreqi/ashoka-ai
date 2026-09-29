import type { EmbeddingProvider } from "../ai/provider";
import type { RetrievedChunk } from "../types";

export interface RetrievalDependencies {
  embedder: EmbeddingProvider;
  database: { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
  limit: number;
  minScore: number;
}

type RpcChunk = {
  id: string;
  source_page_id: string;
  source_url: string;
  source_title: string;
  heading_trail: string[] | null;
  page_number: number | null;
  ordinal: number;
  chunk_text: string;
  content_hash: string;
  embedding_model: string;
  lexical_rank: number | null;
  semantic_rank: number | null;
  lexical_score: number | null;
  semantic_similarity: number | null;
};

export function normalizeQuestion(question: string): string {
  return question.trim().replace(/\s+/g, " ");
}

export function fuseRanks(chunks: RetrievedChunk[]): RetrievedChunk[] {
  return chunks
    .map((chunk) => ({
      ...chunk,
      score: (chunk.lexicalRank ? 1 / (60 + chunk.lexicalRank) : 0) + (chunk.semanticRank ? 1 / (60 + chunk.semanticRank) : 0),
    }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

function fromRpc(row: RpcChunk): RetrievedChunk {
  return {
    id: row.id,
    sourcePageId: row.source_page_id,
    sourceUrl: row.source_url,
    sourceTitle: row.source_title,
    headingTrail: row.heading_trail ?? [],
    pageNumber: row.page_number,
    ordinal: row.ordinal,
    text: row.chunk_text,
    contentHash: row.content_hash,
    embedding: [],
    embeddingModel: row.embedding_model,
    score: 0,
    lexicalRank: row.lexical_rank ?? undefined,
    semanticRank: row.semantic_rank ?? undefined,
    lexicalScore: row.lexical_score ?? undefined,
    semanticSimilarity: row.semantic_similarity ?? undefined,
  };
}

export async function retrieve(question: string, deps: RetrievalDependencies): Promise<RetrievedChunk[]> {
  const normalized = normalizeQuestion(question);
  if (!normalized || normalized.length > 500) return [];
  const [embedding] = await deps.embedder.embed([normalized]);
  if (!embedding) throw new Error("embedding provider returned no query vector");
  const { data, error } = await deps.database.rpc("hybrid_search_chunks", {
    p_query: normalized,
    p_embedding: embedding,
    p_match_count: Math.max(1, Math.min(5, deps.limit)) * 4,
    p_min_score: deps.minScore,
  });
  if (error) throw new Error(error instanceof Error ? error.message : "hybrid retrieval failed");
  const seen = new Set<string>();
  const perSource = new Map<string, number>();
  return fuseRanks(Array.isArray(data) ? (data as RpcChunk[]).map(fromRpc) : [])
    .filter((chunk) => (chunk.lexicalScore ?? 0) > 0 || (chunk.semanticSimilarity ?? 0) >= deps.minScore)
    .filter((chunk) => {
      if (seen.has(chunk.contentHash) || (perSource.get(chunk.sourcePageId) ?? 0) >= 2) return false;
      seen.add(chunk.contentHash);
      perSource.set(chunk.sourcePageId, (perSource.get(chunk.sourcePageId) ?? 0) + 1);
      return true;
    })
    .slice(0, Math.min(5, deps.limit));
}

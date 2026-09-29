import { createHash } from "node:crypto";

import type { AnswerResult, RetrievedChunk } from "../types";
import { normalizeQuestion } from "./retrieve";

export interface CacheKeyInput {
  question: string;
  corpusRevision: number;
  embeddingModel: string;
  retrievalSettings: { limit: number; minScore: number };
  promptVersion: string;
}

export interface CachedAnswer { result: AnswerResult; retrieval: RetrievedChunk[] }
export interface CacheIdentity { questionHash: string; corpusRevision: number; retrievalSettings: CacheKeyInput["retrievalSettings"] }

export function cacheKey(input: CacheKeyInput): string {
  return createHash("sha256").update(JSON.stringify({ ...input, question: normalizeQuestion(input.question) })).digest("hex");
}

export interface AnswerCache {
  lookup(question: string): Promise<{ cached: CachedAnswer | null; key: CacheIdentity }>;
  set(question: string, result: AnswerResult, retrieval?: RetrievedChunk[], key?: CacheIdentity): Promise<void>;
}

export class SupabaseAnswerCache implements AnswerCache {
  constructor(
    private readonly database: { from(table: string): any },
    private readonly settings: Omit<CacheKeyInput, "question" | "corpusRevision">,
    private readonly ttlSeconds: number,
  ) {}

  private async identity(question: string): Promise<CacheIdentity> {
    const { data, error } = await this.database.from("app_state").select("corpus_revision").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message ?? "corpus revision unavailable");
    const corpusRevision = data?.corpus_revision ?? 0;
    return {
      questionHash: createHash("sha256").update(normalizeQuestion(question)).digest("hex"),
      corpusRevision,
      retrievalSettings: this.settings.retrievalSettings,
    };
  }

  async lookup(question: string): Promise<{ cached: CachedAnswer | null; key: CacheIdentity }> {
    const key = await this.identity(question);
    const { data, error } = await this.database.from("answer_cache").select("answer,sources,retrieval").eq("question_hash", key.questionHash).eq("corpus_revision", key.corpusRevision).eq("embedding_model", this.settings.embeddingModel).eq("retrieval_settings", JSON.stringify(key.retrievalSettings)).eq("prompt_version", this.settings.promptVersion).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (error) throw new Error(error.message ?? "cache read failed");
    return { cached: data ? { result: { answer: data.answer, sources: data.sources }, retrieval: data.retrieval ?? [] } : null, key };
  }

  async set(question: string, result: AnswerResult, retrieval: RetrievedChunk[] = [], key?: CacheIdentity): Promise<void> {
    const identity = key ?? await this.identity(question);
    const { error } = await this.database.from("answer_cache").upsert({
      question_hash: identity.questionHash,
      corpus_revision: identity.corpusRevision,
      embedding_model: this.settings.embeddingModel,
      retrieval_settings: identity.retrievalSettings,
      prompt_version: this.settings.promptVersion,
      answer: result.answer,
      sources: result.sources,
      retrieval,
      expires_at: new Date(Date.now() + this.ttlSeconds * 1_000).toISOString(),
    }, { onConflict: "question_hash,corpus_revision,embedding_model,retrieval_settings,prompt_version" });
    if (error) throw new Error(error.message ?? "cache write failed");
  }
}

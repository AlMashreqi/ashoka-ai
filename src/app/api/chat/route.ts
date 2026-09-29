import { z } from "zod";

import { answerQuestion } from "../../../lib/rag/answer";
import { type AnswerCache, SupabaseAnswerCache } from "../../../lib/rag/cache";
import { FALLBACK } from "../../../lib/rag/citations";
import { retrieve } from "../../../lib/rag/retrieve";
import { checkRateLimit, type RateLimitResult } from "../../../lib/rate-limit";
import type { AnswerResult, RetrievedChunk } from "../../../lib/types";

const bodySchema = z.object({ question: z.string().transform((value) => value.trim()).refine((value) => value.length >= 1 && value.length <= 500) });

type AnswerWork = AnswerResult | { result: AnswerResult; retrieval: RetrievedChunk[] };
export interface ChatHandlerDependencies {
  checkRateLimit(request: Request): Promise<RateLimitResult>;
  cache: AnswerCache;
  answer(question: string): Promise<AnswerWork>;
}

export function createChatHandler(deps: ChatHandlerDependencies) {
  return async function POST(request: Request): Promise<Response> {
    let question: string;
    try {
      question = bodySchema.parse(await request.json()).question;
    } catch {
      return Response.json({ error: "Invalid question" }, { status: 400 });
    }
    try {
      const rateLimit = await deps.checkRateLimit(request);
      if (!rateLimit.allowed) {
        const milliseconds = Date.parse(rateLimit.resetAt) - Date.now();
        return Response.json({ error: "Too many requests" }, { status: 429, headers: { "retry-after": String(Math.max(1, Math.ceil((Number.isFinite(milliseconds) ? milliseconds : 0) / 1_000))) } });
      }
      const { cached, key } = await deps.cache.lookup(question);
      if (cached) return Response.json(cached.result);
      const work = await deps.answer(question);
      const result = "result" in work ? work.result : work;
      const retrieval = "result" in work ? work.retrieval : [];
      if (result.answer !== FALLBACK) {
        try {
          await deps.cache.set(question, result, retrieval, key);
        } catch {
          // A cache outage must not discard a grounded answer.
        }
      }
      return Response.json(result);
    } catch {
      return Response.json({ answer: FALLBACK, sources: [] });
    }
  };
}

async function productionDependencies(): Promise<ChatHandlerDependencies> {
  const [{ getConfig }, { createServerSupabaseClient }, { createProviders }] = await Promise.all([
    import("../../../lib/config"),
    import("../../../lib/supabase/server"),
    import("../../../lib/ai/factory"),
  ]);
  const config = getConfig(process.env);
  const database = createServerSupabaseClient(config);
  const providers = createProviders(config);
  const cache = new SupabaseAnswerCache(database, {
    embeddingModel: config.embeddingModel,
    retrievalSettings: { limit: config.retrievalLimit, minScore: config.retrievalMinScore },
    promptVersion: "v2",
  }, config.cacheTtlSeconds);
  return {
    checkRateLimit: (request) => checkRateLimit(request, { database, salt: config.rateLimitSalt, trustedIpHeader: config.trustedIpHeader, maxRequests: config.rateLimitRequests, windowSeconds: config.rateLimitWindowSeconds }),
    cache,
    answer: async (question) => {
      let retrieval: RetrievedChunk[] = [];
      const result = await answerQuestion(question, {
        retrieve: (value) => retrieve(value, { embedder: providers.embedder, database, limit: config.retrievalLimit, minScore: config.retrievalMinScore }),
        chat: providers.chat,
        maxAnswerWords: config.maxAnswerWords,
        maxCompletionTokens: config.maxCompletionTokens,
        onRetrieved: (chunks) => { retrieval = chunks; },
      });
      return { result, retrieval };
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    return await createChatHandler(await productionDependencies())(request);
  } catch {
    return Response.json({ answer: FALLBACK, sources: [] });
  }
}

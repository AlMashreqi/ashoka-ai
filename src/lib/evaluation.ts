import type { AnswerResult } from "./types";
import { FALLBACK } from "./rag/citations";

const DEFAULT_LIVE_INTERVAL_MS = 6_500;

export function evaluationIntervalMs(value?: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= DEFAULT_LIVE_INTERVAL_MS ? parsed : DEFAULT_LIVE_INTERVAL_MS;
}

export function retryAfterMilliseconds(value: string | null): number {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1_000) : DEFAULT_LIVE_INTERVAL_MS;
}

export interface EvaluationQuestion {
  question: string;
  answerExpected: boolean;
  expectedSources: string[];
  verifySourcesLive: boolean;
}

export interface EvaluationResult {
  mode: "offline" | "live";
  total: number;
  checked: number;
  passed: number;
}

export async function evaluate(questions: EvaluationQuestion[], deps: { live: boolean; answer?: (question: string) => Promise<AnswerResult>; intervalMs?: number; delay?: (ms: number) => Promise<void> }): Promise<EvaluationResult> {
  if (!deps.live) return { mode: "offline", total: questions.length, checked: 0, passed: 0 };
  if (!deps.answer) throw new Error("live evaluation requires an answer function");
  let passed = 0;
  for (const [index, question] of questions.entries()) {
    if (index) await (deps.delay ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(deps.intervalMs ?? DEFAULT_LIVE_INTERVAL_MS);
    const result = await deps.answer(question.question);
    const urls = new Set(result.sources.map((source) => source.url));
    const sourcesMatch = !question.verifySourcesLive || question.expectedSources.every((url) => urls.has(url));
    if (question.answerExpected ? result.answer !== FALLBACK && sourcesMatch : result.answer === FALLBACK && !result.sources.length) passed += 1;
  }
  return { mode: "live", total: questions.length, checked: questions.length, passed };
}

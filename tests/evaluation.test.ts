import { describe, expect, it } from "vitest";

import { evaluate, evaluationIntervalMs, retryAfterMilliseconds, type EvaluationQuestion } from "../src/lib/evaluation";
import { FALLBACK } from "../src/lib/rag/citations";

const questions: EvaluationQuestion[] = [{ question: "What programmes are offered?", answerExpected: true, expectedSources: ["https://www.ashoka.edu.in/department/department-of-cs/"], verifySourcesLive: true }];

describe("evaluation", () => {
  it("stays offline unless live evaluation is explicitly enabled", async () => {
    let requests = 0;
    const result = await evaluate(questions, { live: false, answer: async () => { requests += 1; return { answer: "unused", sources: [] }; } });

    expect(result).toEqual({ mode: "offline", total: 1, checked: 0, passed: 0 });
    expect(requests).toBe(0);
  });

  it("requires supported live answers to be grounded and enforces sources only when requested", async () => {
    const source = "https://www.ashoka.edu.in/department/department-of-cs/";
    const result = await evaluate([
      { question: "fallback", answerExpected: true, expectedSources: [source], verifySourcesLive: true },
      { question: "unchecked source", answerExpected: true, expectedSources: [source], verifySourcesLive: false },
      { question: "checked source", answerExpected: true, expectedSources: [source], verifySourcesLive: true },
    ], {
      live: true,
      delay: async () => undefined,
      answer: async (question) => question === "fallback"
        ? { answer: FALLBACK, sources: [] }
        : { answer: "Grounded answer [1]", sources: question === "checked source" ? [{ chunkId: "1", title: "Department", url: source, numbers: [1] }] : [] },
    });

    expect(result).toEqual({ mode: "live", total: 3, checked: 3, passed: 2 });
  });

  it("requires unsupported live answers to be the exact fallback with no sources", async () => {
    const result = await evaluate([
      { question: "safe", answerExpected: false, expectedSources: [], verifySourcesLive: true },
      { question: "invented", answerExpected: false, expectedSources: [], verifySourcesLive: true },
      { question: "cited", answerExpected: false, expectedSources: [], verifySourcesLive: true },
    ], {
      live: true,
      delay: async () => undefined,
      answer: async (question) => question === "safe"
        ? { answer: FALLBACK, sources: [] }
        : question === "invented"
          ? { answer: "Unsupported answer", sources: [] }
          : { answer: FALLBACK, sources: [{ chunkId: "1", title: "Department", url: "https://www.ashoka.edu.in/department/department-of-cs/", numbers: [1] }] },
    });

    expect(result).toEqual({ mode: "live", total: 3, checked: 3, passed: 1 });
  });

  it("paces live requests through an injectable delay", async () => {
    const delays: number[] = [];
    await evaluate([...questions, ...questions], { live: true, answer: async () => ({ answer: "Grounded [1]", sources: [{ chunkId: "1", title: "Department", url: questions[0].expectedSources[0], numbers: [1] }] }), delay: async (milliseconds) => { delays.push(milliseconds); } });
    expect(delays).toEqual([6_500]);
  });

  it("uses a safe default evaluation pace and permits a slower environment override", () => {
    expect(evaluationIntervalMs()).toBe(6_500);
    expect(evaluationIntervalMs("7000")).toBe(7_000);
    expect(evaluationIntervalMs("0")).toBe(6_500);
  });

  it("uses a bounded wait when a 429 lacks Retry-After", () => {
    expect(retryAfterMilliseconds(null)).toBe(6_500);
    expect(retryAfterMilliseconds("2")).toBe(2_000);
  });
});

import { readFile } from "node:fs/promises";

import { evaluate, evaluationIntervalMs, retryAfterMilliseconds, type EvaluationQuestion } from "../src/lib/evaluation";

async function main() {
  const questions = JSON.parse(await readFile(new URL("../evaluation/questions.json", import.meta.url), "utf8")) as EvaluationQuestion[];
  const live = process.argv.includes("--live");
  if (!live) {
    console.log(`offline evaluation: ${questions.length} questions loaded; use npm run eval -- --live with EVALUATION_BASE_URL to verify sources.`);
    return;
  }
  const baseUrl = process.env.EVALUATION_BASE_URL;
  if (!baseUrl) throw new Error("EVALUATION_BASE_URL is required with --live");
  const result = await evaluate(questions, {
    live: true,
    answer: async (question) => {
      let response = await fetch(new URL("/api/chat", baseUrl), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      if (response.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, retryAfterMilliseconds(response.headers.get("retry-after"))));
        response = await fetch(new URL("/api/chat", baseUrl), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      }
      if (!response.ok) throw new Error(`chat request failed: ${response.status}`);
      return response.json();
    },
    intervalMs: evaluationIntervalMs(process.env.EVALUATION_INTERVAL_MS),
  });
  console.log(`live evaluation: ${result.passed}/${result.checked} source expectations met`);
  if (result.passed !== result.checked) process.exitCode = 1;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "evaluation failed"); process.exitCode = 1; });

"use client";

import { useState, type FormEvent } from "react";

type Answer = { answer: string; sources: Array<{ url: string; title: string; pageNumber?: number; numbers: number[] }> };

export default function ChatForm() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      const body = await response.json() as Answer & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to answer right now.");
      setResult(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to answer right now.");
    } finally {
      setLoading(false);
    }
  }

  return <form onSubmit={submit}><label htmlFor="question">Question</label><textarea id="question" value={question} onChange={(event) => setQuestion(event.target.value)} required maxLength={500} /><button disabled={loading || !question.trim()}>{loading ? "Thinking…" : "Ask"}</button><div aria-live="polite">{error && <p className="error">{error}</p>}{result && <article><p>{result.answer}</p>{result.sources.length > 0 && <><h2>Official sources</h2><ul>{result.sources.map((source) => <li key={`${source.url}-${source.pageNumber ?? ""}`}><a href={source.url} target="_blank" rel="noreferrer">[{source.numbers.join(", ")}] {source.title}{source.pageNumber ? ` (page ${source.pageNumber})` : ""}</a></li>)}</ul></>}</article>}</div></form>;
}

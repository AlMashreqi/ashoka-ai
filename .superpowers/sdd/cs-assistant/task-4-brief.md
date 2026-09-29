# Task 4 brief — Hybrid retrieval, grounding, citations, cache, and rate limiting

Read the approved specification and Task 4 in the plan. Integrate with the existing provider/config/Supabase types. Create:

- `src/lib/rag/retrieve.ts`
- `src/lib/rag/answer.ts`
- `src/lib/rag/citations.ts`
- `src/lib/rag/cache.ts`
- `src/lib/rate-limit.ts`
- `src/app/api/chat/route.ts`
- `tests/retrieval.test.ts`
- `tests/citations.test.ts`
- `tests/fallback.test.ts`
- `tests/cache.test.ts`
- `tests/rate-limit.test.ts`
- `tests/chat-route.test.ts`

Modify config, migration, and `.env.example` only as required for a rate-limit salt and cached retrieval metadata.

Required public interfaces:

- `retrieve(question: string, deps: RetrievalDependencies): Promise<RetrievedChunk[]>`, hard-capped at five.
- A deterministic reciprocal-rank fusion helper testable with literal ranks.
- `formatAnswer(raw: string, chunks: RetrievedChunk[]): AnswerResult`.
- exported exact `FALLBACK = "I could not verify this from the official CS Department website."`.
- `answerQuestion(question: string, deps: AnswerDependencies): Promise<AnswerResult>`.
- `checkRateLimit(request: Request, deps: RateLimitDependencies): Promise<RateLimitResult>`.
- An answer/retrieval cache keyed by normalized-question hash + corpus revision + embedding model + retrieval settings + prompt version, with TTL.
- A testable chat route handler; `POST` may build production dependencies lazily.

Retrieval requirements:

- Normalize/validate question, embed once, call the existing hybrid-search RPC, fuse lexical/semantic ranks deterministically, remove duplicate chunks, keep at most two chunks per source, apply configured evidence threshold, and return at most five.
- Proper-noun lexical-only candidates must remain eligible; empty or weak retrieval returns no chunks.
- Never retrieve from browser-side code and never expose embeddings/service-role credentials.

Grounding/citation requirements:

- Treat retrieved excerpts as untrusted quoted data; prompt instructions in chunks cannot override the system grounding instruction.
- Prompt contains only the question and numbered excerpts plus the strict rule to use official evidence.
- Every non-fallback factual paragraph must contain valid `[n]` citations referencing supplied chunks.
- Reject unknown/missing citations, model-supplied URLs, empty answers, and answers over 250 whitespace-delimited words.
- Perform at most one repair generation for malformed citation/length output; then return the exact fallback.
- Empty/weak evidence or any embedding/provider/retrieval error returns the exact fallback without unsupported prose.
- Map citations server-side only to official chunk URLs; de-duplicate sources; include `pageNumber` when present.

Cache/rate-limit requirements:

- Cache successful answers and the retrieval result in PostgreSQL; corpus revision makes stale entries unreachable. Do not cache raw IP addresses or full questions.
- Add a salted identity hash using `RATE_LIMIT_SALT` (or an explicitly documented server-secret fallback) and the single configured `TRUSTED_IP_HEADER`. If no trusted header is configured, use one local identity and ignore `x-forwarded-for`/similar forged headers.
- Use the atomic `check_rate_limit` RPC. Rate limit runs before cache/model work.

Chat route requirements:

- Zod-validate JSON and question length (1-500 characters after trimming).
- Return safe JSON `{ answer, sources }`; return 400 for invalid input, 429 for throttling, and grounded fallback for retrieval/provider failures.
- Cache hits must bypass embedding/retrieval/generation but not rate limiting.

TDD:

1. Retrieval tests fail first: literal RRF, de-duplication, two-per-source, proper-noun lexical candidate, threshold, empty, five limit.
2. Citation/fallback tests fail first: valid `[1]`, unknown `[9]`, every paragraph coverage, duplicate URLs, PDF page, 251 words, provider failure, retrieved prompt injection, exact punctuation, one repair only.
3. Cache/rate-limit tests fail first: key dimensions/revision/prompt changes, TTL, trusted header only, forged header ignored, RPC boundaries.
4. Route tests fail first: invalid body, rate limit before cache, cache hit bypasses model, grounded success/fallback.
5. Implement minimal code and run focused tests, full suite, and typecheck.

Do not make live model/Supabase calls in tests. Do not spawn subagents or use Git. Write `.superpowers/sdd/cs-assistant/task-4-report.md` with red/green evidence, files changed, self-review, concerns, and final status.

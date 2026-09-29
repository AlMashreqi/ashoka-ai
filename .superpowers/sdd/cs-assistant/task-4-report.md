# Task 4 report — Hybrid retrieval, grounding, citations, cache, and rate limiting

## Status

DONE_WITH_CONCERNS

## RED/GREEN evidence

### Initial RED

```sh
npm test -- tests/retrieval.test.ts tests/citations.test.ts tests/fallback.test.ts tests/cache.test.ts tests/rate-limit.test.ts tests/chat-route.test.ts
```

Result: exit 1. All six new suites failed at import time because the required Task 4 retrieval, grounding, cache, rate-limit, and route modules did not exist.

Additional focused RED runs validated new boundaries before their implementations:

```sh
npm test -- tests/config.test.ts
npm test -- tests/fallback.test.ts tests/cache.test.ts tests/chat-route.test.ts
npm test -- tests/retrieval.test.ts
npm test -- tests/cache.test.ts
```

Observed failures covered missing `rateLimitSalt`, a repair call without explicit repair guidance, overlong normalized questions reaching the embedder, and an object rather than serialized JSONB retrieval-settings cache filter.

### Final GREEN

```sh
npm test -- tests/retrieval.test.ts tests/citations.test.ts tests/fallback.test.ts tests/cache.test.ts tests/rate-limit.test.ts tests/chat-route.test.ts tests/config.test.ts
npm test
npm run typecheck
```

Results: all exit 0.

```text
Focused Task 4: 7 files, 27 tests passed
Full suite: 16 files, 70 tests passed
typecheck: tsc --noEmit (exit 0)
```

## Files changed

- `.env.example`
- `src/app/api/chat/route.ts`
- `src/lib/config.ts`
- `src/lib/rag/answer.ts`
- `src/lib/rag/cache.ts`
- `src/lib/rag/citations.ts`
- `src/lib/rag/retrieve.ts`
- `src/lib/rate-limit.ts`
- `supabase/migrations/202609230001_initial.sql`
- `tests/cache.test.ts`
- `tests/chat-route.test.ts`
- `tests/citations.test.ts`
- `tests/config.test.ts`
- `tests/fallback.test.ts`
- `tests/providers.test.ts`
- `tests/rate-limit.test.ts`
- `tests/retrieval.test.ts`
- `.superpowers/sdd/cs-assistant/task-4-report.md`

## Self-review

- Retrieval normalizes and bounds questions, embeds once, requests an expanded candidate window through the existing hybrid-search RPC, applies deterministic reciprocal-rank fusion, deduplicates content, keeps no more than two chunks per URL, applies the configured score threshold, and returns at most five. Lexical-only candidates remain eligible.
- Grounding sends a strict system instruction plus only the question and numbered official excerpts. Excerpt text is explicitly untrusted, output URLs are rejected, every factual paragraph needs supplied citations, sources are mapped server-side to de-duplicated official URLs, and PDF citations carry page numbers.
- Empty/weak evidence, retrieval/provider errors, malformed citations, model URLs, missing citations, and outputs over 250 whitespace-delimited words return the exact fallback. Generation performs at most one explicitly labeled repair attempt.
- The cache uses normalized-question hashing plus corpus revision, embedding model, retrieval settings, and prompt version. It stores successful result sources and retrieved chunks with a TTL; revision changes make prior records unreachable. Retrieval settings are serialized for the JSONB equality filter.
- Rate limiting hashes only the configured trusted header with `RATE_LIMIT_SALT`; it falls back to `ADMIN_SECRET` when the optional salt is absent. Without a trusted header it uses one local identity and ignores forged forwarding headers. The route rate-limits before cache/model work, validates 1–500 trimmed characters, serves cache hits without answer work, and returns only safe JSON.
- The migration adds cached retrieval JSONB and permits up to 20 RPC candidates for client-side diversity while public retrieval remains capped at five.
- No live provider/Supabase calls, Git operations, or subagents were used.

## Concerns

- The updated migration, Supabase JSONB filter behavior, cache persistence, and atomic RPC paths were tested with local fakes and typechecking only; they have not been applied against a live Supabase pgvector project in this workspace.

---

## Fix round 1/5

### Status

DONE_WITH_CONCERNS

### RED/GREEN evidence

RED command:

```sh
npm test -- tests/cache.test.ts tests/retrieval.test.ts tests/citations.test.ts tests/chat-route.test.ts tests/config.test.ts
```

Result: exit 1; six requested regressions failed: absent composite `onConflict`, zero semantic threshold/default and `p_min_score`, no raw-evidence insufficiency gate, URL-keyed rather than source-page-keyed diversity, mixed valid/invalid citations accepted, and a valid answer replaced by fallback when cache writing failed. A later citation RED run also caught Markdown-style relative model URLs.

GREEN commands:

```sh
npm test -- tests/retrieval.test.ts tests/citations.test.ts tests/fallback.test.ts tests/cache.test.ts tests/rate-limit.test.ts tests/chat-route.test.ts tests/config.test.ts
npm test
npm run typecheck
```

Results: all exit 0.

```text
Focused Task 4: 7 files, 30 tests passed
Full suite: 16 files, 73 tests passed
typecheck: tsc --noEmit (exit 0)
```

### Changes

- `SupabaseAnswerCache.set` now supplies the exact unique composite conflict target: `question_hash,corpus_revision,embedding_model,retrieval_settings,prompt_version`.
- The hybrid-search RPC returns `lexical_score` and `semantic_similarity` alongside ranks/RRF. It keeps a candidate when its lexical score is positive or its cosine similarity meets `p_min_score`.
- Retrieval maps the raw evidence fields into `RetrievedChunk`, consistently supplies `p_min_score`, admits positive lexical-only proper-noun matches, rejects weak semantic-only neighbors, and applies source diversity by `sourcePageId`.
- The default/documented semantic threshold is `0.60` in config and `.env.example`.
- Citation formatting validates every cited chunk before source de-duplication and rejects absolute, relative, and Markdown-style model-supplied URLs.
- The route treats cache writes as best effort, preserving a valid grounded answer when persistence is unavailable.

### Files changed in this round

- `.env.example`
- `src/app/api/chat/route.ts`
- `src/lib/config.ts`
- `src/lib/rag/cache.ts`
- `src/lib/rag/citations.ts`
- `src/lib/rag/retrieve.ts`
- `src/lib/types.ts`
- `supabase/migrations/202609230001_initial.sql`
- `tests/cache.test.ts`
- `tests/chat-route.test.ts`
- `tests/citations.test.ts`
- `tests/config.test.ts`
- `tests/retrieval.test.ts`
- `.superpowers/sdd/cs-assistant/task-4-report.md`

### Self-review

- The cache conflict target exactly matches the migration's unique constraint, preventing duplicate writes for the same normalized question/revision/model/settings/prompt tuple.
- The database and TypeScript gates both use the same rule: lexical evidence is sufficient, otherwise cosine similarity must be at least the configured threshold. RRF remains solely deterministic ordering, not evidence sufficiency.
- Retrieval still returns no more than five chunks, while the RPC can return a larger candidate window for diversity filtering.
- Citation validity is all-or-nothing across every referenced chunk; server-side sources still come only from official supplied chunks.
- Rate limiting still occurs before cache/model work, and cache-write errors are isolated after a valid response has been formed.
- No live provider/Supabase calls, Git operations, or subagents were used.

### Concerns

- The revised PostgreSQL RPC return contract, cache upsert, and semantic threshold behavior have local fake-test/typecheck coverage only; apply the migration and validate these paths against the target Supabase pgvector project before operational use.

---

## Fix round 2/5

### Status

DONE_WITH_CONCERNS

### RED/GREEN evidence

RED command:

```sh
npm test -- tests/citations.test.ts tests/migrations.test.ts
```

Result: exit 1. The new citation regression accepted `www.ashoka.edu.in/department/department-of-cs/` and mapped it to a server-side source. The migration contract regression found no `20260929` forward migration to replace the installed RPC return tuple.

GREEN commands:

```sh
npm test -- tests/citations.test.ts tests/migrations.test.ts tests/retrieval.test.ts
npm test
npm run typecheck
```

Results: all exit 0.

```text
Focused citation/migration/retrieval: 3 files, 14 tests passed
Full suite: 17 files, 75 tests passed
typecheck: tsc --noEmit (exit 0)
```

### Changes

- Citation validation rejects bare `www.` domain text in model output while leaving citation-only grounded prose and server-mapped official sources unchanged.
- Added `202609290001_hybrid_search_chunks_return_contract.sql`, which drops the exact existing function argument signature, recreates the current 15-column return contract, revokes public execution, and grants execution to `service_role`. It therefore upgrades databases whose original migration had already installed the former return type; fresh installs also run cleanly through both migrations.
- Added the smallest static migration-contract test: it verifies the forward migration removes the installed RPC before recreation, exposes `lexical_score` and `semantic_similarity` to callers, and restores the service-role execution grant.

### Files changed in this round

- `src/lib/rag/citations.ts`
- `supabase/migrations/202609290001_hybrid_search_chunks_return_contract.sql`
- `tests/citations.test.ts`
- `tests/migrations.test.ts`
- `.superpowers/sdd/cs-assistant/task-4-report.md`

### Self-review

- The URL guard is shared by all `formatAnswer` callers and detects a domain-shaped bare `www.` URL rather than treating ordinary text as a URL.
- The forward migration uses the exact PostgreSQL function identity (`text, extensions.vector, integer, real`), so it removes either the older or current return tuple before creating the final contract. Its body, return columns, RRF/evidence predicate, and grants match the current production RPC contract.
- The migration test asserts user-observable upgrade behavior (available response evidence fields and service-role callable RPC), not a migration filename or incidental formatting.
- No live provider/Supabase calls, Git operations, or subagents were used.

### Concerns

- PostgreSQL and pgvector are not installed in this workspace, so the forward migration has static contract coverage rather than a live upgrade execution. Apply it to a Supabase staging project before production deployment.

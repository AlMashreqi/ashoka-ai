# Task 1 brief — Project foundation and database contract

Read the approved specification at `docs/superpowers/specs/2026-09-23-cs-department-information-assistant-design.md` for binding constraints.

Implement only Task 1 from `docs/superpowers/plans/2026-09-23-cs-department-information-assistant.md`.

Required files:

- `package.json`, lockfile, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.example`
- `src/lib/config.ts`, `src/lib/types.ts`, `src/lib/supabase/server.ts`
- `supabase/migrations/202609230001_initial.sql`, `supabase/seed.sql`
- `tests/config.test.ts`

Required interfaces and behavior:

- `getConfig(env: NodeJS.ProcessEnv): AppConfig`
- `SourcePage`, `DocumentChunk`, `RetrievedChunk`, `Citation`, `AnswerResult`
- `createServerSupabaseClient(config: AppConfig)`
- Defaults: 1 request/second, 50 pages, 5 retrieved chunks, 250 answer words, 768 embedding dimensions, Ollama chat at `http://127.0.0.1:11434/api/chat`, Ollama embeddings at `http://127.0.0.1:11434/api/embed`.
- Hosted NVIDIA/OpenRouter configuration fails unless `ENABLE_HOSTED_DEV_PROVIDERS=true`.
- Migration: pgvector, source/chunk/crawl/cache/rate-limit/app-state tables, URL/content constraints, FTS/vector indexes, RLS deny-by-default, hybrid retrieval RPC, atomic rate-limit RPC.
- Seed one official fixture page and chunks with a 768-dimensional zero vector.
- Scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `crawl`, `reindex`, `eval`.

Process:

1. Follow strict TDD: write `tests/config.test.ts`, run it and record the expected failure, then implement minimal production code.
2. Use only the dependencies named in the plan.
3. Run the task tests and typecheck.
4. Self-review against this brief.
5. Do not spawn subagents and do not attempt Git operations.
6. Write the full report to `.superpowers/sdd/cs-assistant/task-1-report.md`, including red/green commands and outputs, files changed, self-review, concerns, and status `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`.

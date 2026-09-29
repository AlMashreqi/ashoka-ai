# Task 3 report — Providers, persistence, crawl CLI, and re-indexing

## Status

DONE_WITH_CONCERNS

## TDD evidence

### Provider adapters

RED command:

```sh
npm test -- tests/providers.test.ts
```

Result: exit 1. The suite failed at import time because the Task 3 AI factory and adapters did not exist.

GREEN command:

```sh
npm test -- tests/providers.test.ts
```

Result: exit 0; 1 file and 4 tests passed. The tests use only injected fetch functions and verify Ollama `/api/embed`/`/api/chat` mappings, OpenAI-compatible embeddings/chat mappings, bearer authorization, timeout signals, non-2xx responses, malformed JSON/embeddings, dimension validation, and hosted-provider gating.

### Indexing

RED command:

```sh
npm test -- tests/indexer.test.ts
```

Result: exit 1. The suite failed at import time because `indexer.ts` did not exist.

GREEN command:

```sh
npm test -- tests/indexer.test.ts
```

Result: exit 0; 1 file and 4 tests passed. The tests prove unchanged content causes zero embed/write calls, changed content reaches exactly one replacement call, count and literal 767-dimension vectors fail before writes, and stored-document reindexing calls no network dependency.

### Final verification

Commands:

```sh
npm test -- tests/providers.test.ts tests/indexer.test.ts
npm test
npm run typecheck
```

Results: all exit 0.

```text
Focused Task 3: 2 files, 8 tests passed
Full suite: 9 files, 43 tests passed
typecheck: tsc --noEmit (exit 0)
```

## Files changed

- `src/lib/ai/provider.ts`
- `src/lib/ai/ollama.ts`
- `src/lib/ai/openai-compatible.ts`
- `src/lib/ai/factory.ts`
- `src/lib/indexing/store.ts`
- `src/lib/indexing/indexer.ts`
- `src/lib/crawl/crawler.ts`
- `scripts/crawl.ts`
- `scripts/reindex.ts`
- `supabase/migrations/202609230001_initial.sql`
- `tests/providers.test.ts`
- `tests/indexer.test.ts`
- `.superpowers/sdd/cs-assistant/task-3-report.md`

## Self-review

- Provider adapters use native injected fetch, attach `AbortSignal.timeout`, validate HTTP status/JSON/embedding count/finite 768-value vectors, and never log keys or request content.
- Ollama uses documented `input`/`embeddings` and `message.content` shapes. NVIDIA/OpenRouter share the OpenAI-compatible adapter and require both the Task 1 gate and API key.
- Indexing derives the content hash and performs unchanged detection before chunk embedding. Vector count and dimension validation occur before the sole store replacement call.
- The replacement RPC upserts the source metadata, deletes/replaces its chunks, increments `app_state.corpus_revision` once, and runs transactionally in PostgreSQL. The crawler now supplies its raw response hash to the store, maintaining consistent unchanged checks across crawls.
- The store implements the Task 2 crawl storage operations, exposes successful stored source content for offline reindexing, records per-page failures, and lets the CLI record bounded crawl counters.
- `crawl -- --dry-run` uses no-op storage and embedding to fetch/extract/chunk without database or vector writes; `reindex` has no crawl/fetch dependency. CLI output contains counts/status only and failures set a nonzero exit status.
- No provider SDK, real provider test call, real Supabase test call, Git command, or Git operation was used.

## Concerns

- The migration/RPC and CLI database path could not be executed against a live Supabase pgvector project in this workspace. They were typechecked and statically reviewed; run the migration and commands against configured Supabase before operational use.

---

## Fix round 1/5

### Status

DONE_WITH_CONCERNS

### RED/GREEN evidence

RED command:

```sh
npm test -- tests/config.test.ts tests/providers.test.ts tests/indexer.test.ts tests/crawler.test.ts tests/store.test.ts
```

Result: exit 1; 4 failures exposed the regressions: `providerTimeoutMs` was absent from config, the crawler saved an empty extracted document, the indexer indexed an empty document, and the failure-recording fake failed because `recordFailure` attempted the old destructive upsert path.

GREEN commands:

```sh
npm test -- tests/config.test.ts tests/providers.test.ts tests/indexer.test.ts tests/crawler.test.ts tests/store.test.ts tests/html.test.ts tests/pdf.test.ts tests/chunk.test.ts
npm test
npm run typecheck
```

Results: all exit 0.

```text
Focused regressions: 8 files, 45 tests passed
Full suite: 10 files, 50 tests passed
typecheck: tsc --noEmit (exit 0)
```

### Changes

- Added `documentHash`, a deterministic hash of extracted canonical URL, title, actual content type, headings, and blocks. Both direct crawling and offline indexing compute it after extraction and before the unchanged check/embedding; the store uses the same helper for an omitted legacy save hash.
- Added `contentType` to extracted documents and preserved `text/html`/`application/pdf` through HTML/PDF extraction, Supabase replacement, and reconstruction for offline reindexing. Store replacement uses the extracted value, never a filename suffix.
- Made direct crawler indexing reject empty documents/chunk sets and reject count-mismatched, wrong-size, or non-finite vectors before storage. `CrawlDependencies` now requires `embeddingDimensions`; the CLI and all tests supply it. Dry runs use correctly-sized in-memory vectors with no provider/database writes so extraction/chunking remains observable.
- Changed `SupabaseStore.recordFailure` to look up the page first. Existing rows receive only failure/status/error crawl fields; successful title/content/hash and chunks are untouched. Missing rows receive the schema-required minimal failed record. Reindex selection includes both currently-successful rows and preserved rows with `last_successful_crawl_at`.
- Supabase storage accepts the configured embedding model, and both commands pass `config.embeddingModel`; chunk RPC payloads no longer hardcode `nomic-embed-text`.
- Added `AI_TIMEOUT_MS`/`providerTimeoutMs` (default 30 seconds) and use it in Ollama and OpenAI-compatible adapters instead of a literal timeout.

### Focused regression coverage

- Specific fake Supabase interactions verify a later failure only updates status/error/crawl timestamps, an absent page receives only the schema-required minimal failed row, and a reindex query returns prior content with its actual PDF content type.
- Store RPC coverage verifies a configured embedding model and extracted PDF type reach the replacement RPC.
- Crawler coverage verifies empty extraction, vector count/dimension/non-finite rejection, and its unchanged hash equals the shared document hash used by the indexer.
- Indexer coverage verifies the shared document hash reaches replacement; provider coverage verifies the configured timeout signal; HTML/PDF coverage verifies actual content type.

### Files changed in this round

- `.env.example`
- `scripts/crawl.ts`
- `scripts/reindex.ts`
- `src/lib/ai/ollama.ts`
- `src/lib/ai/openai-compatible.ts`
- `src/lib/ai/provider.ts`
- `src/lib/config.ts`
- `src/lib/crawl/crawler.ts`
- `src/lib/crawl/html.ts`
- `src/lib/crawl/pdf.ts`
- `src/lib/indexing/document-hash.ts`
- `src/lib/indexing/indexer.ts`
- `src/lib/indexing/store.ts`
- `tests/chunk.test.ts`
- `tests/config.test.ts`
- `tests/crawler.test.ts`
- `tests/html.test.ts`
- `tests/indexer.test.ts`
- `tests/pdf.test.ts`
- `tests/providers.test.ts`
- `tests/store.test.ts`
- `.superpowers/sdd/cs-assistant/task-3-report.md`

### Self-review

- Existing successful rows are updated without title, raw content, hash, content type, headings, or chunk deletion; the replacement RPC is never called by failure recording.
- Hashing is based on canonical extracted metadata/content, so raw transport representation no longer disagrees with reindex hashing.
- Crawler validation occurs before `save`, and indexer validation occurs before `replacePage`; both require exact configured finite dimensions.
- All `SupabaseStore` production constructors receive the config-selected embedding model. No production provider adapter retains a hardcoded 30-second timeout.
- No external provider or Supabase calls, Git operations, or subagents were used.

### Concerns

- The migration/RPC and CLI database paths remain unexecuted against a live Supabase pgvector project; the fake interaction, focused tests, full suite, and typecheck cover the local contract only.

---

## Fix round 2/5

### Status

DONE_WITH_CONCERNS

### RED/GREEN evidence

RED command:

```sh
npm test -- tests/store.test.ts tests/crawler.test.ts tests/indexer.test.ts
```

Result: exit 1; 5 expected regressions failed. Reconstructed stored documents lost PDF `pageNumber`/heading-trail metadata and therefore changed the document hash; replacement RPC payloads omitted blocks; failed pages were treated as unchanged; a recovered crawl skipped rather than replacing; and a new failed PDF was stored as `text/html`.

GREEN commands:

```sh
npm test -- tests/store.test.ts tests/crawler.test.ts tests/indexer.test.ts
npm run typecheck
npm test
```

Results: all exit 0.

```text
Focused store/indexer/crawler: 3 files, 24 tests passed
Full suite: 10 files, 52 tests passed
typecheck: tsc --noEmit (exit 0)
```

### Changes

- Added `source_pages.blocks jsonb not null default '[]'::jsonb` and a `p_blocks jsonb` parameter to `replace_indexed_page`. The RPC writes blocks atomically with source metadata; its revoke/grant signatures now match the added parameter.
- Store replacement sends full extracted blocks (`text`, `headingTrail`, and `pageNumber`). Reindex reads the same JSONB value and reconstructs the original blocks, headings, content type, and raw content without flattening them.
- Updated the seed document with headings and a complete JSONB block payload matching its source metadata.
- `hasContent` now reads status and returns false for a currently failed matching row. The next unchanged crawl therefore embeds/replaces it and the RPC restores `crawl_status = 'success'`.
- Added optional expected content type to `recordFailure`. It remains backward compatible for existing callers and the crawler supplies the pending HTML/PDF type, so a newly inserted failed PDF is correctly labeled.

### Files changed in this round

- `src/lib/crawl/crawler.ts`
- `src/lib/indexing/store.ts`
- `supabase/migrations/202609230001_initial.sql`
- `supabase/seed.sql`
- `tests/crawler.test.ts`
- `tests/store.test.ts`
- `.superpowers/sdd/cs-assistant/task-3-report.md`

### Self-review

- JSONB blocks preserve the exact metadata consumed by `documentHash`; the round-trip test compares reconstructed document equality and identical hashes, including PDF page number and heading trail.
- `p_blocks` is included in the store RPC call, migration function definition, insert/upsert behavior, and precise revoke/grant function signature.
- Failure recovery is fixed centrally in `SupabaseStore.hasContent`, so both direct crawler and any other index caller can re-index a failed row with matching content instead of reporting it unchanged.
- Existing success content and chunks are still not modified by `recordFailure`; only newly absent failed rows receive an empty `blocks` value and the expected type.
- No live Supabase/provider calls, Git operations, or subagents were used.

### Concerns

- The revised initial migration, RPC, and seed have not been applied to a live Supabase pgvector instance in this workspace. Local fake-Supabase contract tests, full suite, and typecheck pass; apply and validate the migration in the target project before operational use.

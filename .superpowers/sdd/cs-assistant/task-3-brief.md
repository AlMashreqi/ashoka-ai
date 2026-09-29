# Task 3 brief — Providers, persistence, crawl CLI, and re-indexing

Read the approved specification at `docs/superpowers/specs/2026-09-23-cs-department-information-assistant-design.md`. Implement only Task 3 from the plan, integrating with the existing Task 1/2 interfaces.

Create:

- `src/lib/ai/provider.ts`
- `src/lib/ai/ollama.ts`
- `src/lib/ai/openai-compatible.ts`
- `src/lib/ai/factory.ts`
- `src/lib/indexing/store.ts`
- `src/lib/indexing/indexer.ts`
- `scripts/crawl.ts`
- `scripts/reindex.ts`
- `tests/providers.test.ts`
- `tests/indexer.test.ts`

Modify the initial migration only as needed for source metadata and an atomic page-replacement/index-revision RPC.

Required provider interfaces:

- `EmbeddingProvider.embed(inputs: string[]): Promise<number[][]>`
- `ChatProvider.complete(request: ChatRequest): Promise<string>`
- `createProviders(config: AppConfig): { embedder: EmbeddingProvider; chat: ChatProvider }`

Provider requirements:

- Use native `fetch`; install no provider SDK.
- Ollama maps to `/api/embed` and `/api/chat` request/response shapes.
- NVIDIA and OpenRouter share a configurable OpenAI-compatible adapter for `/embeddings` and `/chat/completions`.
- Hosted providers remain impossible unless Task 1 config enabled them and supplied a key/model/endpoint.
- Inject `fetch` in tests, enforce `AbortSignal.timeout`, validate response status/body and embedding dimensions, and never log keys or prompts.

Required indexing interfaces:

- `indexDocument(document: ExtractedDocument, deps: IndexDependencies): Promise<IndexResult>`
- `reindexAll(deps: ReindexDependencies): Promise<ReindexSummary>`
- A Supabase store that implements the Task 2 `CrawlStorage` contract and exposes stored source documents for re-indexing.

Indexing requirements:

- Hash/unchanged check occurs before embedding.
- Validate vector count and exactly 768 values per vector before any database write.
- Replace a page's stored source/chunks atomically and increment corpus revision exactly once on successful changed content.
- Store source URL/title/content type/clean raw content/headings or equivalent metadata/crawl time/content hash and chunk heading trail/page/ordinal/hash/vector/model.
- Record crawl run counters and per-page errors without storing secrets or raw questions.
- `reindexAll` rebuilds chunks and vectors for stored successful pages and increments revision per successfully changed page; it must not fetch the web.

CLI requirements:

- `npm run crawl` builds config/providers/store and executes the serial Task 2 crawler.
- `npm run crawl -- --dry-run` fetches/extracts/chunks but performs no database/vector writes; `CRAWL_MAX_PAGES` remains enforced.
- `npm run reindex` rebuilds stored content without network crawling.
- Commands print only safe counts/status and exit nonzero for configuration/database/provider failures.

TDD:

1. Write provider tests first and observe missing-module failure. Test Ollama mappings, OpenAI-compatible mappings, HTTP/malformed responses, hosted gating, timeouts, and wrong embedding dimensions.
2. Implement minimal provider adapters and pass focused tests.
3. Write indexer tests first. Test unchanged content causes zero embed/write calls, changed pages replace atomically, vector count/dimension errors occur before write, and successful indexing increments corpus revision once.
4. Implement store/indexer/commands and pass focused tests.
5. Run the full suite and typecheck.

Do not make real provider or Supabase calls in tests. Do not spawn subagents or use Git. Write the report to `.superpowers/sdd/cs-assistant/task-3-report.md` with red/green evidence, files changed, self-review, concerns, and final status.

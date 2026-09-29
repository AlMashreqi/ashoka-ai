# Task 2 brief — Safe extraction, deduplication, and chunking

Read the approved specification at `docs/superpowers/specs/2026-09-23-cs-department-information-assistant-design.md` for binding constraints. Implement only Task 2 from the plan.

Create:

- `src/lib/crawl/url-policy.ts`
- `src/lib/crawl/frontier.ts`
- `src/lib/crawl/fetch.ts`
- `src/lib/crawl/html.ts`
- `src/lib/crawl/pdf.ts`
- `src/lib/crawl/chunk.ts`
- `src/lib/crawl/crawler.ts`
- `tests/fixtures/department.html`
- `tests/fixtures/department-duplicate-links.html`
- `tests/url-policy.test.ts`
- `tests/frontier.test.ts`
- `tests/html.test.ts`
- `tests/chunk.test.ts`
- `tests/crawler.test.ts`

Required interfaces:

- `canonicalizeUrl(input: string): URL`
- `classifyUrl(candidate: URL, policy: CrawlPolicy, directlyLinked: boolean): "html" | "pdf" | "reject"`
- `extractHtml(html: string, url: URL): ExtractedDocument`
- `extractPdf(bytes: Uint8Array, url: URL): Promise<ExtractedDocument>`
- `chunkDocument(document: ExtractedDocument, options: ChunkOptions): PendingChunk[]`
- `crawl(deps: CrawlDependencies): Promise<CrawlSummary>` with injected fetch, storage, embedder, clock, and delay functions.

Required behavior:

- HTTPS and exact official origin for every accepted URL.
- HTML only under configured path prefixes. PDF only when directly linked from an accepted HTML page and same-origin, regardless of its upload path.
- Normalize hostname/default ports, repeated slashes, fragments, query ordering, and tracking parameters.
- Validate every manual redirect target before reading its response body.
- A per-run canonical URL `Set` prevents duplicate fetches, including PDF fragment/tracking variants.
- HTML extraction returns title, canonical URL, ordered headings, clean blocks/text, and accepted link candidates; remove scripts, styles, nav, forms, cookie banners, and repeated chrome.
- Treat Cloudflare challenge HTML as a crawl failure; do not solve it.
- PDF.js extraction retains one-based page numbers. Empty/image-only pages are skipped.
- Chunk at headings/paragraphs/sentences, with configurable character target and overlap. Preserve heading trail, page number, stable ordinal, and content hash.
- Serial crawler uses an honest descriptive user agent and browser-compatible `Accept`, configurable delay, manual redirects, timeout and byte cap, bounded 429/5xx retry using `Retry-After`, content-type validation, unchanged-content skipping, and per-URL failure recording.
- Do not fetch or parse robots.txt.

TDD checkpoints:

1. Write URL policy/frontier tests and run them failing before implementation.
2. Implement policy/frontier and pass those tests.
3. Write HTML/chunk tests and run them failing before implementation.
4. Implement HTML/PDF extraction and chunking and pass those tests.
5. Write crawler tests first for serial pacing, 429 retry, bounded 5xx retry, byte cap, wrong content type, redirect rejection before body consumption, duplicate PDF variants, unchanged skipping, external-link rejection, and Cloudflare 403/challenge status.
6. Implement the serial crawler minimally and run the full suite plus typecheck.

Do not spawn subagents or attempt Git operations. Write the complete report to `.superpowers/sdd/cs-assistant/task-2-report.md`, including each red/green command and result, files changed, self-review, concerns, and final status.

# Task 2 report — Safe extraction, deduplication, and chunking

## Status

DONE

## TDD evidence

### URL policy and frontier

RED command:

```sh
npm test -- tests/url-policy.test.ts tests/frontier.test.ts
```

Result: exit 1. Both suites failed at import time because `url-policy` and `frontier` did not exist.

GREEN command:

```sh
npm test -- tests/url-policy.test.ts tests/frontier.test.ts
```

Result: exit 0; 2 files and 4 tests passed.

Final security RED command:

```sh
npm test -- tests/url-policy.test.ts
```

Result: exit 1; a caller-supplied `evil.example` policy caused an HTML classification rather than `reject`.

The implementation then added an independent official-origin check. Its final result is covered by the full suite below.

### HTML extraction and chunking

RED command:

```sh
npm test -- tests/html.test.ts tests/chunk.test.ts
```

Result: exit 1. Both suites failed at import time because `html` and `chunk` did not exist.

GREEN command:

```sh
npm test -- tests/html.test.ts tests/chunk.test.ts
```

Result: exit 0; 2 files and 3 tests passed.

### Crawler

RED command:

```sh
npm test -- tests/crawler.test.ts
```

Result: exit 1. The suite failed at import time because `crawler` did not exist.

GREEN command:

```sh
npm test -- tests/crawler.test.ts
```

Result: exit 0; 1 file and 8 tests passed. The assertions cover serial pacing and request identity, `429` retry, bounded `5xx` retry, byte cap, content type, redirect body-safety, duplicate PDF variants, unchanged skipping, external discards, and Cloudflare/403 failures.

### PDF extraction and typecheck correction

An initial complete-suite run passed 24 tests but TypeScript failed on PDF.js’s declared generic metadata and `TextItem | TextMarkedContent` union. The declarations were inspected, then structurally narrowed; no runtime behavior changed.

To close the strict-TDD PDF coverage gap, `pdf.ts` was removed before adding a real two-page PDF.js fixture test.

RED command:

```sh
npm test -- tests/pdf.test.ts
```

Result: exit 1 because `pdf.ts` was absent.

GREEN command:

```sh
npm test -- tests/pdf.test.ts
```

Result: exit 0; 1 file and 1 test passed. It verifies extracted page 1 text and omission of an empty page 2.

### Final verification

Command:

```sh
npm test && npm run typecheck
```

Result: exit 0.

```text
Test Files  7 passed (7)
Tests  26 passed (26)
typecheck: tsc --noEmit (exit 0)
```

## Files changed

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
- `tests/pdf.test.ts`
- `tests/chunk.test.ts`
- `tests/crawler.test.ts`
- `.superpowers/sdd/cs-assistant/task-2-report.md`

## Self-review

- Canonicalization lowercases hosts, relies on URL normalization for default ports, collapses repeated slashes, removes fragments and tracking parameters, and sorts retained query pairs.
- Accepted URLs must be HTTPS, the exact official origin, and the configured HTML path boundary. PDF candidates require a direct link from accepted HTML and the same origin. The crawler independently discards external candidates.
- Fetches use manual redirects, an honest descriptive user agent, and a browser-compatible `Accept` header. Redirect targets are classified before any body read. The serial request path uses injected clock/delay, bounded retry, `Retry-After`, timeout, and byte/content-type checks.
- HTML extraction strips script/style/navigation/forms/cookie/repeated chrome, preserves ordered headings and heading trails, resolves canonical links safely, and treats Cloudflare challenge markup as an error. PDF.js retains one-based pages and skips empty pages.
- Chunking respects target characters at sentence boundaries, carries heading/page metadata, uses deterministic ordinals, maintains character overlap when splitting, and creates SHA-256 content hashes.
- The crawler hashes response bytes before embedding/storage and skips unchanged documents; its frontier prevents duplicate canonical URLs including PDF tracking/fragment variants.
- No robots request or parser was added. No Git commands or Git operations were attempted.

## Concerns

- None. Live crawling was intentionally not attempted; the current official site’s expected Cloudflare/403 behavior is covered as a recorded crawler failure rather than bypassed.

## Fix round 1/5

### Status

DONE

### RED regression evidence

Command:

```sh
npm test -- tests/html.test.ts tests/chunk.test.ts tests/crawler.test.ts
```

Result: exit 1; 9 newly added assertions failed and 11 existing assertions passed. The failures demonstrated all reported defects:

- a non-official injected seed was fetched;
- the whole-body reader could not cancel a live stream after exceeding the byte cap (the regression timed out after five seconds);
- a redirect target already in the queue was fetched twice;
- an unapproved same-origin canonical URL was stored instead of the fetched URL;
- canonical tracking/query/fragment normalization and repeated/nested HTML block handling were absent;
- long sentences exceeded the target, adjacent compatible blocks had no overlap, and non-finite/equal overlap options were accepted.

### GREEN verification

Focused command:

```sh
npm test -- tests/html.test.ts tests/chunk.test.ts tests/crawler.test.ts
```

Result: exit 0; 3 files and 20 tests passed.

Task 2 command:

```sh
npm test -- tests/url-policy.test.ts tests/frontier.test.ts tests/html.test.ts tests/pdf.test.ts tests/chunk.test.ts tests/crawler.test.ts
```

Result: exit 0; 6 files and 26 tests passed.

Full verification command:

```sh
npm test && npm run typecheck
```

Result: exit 0.

```text
Test Files  7 passed (7)
Tests  35 passed (35)
typecheck: tsc --noEmit (exit 0)
```

### Changes made

- The crawler classifies the canonical seed before enqueuing/fetching it; a rejected seed is recorded as a policy failure with no network call.
- Response bodies are read through `ReadableStream.getReader()`. The reader is cancelled immediately once accumulated bytes exceed `maxResponseBytes`; content-length remains an early rejection optimization.
- Each accepted redirect target enters the per-run frontier before it is fetched. Targets already queued or processed cause the redirecting URL to be skipped, preventing a second destination fetch.
- HTML canonical links are passed through URL canonicalization. The crawler classifies the canonical as HTML under the active policy and uses the fetched canonical URL when it is not approved.
- HTML block extraction removes nested lists before reading parent list text and de-duplicates repeated cleaned block text.
- Chunking groups adjacent blocks that share heading trail and page metadata, then splits at sentence boundaries or hard character boundaries with the configured overlap. It rejects non-finite options and overlap values greater than or equal to the target.

### Files changed in this round

- `src/lib/crawl/html.ts`
- `src/lib/crawl/chunk.ts`
- `src/lib/crawl/crawler.ts`
- `tests/html.test.ts`
- `tests/chunk.test.ts`
- `tests/crawler.test.ts`
- `.superpowers/sdd/cs-assistant/task-2-report.md`

### Self-review

- The public Task 2 interfaces remain unchanged.
- Unsafe seed policies, unsafe redirect targets, and unsafe canonical URLs cannot cause an unapproved fetch or stored canonical URL.
- The byte-cap check is now enforced during streaming and invokes reader cancellation at the first oversized chunk, before embeddings or storage.
- Redirect targets share the existing canonical frontier, including a target that was merely queued but has not yet been fetched.
- Canonical URLs, raw link candidates, and direct PDF variants continue to use the same canonicalization rules for fragments, tracking parameters, and query ordering.
- The chunk loop always advances by at least one character because overlap must be strictly smaller than a finite positive target; long sentences cannot exceed that target.
- No robots handling, Git command, or Git operation was added.

### Concerns

- None. The streaming-cap behavior is covered by an intentionally unclosed in-memory stream whose cancellation is asserted; live crawling remains intentionally out of scope for tests.

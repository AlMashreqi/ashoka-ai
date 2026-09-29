# Task 1 report — Project foundation and database contract

## Status

DONE_WITH_CONCERNS

## Scope completed

- Created the Next.js/TypeScript/Vitest project foundation with the required scripts and only the runtime/development dependencies named in Task 1.
- Implemented `getConfig(env: NodeJS.ProcessEnv): AppConfig`, including validated Supabase, crawl, provider, model, rate-limit, cache, and admin settings.
- Set the required defaults verbatim: 1 request/second, 50 pages, 5 retrieved chunks, 250 answer words, 768 embedding dimensions, `http://127.0.0.1:11434/api/chat`, and `http://127.0.0.1:11434/api/embed`.
- Enforced the fixed 768-dimensional database contract and disabled NVIDIA/OpenRouter unless `ENABLE_HOSTED_DEV_PROVIDERS=true`.
- Added the requested shared domain types and server-only Supabase client factory.
- Added the pgvector migration, hybrid retrieval and atomic rate-limit RPCs, RLS deny-by-default policies, and deterministic fixture seed with `array_fill(0::real, ARRAY[768])::vector`.

## TDD evidence

### RED 1

Command:

```sh
npm test -- tests/config.test.ts
```

Output/result: exit 1. Vitest failed before collecting tests because `../src/lib/config` did not exist:

```text
Error: Cannot find module '../src/lib/config' imported from .../tests/config.test.ts
Test Files  1 failed (1)
Tests  no tests
```

### GREEN 1 and typecheck discovery

Command:

```sh
npm test -- tests/config.test.ts && npm run typecheck
```

Output/result: the three initial tests passed, then TypeScript failed because bare test objects did not satisfy the installed Node `ProcessEnv` type (its `NODE_ENV` property is required). The test fixtures were typed as `NodeJS.ProcessEnv`; no production interface was loosened.

### RED 2

Command:

```sh
npm test -- tests/config.test.ts
```

Output/result: exit 1. The new database-dimension test failed as intended:

```text
AssertionError: expected [Function] to throw an error
Tests  1 failed | 3 passed (4)
```

### GREEN 2 / final task verification

Command:

```sh
npm test -- tests/config.test.ts && npm run typecheck
```

Output/result: exit 0.

```text
Test Files  1 passed (1)
Tests  4 passed (4)
typecheck: tsc --noEmit (exit 0)
```

### Full available test suite

Command:

```sh
npm test
```

Output/result: exit 0; 1 test file passed, 4 tests passed.

## Files changed

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `next.config.ts`
- `eslint.config.mjs`
- `vitest.config.ts`
- `.gitignore`
- `.env.example`
- `src/lib/config.ts`
- `src/lib/types.ts`
- `src/lib/supabase/server.ts`
- `supabase/migrations/202609230001_initial.sql`
- `supabase/seed.sql`
- `tests/config.test.ts`

## Self-review

- Required files, scripts, public interfaces, and literal defaults are present.
- The migration creates `source_pages`, `document_chunks`, `crawl_runs`, `answer_cache`, `rate_limit_buckets`, and `app_state`; enables pgvector; applies URL/content constraints; creates FTS and cosine-vector indexes; enables RLS with no public access; and defines the required retrieval/rate-limit RPCs.
- The seed inserts one official CS fixture source and one chunk with a 768-dimensional zero vector.
- The configuration tests exercise missing Supabase configuration, required defaults, hosted-provider gating, and the embedding-dimension contract. Each configuration behavior was observed failing before its corresponding production implementation.
- No Git commands or Git operations were attempted.

## Concerns

- The Supabase CLI/local PostgreSQL service is unavailable in this workspace, so the SQL migration and seed were reviewed statically but not executed against a live pgvector database. This should be run with the project’s Supabase environment before relying on the schema.

## Fix round 1/5

### Status

DONE_WITH_CONCERNS

### Review findings addressed

- `MAX_ANSWER_WORDS` is now capped by configuration validation at the immutable 250-word maximum.
- `BASE_URL` now requires HTTPS, origin `https://www.ashoka.edu.in`, a path under `/department/department-of-cs/`, and no query or fragment.
- `HTML_PATH_PREFIXES` now accepts only non-empty, slash-prefixed same-origin paths and returns normalized pathname data.
- pgvector is installed in `extensions`; all vector column types, opclasses, RPC signatures, grants/revokes, distance operator resolution, and seed casts are schema-qualified.
- `.env.example` now documents all supported crawl, retrieval, rate-limit, cache, trusted-header, and hosted NVIDIA/OpenRouter fields with local defaults or commented safe placeholders.

### TDD evidence

#### RED

Command:

```sh
npm test -- tests/config.test.ts
```

Output/result: exit 1. The new tests failed as expected against the prior implementation:

```text
Test Files  1 failed (1)
Tests  5 failed | 4 passed (9)
```

The failures proved that a 251-word limit was accepted, HTTP/external/out-of-scope base URLs were accepted, and an external absolute HTML prefix was accepted.

#### Green attempt and correction

The first implementation run exposed a separate `ReferenceError: Cannot access 'htmlPathPrefixes' before initialization`; a local result variable shadowed the prefix-parser helper. The existing default, hosted-provider, and prefix tests reproduced it. Renaming the helper to `parseHtmlPathPrefixes` was the sole correction.

#### GREEN / final verification

Command:

```sh
npm test -- tests/config.test.ts && npm run typecheck
```

Output/result: exit 0.

```text
Test Files  1 passed (1)
Tests  9 passed (9)
typecheck: tsc --noEmit (exit 0)
```

Full-suite command:

```sh
npm test
```

Output/result: exit 0; 1 test file passed and 9 tests passed.

### Files changed in this round

- `tests/config.test.ts`
- `src/lib/config.ts`
- `supabase/migrations/202609230001_initial.sql`
- `supabase/seed.sql`
- `.env.example`
- `.superpowers/sdd/cs-assistant/task-1-report.md`

### Self-review

- The new test expects `MAX_ANSWER_WORDS=251` to fail; the configuration schema now permits only positive integers through 250.
- Base URL validation rejects non-HTTPS, foreign-origin, and out-of-boundary paths before configuration is returned. Prefix parsing rejects absolute URLs, protocol-relative URLs, queries, fragments, and empty values rather than converting them into misleading paths.
- The migration uses `extensions.vector`, `extensions.vector_cosine_ops`, and `operator(extensions.<=>)` consistently. The hybrid RPC function signature and its grants/revokes use the same qualified vector type.
- The environment template includes all names consumed by `src/lib/config.ts`; optional hosted and trusted-header settings remain commented until deliberately configured.
- No Git commands or Git operations were attempted.

### Concerns

- The Supabase CLI/local PostgreSQL service remains unavailable, so the revised migration and seed have not been executed against a live pgvector database. Static review confirmed every vector reference is schema-qualified.

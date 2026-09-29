# Final Astra findings — single fix wave

Read the spec, plan, ledger, and complete final review manifest before changing code. Use strict TDD: reproduce each defect with the smallest behavioral test, run it RED for the expected reason, then implement the minimal shared fix. Do not spawn subagents or use Git.

## Critical and Important — all must be fixed

1. `src/lib/crawl/chunk.ts`: sentence-boundary splitting can make zero progress when the selected cut is shorter than overlap. Regression: default 1500/200 options with `Short. ` plus 1600 characters must terminate and reconstruct bounded chunks.
2. CLI startup: `src/lib/supabase/server.ts` imports unresolved `server-only` in plain Node; crawl/reindex commands also do not load the `.env` prescribed by README. Create a Node-compatible shared Supabase client path while keeping Next server-only imports out of client bundles, load local CLI env without a new dependency, use a Node-compatible script invocation, add harmless `--help` entry-point smoke tests for both commands, and declare the actual supported Node floor.
3. `crawler.ts`: unchanged HTML continues before link discovery, so descendants are skipped. Discover allowed links after every successful HTML extraction even when indexing is skipped; add seed/child regression.
4. Repeated PDF page text conflicts with `unique(source_page_id, content_hash)`. Preserve valid repeated text/page metadata. Prefer ordinal uniqueness and remove the incorrect content-hash uniqueness from fresh and upgrade schema; keep retrieval dedup safe. Add PDF/index persistence regression.
5. The forward upgrade migration covers only hybrid search. It must also add `source_pages.blocks`, `answer_cache.retrieval`, all other changed columns/constraints, and safely replace the old `replace_indexed_page` signature/body while preserving existing data and grants. Fresh installs plus ordered upgrades must align; strengthen migration contract tests.
6. Cache get/set can store revision-1 evidence under revision 2. Capture the corpus revision at lookup/retrieval time and write using that captured key, never a newly read revision. Old-revision writes may exist but must be unreachable after revision increments. Add concurrency regression.
7. Admin crawl/reindex mutations accept cross-origin POSTs with a valid cookie. Require a same-origin `Origin` before work, in addition to the session cookie. Add missing-origin/cross-origin/same-origin regressions without exposing an application secret.
8. Answer citation identifiers do not map to displayed sources; dedup by URL loses cited PDF pages. Extend the server-returned citation shape so the UI visibly maps answer numbers to official links, coalescing only identical URL plus page while retaining all cited numbers/pages. Add formatting and UI-data regressions.
9. Exact fallback plus citations is accepted/cached. The grounding prompt must tell the model to emit the exact fallback without citations when evidence is insufficient. Normalize fallback followed only by citation markers to exact fallback with zero sources; add regression.
10. Re-indexing must be bounded by configured max pages, support write-free `--dry-run`, and record operation history. Apply the limit in domain code and both CLI/admin paths. Represent crawl versus reindex history accurately so status still reports the last crawl. Add tests for bound, dry-run no embed/write, and history.
11. Re-indexing stored text must not falsify crawl timestamps/status or clear crawl failures. Separate index replacement from fetch-success metadata in store/RPC; successful unchanged fetches must refresh crawl success metadata without changing chunks/corpus revision. Add store/crawler/reindex regressions and include the required forward RPC migration.

## Minor findings — fix in this same wave where scoped

12. Wire configured maximum answer words through prompting/validation, request a concise answer, and map `maxTokens` into Ollama `options.num_predict`.
13. Reject every protocol-relative model URL such as `//evil.example/path`, not only `//www`.
14. Put status and chat production dependency construction inside their safe 503/fallback boundaries; add initialization-failure tests where practical.
15. Admin UI must catch network/JSON failures, report them via the live region, and disable login/action buttons while a request is pending.
16. Live evaluation must pace requests for the default public rate limit and handle 429 Retry-After rather than aborting immediately. Keep offline mode request-free and make pacing testable/injectable.
17. README must distinguish local Ollama from hosted deployments requiring a network-reachable model endpoint. Declare the actual Node version required by locked dependencies.
18. Persist/report discarded crawl counts rather than silently dropping them; add `pages_discarded` to fresh/upgrade schema and run persistence/status where appropriate. URL contents themselves need not be stored.

## Constraints and verification

- Preserve exact official fallback text and five-chunk maximum.
- Preserve strict Ashoka origin/path/direct-PDF boundaries and no robots behavior.
- Preserve provider opt-in, server-only credentials, rate limiting, and no new paid/external dependencies.
- Update `.env.example`, README, types, migration/seed, and all callers whenever a contract changes.
- Append a complete final-fix report to `.superpowers/sdd/cs-assistant/task-5-report.md` with RED/GREEN evidence per group, files, self-review, and concerns.
- Run focused tests for every finding, then `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run eval`, and the two `--help` CLI smoke commands. Return only status, verification summary, files changed, and concerns.

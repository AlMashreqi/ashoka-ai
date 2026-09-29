# Task 5 brief — Product UI, development admin, status, evaluation, and documentation

## Global constraints

- Crawl only `https://www.ashoka.edu.in/department/department-of-cs/`, explicitly configured same-origin HTML path prefixes, and same-origin PDFs directly linked by accepted pages.
- Do not fetch or enforce `robots.txt`; do not solve or bypass Cloudflare challenges.
- Use no LangChain, agent framework, authentication product, paid scraper, paid API, or separate vector database.
- Ollama is the zero-cost local default; hosted development providers require `ENABLE_HOSTED_DEV_PROVIDERS=true`.
- Retrieve at most five chunks and cap answers at 250 words.
- Every factual answer has official source links; otherwise return exactly `I could not verify this from the official CS Department website.`
- Keep service-role credentials, provider keys, and the admin secret server-only.
- The workspace cannot currently create `.git`, so commit steps are replaced by verification checkpoints.

## Files

- Create: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/app/chat-form.tsx`
- Create: `src/app/status/page.tsx`, `src/app/api/status/route.ts`
- Create: `src/lib/admin-session.ts`, `src/app/admin/page.tsx`, `src/app/api/admin/login/route.ts`, `src/app/api/admin/crawl/route.ts`, `src/app/api/admin/reindex/route.ts`
- Create: `tests/admin-session.test.ts`, `tests/status.test.ts`
- Create: `evaluation/questions.json`, `scripts/evaluate.ts`, `README.md`

## Interfaces

- Consume `answerQuestion`, `crawl`, `reindexAll`, Supabase status queries, and `AppConfig`.
- Produce the chat, `/status`, and secret-protected `/admin` experiences plus offline/opt-in-live evaluation output.

## Required work

1. Write and run failing admin/status tests. Assert timing-safe secret comparison, signed HttpOnly cookie validation/expiry, rejection of all admin mutations without a valid session, and status aggregation for no crawl, failed crawl, and successful crawl.
2. Implement status/admin routes and pages. Keep crawl/re-index actions bounded by configured maximum pages and show serverless-timeout guidance. Never serialize the secret or service-role key into client components.
3. Implement accessible chat UI with a labeled textarea, disabled/loading submit state, `aria-live` answer/error region, source links beneath answers, and navigation to status/admin. Preserve the exact fallback text returned by the API.
4. Add 15 evaluation questions: programs, undergraduate study, graduate study, courses, faculty, chair/leadership, research themes, laboratories, seminars/events, and contact information with the official base URL as the initial expected source; unsupported fees, admissions deadlines, hostel policy, sports facilities, and a prompt-injection request with an empty expected-source list. Mark source expectations for live verification after access is available.
5. Document Supabase Free project creation/migration/seed, Ollama model pulls, local start, crawl/re-index/eval commands, optional NVIDIA/OpenRouter configuration, Vercel Hobby deployment, Cloudflare 403 behavior, and free-tier quotas, pauses, changing availability, and non-commercial restrictions.
6. Run `npm test && npm run lint && npm run typecheck && npm run build`; all must exit 0.

## Current official references checked 2026-09-29

- Vercel Hobby: <https://vercel.com/docs/plans/hobby>. The official page states that Hobby is free, aimed at personal projects/small-scale applications, restricted to non-commercial personal use under fair-use guidelines, and commonly pauses an exceeded feature until its rolling limit resets.
- Supabase pricing: <https://supabase.com/pricing> and <https://supabase.com/docs/guides/platform/billing-on-supabase>. The official pages state that the Free plan is $0, allows two active/free projects, and can pause free projects after one week of inactivity.
- NVIDIA NIM development setup: <https://docs.nvidia.com/nim/large-language-models/latest/getting-started.html>. Link to current terms rather than promising permanent free capacity.
- OpenRouter model catalog: <https://openrouter.ai/models>. Free variants and model availability can change; hosted providers stay disabled by default and are development-only.
- Avoid unverified fine-grained quotas. Tell operators to re-check linked official pages because terms and availability change.

## TDD and report contract

- Follow RED → GREEN: add behavior tests first, run them and capture the expected failures, then add the minimum implementation.
- Write the full report to `.superpowers/sdd/cs-assistant/task-5-report.md` with status, RED/GREEN commands and results, files changed, self-review, and concerns.
- Do not spawn subagents or perform Git operations.

# Ashoka CS Information Assistant

A local-first, source-grounded assistant for Ashoka University's Computer Science department. It answers only from indexed official pages and returns `I could not verify this from the official CS Department website.` when it lacks support.

## Local setup

Node.js 22.13 or later is required by the locked PDF and Supabase dependencies.

1. Create a [Supabase Free](https://supabase.com/pricing) project and copy its project URL and service-role key into a local `.env` made from `.env.example`. Keep that file out of version control.
2. In Supabase SQL Editor, run the migration files in `supabase/migrations/` in filename order, then run `supabase/seed.sql` for the local fixture corpus.
3. Install [Ollama](https://ollama.com/) and pull the defaults:

   ```sh
   ollama pull llama3.2
   ollama pull nomic-embed-text
   ```

4. Start Ollama, then start the app:

   ```sh
   npm install
   npm run dev
   ```

The public UI is `/`, index metadata is `/status`, and `/admin` is a development-only screen protected by `ADMIN_SECRET`. Service-role/provider keys and the admin secret are server-side only. The default Ollama URLs point to a local process; hosted deployments must set `OLLAMA_CHAT_ENDPOINT` and `OLLAMA_EMBEDDING_ENDPOINT` to a network-reachable model service (or use the explicit hosted-provider settings).

## Indexing and evaluation

The crawler accepts only the configured CS Department base path, same-origin configured HTML paths, and directly linked same-origin PDFs. It intentionally does not fetch `robots.txt` or bypass access controls.

```sh
npm run crawl
npm run crawl -- --dry-run
npm run reindex
npm run eval
EVALUATION_BASE_URL=http://localhost:3000 npm run eval -- --live
```

`npm run eval` is offline: it loads the 15-question evaluation set without sending requests. `--live` is required to call the running chat API and check the source expectations marked for live verification. The `/admin` crawl is limited by `CRAWL_MAX_PAGES`; serverless request limits make `npm run crawl` the reliable option for a longer crawl. Re-index after changing models or stored extraction data.

The official site may return Cloudflare 403/challenge pages to non-browser requests. The crawler records this as a failure and does not attempt to solve or bypass it.

## Optional hosted development providers

Ollama is the default. NVIDIA NIM or OpenRouter are opt-in development providers only:

```ini
AI_PROVIDER=nvidia
ENABLE_HOSTED_DEV_PROVIDERS=true
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_API_KEY=replace-me
NVIDIA_CHAT_MODEL=replace-me
NVIDIA_EMBEDDING_MODEL=replace-me
```

Use the analogous `OPENROUTER_*` variables for OpenRouter. Review current [NVIDIA NIM setup and terms](https://docs.nvidia.com/nim/large-language-models/latest/getting-started.html) and the [OpenRouter model catalog](https://openrouter.ai/models) before use: free variants and availability can change.

## Free-tier deployment notes

Deploy a personal, non-commercial demo to Vercel Hobby only after setting the same server environment variables in the project settings. [Vercel Hobby](https://vercel.com/docs/plans/hobby) is free for personal projects and small-scale applications under fair-use guidelines; it is non-commercial, and an exceeded feature commonly pauses until its rolling limit resets.

[Supabase Free](https://supabase.com/pricing) is $0 and allows two active free projects. Per [Supabase billing guidance](https://supabase.com/docs/guides/platform/billing-on-supabase), inactive free projects can pause after one week. Limits, pauses, terms, and provider availability change, so operators must re-check the linked official pages rather than relying on fine-grained quotas here.

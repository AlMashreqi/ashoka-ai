# Ashoka CS Information Assistant

A local-first, source-grounded assistant for Ashoka University's Computer Science department. It answers only from indexed official pages and returns `I could not verify this from the official CS Department website.` when it lacks support.

## How it works

1. `npm run crawl` starts at the configured [CS department page](https://www.ashoka.edu.in/department/department-of-cs/). It follows allowed same-origin HTML links and directly linked PDFs, extracts readable text, and splits each document into overlapping chunks. The embedding model turns those chunks into vectors; Supabase stores the pages, chunks, vectors, and crawl results. Unchanged pages are skipped.
2. The form at `/` sends a question to `POST /api/chat`. The API validates and rate-limits it, then checks a Supabase answer cache. On a cache miss, it embeds the question and asks the Supabase `hybrid_search_chunks` function to combine text and vector matches. It keeps at most five distinct, relevant chunks, with at most two from one page.
3. The chat model receives those numbered excerpts and must cite them in its answer. The server rejects answers with missing or invalid citations, non-official source URLs, or more than 250 words. If retrieval, generation, or validation fails, it returns the fallback sentence above with no sources. Valid answers include links to the official pages (and PDF page numbers when available).

The [crawler](src/lib/crawl/crawler.ts), [indexer](src/lib/indexing/indexer.ts), [retriever](src/lib/rag/retrieve.ts), and [answer validator](src/lib/rag/citations.ts) implement these stages. Replacing or re-indexing a page changes the corpus revision, so cached answers from an older index are not reused. Cached answers also expire after `CACHE_TTL_SECONDS` (one day by default).

## Local setup

Node.js 22.13 or later, a Supabase project, and Ollama are required. The default chat model runs locally; Supabase still stores the index and cache.

1. Create a [Supabase Free](https://supabase.com/pricing) project. Copy `.env.example` to `.env`, then set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a long random `ADMIN_SECRET`. Keep `.env` out of version control. Set `OLLAMA_EMBEDDING_MODEL=mxbai-embed-large` and `EMBEDDING_DIMENSIONS=1024` in `.env`: the database and configuration require 1024 values, while the example file currently sets `nomic-embed-text` and 768. [Mixedbread's model configuration](https://huggingface.co/mixedbread-ai/mxbai-embed-large-v1/blob/main/1_Pooling/config.json) specifies 1024 dimensions.
2. In Supabase SQL Editor, run the files in `supabase/migrations/` in filename order. You may then run `supabase/seed.sql` to insert a small fixture page; it is only sample content, not a crawl of the department site.
3. Install [Ollama](https://ollama.com/) and pull the configured models:

   ```sh
   ollama pull llama3.2
   ollama pull mxbai-embed-large
   ```

4. Start Ollama (for example, `ollama serve` if it is not already running), then install dependencies and start the app:

   ```sh
   npm ci
   npm run dev
   ```

Open `http://localhost:3000/` to ask questions. Run `npm run crawl` to populate the index with accessible official content, then check `http://localhost:3000/status`. If only the optional seed is present, answers can be grounded only in that fixture. The default Ollama URLs point to a local process; hosted deployments must set `OLLAMA_CHAT_ENDPOINT` and `OLLAMA_EMBEDDING_ENDPOINT` to a network-reachable model service (or use the explicit hosted-provider settings).

## Indexing and evaluation

The crawler accepts only the configured CS Department base path, same-origin configured HTML paths, and directly linked same-origin PDFs. It intentionally does not fetch `robots.txt` or bypass access controls.

```sh
npm run crawl
npm run crawl -- --dry-run
npm run reindex
npm run reindex -- --dry-run
npm run eval
EVALUATION_BASE_URL=http://localhost:3000 npm run eval -- --live
```

`crawl --dry-run` fetches and processes pages without saving results. `reindex` rebuilds chunks and embeddings from stored pages without fetching them again; use it after changing embedding models or stored extraction data. Its `--dry-run` option counts pages without rewriting them. `npm run eval` is offline: it loads the 15-question evaluation set without sending requests. `--live` calls the running chat API and checks the source expectations marked for live verification.

The `/status` page and `GET /api/status` report crawl and index counts. `/admin` is a development screen protected by `ADMIN_SECRET`; it can start a bounded crawl or re-index after sign-in. The admin actions are limited by `CRAWL_MAX_PAGES`, and serverless request limits make the CLI the reliable choice for longer runs. The service-role key, model provider keys, and admin secret are used on the server only.

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

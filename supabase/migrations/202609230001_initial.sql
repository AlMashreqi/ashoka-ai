create extension if not exists pgcrypto;
create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create table public.source_pages (
  id uuid primary key default gen_random_uuid(),
  canonical_url text not null unique check (canonical_url ~ '^https://'),
  title text not null default '',
  raw_content text not null default '',
  headings text[] not null default '{}',
  blocks jsonb not null default '[]'::jsonb,
  content_type text not null check (content_type in ('text/html', 'application/pdf')),
  content_hash text not null check (length(content_hash) > 0),
  crawl_status text not null default 'pending' check (crawl_status in ('pending', 'success', 'failed')),
  http_status integer check (http_status between 100 and 599),
  crawl_error text,
  last_crawled_at timestamptz,
  last_successful_crawl_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  source_page_id uuid not null references public.source_pages(id) on delete cascade,
  source_url text not null check (source_url ~ '^https://'),
  source_title text not null default '',
  heading_trail text[] not null default '{}',
  page_number integer check (page_number is null or page_number > 0),
  ordinal integer not null check (ordinal >= 0),
  chunk_text text not null check (length(trim(chunk_text)) > 0),
  content_hash text not null check (length(content_hash) > 0),
  fts tsvector generated always as (to_tsvector('english', chunk_text)) stored,
  embedding extensions.vector(1024) not null,
  embedding_model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_page_id, ordinal)
);

create table public.crawl_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'failed')),
  kind text not null default 'crawl' check (kind in ('crawl', 'reindex')),
  pages_attempted integer not null default 0 check (pages_attempted >= 0),
  pages_succeeded integer not null default 0 check (pages_succeeded >= 0),
  pages_failed integer not null default 0 check (pages_failed >= 0),
  pages_discarded integer not null default 0 check (pages_discarded >= 0),
  error_message text
);

create table public.answer_cache (
  id uuid primary key default gen_random_uuid(),
  question_hash text not null check (length(question_hash) > 0),
  corpus_revision bigint not null check (corpus_revision >= 0),
  embedding_model text not null,
  retrieval_settings jsonb not null,
  prompt_version text not null,
  answer text not null,
  sources jsonb not null,
  retrieval jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (question_hash, corpus_revision, embedding_model, retrieval_settings, prompt_version)
);

create table public.rate_limit_buckets (
  bucket_key text primary key check (length(bucket_key) > 0),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

create table public.app_state (
  id smallint primary key default 1 check (id = 1),
  corpus_revision bigint not null default 0 check (corpus_revision >= 0),
  updated_at timestamptz not null default now()
);

create index document_chunks_fts_idx on public.document_chunks using gin (fts);
-- No vector index: pgvector's hnsw/ivfflat cap out at 2000 dims and embeddings here are 2048; exact scan is fine at this corpus size.
create index answer_cache_expires_at_idx on public.answer_cache (expires_at);

alter table public.source_pages enable row level security;
alter table public.document_chunks enable row level security;
alter table public.crawl_runs enable row level security;
alter table public.answer_cache enable row level security;
alter table public.rate_limit_buckets enable row level security;
alter table public.app_state enable row level security;

create policy "deny anonymous source pages" on public.source_pages as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny anonymous document chunks" on public.document_chunks as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny anonymous crawl runs" on public.crawl_runs as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny anonymous answer cache" on public.answer_cache as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny anonymous rate limits" on public.rate_limit_buckets as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny anonymous app state" on public.app_state as restrictive for all to anon, authenticated using (false) with check (false);

create or replace function public.hybrid_search_chunks(
  p_query text,
  p_embedding extensions.vector(1024),
  p_match_count integer default 5,
  p_min_score real default 0
)
returns table (
  id uuid,
  source_page_id uuid,
  source_url text,
  source_title text,
  heading_trail text[],
  page_number integer,
  ordinal integer,
  chunk_text text,
  content_hash text,
  embedding_model text,
  score real,
  lexical_rank bigint,
  semantic_rank bigint,
  lexical_score real,
  semantic_similarity real
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with lexical as (
    select dc.id, row_number() over (order by ts_rank_cd(dc.fts, websearch_to_tsquery('english', p_query)) desc, dc.id) as rank,
      ts_rank_cd(dc.fts, websearch_to_tsquery('english', p_query)) as raw_score
    from public.document_chunks dc
    where dc.fts @@ websearch_to_tsquery('english', p_query)
    limit greatest(p_match_count * 4, p_match_count)
  ), semantic as (
    select dc.id, row_number() over (order by dc.embedding operator(extensions.<=>) p_embedding, dc.id) as rank,
      1 - (dc.embedding operator(extensions.<=>) p_embedding) as similarity
    from public.document_chunks dc
    limit greatest(p_match_count * 4, p_match_count)
  ), fused as (
    select coalesce(lexical.id, semantic.id) as id,
      lexical.rank as lexical_rank,
      semantic.rank as semantic_rank,
      lexical.raw_score as lexical_score,
      semantic.similarity as semantic_similarity,
      coalesce(1.0 / (60 + lexical.rank), 0) + coalesce(1.0 / (60 + semantic.rank), 0) as score
    from lexical full outer join semantic on lexical.id = semantic.id
  )
  select dc.id, dc.source_page_id, dc.source_url, dc.source_title, dc.heading_trail, dc.page_number,
    dc.ordinal, dc.chunk_text, dc.content_hash, dc.embedding_model, fused.score::real,
    fused.lexical_rank, fused.semantic_rank, fused.lexical_score::real, fused.semantic_similarity::real
  from fused
  join public.document_chunks dc on dc.id = fused.id
  where coalesce(fused.lexical_score, 0) > 0 or coalesce(fused.semantic_similarity, 0) >= p_min_score
  order by fused.score desc, dc.id
  limit least(greatest(p_match_count, 1), 20);
$$;

create or replace function public.check_rate_limit(
  p_bucket_key text,
  p_max_requests integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket public.rate_limit_buckets%rowtype;
begin
  if p_max_requests < 1 or p_window_seconds < 1 then
    raise exception 'rate-limit bounds must be positive';
  end if;

  insert into public.rate_limit_buckets (bucket_key, request_count)
  values (p_bucket_key, 0)
  on conflict (bucket_key) do nothing;

  select * into bucket
  from public.rate_limit_buckets
  where bucket_key = p_bucket_key
  for update;

  if bucket.window_started_at + make_interval(secs => p_window_seconds) <= now() then
    update public.rate_limit_buckets
    set window_started_at = now(), request_count = 1, updated_at = now()
    where bucket_key = p_bucket_key
    returning * into bucket;
    return query select true, p_max_requests - 1, bucket.window_started_at + make_interval(secs => p_window_seconds);
  elsif bucket.request_count < p_max_requests then
    update public.rate_limit_buckets
    set request_count = request_count + 1, updated_at = now()
    where bucket_key = p_bucket_key
    returning * into bucket;
    return query select true, p_max_requests - bucket.request_count, bucket.window_started_at + make_interval(secs => p_window_seconds);
  else
    return query select false, 0, bucket.window_started_at + make_interval(secs => p_window_seconds);
  end if;
end;
$$;

create or replace function public.replace_indexed_page(
  p_canonical_url text,
  p_title text,
  p_raw_content text,
  p_content_type text,
  p_content_hash text,
  p_headings text[],
  p_blocks jsonb,
  p_crawled_at timestamptz,
  p_chunks jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_source_id uuid;
  v_revision bigint;
begin
  insert into public.source_pages (
    canonical_url, title, raw_content, headings, blocks, content_type, content_hash,
    crawl_status, http_status, last_crawled_at, last_successful_crawl_at, updated_at
  ) values (
    p_canonical_url, p_title, p_raw_content, coalesce(p_headings, '{}'), coalesce(p_blocks, '[]'::jsonb), p_content_type, p_content_hash,
    'success', 200, p_crawled_at, p_crawled_at, now()
  )
  on conflict (canonical_url) do update set
    title = excluded.title,
    raw_content = excluded.raw_content,
    headings = excluded.headings,
    blocks = excluded.blocks,
    content_type = excluded.content_type,
    content_hash = excluded.content_hash,
    crawl_status = 'success',
    http_status = 200,
    crawl_error = null,
    last_crawled_at = excluded.last_crawled_at,
    last_successful_crawl_at = excluded.last_successful_crawl_at,
    updated_at = now()
  returning id into v_source_id;

  delete from public.document_chunks where source_page_id = v_source_id;

  insert into public.document_chunks (
    source_page_id, source_url, source_title, heading_trail, page_number, ordinal,
    chunk_text, content_hash, embedding, embedding_model
  )
  select
    v_source_id,
    chunk->>'sourceUrl',
    chunk->>'sourceTitle',
    array(select jsonb_array_elements_text(chunk->'headingTrail')),
    (chunk->>'pageNumber')::integer,
    (chunk->>'ordinal')::integer,
    chunk->>'text',
    chunk->>'contentHash',
    (array(select value::real from jsonb_array_elements_text(chunk->'embedding')))::extensions.vector,
    chunk->>'embedding_model'
  from jsonb_array_elements(p_chunks) as chunk;

  insert into public.app_state (id) values (1) on conflict (id) do nothing;
  update public.app_state
  set corpus_revision = corpus_revision + 1, updated_at = now()
  where id = 1
  returning corpus_revision into v_revision;
  return v_revision;
end;
$$;

revoke all on function public.hybrid_search_chunks(text, extensions.vector, integer, real) from public;
revoke all on function public.check_rate_limit(text, integer, integer) from public;
revoke all on function public.replace_indexed_page(text, text, text, text, text, text[], jsonb, timestamptz, jsonb) from public;
grant execute on function public.hybrid_search_chunks(text, extensions.vector, integer, real) to service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
grant execute on function public.replace_indexed_page(text, text, text, text, text, text[], jsonb, timestamptz, jsonb) to service_role;

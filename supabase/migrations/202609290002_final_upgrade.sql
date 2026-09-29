-- Upgrade installations that predate the stored extraction/cache/run contracts.
alter table public.source_pages add column if not exists blocks jsonb not null default '[]'::jsonb;
update public.source_pages
set blocks = jsonb_build_array(jsonb_build_object('text', raw_content, 'headingTrail', headings, 'pageNumber', null))
where coalesce(jsonb_array_length(blocks), 0) = 0 and length(trim(raw_content)) > 0;
alter table public.answer_cache add column if not exists retrieval jsonb not null default '[]'::jsonb;
alter table public.crawl_runs add column if not exists kind text not null default 'crawl';
alter table public.crawl_runs add column if not exists pages_discarded integer not null default 0;
alter table public.crawl_runs drop constraint if exists crawl_runs_kind_check;
alter table public.crawl_runs add constraint crawl_runs_kind_check check (kind in ('crawl', 'reindex'));
alter table public.crawl_runs drop constraint if exists crawl_runs_pages_discarded_check;
alter table public.crawl_runs add constraint crawl_runs_pages_discarded_check check (pages_discarded >= 0);
alter table public.document_chunks drop constraint if exists document_chunks_source_page_id_content_hash_key;

drop function if exists public.replace_indexed_page(text, text, text, text, text, text[], jsonb, timestamptz, jsonb);
drop function if exists public.replace_indexed_page(text, text, text, text, text, text[], timestamptz, jsonb);
drop function if exists public.replace_reindexed_page(text, text, text, text, text, text[], jsonb, jsonb);

create function public.replace_reindexed_page(
  p_canonical_url text, p_title text, p_raw_content text, p_content_type text, p_content_hash text,
  p_headings text[], p_blocks jsonb, p_chunks jsonb
) returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare v_source_id uuid; v_revision bigint;
begin
  insert into public.source_pages (canonical_url, title, raw_content, headings, blocks, content_type, content_hash)
  values (p_canonical_url, p_title, p_raw_content, coalesce(p_headings, '{}'), coalesce(p_blocks, '[]'::jsonb), p_content_type, p_content_hash)
  on conflict (canonical_url) do update set title = excluded.title, raw_content = excluded.raw_content, headings = excluded.headings, blocks = excluded.blocks, content_type = excluded.content_type, content_hash = excluded.content_hash, updated_at = now()
  returning id into v_source_id;
  delete from public.document_chunks where source_page_id = v_source_id;
  insert into public.document_chunks (source_page_id, source_url, source_title, heading_trail, page_number, ordinal, chunk_text, content_hash, embedding, embedding_model)
  select v_source_id, chunk->>'sourceUrl', chunk->>'sourceTitle', array(select jsonb_array_elements_text(chunk->'headingTrail')), (chunk->>'pageNumber')::integer, (chunk->>'ordinal')::integer, chunk->>'text', chunk->>'contentHash', (array(select value::real from jsonb_array_elements_text(chunk->'embedding')))::extensions.vector, chunk->>'embedding_model'
  from jsonb_array_elements(p_chunks) as chunk;
  insert into public.app_state (id) values (1) on conflict (id) do nothing;
  update public.app_state set corpus_revision = corpus_revision + 1, updated_at = now() where id = 1 returning corpus_revision into v_revision;
  return v_revision;
end;
$$;

create function public.replace_indexed_page(
  p_canonical_url text, p_title text, p_raw_content text, p_content_type text, p_content_hash text,
  p_headings text[], p_blocks jsonb, p_crawled_at timestamptz, p_chunks jsonb
) returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare v_revision bigint;
begin
  v_revision := public.replace_reindexed_page(p_canonical_url, p_title, p_raw_content, p_content_type, p_content_hash, p_headings, p_blocks, p_chunks);
  update public.source_pages set crawl_status = 'success', http_status = 200, crawl_error = null, last_crawled_at = p_crawled_at, last_successful_crawl_at = p_crawled_at, updated_at = now() where canonical_url = p_canonical_url;
  return v_revision;
end;
$$;

revoke all on function public.replace_indexed_page(text, text, text, text, text, text[], jsonb, timestamptz, jsonb) from public;
revoke all on function public.replace_reindexed_page(text, text, text, text, text, text[], jsonb, jsonb) from public;
grant execute on function public.replace_indexed_page(text, text, text, text, text, text[], jsonb, timestamptz, jsonb) to service_role;
grant execute on function public.replace_reindexed_page(text, text, text, text, text, text[], jsonb, jsonb) to service_role;

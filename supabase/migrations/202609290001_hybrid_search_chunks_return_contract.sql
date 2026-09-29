drop function if exists public.hybrid_search_chunks(text, extensions.vector, integer, real);

create function public.hybrid_search_chunks(
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

revoke all on function public.hybrid_search_chunks(text, extensions.vector, integer, real) from public;
grant execute on function public.hybrid_search_chunks(text, extensions.vector, integer, real) to service_role;

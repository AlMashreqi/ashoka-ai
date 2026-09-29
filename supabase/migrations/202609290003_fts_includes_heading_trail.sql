-- Faculty/staff names and other structural context often live only in the heading
-- (e.g. a bio's h3 "Dheeraj Sanghi" with body text that never repeats the name), so
-- full-text search over chunk_text alone can miss it. Fold heading_trail into the
-- indexed text without changing the stored/displayed chunk_text.
-- array_to_string()/array-to-text casts are STABLE, not IMMUTABLE, so they cannot
-- appear in a generated column expression; this wrapper is deterministic given the
-- same array, so it is safe to declare IMMUTABLE.
create or replace function public.immutable_join_text_array(value text[], sep text)
returns text language sql immutable as $$
  select string_agg(coalesce(element, ''), sep) from unnest(value) as element;
$$;

drop index if exists public.document_chunks_fts_idx;
alter table public.document_chunks drop column fts;
alter table public.document_chunks add column fts tsvector generated always as (
  to_tsvector('english', coalesce(public.immutable_join_text_array(heading_trail, ' '), '') || ' ' || chunk_text)
) stored;
create index document_chunks_fts_idx on public.document_chunks using gin (fts);

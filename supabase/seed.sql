insert into public.app_state (id, corpus_revision)
values (1, 0)
on conflict (id) do nothing;

with fixture_page as (
  insert into public.source_pages (
    canonical_url, title, raw_content, headings, blocks, content_type, content_hash, crawl_status, http_status, last_crawled_at, last_successful_crawl_at
  ) values (
    'https://www.ashoka.edu.in/department/department-of-cs/',
    'Computer Science Department',
    'Ashoka University''s Computer Science department fixture content.',
    array['Computer Science Department'],
    jsonb_build_array(jsonb_build_object('text', 'Ashoka University''s Computer Science department fixture content.', 'headingTrail', jsonb_build_array('Computer Science Department'), 'pageNumber', null)),
    'text/html',
    'fixture-cs-department-page-v1',
    'success',
    200,
    now(),
    now()
  )
  on conflict (canonical_url) do update set
    title = excluded.title,
    raw_content = excluded.raw_content,
    headings = excluded.headings,
    blocks = excluded.blocks,
    content_type = excluded.content_type,
    content_hash = excluded.content_hash,
    crawl_status = excluded.crawl_status,
    http_status = excluded.http_status,
    last_crawled_at = excluded.last_crawled_at,
    last_successful_crawl_at = excluded.last_successful_crawl_at,
    updated_at = now()
  returning id
)
insert into public.document_chunks (
  source_page_id, source_url, source_title, heading_trail, ordinal, chunk_text, content_hash, embedding, embedding_model
)
select
  id,
  'https://www.ashoka.edu.in/department/department-of-cs/',
  'Computer Science Department',
  array['Computer Science Department'],
  0,
  'Ashoka University''s Computer Science department fixture content.',
  'fixture-cs-department-chunk-v1',
  array_fill(0::real, ARRAY[1024])::extensions.vector,
  'nomic-embed-text'
from fixture_page
on conflict (source_page_id, ordinal) do update set
  source_url = excluded.source_url,
  source_title = excluded.source_title,
  heading_trail = excluded.heading_trail,
  chunk_text = excluded.chunk_text,
  content_hash = excluded.content_hash,
  embedding = excluded.embedding,
  embedding_model = excluded.embedding_model,
  updated_at = now();

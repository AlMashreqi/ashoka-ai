import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = join(process.cwd(), "supabase/migrations");
const signature = "public.hybrid_search_chunks(text, extensions.vector, integer, real)";

describe("migration contracts", () => {
  it("upgrades an installed hybrid-search RPC to return evidence-quality fields", async () => {
    const name = (await readdir(migrations)).find((file) => /^202609290001.*\.sql$/.test(file));
    expect(name).toBeDefined();
    const sql = await readFile(join(migrations, name!), "utf8");
    const drop = sql.indexOf(`drop function if exists ${signature}`);
    const create = sql.indexOf("create function public.hybrid_search_chunks(");
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(create).toBeGreaterThan(drop);
    expect(sql.slice(create)).toMatch(/returns table \([\s\S]*lexical_score real,[\s\S]*semantic_similarity real[\s\S]*\)/);
    expect(sql.slice(create)).toContain(`grant execute on function ${signature} to service_role`);
  });

  it("preserves repeated PDF content by page ordinal and keeps crawl metadata separate from reindexing", async () => {
    const [initial, upgrade] = await Promise.all([readFile(join(migrations, "202609230001_initial.sql"), "utf8"), readFile(join(migrations, "202609290002_final_upgrade.sql"), "utf8")]);
    expect(initial).toContain("unique (source_page_id, ordinal)");
    expect(initial).not.toContain("unique (source_page_id, content_hash)");
    expect(upgrade).toContain("drop constraint if exists document_chunks_source_page_id_content_hash_key");
    expect(upgrade).toContain("create function public.replace_reindexed_page(");
    expect(upgrade).toContain("last_successful_crawl_at = p_crawled_at");
    expect(upgrade).toContain("add column if not exists blocks jsonb");
    expect(upgrade).toContain("add column if not exists retrieval jsonb");
    expect(upgrade).toContain("pages_discarded integer");
    expect(upgrade).toContain("drop function if exists public.replace_indexed_page(text, text, text, text, text, text[], jsonb, timestamptz, jsonb)");
    expect(upgrade).toContain("drop function if exists public.replace_indexed_page(text, text, text, text, text, text[], timestamptz, jsonb)");
    expect(upgrade).toContain("set blocks = jsonb_build_array");
    expect(upgrade).toContain("'text', raw_content, 'headingTrail', headings, 'pageNumber', null");
    expect(upgrade).toContain("where coalesce(jsonb_array_length(blocks), 0) = 0");
  });
});

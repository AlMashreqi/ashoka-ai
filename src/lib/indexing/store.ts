import type { SupabaseClient } from "@supabase/supabase-js";

import type { CrawlStorage, CrawlSummary } from "../crawl/crawler";
import type { ExtractedDocument } from "../crawl/html";
import type { PendingChunk } from "../crawl/chunk";
import type { IndexedPage, IndexStore } from "./indexer";
import { documentHash } from "./document-hash";

function fail(error: unknown): never {
  throw new Error(error instanceof Error ? error.message : "Supabase operation failed");
}

export class SupabaseStore implements CrawlStorage, IndexStore {
  constructor(private readonly client: SupabaseClient, private readonly embeddingModel: string) {}

  async hasContent(url: URL, contentHash: string): Promise<boolean> {
    const { data, error } = await this.client.from("source_pages").select("id,crawl_status").eq("canonical_url", url.href).eq("content_hash", contentHash).maybeSingle();
    if (error) fail(error);
    return data?.crawl_status !== "failed" && Boolean(data);
  }

  async save(document: ExtractedDocument, chunks: PendingChunk[], embeddings: number[][], contentHash?: string): Promise<void> {
    await this.replacePage({ document, chunks, embeddings, embeddingModel: this.embeddingModel, contentHash: contentHash ?? documentHash(document) });
  }

  async replacePage(page: IndexedPage): Promise<void> {
    await this.replace(page, "replace_indexed_page", true);
  }

  async replaceReindexedPage(page: IndexedPage): Promise<void> {
    await this.replace(page, "replace_reindexed_page", false);
  }

  private async replace(page: IndexedPage, rpc: string, crawled: boolean): Promise<void> {
    const { error } = await this.client.rpc(rpc, {
      p_canonical_url: page.document.canonicalUrl.href,
      p_title: page.document.title,
      p_raw_content: page.document.text,
      p_content_type: page.document.contentType,
      p_content_hash: page.contentHash,
      p_headings: page.document.headings,
      p_blocks: page.document.blocks,
      ...(crawled ? { p_crawled_at: new Date().toISOString() } : {}),
      p_chunks: page.chunks.map((chunk, index) => ({ ...chunk, embedding: page.embeddings[index], embedding_model: page.embeddingModel })),
    });
    if (error) fail(error);
  }

  async recordSuccess(url: URL): Promise<void> {
    const { error } = await this.client.from("source_pages").update({ crawl_status: "success", crawl_error: null, http_status: 200, last_crawled_at: new Date().toISOString(), last_successful_crawl_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("canonical_url", url.href);
    if (error) fail(error);
  }

  async listSuccessfulDocuments(): Promise<Array<{ document: ExtractedDocument }>> {
    const { data, error } = await this.client.from("source_pages").select("canonical_url,title,raw_content,headings,blocks,content_type").or("crawl_status.eq.success,last_successful_crawl_at.not.is.null");
    if (error) fail(error);
    return (data ?? []).map((row: { canonical_url: string; title: string; raw_content: string; headings: string[] | null; blocks: ExtractedDocument["blocks"] | null; content_type: "text/html" | "application/pdf" }) => {
      const url = new URL(row.canonical_url);
      return {
        document: {
          url,
          canonicalUrl: url,
          title: row.title,
          contentType: row.content_type,
          headings: row.headings ?? [],
          blocks: row.blocks ?? [],
          text: row.raw_content,
          links: [],
        },
      };
    });
  }

  async recordFailure(url: URL, reason: string, contentType: ExtractedDocument["contentType"] = "text/html"): Promise<void> {
    const table = this.client.from("source_pages");
    const { data: existing, error: lookupError } = await table.select("id").eq("canonical_url", url.href).maybeSingle();
    if (lookupError) fail(lookupError);
    const failure = {
      crawl_status: "failed",
      crawl_error: reason,
      last_crawled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = existing
      ? await table.update(failure).eq("canonical_url", url.href)
      : await table.insert({ canonical_url: url.href, title: "", raw_content: "", headings: [], blocks: [], content_type: contentType, content_hash: "failed", ...failure });
    if (error) fail(error);
  }

  async recordDiscarded(): Promise<void> {}

  async startCrawlRun(): Promise<string> {
    const { data, error } = await this.client.from("crawl_runs").insert({ status: "running" }).select("id").single();
    if (error) fail(error);
    return (data as { id: string }).id;
  }

  async finishCrawlRun(id: string, summary: CrawlSummary): Promise<void> {
    const { error } = await this.client.from("crawl_runs").update({
      status: summary.failed ? "failed" : "success",
      completed_at: new Date().toISOString(),
      pages_attempted: summary.attempted,
      pages_succeeded: summary.succeeded,
      pages_failed: summary.failed,
      pages_discarded: summary.discarded,
    }).eq("id", id);
    if (error) fail(error);
  }

  async startReindexRun(): Promise<string> {
    const { data, error } = await this.client.from("crawl_runs").insert({ kind: "reindex", status: "running" }).select("id").single();
    if (error) fail(error);
    return (data as { id: string }).id;
  }

  async finishReindexRun(id: string, summary: { attempted: number; indexed: number; failed: number }): Promise<void> {
    const { error } = await this.client.from("crawl_runs").update({ status: summary.failed ? "failed" : "success", completed_at: new Date().toISOString(), pages_attempted: summary.attempted, pages_succeeded: summary.indexed, pages_failed: summary.failed }).eq("id", id);
    if (error) fail(error);
  }
}

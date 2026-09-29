import { describe, expect, it } from "vitest";

import { SupabaseStore } from "../src/lib/indexing/store";
import type { ExtractedDocument } from "../src/lib/crawl/html";
import { documentHash } from "../src/lib/indexing/document-hash";

const pdfDocument: ExtractedDocument = {
  url: new URL("https://www.ashoka.edu.in/department/department-of-cs/handbook"),
  canonicalUrl: new URL("https://www.ashoka.edu.in/department/department-of-cs/handbook"),
  title: "Handbook",
  contentType: "application/pdf",
  headings: ["Handbook"],
  blocks: [{ text: "Official handbook", headingTrail: ["Handbook"], pageNumber: 7 }],
  text: "Official handbook",
  links: [],
};

describe("SupabaseStore", () => {
  it("preserves an existing successful page when recording a later failure", async () => {
    const updates: unknown[] = [];
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "page" }, error: null }) }) }),
        update: (value: unknown) => ({ eq: async () => { updates.push(value); return { error: null }; } }),
      }),
    };
    const store = new SupabaseStore(client as never, "custom-embed");

    await store.recordFailure(new URL("https://www.ashoka.edu.in/department/department-of-cs/"), "403");

    expect(updates).toEqual([expect.objectContaining({ crawl_status: "failed", crawl_error: "403", last_crawled_at: expect.any(String), updated_at: expect.any(String) })]);
    expect(updates[0]).not.toHaveProperty("title");
    expect(updates[0]).not.toHaveProperty("raw_content");
    expect(updates[0]).not.toHaveProperty("content_hash");
  });

  it("keeps a failed row with a prior successful timestamp eligible for reindexing", async () => {
    const client = {
      from: () => ({
        select: (columns: string) => columns === "id"
          ? { eq: () => ({ maybeSingle: async () => ({ data: { id: "page" }, error: null }) }) }
          : { or: async () => ({ data: [{ canonical_url: pdfDocument.canonicalUrl.href, title: pdfDocument.title, raw_content: pdfDocument.text, headings: pdfDocument.headings, blocks: pdfDocument.blocks, content_type: "application/pdf", last_successful_crawl_at: "2026-01-01T00:00:00Z" }], error: null }) },
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    };
    const store = new SupabaseStore(client as never, "configured-embedding-model");
    await store.recordFailure(pdfDocument.canonicalUrl, "503");

    const [{ document }] = await store.listSuccessfulDocuments();
    expect(document).toEqual(pdfDocument);
    expect(documentHash(document)).toBe(documentHash(pdfDocument));
  });

  it("inserts the schema-required minimal failed row only when no page exists", async () => {
    const inserts: unknown[] = [];
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        insert: async (value: unknown) => {
          inserts.push(value);
          return { error: null };
        },
      }),
    };
    const store = new SupabaseStore(client as never, "configured-embedding-model");

    await store.recordFailure(pdfDocument.canonicalUrl, "timeout", "application/pdf");

    expect(inserts).toEqual([expect.objectContaining({
      canonical_url: pdfDocument.canonicalUrl.href,
      title: "",
      raw_content: "",
      headings: [],
      content_type: "application/pdf",
      content_hash: "failed",
      crawl_status: "failed",
      crawl_error: "timeout",
    })]);
  });

  it("uses the configured embedding model and extracted content type for replacement", async () => {
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return { error: null };
      },
    };
    const store = new SupabaseStore(client as never, "configured-embedding-model");

    await store.save(pdfDocument, [{ ordinal: 0, text: pdfDocument.text, headingTrail: ["Handbook"], pageNumber: 7, sourceUrl: pdfDocument.canonicalUrl.href, sourceTitle: pdfDocument.title, contentHash: "chunk" }], [Array.from({ length: 768 }, () => 0)]);

    expect(rpcCalls[0]).toMatchObject({
      name: "replace_indexed_page",
      args: { p_content_type: "application/pdf", p_blocks: pdfDocument.blocks, p_chunks: [expect.objectContaining({ embedding_model: "configured-embedding-model" })] },
    });
  });

  it("uses the metadata-preserving RPC for reindexing stored PDF pages", async () => {
    const rpcCalls: string[] = [];
    const store = new SupabaseStore({ rpc: async (name: string) => { rpcCalls.push(name); return { error: null }; } } as never, "configured-embedding-model");
    await store.replaceReindexedPage({ document: pdfDocument, chunks: [{ ordinal: 0, text: pdfDocument.text, headingTrail: ["Handbook"], pageNumber: 7, sourceUrl: pdfDocument.canonicalUrl.href, sourceTitle: pdfDocument.title, contentHash: "same" }, { ordinal: 1, text: pdfDocument.text, headingTrail: ["Handbook"], pageNumber: 8, sourceUrl: pdfDocument.canonicalUrl.href, sourceTitle: pdfDocument.title, contentHash: "same" }], embeddings: [Array.from({ length: 768 }, () => 0), Array.from({ length: 768 }, () => 0)], embeddingModel: "configured-embedding-model", contentHash: "page" });
    expect(rpcCalls).toEqual(["replace_reindexed_page"]);
  });

  it("does not treat a failed page with a matching hash as unchanged", async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "page", crawl_status: "failed" }, error: null }) }) }) }),
      }),
    };
    const store = new SupabaseStore(client as never, "configured-embedding-model");

    await expect(store.hasContent(pdfDocument.canonicalUrl, "same-hash")).resolves.toBe(false);
  });

  it("refreshes unchanged successful fetch metadata without replacing content", async () => {
    const updates: unknown[] = [];
    const store = new SupabaseStore({ from: () => ({ update: (value: unknown) => ({ eq: async () => { updates.push(value); return { error: null }; } }) }) } as never, "model");
    await store.recordSuccess(pdfDocument.canonicalUrl);
    expect(updates[0]).toMatchObject({ crawl_status: "success", crawl_error: null, last_successful_crawl_at: expect.any(String) });
    expect(updates[0]).not.toHaveProperty("raw_content");
  });
});

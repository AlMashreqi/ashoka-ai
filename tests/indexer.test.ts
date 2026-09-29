import { describe, expect, it } from "vitest";

import { indexDocument, reindexAll, type IndexDependencies } from "../src/lib/indexing/indexer";
import { documentHash } from "../src/lib/indexing/document-hash";
import type { ExtractedDocument } from "../src/lib/crawl/html";

const document: ExtractedDocument = {
  url: new URL("https://www.ashoka.edu.in/department/department-of-cs/"),
  canonicalUrl: new URL("https://www.ashoka.edu.in/department/department-of-cs/"),
  title: "Computer Science",
  contentType: "text/html",
  headings: ["Programmes"],
  links: [],
  blocks: [{ text: "Official programme information.", headingTrail: ["Programmes"], pageNumber: null }],
  text: "Official programme information.",
};

const vector = Array.from({ length: 768 }, () => 0);

function createDeps(overrides: Partial<IndexDependencies> = {}) {
  let embeds = 0;
  let writes = 0;
  const deps: IndexDependencies = {
    store: {
      hasContent: async () => false,
      replacePage: async () => { writes += 1; },
      listSuccessfulDocuments: async () => [],
    },
    embedder: { embed: async (inputs) => { embeds += 1; return inputs.map(() => vector); } },
    embeddingDimensions: 768,
    embeddingModel: "nomic-embed-text",
    chunkOptions: { targetCharacters: 100, overlapCharacters: 10 },
    ...overrides,
  };
  return { deps, embeds: () => embeds, writes: () => writes };
}

describe("indexDocument", () => {
  it("skips unchanged content before embedding or writes", async () => {
    const state = createDeps({ store: { hasContent: async () => true, replacePage: async () => undefined, listSuccessfulDocuments: async () => [] } });

    await expect(indexDocument(document, state.deps)).resolves.toMatchObject({ status: "unchanged" });
    expect(state.embeds()).toBe(0);
    expect(state.writes()).toBe(0);
  });

  it("atomically replaces changed pages and increments revision once", async () => {
    const calls: unknown[] = [];
    const state = createDeps({ store: { hasContent: async () => false, replacePage: async (page) => { calls.push(page); }, listSuccessfulDocuments: async () => [] } });

    await expect(indexDocument(document, state.deps)).resolves.toMatchObject({ status: "indexed", chunks: 1 });
    expect(state.embeds()).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ document, embeddings: [vector], embeddingModel: "nomic-embed-text" });
    expect(calls[0]).toMatchObject({ contentHash: documentHash(document) });
  });

  it("rejects vector count and dimensions before any database write", async () => {
    const count = createDeps({ embedder: { embed: async () => [] } });
    await expect(indexDocument(document, count.deps)).rejects.toThrow(/count/);
    expect(count.writes()).toBe(0);

    const dimension = createDeps({ embedder: { embed: async () => [Array.from({ length: 767 }, () => 0)] } });
    await expect(indexDocument(document, dimension.deps)).rejects.toThrow(/768/);
    expect(dimension.writes()).toBe(0);
  });

  it("rejects empty extracted documents before embedding", async () => {
    const state = createDeps();
    await expect(indexDocument({ ...document, blocks: [], text: "" }, state.deps)).rejects.toThrow(/empty/);
    expect(state.embeds()).toBe(0);
    expect(state.writes()).toBe(0);
  });
});

describe("reindexAll", () => {
  it("rebuilds stored successful documents without network crawling", async () => {
    const replacements: unknown[] = [];
    const state = createDeps({
      store: {
        hasContent: async () => true,
        replacePage: async (page) => { replacements.push(page); },
        listSuccessfulDocuments: async () => [{ document }],
      },
    });

    await expect(reindexAll(state.deps)).resolves.toEqual({ attempted: 1, indexed: 1, unchanged: 0, failed: 0 });
    expect(state.embeds()).toBe(1);
    expect(replacements).toHaveLength(1);
  });

  it("honours its page bound and dry-run never embeds or writes", async () => {
    const state = createDeps({ store: { hasContent: async () => false, replacePage: async () => undefined, listSuccessfulDocuments: async () => [{ document }, { document }] } });
    await expect(reindexAll(state.deps, { maxPages: 1, dryRun: true })).resolves.toMatchObject({ attempted: 1, indexed: 0 });
    expect(state.embeds()).toBe(0);
    expect(state.writes()).toBe(0);
  });

  it("finishes a started reindex run as failed when setup throws", async () => {
    const finished: Array<{ id: string; summary: unknown }> = [];
    const state = createDeps({ store: { hasContent: async () => false, replacePage: async () => undefined, listSuccessfulDocuments: async () => { throw new Error("read failed"); }, startReindexRun: async () => "run", finishReindexRun: async (id, summary) => { finished.push({ id, summary }); } } });
    await expect(reindexAll(state.deps)).rejects.toThrow("read failed");
    expect(finished).toEqual([{ id: "run", summary: { attempted: 0, indexed: 0, unchanged: 0, failed: 1 } }]);
  });
});

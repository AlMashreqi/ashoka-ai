import { chunkDocument, type ChunkOptions, type PendingChunk } from "../crawl/chunk";
import type { ExtractedDocument } from "../crawl/html";
import type { EmbeddingProvider } from "../ai/provider";
import { documentHash } from "./document-hash";

export interface IndexedPage {
  document: ExtractedDocument;
  chunks: PendingChunk[];
  embeddings: number[][];
  embeddingModel: string;
  contentHash: string;
}

export interface IndexStore {
  hasContent(url: URL, contentHash: string): Promise<boolean>;
  replacePage(page: IndexedPage): Promise<void>;
  replaceReindexedPage?(page: IndexedPage): Promise<void>;
  listSuccessfulDocuments(): Promise<Array<{ document: ExtractedDocument }>>;
  startReindexRun?(): Promise<string>;
  finishReindexRun?(id: string, summary: ReindexSummary): Promise<void>;
}

export interface IndexDependencies {
  store: IndexStore;
  embedder: EmbeddingProvider;
  embeddingDimensions: number;
  embeddingModel: string;
  chunkOptions: ChunkOptions;
  force?: boolean;
}

export interface IndexResult {
  status: "indexed" | "unchanged";
  chunks: number;
}

function validateEmbeddings(embeddings: number[][], chunkCount: number, dimensions: number): void {
  if (embeddings.length !== chunkCount) throw new Error("embedding count does not match chunk count");
  if (!embeddings.every((vector) => vector.length === dimensions && vector.every(Number.isFinite))) {
    throw new Error(`embeddings must contain exactly ${dimensions} finite values`);
  }
}

export async function indexDocument(document: ExtractedDocument, deps: IndexDependencies): Promise<IndexResult> {
  if (!document.blocks.length || !document.text.trim()) throw new Error("cannot index empty extracted document");
  const hash = documentHash(document);
  if (!deps.force && await deps.store.hasContent(document.canonicalUrl, hash)) {
    return { status: "unchanged", chunks: 0 };
  }
  const chunks = chunkDocument(document, deps.chunkOptions);
  if (!chunks.length) throw new Error("cannot index empty chunk set");
  const embeddings = await deps.embedder.embed(chunks.map((chunk) => chunk.text));
  validateEmbeddings(embeddings, chunks.length, deps.embeddingDimensions);
  const page = { document, chunks, embeddings, embeddingModel: deps.embeddingModel, contentHash: hash };
  await (deps.force && deps.store.replaceReindexedPage ? deps.store.replaceReindexedPage(page) : deps.store.replacePage(page));
  return { status: "indexed", chunks: chunks.length };
}

export interface ReindexDependencies extends Omit<IndexDependencies, "force"> {}
export interface ReindexSummary { attempted: number; indexed: number; unchanged: number; failed: number }

export async function reindexAll(deps: ReindexDependencies, options: { maxPages?: number; dryRun?: boolean } = {}): Promise<ReindexSummary> {
  const summary: ReindexSummary = { attempted: 0, indexed: 0, unchanged: 0, failed: 0 };
  const run = options.dryRun ? undefined : await deps.store.startReindexRun?.();
  let outerError = false;
  try {
    for (const { document } of (await deps.store.listSuccessfulDocuments()).slice(0, options.maxPages)) {
      summary.attempted += 1;
      if (options.dryRun) continue;
      try {
        const result = await indexDocument(document, { ...deps, force: true });
        summary[result.status] += 1;
      } catch {
        summary.failed += 1;
      }
    }
  } catch (error) {
    outerError = true;
    summary.failed += 1;
    throw error;
  } finally {
    if (run) {
      try { await deps.store.finishReindexRun?.(run, summary); }
      catch (error) { if (!outerError) throw error; }
    }
  }
  return summary;
}

export interface SourcePage {
  id: string;
  canonicalUrl: string;
  title: string;
  contentType: string;
  contentHash: string;
  crawlStatus: "pending" | "success" | "failed";
  lastCrawledAt: string | null;
  lastSuccessfulCrawlAt: string | null;
  httpStatus: number | null;
}

export interface DocumentChunk {
  id: string;
  sourcePageId: string;
  sourceUrl: string;
  sourceTitle: string;
  headingTrail: string[];
  pageNumber: number | null;
  ordinal: number;
  text: string;
  contentHash: string;
  embedding: number[];
  embeddingModel: string;
}

export interface RetrievedChunk extends DocumentChunk {
  score: number;
  lexicalRank?: number;
  semanticRank?: number;
  lexicalScore?: number;
  semanticSimilarity?: number;
}

export interface Citation {
  chunkId: string;
  url: string;
  title: string;
  pageNumber?: number;
  numbers: number[];
}

export interface AnswerResult {
  answer: string;
  sources: Citation[];
}

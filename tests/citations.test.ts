import { describe, expect, it } from "vitest";

import { FALLBACK, formatAnswer } from "../src/lib/rag/citations";
import type { RetrievedChunk } from "../src/lib/types";

const chunks: RetrievedChunk[] = [
  { id: "html", sourcePageId: "a", sourceUrl: "https://www.ashoka.edu.in/department/department-of-cs/", sourceTitle: "Department", headingTrail: [], pageNumber: null, ordinal: 0, text: "Evidence", contentHash: "a", embedding: [], embeddingModel: "model", score: 1 },
  { id: "pdf", sourcePageId: "b", sourceUrl: "https://www.ashoka.edu.in/handbook.pdf", sourceTitle: "Handbook", headingTrail: [], pageNumber: 4, ordinal: 0, text: "PDF evidence", contentHash: "b", embedding: [], embeddingModel: "model", score: 1 },
];

describe("citation formatting", () => {
  it("maps valid citations only to de-duplicated official sources and keeps PDF pages", () => {
    expect(formatAnswer("The department has a programme [1].\n\nThe programme is documented [1][2].", chunks)).toEqual({ answer: "The department has a programme [1].\n\nThe programme is documented [1][2].", sources: [{ chunkId: "html", url: chunks[0].sourceUrl, title: "Department", numbers: [1] }, { chunkId: "pdf", url: chunks[1].sourceUrl, title: "Handbook", pageNumber: 4, numbers: [2] }] });
  });

  it.each(["The chair is Dr. Rao [9]", "A factual paragraph without a citation.", "See https://evil.example [1]", "", Array.from({ length: 251 }, () => "word").join(" ") + " [1]"])("falls back for invalid grounded output: %s", (raw) => {
    expect(formatAnswer(raw, chunks)).toEqual({ answer: FALLBACK, sources: [] });
  });

  it("falls back when any cited chunk is non-official or output contains a URL-like path", () => {
    const mixed = [...chunks, { ...chunks[0], id: "bad", sourceUrl: "https://evil.example/forged" }];
    expect(formatAnswer("Official fact [1][3]", mixed)).toEqual({ answer: FALLBACK, sources: [] });
    expect(formatAnswer("See /department/department-of-cs/ [1]", chunks)).toEqual({ answer: FALLBACK, sources: [] });
    expect(formatAnswer("See [source](/department/department-of-cs/) [1]", chunks)).toEqual({ answer: FALLBACK, sources: [] });
  });

  it("normalizes cited fallback and rejects protocol-relative URLs", () => {
    expect(formatAnswer(`${FALLBACK} [1]`, chunks)).toEqual({ answer: FALLBACK, sources: [] });
    expect(formatAnswer("See //evil.example/path [1]", chunks)).toEqual({ answer: FALLBACK, sources: [] });
  });

  it("falls back for bare www-style model URLs while preserving normal prose", () => {
    expect(formatAnswer("See www.ashoka.edu.in/department/department-of-cs/ [1]", chunks)).toEqual({ answer: FALLBACK, sources: [] });
    expect(formatAnswer("The department has a programme [1].", chunks)).toEqual({ answer: "The department has a programme [1].", sources: [{ chunkId: "html", url: chunks[0].sourceUrl, title: "Department", numbers: [1] }] });
  });

  it("keeps PDF pages and maps every displayed citation number", () => {
    const pages = [{ ...chunks[1], id: "pdf-4", pageNumber: 4 }, { ...chunks[1], id: "pdf-5", pageNumber: 5 }, { ...chunks[1], id: "pdf-4b", pageNumber: 4 }];
    expect(formatAnswer("Pages [1][2][3]", pages)).toMatchObject({ sources: [
      { url: chunks[1].sourceUrl, pageNumber: 4, numbers: [1, 3] },
      { url: chunks[1].sourceUrl, pageNumber: 5, numbers: [2] },
    ] });
  });
});

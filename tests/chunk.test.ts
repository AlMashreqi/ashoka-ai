import { describe, expect, it } from "vitest";

import { chunkDocument } from "../src/lib/crawl/chunk";
import type { ExtractedDocument } from "../src/lib/crawl/html";

const document: ExtractedDocument = {
  url: new URL("https://www.ashoka.edu.in/department/department-of-cs/"),
  canonicalUrl: new URL("https://www.ashoka.edu.in/department/department-of-cs/"),
  title: "Computer Science",
  contentType: "text/html",
  headings: ["Programmes"],
  links: [],
  blocks: [
    {
      text: "First sentence explains the programme. Second sentence explains its coursework. Third sentence explains research.",
      headingTrail: ["Programmes"],
      pageNumber: null,
    },
    { text: "PDF page content.", headingTrail: ["Programmes"], pageNumber: 3 },
  ],
  text: "",
};

describe("chunkDocument", () => {
  it("makes progress when a short sentence boundary precedes overlap", () => {
    const text = `Short. ${"x".repeat(1600)}`;
    const chunks = chunkDocument({ ...document, blocks: [{ text, headingTrail: [], pageNumber: null }], text }, { targetCharacters: 1500, overlapCharacters: 200 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 1500)).toBe(true);
    expect(chunks.at(-1)?.text.endsWith("x")).toBe(true);
  });
  it("keeps stable ordinals, heading trails, page numbers, hashes, limits, and overlap", () => {
    const chunks = chunkDocument(document, { targetCharacters: 55, overlapCharacters: 12 });

    expect(chunks.map((chunk) => chunk.ordinal)).toEqual([0, 1, 2, 3]);
    expect(chunks.every((chunk) => chunk.text.length <= 55)).toBe(true);
    expect(chunks[0]).toMatchObject({ headingTrail: ["Programmes"], pageNumber: null });
    expect(chunks[1].text).toContain("programme.");
    expect(chunks[1].contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(chunks.at(-1)).toMatchObject({ text: "PDF page content.", pageNumber: 3 });
  });

  it("hard-splits long sentences and overlaps adjacent blocks with matching metadata", () => {
    const chunks = chunkDocument({
      ...document,
      blocks: [
        { text: "abcdefghijklmno", headingTrail: ["Programmes"], pageNumber: null },
        { text: "Second block.", headingTrail: ["Programmes"], pageNumber: null },
      ],
    }, { targetCharacters: 10, overlapCharacters: 3 });

    expect(chunks.every((chunk) => chunk.text.length <= 10)).toBe(true);
    expect(chunks[1].text.startsWith(chunks[0].text.slice(-3))).toBe(true);
    expect(chunks.some((chunk) => chunk.text.includes("Second"))).toBe(true);
  });

  it.each([
    { targetCharacters: Number.NaN, overlapCharacters: 0 },
    { targetCharacters: Number.POSITIVE_INFINITY, overlapCharacters: 0 },
    { targetCharacters: 10, overlapCharacters: 10 },
  ])("rejects invalid chunk options: %o", (options) => {
    expect(() => chunkDocument(document, options)).toThrow(/chunk options/);
  });
});

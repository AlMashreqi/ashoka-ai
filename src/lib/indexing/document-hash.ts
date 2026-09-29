import { createHash } from "node:crypto";

import type { ExtractedDocument } from "../crawl/html";

export function documentHash(document: ExtractedDocument): string {
  return createHash("sha256").update(JSON.stringify({
    url: document.canonicalUrl.href,
    title: document.title,
    contentType: document.contentType,
    headings: document.headings,
    blocks: document.blocks.map(({ text, headingTrail, pageNumber }) => [text, headingTrail, pageNumber]),
  })).digest("hex");
}

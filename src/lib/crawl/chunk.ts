import { createHash } from "node:crypto";

import type { ExtractedBlock, ExtractedDocument } from "./html";

export interface ChunkOptions {
  targetCharacters: number;
  overlapCharacters: number;
}

export interface PendingChunk {
  sourceUrl: string;
  sourceTitle: string;
  headingTrail: string[];
  pageNumber: number | null;
  ordinal: number;
  text: string;
  contentHash: string;
}

function splitText(text: string, options: ChunkOptions): string[] {
  const parts: string[] = [];
  let remaining = text.replace(/\s+/g, " ").trim();
  while (remaining) {
    if (remaining.length <= options.targetCharacters) {
      parts.push(remaining);
      break;
    }
    let cut = 0;
    const boundaries = /[.!?](?=\s|$)/g;
    for (let match = boundaries.exec(remaining); match && match.index + 1 <= options.targetCharacters; match = boundaries.exec(remaining)) {
      cut = match.index + 1;
    }
    cut ||= options.targetCharacters;
    const chunk = remaining.slice(0, cut).trim();
    parts.push(chunk);
    remaining = remaining.slice(cut > options.overlapCharacters ? cut - options.overlapCharacters : cut).trimStart();
  }
  return parts;
}

export function chunkDocument(document: ExtractedDocument, options: ChunkOptions): PendingChunk[] {
  if (
    !Number.isFinite(options.targetCharacters) ||
    !Number.isFinite(options.overlapCharacters) ||
    options.targetCharacters < 1 ||
    options.overlapCharacters < 0 ||
    options.overlapCharacters >= options.targetCharacters
  ) {
    throw new Error("chunk options must be non-negative with a positive target");
  }

  const chunks: Omit<PendingChunk, "ordinal" | "contentHash">[] = [];
  let group: { block: ExtractedBlock; text: string } | undefined;
  const flush = () => {
    if (!group) return;
    for (const text of splitText(group.text, options)) {
      chunks.push({
        sourceUrl: document.canonicalUrl.href,
        sourceTitle: document.title,
        headingTrail: group.block.headingTrail,
        pageNumber: group.block.pageNumber,
        text,
      });
    }
    group = undefined;
  };

  for (const block of document.blocks) {
    if (
      group &&
      group.block.pageNumber === block.pageNumber &&
      group.block.headingTrail.join("\u0000") === block.headingTrail.join("\u0000")
    ) {
      group.text = `${group.text}\n\n${block.text}`;
    } else {
      flush();
      group = { block, text: block.text };
    }
  }
  flush();

  return chunks.map((chunk, ordinal) => ({
    ...chunk,
    ordinal,
    contentHash: createHash("sha256").update(chunk.text).digest("hex"),
  }));
}

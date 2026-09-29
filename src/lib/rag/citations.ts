import type { AnswerResult, Citation, RetrievedChunk } from "../types";

export const FALLBACK = "I could not verify this from the official CS Department website.";

function fallback(): AnswerResult {
  return { answer: FALLBACK, sources: [] };
}

function validOfficialUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === "https://www.ashoka.edu.in";
  } catch {
    return false;
  }
}

export function formatAnswer(raw: string, chunks: RetrievedChunk[], maxWords = 250): AnswerResult {
  const answer = raw.trim();
  if (new RegExp(`^${FALLBACK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s*\\[\\d+\\])+$`).test(answer)) return fallback();
  if (!answer || /(?:https?:\/\/|\/\/[^\s]+|\bwww\.(?:[a-z0-9-]+\.)+[a-z]{2,}(?=[:/?#\s)]|$)|(?:^|[\s(])\/[a-z0-9_-]+)/i.test(answer) || answer.split(/\s+/).length > maxWords) return fallback();
  const cited = new Set<number>();
  for (const paragraph of answer.split(/\n\s*\n/)) {
    const matches = [...paragraph.matchAll(/\[(\d+)\]/g)];
    if (!matches.length) return fallback();
    for (const match of matches) cited.add(Number(match[1]));
  }
  if ([...cited].some((number) => !Number.isInteger(number) || number < 1 || number > chunks.length)) return fallback();
  if ([...cited].some((number) => !validOfficialUrl(chunks[number - 1].sourceUrl))) return fallback();
  const sourcesByLocation = new Map<string, Citation>();
  const sources: Citation[] = [];
  for (const number of cited) {
    const chunk = chunks[number - 1];
    const location = `${chunk.sourceUrl}#${chunk.pageNumber ?? ""}`;
    const existing = sourcesByLocation.get(location);
    if (existing) existing.numbers.push(number);
    else {
      const source = { chunkId: chunk.id, url: chunk.sourceUrl, title: chunk.sourceTitle, ...(chunk.pageNumber ? { pageNumber: chunk.pageNumber } : {}), numbers: [number] };
      sourcesByLocation.set(location, source);
      sources.push(source);
    }
  }
  return sources.length ? { answer, sources } : fallback();
}

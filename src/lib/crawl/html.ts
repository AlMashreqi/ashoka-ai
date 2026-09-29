import * as cheerio from "cheerio";

import { canonicalizeUrl } from "./url-policy";

export interface ExtractedBlock {
  text: string;
  headingTrail: string[];
  pageNumber: number | null;
}

export interface ExtractedDocument {
  url: URL;
  canonicalUrl: URL;
  title: string;
  contentType: "text/html" | "application/pdf";
  headings: string[];
  blocks: ExtractedBlock[];
  text: string;
  links: URL[];
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function extractHtml(html: string, url: URL): ExtractedDocument {
  const lowerHtml = html.toLowerCase();
  if (/cf-chl|challenge-platform|just a moment/.test(lowerHtml)) {
    throw new Error("Cloudflare challenge page");
  }

  const $ = cheerio.load(html);
  $("script, style, noscript, nav, header, footer, form, [role='navigation'], [class*='cookie' i], [id*='cookie' i]").remove();

  const canonicalHref = $("link[rel~='canonical' i]").attr("href");
  const canonical = canonicalHref ? canonicalizeUrl(new URL(canonicalHref, url).href) : url;
  const canonicalUrl = canonical.origin === url.origin ? canonical : url;
  const title = cleanText($("title").first().text()) || cleanText($("h1").first().text());
  const headings: string[] = [];
  const blocks: ExtractedBlock[] = [];
  const trail: string[] = [];
  const seenBlocks = new Set<string>();

  $("h1, h2, h3, h4, h5, h6, p, li, blockquote, td").each((_, element) => {
    const elementCopy = $(element).clone();
    if (element.tagName.toLowerCase() === "li") elementCopy.find("ul, ol").remove();
    const text = cleanText(elementCopy.text());
    if (!text) return;
    const tag = element.tagName.toLowerCase();
    const level = /^h[1-6]$/.test(tag) ? Number(tag[1]) : 0;
    if (level) {
      trail.length = level - 1;
      trail[level - 1] = text;
      headings.push(text);
      return;
    }
    if (seenBlocks.has(text)) return;
    seenBlocks.add(text);
    blocks.push({ text, headingTrail: [...trail], pageNumber: null });
  });

  const links: URL[] = [];
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    try {
      links.push(new URL(href, url));
    } catch {
      // A malformed link is a discarded crawl candidate.
    }
  });

  return {
    url,
    canonicalUrl,
    title,
    contentType: "text/html",
    headings,
    blocks,
    text: blocks.map((block) => block.text).join("\n\n"),
    links,
  };
}

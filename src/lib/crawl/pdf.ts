import type { ExtractedDocument } from "./html";

export async function extractPdf(bytes: Uint8Array, url: URL): Promise<ExtractedDocument> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await getDocument({ data: bytes }).promise;
  const metadata = await pdf.getMetadata();
  const metadataTitle = (metadata.info as { Title?: unknown }).Title;
  const title = typeof metadataTitle === "string" && metadataTitle.trim()
    ? metadataTitle.trim()
    : decodeURIComponent(url.pathname.split("/").at(-1)?.replace(/\.pdf$/i, "") || "PDF document");
  const blocks: ExtractedDocument["blocks"] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .filter((item): item is (typeof content.items)[number] & { str: string } => "str" in item && typeof item.str === "string")
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) blocks.push({ text, headingTrail: [], pageNumber });
  }

  return {
    url,
    canonicalUrl: url,
    title,
    contentType: "application/pdf",
    headings: [],
    blocks,
    text: blocks.map((block) => block.text).join("\n\n"),
    links: [],
  };
}

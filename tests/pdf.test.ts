import { describe, expect, it } from "vitest";

import { extractPdf } from "../src/lib/crawl/pdf";

function pdfFixture(): Uint8Array {
  const stream = "BT\n/F1 12 Tf\n72 720 Td\n(Computer Science PDF) Tj\nET\n";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 6 0 R >> >> /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`,
    "5 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>\nendobj\n",
    "6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

describe("extractPdf", () => {
  it("retains one-based page numbers and skips empty pages", async () => {
    const document = await extractPdf(
      pdfFixture(),
      new URL("https://www.ashoka.edu.in/wp-content/uploads/course-list.pdf"),
    );

    expect(document.title).toBe("course-list");
    expect(document.contentType).toBe("application/pdf");
    expect(document.blocks).toEqual([
      { text: "Computer Science PDF", headingTrail: [], pageNumber: 1 },
    ]);
  });
});

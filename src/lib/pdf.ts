// A minimal PDF writer: one JPEG image per page, placed at a given size on the paper. Enough
// for printing a coloring page and its color key, without pulling in a PDF library.

export interface PdfPage {
  jpeg: Uint8Array;
  /** Image size in pixels. */
  pxW: number;
  pxH: number;
  /** Paper size and the image's placement on it, in inches (origin top-left). */
  paperW: number;
  paperH: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const enc = new TextEncoder();

export function makePdf(pages: PdfPage[]): Blob {
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: Uint8Array | string) => {
    const bytes = typeof chunk === "string" ? enc.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: (Uint8Array | string)[]) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body.forEach(push);
    push("\nendobj\n");
  };
  const pt = (inches: number) => (inches * 72).toFixed(2);

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  // 1: catalog, 2: page tree, then per page: page, content, image.
  const pageIds = pages.map((_, i) => 3 + i * 3);
  object(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  object(2, [`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`]);
  pages.forEach((p, i) => {
    const [pageId, contentId, imageId] = [pageIds[i], pageIds[i] + 1, pageIds[i] + 2];
    // PDF's origin is bottom-left.
    const draw = `q ${pt(p.w)} 0 0 ${pt(p.h)} ${pt(p.x)} ${pt(p.paperH - p.y - p.h)} cm /Im0 Do Q`;
    object(pageId, [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt(p.paperW)} ${pt(p.paperH)}] ` +
        `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    ]);
    object(contentId, [`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`]);
    object(imageId, [
      `<< /Type /XObject /Subtype /Image /Width ${p.pxW} /Height ${p.pxH} /ColorSpace /DeviceRGB ` +
        `/BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
      p.jpeg,
      "\nendstream",
    ]);
  });

  const xref = length;
  const count = 3 + pages.length * 3;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}

/** A canvas as JPEG bytes. */
export async function canvasJpeg(canvas: HTMLCanvasElement, quality = 0.95): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", quality),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

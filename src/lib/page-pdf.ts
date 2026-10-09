// The printable PDF of a page: the page to color, its color key, and the finished picture,
// each on a sheet of its own. Used by the photo pages and the ready-made Halloween pages.

import { drawPage, type Page } from "@/lib/page";
import { canvasJpeg, makePdf, type PdfPage } from "@/lib/pdf";
import type { Fit } from "@/lib/print";

/** Print resolution, and the most pixels on a printed page's long side (keeps memory in check). */
const PRINT_DPI = 300;
const MAX_PRINT_PX = 6000;
/**
 * Most pixels in one printed sheet. Safari on iPhone and iPad can't draw a canvas bigger than
 * about 16.7 million pixels (it comes out blank), and big canvases can run a phone out of memory.
 */
const MAX_PRINT_AREA = 16_000_000;
/** Resolution of the color-key sheet (lower on huge paper, see MAX_PRINT_AREA). */
const KEY_SHEET_DPI = 150;

/**
 * The second printed sheet: the color key, with big swatches so colors are easy to match.
 * (The finished picture gets a sheet of its own.)
 */
function drawKeySheet(page: Page, fit: Fit): HTMLCanvasElement {
  const KEY_DPI = Math.min(KEY_SHEET_DPI, Math.sqrt(MAX_PRINT_AREA / (fit.paperW * fit.paperH)));
  const W = Math.round(fit.paperW * KEY_DPI);
  const H = Math.round(fit.paperH * KEY_DPI);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  const m = 0.5 * KEY_DPI;
  ctx.fillStyle = "#222";
  ctx.font = `bold ${Math.round(0.3 * KEY_DPI)}px Arial, sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText("Color key", m, m);

  // Swatches, in rows, sized to fill the sheet's width.
  const cols = Math.max(4, Math.floor((W - 2 * m) / (1.1 * KEY_DPI)));
  const cell = (W - 2 * m) / cols;
  const sw = Math.min(cell * 0.45, 0.45 * KEY_DPI);
  const top = m + 0.55 * KEY_DPI;
  ctx.font = `bold ${Math.round(sw * 0.7)}px Arial, sans-serif`;
  ctx.textBaseline = "middle";
  page.key.forEach(({ n, rgb }, i) => {
    const x = m + (i % cols) * cell;
    const y = top + Math.floor(i / cols) * (sw + 0.2 * KEY_DPI);
    ctx.fillStyle = `rgb(${rgb.join(",")})`;
    ctx.fillRect(x, y, sw, sw);
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, sw, sw);
    ctx.fillStyle = "#222";
    ctx.fillText(String(n), x + sw + 0.08 * KEY_DPI, y + sw / 2);
  });
  return canvas;
}

/** Draws a page onto a canvas at `pxScale` times its layout size (drawPage, or one that adds to it). */
export type DrawSheet = (canvas: HTMLCanvasElement, page: Page, view: "outline" | "colored", pxScale: number) => void | Promise<void>;

/** The page rendered at print resolution for `fit`, as a three-sheet PDF. */
export async function pagePdf(page: Page, fit: Fit, draw: DrawSheet = drawPage): Promise<Blob> {
  return makePdf(await pageSheets(page, fit, draw));
}

/** Several pages in one PDF, each as its three sheets (a bundle of pages bought together). */
export async function pagesPdf(pages: { page: Page; fit: Fit; draw?: DrawSheet }[]): Promise<Blob> {
  const sheets: PdfPage[] = [];
  for (const { page, fit, draw } of pages) sheets.push(...(await pageSheets(page, fit, draw)));
  return makePdf(sheets);
}

/** A page's three printed sheets: the page to color, its color key, and the finished picture. */
async function pageSheets(page: Page, fit: Fit, draw: DrawSheet = drawPage): Promise<PdfPage[]> {
  const longIn = Math.max(fit.w, fit.h);
  const dpi = Math.min(PRINT_DPI, MAX_PRINT_PX / longIn, Math.sqrt(MAX_PRINT_AREA / (fit.w * fit.h)));
  // One sheet at a time, each let go once it's in the PDF, so a phone never holds more
  // than one big picture in memory.
  const sheetJpeg = async (canvas: HTMLCanvasElement, quality?: number) => {
    const out = { jpeg: await canvasJpeg(canvas, quality), pxW: canvas.width, pxH: canvas.height };
    canvas.width = canvas.height = 0;
    return out;
  };
  const sheet = document.createElement("canvas");
  await draw(sheet, page, "outline", (fit.w * dpi) / page.width);
  const outline = await sheetJpeg(sheet);
  const key = await sheetJpeg(drawKeySheet(page, fit), 0.9);
  // The finished picture on a sheet of its own, the same size as the page to color.
  const painted = document.createElement("canvas");
  await draw(painted, page, "colored", (fit.w * dpi) / page.width);
  const finished = await sheetJpeg(painted, 0.9);
  return [
    { ...outline, paperW: fit.paperW, paperH: fit.paperH, x: fit.x, y: fit.y, w: fit.w, h: fit.h, cut: fit.cut },
    { ...key, paperW: fit.paperW, paperH: fit.paperH, x: 0, y: 0, w: fit.paperW, h: fit.paperH },
    { ...finished, paperW: fit.paperW, paperH: fit.paperH, x: fit.x, y: fit.y, w: fit.w, h: fit.h, cut: fit.cut },
  ];
}

/** Saves `blob` as a file named `name`. */
export function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

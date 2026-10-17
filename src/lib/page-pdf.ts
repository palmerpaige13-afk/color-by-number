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
    ctx.fillText(String(page.answers?.[n - 1] ?? n), x + sw + 0.08 * KEY_DPI, y + sw / 2);
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

/** Mural sheets print at this resolution: sharp enough for coloring, small enough for 36 sheets. */
const MURAL_DPI = 200;
/** JPEG quality of mural sheets: line drawings stay crisp, and 36 sheets stay a manageable download. */
const MURAL_JPEG = 0.8;
/** A mural sheet's name: its row as a letter and its column as a number ("B3"). */
export const sheetName = (row: number, col: number) => `${String.fromCharCode(65 + row)}${col + 1}`;

/**
 * A mural's PDF: a map of how the sheets go together (the finished picture with the grid on
 * it), the shared color key, then every sheet on its own Letter page, labeled, with a small
 * map of where it goes and a dashed line to trim along. A mystery mural's map is a blank grid,
 * and the finished picture comes last, as the reveal.
 */
export async function muralPdf(page: Page, fit: Fit, { mystery = false }: { mystery?: boolean } = {}): Promise<Blob> {
  const m = fit.mural!;
  const u = page.width / fit.w; // page units per inch
  const pages: PdfPage[] = [];
  const letter = (landscape: boolean) => (landscape ? { w: 11, h: 8.5 } : { w: 8.5, h: 11 });

  /**
   * A map of the whole mural on one sheet, with the grid and each sheet's name: with the
   * colored picture, or (a mystery mural) as a blank grid that gives nothing away.
   */
  const mapSheet = async (title: string, note: string, showPicture: boolean) => {
    const paper = letter(fit.w > fit.h);
    const dpi = 150;
    const c = document.createElement("canvas");
    c.width = Math.round(paper.w * dpi);
    c.height = Math.round(paper.h * dpi);
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#222";
    ctx.textBaseline = "top";
    ctx.font = `bold ${Math.round(0.3 * dpi)}px Arial, sans-serif`;
    ctx.fillText(title, 0.5 * dpi, 0.45 * dpi);
    ctx.font = `${Math.round(0.15 * dpi)}px Arial, sans-serif`;
    ctx.fillText(note, 0.5 * dpi, 0.85 * dpi);
    const top = 1.25 * dpi;
    const s = Math.min((c.width - dpi) / fit.w, (c.height - top - 0.5 * dpi) / fit.h); // px per inch
    const px = (c.width - fit.w * s) / 2;
    if (showPicture) {
      const pic = document.createElement("canvas");
      pic.getContext("2d", { willReadFrequently: true });
      await drawPage(pic, page, "colored", (s * fit.w) / page.width);
      ctx.drawImage(pic, px, top);
      pic.width = pic.height = 0;
    } else {
      ctx.fillStyle = "#f4f4f5";
      ctx.fillRect(px, top, fit.w * s, fit.h * s);
    }
    ctx.strokeStyle = showPicture ? "rgba(255,255,255,0.95)" : "#888";
    ctx.lineWidth = Math.max(2, 0.02 * dpi);
    for (let i = 0; i <= m.cols; i++) {
      ctx.beginPath(); ctx.moveTo(px + i * m.cellW * s, top); ctx.lineTo(px + i * m.cellW * s, top + fit.h * s); ctx.stroke();
    }
    for (let j = 0; j <= m.rows; j++) {
      ctx.beginPath(); ctx.moveTo(px, top + j * m.cellH * s); ctx.lineTo(px + fit.w * s, top + j * m.cellH * s); ctx.stroke();
    }
    const label = Math.max(12, Math.min(m.cellW * s * 0.22, 0.4 * dpi));
    ctx.font = `bold ${Math.round(label)}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let r = 0; r < m.rows; r++) {
      for (let col = 0; col < m.cols; col++) {
        const cx = px + (col + 0.5) * m.cellW * s, cy = top + (r + 0.5) * m.cellH * s;
        if (showPicture) {
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.beginPath(); ctx.arc(cx, cy, label * 0.95, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = "#222";
        ctx.fillText(sheetName(r, col), cx, cy);
      }
    }
    pages.push({ ...(await sheetJpegOf(c, 0.9)), paperW: paper.w, paperH: paper.h, x: 0, y: 0, w: paper.w, h: paper.h });
  };

  // 1. How it goes together (in a mystery mural, without showing what it is).
  const sheetCount = m.cols * m.rows;
  if (mystery) {
    await mapSheet(
      `Your mystery mural: ${sheetCount} sheets`,
      "Color each sheet with the color key, trim along the dashed lines, and put them together like this. It's a surprise!",
      false,
    );
  } else {
    await mapSheet(`Your mural: ${sheetCount} sheets`, "Color each sheet with the color key, trim along the dashed lines, and put them together like this.", true);
  }

  // 2. The color key, shared by every sheet.
  {
    const paper = letter(false);
    const key = drawKeySheet(page, { paperW: paper.w, paperH: paper.h, x: 0, y: 0, w: paper.w, h: paper.h });
    pages.push({ ...(await sheetJpegOf(key, 0.9)), paperW: paper.w, paperH: paper.h, x: 0, y: 0, w: paper.w, h: paper.h });
  }

  // 3. Each sheet.
  const paper = letter(m.landscape);
  const margin = (paper.w - m.cellW) / 2;
  const dpi = MURAL_DPI;
  for (let r = 0; r < m.rows; r++) {
    for (let col = 0; col < m.cols; col++) {
      const c = document.createElement("canvas");
      c.width = Math.round(paper.w * dpi);
      c.height = Math.round(paper.h * dpi);
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      const tile = document.createElement("canvas");
      // Kept in memory rather than on the graphics card: copying a big drawing from the graphics
      // card can come back blank in a busy or background tab.
      tile.getContext("2d", { willReadFrequently: true });
      await drawPage(tile, page, "outline", dpi / u, { x: col * m.cellW * u, y: r * m.cellH * u, w: m.cellW * u, h: m.cellH * u });
      const tx = margin * dpi, ty = ((paper.h - m.cellH) / 2) * dpi;
      ctx.drawImage(tile, tx, ty);
      tile.width = tile.height = 0;
      // Trim line around the picture.
      ctx.strokeStyle = "#888";
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 8]);
      ctx.strokeRect(tx, ty, m.cellW * dpi, m.cellH * dpi);
      ctx.setLineDash([]);
      // Its name and where it goes, in the top margin.
      const band = ty;
      ctx.fillStyle = "#222";
      ctx.textBaseline = "middle";
      ctx.font = `bold ${Math.round(band * 0.5)}px Arial, sans-serif`;
      ctx.fillText(`Sheet ${sheetName(r, col)}`, tx, band / 2);
      ctx.font = `${Math.round(band * 0.3)}px Arial, sans-serif`;
      ctx.fillStyle = "#666";
      ctx.fillText(`row ${r + 1}, column ${col + 1} · ${r * m.cols + col + 1} of ${m.rows * m.cols}`, tx + band * 2.6, band / 2);
      const cell = Math.min((band * 0.7) / m.rows, (band * 1.6) / m.cols);
      const mx = tx + m.cellW * dpi - cell * m.cols, my = (band - cell * m.rows) / 2;
      for (let rr = 0; rr < m.rows; rr++) {
        for (let cc = 0; cc < m.cols; cc++) {
          ctx.fillStyle = rr === r && cc === col ? "#222" : "#e2e2e2";
          ctx.fillRect(mx + cc * cell + 1, my + rr * cell + 1, cell - 2, cell - 2);
        }
      }
      pages.push({ ...(await sheetJpegOf(c, MURAL_JPEG)), paperW: paper.w, paperH: paper.h, x: 0, y: 0, w: paper.w, h: paper.h });
    }
  }
  // The answer, last, so it can be left unprinted or kept hidden until the mural is done.
  if (mystery) await mapSheet("The big reveal: don't peek!", "What your mural turns into, once every sheet is colored and put together.", true);
  return makePdf(pages);
}

/** A canvas as a JPEG for the PDF, letting go of the canvas's memory afterwards. */
async function sheetJpegOf(canvas: HTMLCanvasElement, quality?: number) {
  const out = { jpeg: await canvasJpeg(canvas, quality), pxW: canvas.width, pxH: canvas.height };
  canvas.width = canvas.height = 0;
  return out;
}

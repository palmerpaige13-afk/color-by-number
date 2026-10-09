// Print sizes. A page can be printed at any of these; the size decides how much fine detail
// fits, because a number has to be printed at least MIN_POINTS tall to be comfortable to read
// and color around, whatever the paper. Each size also has its own level of detail: small
// cards are simple, paper and posters detailed.

import type { Difficulty } from "@/lib/pipeline";

export type PrintSizeId = "4x6" | "5x7" | "letter" | "11x14" | "16x20" | "24x36" | MuralId;

/**
 * A mural: one picture cut into a grid of Letter sheets, each colored on its own and put back
 * together (a classroom or a family each coloring a piece). The photo is trimmed to the grid's
 * shape; sheets are portrait or landscape, whichever fits the photo best.
 */
export type MuralId = "mural-2" | "mural-4" | "mural-9" | "mural-16" | "mural-36";
export const MURALS: { id: MuralId; sheets: number; label: string }[] = [
  { id: "mural-2", sheets: 2, label: "2 sheets" },
  { id: "mural-4", sheets: 4, label: "4 sheets (2 × 2)" },
  { id: "mural-9", sheets: 9, label: "9 sheets (3 × 3)" },
  { id: "mural-16", sheets: 16, label: "16 sheets (4 × 4)" },
  { id: "mural-36", sheets: 36, label: "36 sheets (6 × 6)" },
];
export const isMural = (id: PrintSizeId): id is MuralId => id.startsWith("mural-");

/** The picture on one Letter sheet of a mural, inside half-inch margins (portrait). */
const MURAL_CELL = { w: 7.5, h: 10 };

/** How a mural's sheets are laid out, for a picture of the given width/height ratio. */
export interface MuralLayout {
  cols: number;
  rows: number;
  /** Sheets turned sideways (landscape Letter). */
  landscape: boolean;
  /** The picture on each sheet, in inches. */
  cellW: number;
  cellH: number;
}

/** The grid of sheets whose shape is closest to `aspect` (width / height). */
export function muralLayout(id: MuralId, aspect: number): MuralLayout {
  const n = MURALS.find((m) => m.id === id)!.sheets;
  const k = Math.round(Math.sqrt(n));
  const grids = k * k === n ? [[k, k]] : [[n, 1], [1, n]];
  let best: MuralLayout | null = null;
  for (const [cols, rows] of grids) {
    for (const landscape of [false, true]) {
      const cellW = landscape ? MURAL_CELL.h : MURAL_CELL.w;
      const cellH = landscape ? MURAL_CELL.w : MURAL_CELL.h;
      const layout = { cols, rows, landscape, cellW, cellH };
      const miss = (l: MuralLayout) => Math.abs(Math.log((l.cols * l.cellW) / (l.rows * l.cellH) / aspect));
      if (!best || miss(layout) < miss(best)) best = layout;
    }
  }
  return best!;
}

export const PRINT_SIZES: {
  id: PrintSizeId;
  label: string;
  blurb: string;
  w: number;
  h: number;
  /** The detail this size gets. */
  level: Difficulty;
  /** A small card printed on Letter paper with a line to cut along. */
  card?: boolean;
}[] = [
  { id: "4x6", label: "4 × 6", blurb: "Photo size, simplest", w: 4, h: 6, level: "easy", card: true },
  { id: "5x7", label: "5 × 7", blurb: "Card size, simple", w: 5, h: 7, level: "easy", card: true },
  { id: "letter", label: "Letter", blurb: "8.5 × 11 in, detailed", w: 8.5, h: 11, level: "hard" },
  { id: "11x14", label: "11 × 14", blurb: "Small poster, detailed", w: 11, h: 14, level: "hard" },
  { id: "16x20", label: "16 × 20", blurb: "Canvas size, lots of detail", w: 16, h: 20, level: "hard" },
  { id: "24x36", label: "24 × 36", blurb: "Large poster, most detail", w: 24, h: 36, level: "hard" },
];

/** Levels from simplest to most detailed. */
export const LEVELS: Difficulty[] = ["easy", "medium", "hard"];

/** A size's level, moved one step simpler (-1) or more detailed (+1) if asked. Murals are detailed. */
export function levelFor(id: PrintSizeId, shift: -1 | 0 | 1): Difficulty {
  const base = LEVELS.indexOf(isMural(id) ? "hard" : PRINT_SIZES.find((s) => s.id === id)!.level);
  return LEVELS[Math.min(LEVELS.length - 1, Math.max(0, base + shift))];
}

/** The paper cards are printed on (Letter), in inches. */
const CARD_SHEET = { w: 8.5, h: 11 };

/** Smallest printed number, in points (1/72 in). */
const MIN_POINTS = 6;
/** Blank margin around the picture, in inches. */
export const MARGIN = 0.5;

export interface Fit {
  /** Paper size in inches, turned to match the picture (landscape for wide pictures). */
  paperW: number;
  paperH: number;
  /** The picture's printed size and position on the paper, in inches. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** For a card: where it is on the paper, to cut along (inches). */
  cut?: { x: number; y: number; w: number; h: number };
  /** For a mural: the grid of sheets (paper and picture size above are the whole mural's). */
  mural?: MuralLayout;
}

/**
 * Places a picture of the given width/height ratio on the paper, as big as the margins allow.
 * A card (4 × 6, 5 × 7) is centered on Letter paper, turned to match the picture, and the
 * picture (already trimmed to the card's shape) fills it edge to edge; its edge is the line
 * to cut along.
 */
export function fitOnPaper(aspect: number, id: PrintSizeId): Fit {
  if (isMural(id)) {
    const mural = muralLayout(id, aspect);
    const w = mural.cols * mural.cellW;
    const h = mural.rows * mural.cellH;
    return { paperW: w, paperH: h, x: 0, y: 0, w, h, mural };
  }
  const size = PRINT_SIZES.find((s) => s.id === id)!;
  const landscape = aspect > 1;
  const sizeW = landscape ? size.h : size.w;
  const sizeH = landscape ? size.w : size.h;
  if (size.card) {
    const cut = { x: (CARD_SHEET.w - sizeW) / 2, y: (CARD_SHEET.h - sizeH) / 2, w: sizeW, h: sizeH };
    return { paperW: CARD_SHEET.w, paperH: CARD_SHEET.h, ...cut, cut };
  }
  const w = Math.min(sizeW - 2 * MARGIN, (sizeH - 2 * MARGIN) * aspect);
  const h = w / aspect;
  return { paperW: sizeW, paperH: sizeH, x: (sizeW - w) / 2, y: (sizeH - h) / 2, w, h };
}

/** A card's width/height ratio, turned to match a picture that's `wide` or not; null if not a card. */
export function cardShape(id: PrintSizeId, wide: boolean): number | null {
  if (isMural(id)) return null;
  const size = PRINT_SIZES.find((s) => s.id === id)!;
  if (!size.card) return null;
  return wide ? size.h / size.w : size.w / size.h;
}

/**
 * The shape a picture is trimmed to for this size: a card's shape (see cardShape), or a
 * mural's grid of sheets nearest the picture's own shape; null if it keeps its shape.
 */
export function pictureShape(id: PrintSizeId, aspect: number): number | null {
  if (isMural(id)) {
    const m = muralLayout(id, aspect);
    return (m.cols * m.cellW) / (m.rows * m.cellH);
  }
  return cardShape(id, aspect > 1);
}

/** Smallest number as a share of the picture's width, for a picture printed `widthIn` wide. */
export const fontFraction = (widthIn: number) => MIN_POINTS / 72 / widthIn;

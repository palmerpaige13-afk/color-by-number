// Print sizes. A page can be printed at any of these; the size decides how much fine detail
// fits, because a number has to be printed at least MIN_POINTS tall to be comfortable to read
// and color around, whatever the paper. Each size also has its own level of detail: small
// cards are simple, paper and posters detailed.

import type { Difficulty } from "@/lib/pipeline";

export type PrintSizeId = "4x6" | "5x7" | "letter" | "11x14" | "16x20" | "24x36";

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

/** A size's level, moved one step simpler (-1) or more detailed (+1) if asked. */
export function levelFor(id: PrintSizeId, shift: -1 | 0 | 1): Difficulty {
  const base = LEVELS.indexOf(PRINT_SIZES.find((s) => s.id === id)!.level);
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
}

/**
 * Places a picture of the given width/height ratio on the paper, as big as the margins allow.
 * A card (4 × 6, 5 × 7) is centered on Letter paper, turned to match the picture, and the
 * picture (already trimmed to the card's shape) fills it edge to edge; its edge is the line
 * to cut along.
 */
export function fitOnPaper(aspect: number, id: PrintSizeId): Fit {
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
  const size = PRINT_SIZES.find((s) => s.id === id)!;
  if (!size.card) return null;
  return wide ? size.h / size.w : size.w / size.h;
}

/** Smallest number as a share of the picture's width, for a picture printed `widthIn` wide. */
export const fontFraction = (widthIn: number) => MIN_POINTS / 72 / widthIn;

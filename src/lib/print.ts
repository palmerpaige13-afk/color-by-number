// Print sizes. A page can be printed at any of these; the size decides how much fine detail
// fits, because a number has to be printed at least MIN_POINTS tall to be comfortable to read
// and color around, whatever the paper.

export type PrintSizeId = "letter" | "11x14" | "16x20" | "24x36";

export const PRINT_SIZES: { id: PrintSizeId; label: string; blurb: string; w: number; h: number }[] = [
  { id: "letter", label: "Letter", blurb: '8.5 × 11 in, home printer', w: 8.5, h: 11 },
  { id: "11x14", label: "11 × 14", blurb: "Small poster", w: 11, h: 14 },
  { id: "16x20", label: "16 × 20", blurb: "Canvas size, lots of detail", w: 16, h: 20 },
  { id: "24x36", label: "24 × 36", blurb: "Large poster, most detail", w: 24, h: 36 },
];

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
}

/** Places a picture of the given width/height ratio on the paper, as big as the margins allow. */
export function fitOnPaper(aspect: number, id: PrintSizeId): Fit {
  const size = PRINT_SIZES.find((s) => s.id === id)!;
  const landscape = aspect > 1;
  const paperW = landscape ? size.h : size.w;
  const paperH = landscape ? size.w : size.h;
  const maxW = paperW - 2 * MARGIN;
  const maxH = paperH - 2 * MARGIN;
  const w = Math.min(maxW, maxH * aspect);
  const h = w / aspect;
  return { paperW, paperH, x: (paperW - w) / 2, y: (paperH - h) / 2, w, h };
}

/** Smallest number as a share of the picture's width, for a picture printed `widthIn` wide. */
export const fontFraction = (widthIn: number) => MIN_POINTS / 72 / widthIn;

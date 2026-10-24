// A smile's teeth and the eyes' irises, traced from the photo. Faces are only a few colors, and teeth are far too
// small to keep a shape (and a number) of their own, so a smiling face came out as plain skin.
// Here the light, colorless pixels inside each mouth's opening (from the face landmarks) are
// traced at a finer grid and printed as a white shape with an outline: nothing to color, and
// the smile is the photo's own. The dark of each open eye is found the same way and printed
// filled in, like a pet's eyes.

import { traceOutlines, type Outline } from "../outlines";
import { rgbToLab } from "./color";
import { labelComponents } from "./regions";
import type { FaceShape, Point, RGB } from "./types";

/** The mouth is looked at this many times finer than the working raster, for smooth shapes. */
const FINE = 4;
/** Teeth are at most this colorful (Lab chroma)... */
const TEETH_MAX_CHROMA = 24;
/** ...at least this light... */
const TEETH_MIN_L = 45;
/** ...and this much lighter than the mouth's darkest part (a closed smile has no such contrast). */
const TEETH_ABOVE_DARK = 12;
/** A light speck smaller than this (square working pixels) isn't a tooth. */
const MIN_PIECE = 4;
/** Gaps between teeth (side by side) up to about twice this (working pixels) are filled. */
const TEETH_GAP = 1.25;
/** Pieces thinner than about twice this (working pixels) are a line of light, not teeth. */
const TEETH_MIN_HALF = 1;
/** A piece narrower than this share of the mouth is a tooth peeking out, not a smile. */
const MIN_PIECE_SPAN = 0.2;
/** A mouth narrower than this (working pixels) shows one piece of teeth: two would be a squiggle. */
const SMALL_MOUTH = 22;
/** Pieces smaller than this share of the biggest are dropped. */
const TEETH_MAIN_SHARE = 0.35;
/** A mouth narrower than this (working pixels) is too small to show teeth on the page. */
const MIN_MOUTH_WIDTH = 8;
/** The teeth must span this share of the mouth's width, or it's a glint, not a smile. */
const MIN_TEETH_SPAN = 0.3;

/** An eye narrower than this (working pixels) is too small to show on the page. */
const MIN_EYE_WIDTH = 5;
/** An eye whose outline is less than this share as tall as wide is squinting (a big smile)... */
const MIN_EYE_OPEN = 0.22;
/** ...and less than this, closed (nothing printed). */
const MIN_EYE_SQUINT = 0.08;
/** An eye's white more colorful than this (Lab chroma) is a tinted sunglasses lens. */
const EYE_WHITE_MAX_CHROMA = 22;
/** The eye's white is the color of its lightest pixels, from this share up. */
const EYE_WHITE_FROM = 0.7;
/** An eye whose light part is darker than this (Lab L) is behind sunglasses. */
const SUNGLASSES_L = 25;
/** ...but one in shadow is still shown (its partner clear) down to this lightness. */
const SHADOW_EYE_L = 12;
/** The iris is at most the darkest this share of the eye... */
const EYE_DARK_SHARE = 0.45;
/** ...and this much darker than the eye's white. */
const EYE_BELOW_WHITE = 15;
/** More than this share of the eye dark isn't an iris against a white. */
const EYE_MAX_SHARE = 0.7;
/** The iris is at least about twice this thick (working pixels). */
const EYE_MIN_HALF = 0.5;
/** An iris smaller than this (square working pixels) isn't printed. */
const MIN_EYE_PIECE = 2;

function inside(poly: Point[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** The photo inside `poly` on a grid FINE times finer (bilinear), with a blank border. */
function sampleInside(data: Uint8ClampedArray, w: number, h: number, poly: Point[]) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(w - 1, Math.ceil(Math.max(...xs)));
  const y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)));
  const gw = Math.max(0, x1 - x0) * FINE + 2;
  const gh = Math.max(0, y1 - y0) * FINE + 2;
  const L = new Float32Array(gw * gh).fill(-1);
  const C = new Float32Array(gw * gh);
  const values: number[] = [];
  const lab = new Float32Array(3);
  for (let gy = 1; gy < gh - 1; gy++) {
    for (let gx = 1; gx < gw - 1; gx++) {
      const x = x0 + (gx - 0.5) / FINE;
      const y = y0 + (gy - 0.5) / FINE;
      if (!inside(poly, x, y)) continue;
      const ax = Math.min(w - 2, Math.max(0, Math.floor(x - 0.5)));
      const ay = Math.min(h - 2, Math.max(0, Math.floor(y - 0.5)));
      const fx = Math.min(1, Math.max(0, x - 0.5 - ax));
      const fy = Math.min(1, Math.max(0, y - 0.5 - ay));
      const rgb = [0, 1, 2].map((c) => {
        const at = (px: number, py: number) => data[(py * w + px) * 4 + c];
        return (at(ax, ay) * (1 - fx) + at(ax + 1, ay) * fx) * (1 - fy) + (at(ax, ay + 1) * (1 - fx) + at(ax + 1, ay + 1) * fx) * fy;
      });
      rgbToLab(Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2]), lab, 0);
      const p = gy * gw + gx;
      L[p] = lab[0];
      C[p] = Math.hypot(lab[1], lab[2]);
      values.push(lab[0]);
    }
  }
  values.sort((a, b) => a - b);
  return { x0, y0, x1, y1, gw, gh, L, C, values };
}

/** `grid`'s shapes as closed outlines in working pixels (those at least MIN_PIECE in area). */
function outlinesOf(grid: Uint8Array, gw: number, gh: number, x0: number, y0: number, minPiece: number): Outline[] {
  const out: Outline[] = [];
  for (const line of traceOutlines(grid, gw, gh, () => true, 4)) {
    const pts = new Float32Array(line.length);
    for (let i = 0; i < line.length; i += 2) {
      pts[i] = x0 + (line[i] - 1) / FINE;
      pts[i + 1] = y0 + (line[i + 1] - 1) / FINE;
    }
    let area = 0;
    for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) area += pts[j] * pts[i + 1] - pts[i] * pts[j + 1];
    if (Math.abs(area) / 2 >= minPiece) out.push(pts);
  }
  return out;
}

/** The average photo color under `grid`'s shapes. */
function meanColor(data: Uint8ClampedArray, w: number, grid: Uint8Array, gw: number, x0: number, y0: number): RGB {
  const sum = [0, 0, 0];
  let n = 0;
  for (let p = 0; p < grid.length; p++) {
    if (!grid[p]) continue;
    const x = Math.floor(x0 + ((p % gw) - 0.5) / FINE);
    const y = Math.floor(y0 + (Math.floor(p / gw) - 0.5) / FINE);
    for (let c = 0; c < 3; c++) sum[c] += data[(y * w + x) * 4 + c];
    n++;
  }
  return sum.map((v) => Math.round(v / Math.max(1, n))) as RGB;
}

/**
 * Each smile's teeth as closed outlines in working pixels, with their own color from the photo
 * (an ivory or a shaded gray, not paper white, so they don't stand out).
 */
export function findTeeth(data: Uint8ClampedArray, w: number, h: number, faces: FaceShape[]): { lines: Outline[]; colors: RGB[] } {
  const out: Outline[] = [];
  const colors: RGB[] = [];
  for (const f of faces) {
    const mouth = f.features?.[0];
    if (!mouth || mouth.length < 6) continue;
    const { x0, y0, x1, y1, gw, gh, L, C, values } = sampleInside(data, w, h, mouth);
    if (x1 - x0 < MIN_MOUTH_WIDTH || y1 <= y0 || values.length < 4) continue;
    const dark = values[Math.floor(values.length * 0.2)];
    const minL = Math.max(TEETH_MIN_L, dark + TEETH_ABOVE_DARK);
    const grid = new Uint8Array(gw * gh);
    let lo = gw;
    let hi = -1;
    for (let p = 0; p < grid.length; p++) {
      if (L[p] < minL || C[p] > TEETH_MAX_CHROMA) continue;
      grid[p] = 1;
      lo = Math.min(lo, p % gw);
      hi = Math.max(hi, p % gw);
    }
    if (hi < 0 || (hi - lo + 1) / FINE < (x1 - x0) * MIN_TEETH_SPAN) continue;
    // The gaps between teeth are filled (one row of teeth, not a crown), and only the main
    // pieces kept: a glint on a lip or a tooth peeking between lips isn't a smile.
    closeUp(grid, gw, gh, Math.round(FINE * TEETH_GAP), L);
    keepMain(grid, gw, gh, Math.round(FINE * TEETH_MIN_HALF), (x1 - x0) * FINE * MIN_PIECE_SPAN, x1 - x0 < SMALL_MOUTH);
    fillHoles(grid, gw, gh);
    const color = meanColor(data, w, grid, gw, x0, y0);
    for (const line of outlinesOf(grid, gw, gh, x0, y0, MIN_PIECE)) {
      out.push(line);
      colors.push(color);
    }
  }
  return { lines: out, colors };
}

/** One shape of an eye as printed: the white, the iris on it, or a squinting eye's dark line. */
export interface EyePart {
  line: Outline;
  color: RGB;
  /** The lid line drawn around an eye's white, in the eye's own dark color. */
  edge?: RGB;
}

/** A closed polygon rounded with a few rounds of corner cutting. */
function rounded(poly: Point[], rounds = 2): Outline {
  let pts = poly;
  for (let r = 0; r < rounds; r++) {
    const next: Point[] = [];
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    });
    pts = next;
  }
  return Float32Array.from(pts.flat());
}

/** The average photo color of the pixels in `grid`'s eye whose lightness is in [lo, hi]. */
function toneColor(data: Uint8ClampedArray, w: number, L: Float32Array, gw: number, x0: number, y0: number, lo: number, hi: number): RGB {
  const pick = Uint8Array.from(L, (v) => (v >= 0 && v >= lo && v <= hi ? 1 : 0));
  return meanColor(data, w, pick, gw, x0, y0);
}

/**
 * Each eye as the photo shows it, in drawing order. An open eye: its white (the eye's outline
 * from the landmarks, in the photo's color for it, with a lid line in the eye's dark color) and
 * the iris on it (the pixels clearly darker than the white). A smiling, squinting eye: a thin
 * dark shape along its lids. None for an eye too small to show, or behind sunglasses.
 */
export function findEyes(data: Uint8ClampedArray, w: number, h: number, faces: FaceShape[]): EyePart[] {
  const out: EyePart[] = [];
  for (const f of faces) {
    const eyes = (f.features?.slice(1, 3) ?? []).filter((eye) => eye.length >= 6).map((eye) => {
      const s = sampleInside(data, w, h, eye);
      const { x0, y0, x1, gw, L, values } = s;
      if (x1 - x0 < MIN_EYE_WIDTH || values.length < 8) return null;
      const light = values[Math.floor(values.length * 0.85)];
      const darkL = values[Math.floor(values.length * EYE_DARK_SHARE)];
      const dark = toneColor(data, w, L, gw, x0, y0, -0.5, darkL);
      const white = toneColor(data, w, L, gw, x0, y0, values[Math.floor(values.length * EYE_WHITE_FROM)], 101);
      const wl = new Float32Array(3);
      rgbToLab(white[0], white[1], white[2], wl, 0);
      // An eye's white is nearly colorless and not dark: a dark or colorful "white" is behind
      // sunglasses (or in shadow, or warm light).
      const clear = light >= SUNGLASSES_L && Math.hypot(wl[1], wl[2]) <= EYE_WHITE_MAX_CHROMA;
      return { eye, s, light, darkL, dark, white, clear };
    });
    // Sunglasses cover both eyes: an eye that doesn't look clear (in shadow, or warm light on
    // its white) is still shown when the face's other eye is clear.
    const anyClear = eyes.some((e) => e?.clear);
    for (const e of eyes) {
      if (!e || !anyClear || (!e.clear && e.light < SHADOW_EYE_L)) continue;
      const { eye, s, light, darkL, dark, white } = e;
      const { x0, y0, x1, gw, gh, L, values } = s;
      const ys = eye.map((p) => p[1]);
      const open = (Math.max(...ys) - Math.min(...ys)) / (x1 - x0);
      if (open < MIN_EYE_OPEN) {
        // Squinting (a big smile): the eye is a thin dark line along the lids.
        if (open >= MIN_EYE_SQUINT) out.push({ line: rounded(eye), color: dark });
        continue;
      }
      out.push({ line: rounded(eye), color: white, edge: dark });
      const maxL = Math.min(darkL, light - EYE_BELOW_WHITE);
      const grid = new Uint8Array(gw * gh);
      let n = 0;
      for (let p = 0; p < grid.length; p++) if (L[p] >= 0 && L[p] <= maxL) { grid[p] = 1; n++; }
      if (!n || n > values.length * EYE_MAX_SHARE) continue;
      keepMain(grid, gw, gh, Math.round(FINE * EYE_MIN_HALF), 0, true);
      fillHoles(grid, gw, gh);
      const color = meanColor(data, w, grid, gw, x0, y0);
      for (const line of outlinesOf(grid, gw, gh, x0, y0, MIN_EYE_PIECE)) out.push({ line, color });
    }
  }
  return out;
}

/** The pixels the teeth (or eyes) cover (and one around them), so numbers keep clear of them. */
export function teethWalls(teeth: Outline[], w: number, h: number): Uint8Array {
  const walls = new Uint8Array(w * h);
  for (const line of teeth) {
    const poly: Point[] = [];
    for (let i = 0; i < line.length; i += 2) poly.push([line[i], line[i + 1]]);
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    for (let y = Math.max(0, Math.floor(Math.min(...ys)) - 1); y <= Math.min(h - 1, Math.ceil(Math.max(...ys)) + 1); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(...xs)) - 1); x <= Math.min(w - 1, Math.ceil(Math.max(...xs)) + 1); x++) {
        if ([[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => inside(poly, x + 0.5 + dx, y + 0.5 + dy))) walls[y * w + x] = 1;
      }
    }
  }
  return walls;
}

/**
 * Grows `grid` sideways by `r` and shrinks it back (a closing), staying inside the mouth
 * (L >= 0). Only sideways: the dark gap between upper and lower teeth stays.
 */
function closeUp(grid: Uint8Array, gw: number, gh: number, r: number, L: Float32Array) {
  if (r < 1) return;
  const pass = (src: Uint8Array, grow: boolean) => {
    const out = new Uint8Array(src.length);
    for (let y = 1; y < gh - 1; y++) {
      for (let x = 1; x < gw - 1; x++) {
        let v = grow ? 0 : 1;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          const s = xx < 0 || xx >= gw ? 0 : src[y * gw + xx];
          if (grow ? s : !s) { v = grow ? 1 : 0; break; }
        }
        out[y * gw + x] = v;
      }
    }
    return out;
  };
  const closed = pass(pass(grid, true), false);
  for (let p = 0; p < grid.length; p++) grid[p] = grid[p] || (closed[p] && L[p] >= 0) ? 1 : 0;
}

/**
 * Keeps only the pieces of `grid` at least `half` thick somewhere (a square of side 2·half + 1
 * fits), at least `span` wide, and at least TEETH_MAIN_SHARE of the biggest such piece (only the
 * biggest, with `one`).
 */
function keepMain(grid: Uint8Array, gw: number, gh: number, half: number, span: number, one: boolean) {
  const comps = labelComponents(grid, gw, gh);
  const thick = new Uint8Array(comps.count);
  const lo = new Int32Array(comps.count).fill(gw);
  const hi = new Int32Array(comps.count).fill(-1);
  for (let p = 0; p < grid.length; p++) {
    const l = comps.labels[p];
    lo[l] = Math.min(lo[l], p % gw);
    hi[l] = Math.max(hi[l], p % gw);
  }
  for (let y = half; y < gh - half; y++) {
    for (let x = half; x < gw - half; x++) {
      if (!grid[y * gw + x] || thick[comps.labels[y * gw + x]]) continue;
      let all = true;
      for (let dy = -half; dy <= half && all; dy++) for (let dx = -half; dx <= half; dx++) if (!grid[(y + dy) * gw + x + dx]) { all = false; break; }
      if (all && hi[comps.labels[y * gw + x]] - lo[comps.labels[y * gw + x]] + 1 >= span) thick[comps.labels[y * gw + x]] = 1;
    }
  }
  let big = 0;
  for (let i = 0; i < comps.count; i++) if (comps.color[i] === 1 && thick[i]) big = Math.max(big, comps.area[i]);
  for (let p = 0; p < grid.length; p++) {
    const l = comps.labels[p];
    if (grid[p] && (!thick[l] || comps.area[l] < big * (one ? 1 : TEETH_MAIN_SHARE))) grid[p] = 0;
  }
}

/** Fills the holes in `grid`'s pieces (gums or a lip showing through), so teeth are one shape. */
function fillHoles(grid: Uint8Array, gw: number, gh: number) {
  const comps = labelComponents(grid, gw, gh);
  const outside = new Uint8Array(comps.count);
  for (let x = 0; x < gw; x++) outside[comps.labels[x]] = outside[comps.labels[(gh - 1) * gw + x]] = 1;
  for (let y = 0; y < gh; y++) outside[comps.labels[y * gw]] = outside[comps.labels[y * gw + gw - 1]] = 1;
  for (let p = 0; p < grid.length; p++) if (!grid[p] && !outside[comps.labels[p]]) grid[p] = 1;
}

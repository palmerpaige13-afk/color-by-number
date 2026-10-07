// Faces, hair and animals. These are often close in color to what's around them (a shadowed
// cheek and dark hair, blond hair and a pale sky, a black dog in shade), so after quantizing
// they can share palette colors with their surroundings and melt into them: no outline gets
// drawn where two touching areas have the same palette color.
//
// To keep each of these parts distinct, its pixels get their own "twin" palette entries (same
// colors, new indices). Shading inside the part survives as separate shapes, but every part
// pixel differs from every pixel outside it by index, so the part is always outlined, and
// region merging keeps its shapes apart from everything else (see `group`).
//
// Faces go further: in the "shaded" style their skin is redrawn in the face's own lit and
// shadow tones (clustered from the face itself), so a shadowed cheek stays skin-colored
// instead of borrowing the hair's brown from the global palette.
//
// The face area comes from, in order of preference: a face-skin segmentation mask (works at
// any angle, excludes hair), the landmark outline (jaw, chin, hairline), or a flood fill of
// skin-colored pixels outward from the cheeks.

import { labDist2, labToRgb, rgbToLab } from "./color";
import type { FaceShape, RGB, RegionMask } from "./types";

/** ΔE from the face's typical skin color within which a pixel counts as skin (fallback). */
const SKIN_TOLERANCE = 20;

/**
 * A face gets a second (shadow) tone only if its lit and shaded halves differ by at least this
 * ΔE and the shaded part is at least MIN_SHADOW_SHARE of the face; otherwise it's one tone.
 * Eyes, brows and stray hair inside the outline always take a skin tone.
 */
const TWO_TONE_DISTANCE = 10;
const MIN_SHADOW_SHARE = 0.25;
/**
 * A face in shadow (backlit, under a hat) has truly dark pixels, but people see it as normal
 * skin, and a flat dark-brown face reads as wrong. Faces whose lit tone is darker than this
 * luma (0–255) are brightened, by at most FACE_MAX_BOOST, keeping the lit/shadow difference.
 */
const FACE_MIN_LUMA = 150;
const FACE_MAX_BOOST = 1.9;
/** How far the shadow tone is pulled toward the lit tone, so shadows read as skin. */
const SHADOW_SOFTEN = 0.45;
/** Rounding a traced face outline: passes, and how many points each side are averaged. */
const OUTLINE_ROUND_PASSES = 2;
const OUTLINE_ROUND_REACH = 2;
/**
 * smoothChins: how far around each pixel it looks (a share of the face's height), and how far
 * below the chin it works (also a share of the face's height).
 */
const CHIN_SMOOTH_RADIUS = 0.09;
const CHIN_SMOOTH_BELOW = 0.4;
/** Most palette entries the parts may use; the one after is kept for a blank background. */
const MAX_PART_PALETTE = 254;
/** Photo-shaded faces: blur (share of the face's size), and the darkest and lightest shares of it. */
const PHOTO_FACE_BLUR = 0.03;
const PHOTO_FACE_DARK = 0.22;
const PHOTO_FACE_LIGHT = 0.7;
/** A piece of shadow or light smaller than this share of the face joins the middle tone. */
const PHOTO_FACE_SPECK = 0.012;
/** How far a photo-shaded face's light and shadow are pulled toward its middle tone. */
const PHOTO_FACE_SOFTEN = 0.4;
/** For a hair color, this darkest share of the hair (shadow between strands) is left out. */
const HAIR_DARK_SKIP = 0.4;
/** Hair at least this blue (Lab b) is lit by the sky; gray hair or a white cap is barely blue. */
const SKY_HAIR_BLUE = -5;
/** Cool hair more colorful than this (Lab chroma) is dyed and keeps its color. */
const HAIR_DYED = 15;
/** The tint (Lab a, b) given to hair that came out a dull sky blue-gray. */
const SKY_HAIR_TINT = [4, 14] as const;
/** Colors for a big thing people hold (a bouquet), picked from it... */
const HELD_COLORS = 12;
/** ...and for a small one (a shoe, a watch). */
const HELD_SMALL_COLORS = 3;
/** A held thing at least this share of the picture is big. */
const HELD_BIG_SHARE = 0.004;
/** Held bits smaller than this (pixels) are left to whatever is around them. */
const HELD_MIN_PIXELS = 40;
/** A held thing this many times taller than wide is a leg or pants, not something held. */
const HELD_MAX_TALL = 2;
/** A held thing within this ΔE of the clothes around it is part of them. */
const HELD_LIKE_CLOTHES = 15;
/** Colors each face gets from its own pixels when people are shown in the photo's colors. */
const OWN_FACE_COLORS = 6;
/** A face's color range runs from this share in from its darkest to as far from its lightest. */
const FACE_RANGE_SKIP = 0.02;
/** On the small cards (people otherwise simplified), a face keeps just this many of its own colors. */
const CARD_FACE_COLORS = 4;
/** A card face whose main color is this much darker (Lab L) than plain skin is in shade and lightened. */
const CARD_FACE_SHADED = 18;
/** ...plus this many per whole picture of face (a face filling a tenth of it gets 6 more)... */
const OWN_FACE_COLORS_PER_SHARE = 60;
/** ...up to this many. */
const OWN_FACE_MAX_COLORS = 12;
/** Dark photo colors (Lab L below this) are looked at for dark jeans... */
const DARK_BLUE_MAX_L = 28;
/** ...a near-black one (below this)... */
const NEAR_BLACK_L = 10;
/** ...on pixels that are faintly blue (Lab b below minus this)... */
const NAVY_HINT = 1;
/** ...goes to the piece's darkest clearly blue color (Lab b below minus this)... */
const DARK_BLUE_MIN = 6;
/** ...when the piece has at least this share as much of it. */
const NAVY_MIN_SHARE = 0.15;
/**
 * Clothes in the photo's shared colors: the pixels of a piece given one shared color take their
 * own average color instead when that average is at least this far from it...
 */
const CLOTHES_OWN_MISMATCH = 10;
/** ...with differences in tint (Lab a and b) counted this many times over. */
const CLOTHES_OWN_TINT = 2;
/** ...and they are at least this share of the piece. */
const CLOTHES_OWN_MIN_SHARE = 0.03;
/** Shades for white clothes on detailed pages. */
const WHITE_SHADES = 3;
/** A clothes pixel this light (Lab L)... */
const WHITE_MIN_L = 62;
/** ...and this gray (Lab chroma) is white (in shadow or not). */
const WHITE_MAX_CHROMA = 12;
/** White clothes smaller than this share of the picture keep the shared colors. */
const WHITE_MIN_SHARE = 0.02;
/** How much further apart in lightness white clothes' shades are spread. */
const WHITE_STRETCH = 2;
/** A hair pixel this far from the hair's usual hue (Lab a, b)... */
const HAIR_COLOR_REACH = 25;
/** ...and this much more colorful than it isn't hair (flowers held against it). */
const HAIR_EXTRA_CHROMA = 15;
/** Bare skin farther than this from every face's color (Lab, lightness scaled below) isn't skin. */
const SKIN_COLOR_REACH = 20;
/** How much lightness counts in that, against hue (lit and shaded skin differ mostly in it). */
const SKIN_LIGHT_WEIGHT = 0.5;
/** A separate piece of one tone smaller than this share of the face or hair joins the other tone. */
const MIN_TONE_PIECE = 0.2;
/**
 * Matching bare skin (arms, legs, feet) to a face: color difference (ΔE) plus this much per
 * face height of distance, so a patch goes to the face that looks most like it and is nearby.
 */
const SKIN_DISTANCE_WEIGHT = 5;
/** Skin goes with the person whose clothes make up at least this share of the clothes it touches. */
const CLOTHES_OWNER_SHARE = 0.6;
/** A face-skin area this many times wider than tall, pinched to this share of its halves'
 * height between them, is two faces. */
/** Growing a face into missed skin: within this share of its size from its center, and this ΔE. */
const FACE_GROW_REACH = 0.6;
const FACE_GROW_TOLERANCE = 9;
/** Unclaimed bits of a person up to this share of a face's height from a part join it. */
const GAP_REACH = 0.5;
/** Bites out of a face's outline up to this share of its size are filled in. */
const FACE_SMOOTH = 0.12;
const DOUBLE_FACE_WIDTH = 1.5;
const DOUBLE_FACE_WAIST = 0.65;
/** Bare skin is split where color changes by this ΔE across 2 x PIECE_EDGE_SPAN pixels. */
const PIECE_EDGE = 6;
const PIECE_EDGE_SPAN = 2;
/** Smallest piece of bare skin, as a share of the picture. */
const MIN_PIECE_SHARE = 0.0006;

export interface FaceRegions {
  palette: RGB[];
  paletteLab: Float32Array;
  /** Per palette entry: 0 for the photo's own colors, k + 1 for twins used by part k. */
  group: Uint8Array;
  /** Per pixel: k + 1 inside face k (faces are the first parts), else 0. */
  mask: Uint8Array;
  /** Per palette entry: what it colors (see PartKind). */
  kind: Uint8Array;
  /** Shaded pages: each traced face's jaw, for smoothChins. */
  jaws?: Jaw[];
}

/** A traced face (its part id and rounded outline) and the bare-skin pieces that are its neck and arms. */
export interface Jaw {
  face: number;
  outline: [number, number][];
  skin: number[];
}

/** What a palette color is used for: 0 the photo in general, then face, hair, clothes, pet. */
export const PartKind = { none: 0, face: 1, hair: 2, clothes: 3, pet: 4 } as const;

/**
 * A traced face outline with its corners rounded: each point moves to the average of its
 * neighbors (a few times over), so the pointed tip of the chin doesn't stick out into the neck
 * as a little spur.
 */
function roundOutline(poly: [number, number][]): [number, number][] {
  let pts = poly;
  const n = pts.length;
  for (let pass = 0; pass < OUTLINE_ROUND_PASSES; pass++) {
    pts = pts.map((_, i) => {
      let x = 0, y = 0;
      for (let d = -OUTLINE_ROUND_REACH; d <= OUTLINE_ROUND_REACH; d++) {
        const [px, py] = pts[(i + d + n) % n];
        x += px;
        y += py;
      }
      const m = 2 * OUTLINE_ROUND_REACH + 1;
      return [x / m, y / m];
    });
  }
  return pts;
}

function fillPolygon(poly: [number, number][], mask: Uint8Array, value: number, w: number, h: number) {
  const ys = poly.map((p) => p[1]);
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i];
      const [bx, by] = poly[(i + 1) % poly.length];
      if (ay <= cy !== by <= cy) xs.push(ax + ((cy - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.ceil(xs[i] - 0.5));
      const xb = Math.min(w - 1, Math.floor(xs[i + 1] - 0.5));
      for (let x = xa; x <= xb; x++) if (!mask[y * w + x]) mask[y * w + x] = value;
    }
  }
}

export function paintSkin(skin: RegionMask, mask: Uint8Array, value: number, w: number, h: number) {
  for (let y = 0; y < skin.height; y++) {
    const my = skin.y + y;
    if (my < 0 || my >= h) continue;
    for (let x = 0; x < skin.width; x++) {
      const mx = skin.x + x;
      if (mx < 0 || mx >= w || !skin.data[y * skin.width + x]) continue;
      if (!mask[my * w + mx]) mask[my * w + mx] = value;
    }
  }
}

/** Fallback when no landmarks: skin-colored pixels connected to the cheeks. */
function floodSkin(
  f: FaceShape,
  smoothed: Uint8ClampedArray,
  mask: Uint8Array,
  value: number,
  w: number,
  h: number,
) {
  const lab = new Float32Array(3);
  const cx = f.x + f.width / 2;
  const cy = f.y + f.height / 2;
  const coreRx = f.width * 0.28;
  const coreRy = f.height * 0.3;
  const inCore = (x: number, y: number) => ((x - cx) / coreRx) ** 2 + ((y - cy) / coreRy) ** 2 <= 1;

  // Typical skin: per-channel median over the cheeks and nose.
  const samples: number[][] = [];
  for (let y = Math.max(0, Math.floor(cy - coreRy)); y <= Math.min(h - 1, cy + coreRy); y++) {
    for (let x = Math.max(0, Math.floor(cx - coreRx)); x <= Math.min(w - 1, cx + coreRx); x++) {
      if (!inCore(x, y)) continue;
      const p = y * w + x;
      rgbToLab(smoothed[p * 4], smoothed[p * 4 + 1], smoothed[p * 4 + 2], lab, 0);
      samples.push([lab[0], lab[1], lab[2]]);
    }
  }
  if (samples.length < 4) return;
  const skin = new Float32Array(3);
  for (let c = 0; c < 3; c++) {
    const v = samples.map((s) => s[c]).sort((a, b) => a - b);
    skin[c] = v[v.length >> 1];
  }

  const rx = f.width * 0.6;
  const ry = f.height * 0.7;
  const tol2 = SKIN_TOLERANCE * SKIN_TOLERANCE;
  const isSkin = (p: number) => {
    rgbToLab(smoothed[p * 4], smoothed[p * 4 + 1], smoothed[p * 4 + 2], lab, 0);
    return labDist2(lab, 0, skin, 0) <= tol2;
  };
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let y = Math.max(0, Math.floor(cy - coreRy)); y <= Math.min(h - 1, cy + coreRy); y++) {
    for (let x = Math.max(0, Math.floor(cx - coreRx)); x <= Math.min(w - 1, cx + coreRx); x++) {
      const p = y * w + x;
      if (inCore(x, y) && isSkin(p)) {
        seen[p] = 1;
        stack.push(p);
      }
    }
  }
  while (stack.length) {
    const p = stack.pop()!;
    if (!mask[p]) mask[p] = value;
    const x = p % w;
    const y = (p - x) / w;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (((nx - cx) / rx) ** 2 + ((ny - cy) / ry) ** 2 > 1) continue;
      const q = ny * w + nx;
      if (seen[q]) continue;
      seen[q] = 1;
      if (isSkin(q)) stack.push(q);
    }
  }
}

export function separateFaces(
  indices: Uint8Array,
  smoothed: Uint8ClampedArray,
  faces: FaceShape[],
  animals: RegionMask[],
  clothes: RegionMask | undefined,
  basePalette: RGB[],
  baseLab: Float32Array,
  w: number,
  h: number,
  style: "lines" | "shaded" | "faceless" | "photo" | "own" | "card" = "lines",
  bodySkin?: RegionMask,
  person?: Uint8Array,
  /** Tones per head of hair: one reads best (a second, shaded tone cuts hair into odd strips). */
  hairTones: 1 | 2 = 1,
  /**
   * Colors picked from each person's own clothes (0: the photo's shared colors). With few
   * colors for the whole photo, dark denim and a black top would otherwise share one.
   */
  clothesColors = 0,
  /** What people hold (a bouquet, a watch, shoes): its own part, in its own colors. */
  held?: RegionMask,
): FaceRegions {
  const detected = faces.length;
  faces = faces.flatMap(splitDoubleFace);
  // Clothes are marked by face number as detected; a split face shifts the numbers after it.
  const clothesByFace = faces.length === detected ? clothes : undefined;
  // Parts: faces first (ids 1..F), then each face's hair, then animals. Earlier parts win
  // where masks overlap.
  const parts = new Uint8Array(w * h);
  // Two faces cheek to cheek can share one face-skin area: where two faces' skin overlaps,
  // each pixel goes to the face whose center is nearer (measured in face sizes).
  const covers = (m: RegionMask | undefined, x: number, y: number) =>
    !!m && x >= m.x && y >= m.y && x < m.x + m.width && y < m.y + m.height && !!m.data[(y - m.y) * m.width + x - m.x];
  const nearer = (k: number, x: number, y: number) => {
    const d = (f: FaceShape) =>
      Math.hypot(x - (f.x + f.width / 2), y - (f.y + f.height / 2)) / Math.max(1, f.width, f.height);
    const own = d(faces[k]);
    return faces.every((g, j) => j === k || !covers(g.skin, x, y) || d(g) >= own);
  };
  // A face traced by the landmarker (forehead, jaw and chin) has its true shape, even where
  // it touches another face; those go first. Faces it couldn't trace (a profile, a face half
  // hidden) use the segmenter's skin area, or failing that, skin-colored pixels.
  const traced = (f: FaceShape) => !!f.outline && f.outline.length >= 3;
  faces.forEach((f, k) => {
    if (traced(f)) fillPolygon(roundOutline(f.outline!), parts, k + 1, w, h);
  });
  faces.forEach((f, k) => {
    if (traced(f)) return;
    if (f.skin) {
      const skin = f.skin;
      const data = skin.data.map((v, i) => (v && nearer(k, skin.x + (i % skin.width), skin.y + Math.floor(i / skin.width)) ? 1 : 0));
      paintSkin({ ...skin, data }, parts, k + 1, w, h);
    } else floodSkin(f, smoothed, parts, k + 1, w, h);
  });
  // Where anyone's hair is, so a face never grows into it (light blonde hair is close to skin).
  const hairAt = new Uint8Array(w * h);
  for (const f of faces) if (f.hair) paintSkin(f.hair, hairAt, 1, w, h);
  growFaces(parts, faces, smoothed, w, h, hairAt);
  const mask = Uint8Array.from(parts); // faces only
  let next = faces.length + 1;
  // Each traced face's chin (its outline's lowest point), on shaded pages: skin touching the
  // face below it is a neck, a piece of its own, so the face keeps its chin line.
  const chins = style === "shaded" ? faces.map((f) => (traced(f) ? Math.max(...f.outline!.map((pt) => pt[1])) : undefined)) : undefined;
  // What people hold comes before hair, skin and clothes, so flowers held against long hair or
  // a dress aren't painted as hair or dress.
  // Each held thing (each bouquet, each shoe) is a part of its own, so a red shoe and a pink
  // bouquet don't share colors.
  const heldParts = new Map<number, number>(); // part -> colors
  if (held) {
    const at = new Uint8Array(w * h);
    paintSkin(held, at, 1, w, h);
    // A pet's tongue or collar is the pet's.
    if (animals.length) {
      const pet = new Uint8Array(w * h);
      for (const a of animals) paintSkin(a, pet, 1, w, h);
      for (let p = 0; p < w * h; p++) if (pet[p]) at[p] = 0;
    }
    for (let start = 0; start < w * h && next < 250; start++) {
      if (!at[start] || parts[start]) continue;
      const piece = [start];
      at[start] = 0;
      for (let i = 0; i < piece.length; i++) {
        const p = piece[i];
        const x = p % w;
        for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
          if (q < 0 || q >= w * h || !at[q] || parts[q]) continue;
          at[q] = 0;
          piece.push(q);
        }
      }
      if (piece.length < HELD_MIN_PIXELS) continue;
      // Tall and narrow is a leg or a pair of jeans the segmenter wasn't sure of: clothes.
      let top = h, bottom = 0, left = w, right = 0;
      for (const p of piece) {
        const x = p % w, y = (p - x) / w;
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
      if (bottom - top + 1 > (right - left + 1) * HELD_MAX_TALL) continue;
      // The color of the clothes it touches: a held thing looking just like them (jeans the
      // segmenter wasn't sure of) is part of them.
      if (clothes && looksLikeAround(piece, clothes, smoothed, w, h)) continue;
      const k = next++;
      for (const p of piece) parts[p] = k;
      heldParts.set(k, piece.length >= w * h * HELD_BIG_SHARE ? HELD_COLORS : HELD_SMALL_COLORS);
    }
  }
  const hairParts = new Map<number, number>(); // hair part -> its face's part
  faces.forEach((f, i) => {
    if (!f.hair || next >= 250) return;
    hairParts.set(next, i + 1);
    paintSkin(f.hair, parts, next++, w, h);
  });
  // Bare skin: pieces of their own (so arms and legs that touch another person keep a line
  // between them), each colored like the face it belongs to.
  const lab = new Float32Array(w * h * 3);
  if (bodySkin) {
    for (let p = 0; p < w * h; p++) rgbToLab(smoothed[p * 4], smoothed[p * 4 + 1], smoothed[p * 4 + 2], lab, p * 3);
  }
  const skinPieces =
    bodySkin && faces.length
      ? matchBodySkin(bodySkin, parts, mask, faces.length, lab, w, h, next, 250, clothesByFace, chins)
      : new Map<number, number>();
  for (const k of skinPieces.keys()) next = Math.max(next, k + 1);
  const kindOf = new Map<number, number>();
  for (const k of skinPieces.keys()) kindOf.set(k, PartKind.face);
  faces.forEach((_, i) => kindOf.set(i + 1, PartKind.face));
  for (const k of hairParts.keys()) kindOf.set(k, PartKind.hair);
  for (const k of heldParts.keys()) kindOf.set(k, PartKind.clothes);
  // Each person's clothes are a part of their own.
  if (clothes) {
    const partOf = new Map<number, number>(); // person -> part
    for (let y = 0; y < clothes.height; y++) {
      for (let x = 0; x < clothes.width; x++) {
        const person = clothes.data[y * clothes.width + x];
        const mx = clothes.x + x;
        const my = clothes.y + y;
        if (!person || mx < 0 || my < 0 || mx >= w || my >= h || parts[my * w + mx]) continue;
        let k = partOf.get(person);
        if (k === undefined) {
          if (next >= 250) continue;
          k = next++;
          partOf.set(person, k);
          kindOf.set(k, PartKind.clothes);
        }
        parts[my * w + mx] = k;
      }
    }
  }
  for (const a of animals) {
    if (next >= 250) break;
    kindOf.set(next, PartKind.pet);
    paintSkin(a, parts, next++, w, h);
  }

  // Own-color faces (people shown in the photo's colors) take no more than their own skin.
  if (person && style !== "own") {
    // Each face's typical color, for what its skin may take.
    if (!bodySkin) for (let p = 0; p < w * h; p++) if (mask[p]) rgbToLab(smoothed[p * 4], smoothed[p * 4 + 1], smoothed[p * 4 + 2], lab, p * 3);
    const faceLab = faces.map((_, i) => {
      const m = [0, 0, 0, 0];
      for (let p = 0; p < w * h; p++) {
        if (mask[p] !== i + 1) continue;
        for (let c = 0; c < 3; c++) m[c] += lab[p * 3 + c];
        m[3]++;
      }
      return m[3] ? m.slice(0, 3).map((v) => v / m[3]) : null;
    });
    const skinOf = (k: number) => (k <= faces.length ? faceLab[k - 1] : skinPieces.has(k) ? faceLab[skinPieces.get(k)! - 1] : null);
    const hairHue = new Map<number, [number, number, number] | null>();
    for (const k of hairParts.keys()) hairHue.set(k, usualHue(parts, k, smoothed));
    fillGaps(parts, person, w, h, Math.max(4, ...faces.map((f) => f.height * GAP_REACH)), (k, q) => {
      const kind = kindOf.get(k);
      if (kind !== PartKind.face && kind !== PartKind.hair) return true;
      const usual = kind === PartKind.face ? skinOf(k) : hairHue.get(k);
      if (!usual) return true;
      if (!lab[q * 3] && !lab[q * 3 + 1] && !lab[q * 3 + 2]) rgbToLab(smoothed[q * 4], smoothed[q * 4 + 1], smoothed[q * 4 + 2], lab, q * 3);
      return kind === PartKind.face ? looksLikeSkin(lab, q, usual) : !notHair(lab, q, usual as [number, number, number]);
    });
  }

  const palette = [...basePalette];
  const labs: number[] = Array.from(baseLab);
  const group: number[] = basePalette.map(() => 0);
  const add = (rgb: RGB, lab: ArrayLike<number>, k: number) => {
    // The last index is kept for the blank background of a cut-out photo.
    if (palette.length >= MAX_PART_PALETTE) return -1;
    palette.push(rgb);
    labs.push(lab[0], lab[1], lab[2]);
    group.push(k);
    return palette.length - 1;
  };

  // Faces: one or two of their own skin tones, as smooth lit/shadow areas. Hair the same way,
  // in the hair's own colors (without the brightening faces in shadow get), so skin showing
  // through a part or a stray highlight is just hair.
  const faceTone = new Map<number, { ids: number[]; tone: Map<number, number> }>();
  if (style !== "lines") {
    const shade = (source: Uint8Array, k: number, maxTones: 1 | 2, brighten: boolean) => {
      const shading = faceShading(smoothed, source, k, w, maxTones, brighten);
      if (!shading) return;
      const ids = shading.rgb.map((rgb, t) => add(rgb, shading.lab.subarray(t * 3, t * 3 + 3), k));
      if (ids.every((id) => id >= 0)) faceTone.set(k, { ids, tone: shading.tone });
    };
    const faceTones = style === "faceless" || bodySkin ? 1 : 2;
    /** On cards, each face's plain skin color (for its arms and legs). */
    const cardSkin = new Map<number, { rgb: RGB[]; lab: Float32Array }>();
    if (style === "own" || style === "card") {
      // Each face in a few colors picked from its own pixels (skin, shadow, lips, eyes), so
      // it keeps its own shading instead of sharing the photo's colors with hair and background.
      faces.forEach((_, i) => {
        // Bigger faces have more to show (a beard, a smile, sunglasses): more colors.
        let n = 0;
        for (let p = 0; p < mask.length; p++) if (mask[p] === i + 1) n++;
        const colors =
          style === "card"
            ? CARD_FACE_COLORS
            : Math.round(Math.min(OWN_FACE_MAX_COLORS, Math.max(OWN_FACE_COLORS, OWN_FACE_COLORS + (n / mask.length) * OWN_FACE_COLORS_PER_SHARE)));
        const own = facePalette(smoothed, mask, i + 1, colors);
        if (!own) return;
        if (style === "card") {
          // A face in shade (sunglasses, trees) reads as normal skin: like simplified faces, a
          // clearly shaded face is lightened so its main color is the skin a face in good light would have,
          // keeping the light and dark of its features. Arms and legs take that skin color.
          const skin = faceShading(smoothed, mask, i + 1, w, 1, true);
          if (skin) {
            const count = new Array(colors).fill(0);
            for (const t of own.tone.values()) count[t]++;
            const main = count.indexOf(Math.max(...count));
            const lift = skin.lab[0] - own.lab[main * 3];
            if (lift > CARD_FACE_SHADED) {
              own.rgb = own.rgb.map((_, t) => {
                const rgb = labToRgb(Math.min(97, own.lab[t * 3] + lift), own.lab[t * 3 + 1], own.lab[t * 3 + 2]);
                return rgb.map((v) => Math.round(Math.max(0, Math.min(255, v)))) as RGB;
              });
              own.rgb.forEach((c, t) => rgbToLab(c[0], c[1], c[2], own.lab, t * 3));
            }
            cardSkin.set(i + 1, skin);
          }
        }
        const ids = own.rgb.map((rgb, t) => add(rgb, own.lab.subarray(t * 3, t * 3 + 3), i + 1));
        if (ids.every((id) => id >= 0)) faceTone.set(i + 1, { ids, tone: own.tone });
      });
    } else if (style === "photo") {
      // The face's own light and shadow, so eyes, nose and mouth show as shaded shapes.
      faces.forEach((_, i) => {
        const shading = facePhotoShading(smoothed, mask, i + 1, w);
        if (!shading) return shade(mask, i + 1, 1, true);
        const ids = shading.rgb.map((rgb, t) => add(rgb, shading.lab.subarray(t * 3, t * 3 + 3), i + 1));
        if (ids.every((id) => id >= 0)) faceTone.set(i + 1, { ids, tone: shading.tone });
      });
    } else faces.forEach((_, i) => shade(mask, i + 1, faceTones, true));
    for (const k of hairParts.keys()) shade(parts, k, hairTones, false);
    for (const [piece, k] of skinPieces) {
      const tone = faceTone.get(k);
      if (!tone) continue;
      const skin = cardSkin.get(k);
      if (skin) {
        const id = add(skin.rgb[0], skin.lab.subarray(0, 3), piece);
        if (id >= 0) faceTone.set(piece, { ids: [id], tone: new Map() });
        continue;
      }
      // Arms and legs take the face's main skin color: the one most of the face has (with a
      // face in several colors of its own, the first is its darkest, not its skin).
      const count = new Array(tone.ids.length).fill(0);
      for (const t of tone.tone.values()) count[t]++;
      const base = tone.ids[count.indexOf(Math.max(...count))];
      const id = add(palette[base], labs.slice(base * 3, base * 3 + 3), piece);
      if (id >= 0) faceTone.set(piece, { ids: [id], tone: new Map() });
    }
  }

  // What people hold, in a few colors of its own (pink roses, white roses and leaves rather than
  // the nearest dress or hair color).
  for (const [k, n] of heldParts) {
    const own = clothesPalette(smoothed, parts, k, n);
    if (!own) continue;
    const ids = own.rgb.map((rgb, t) => add(rgb, own.lab.subarray(t * 3, t * 3 + 3), k));
    if (ids.every((id) => id >= 0)) faceTone.set(k, { ids, tone: own.tone });
  }

  // White clothes (a wedding dress) have only faint folds, which the photo's shared colors
  // flatten into one: their white pixels get their own shadow, middle and light shades.
  const whiteTone = new Map<number, { ids: number[]; tone: Map<number, number> }>();
  for (const [k, kind] of kindOf) {
    if (kind !== PartKind.clothes || clothesColors > 0 || heldParts.has(k)) continue;
    const own = whiteShades(smoothed, parts, k);
    if (!own) continue;
    const ids = own.rgb.map((rgb, t) => add(rgb, own.lab.subarray(t * 3, t * 3 + 3), k));
    if (ids.every((id) => id >= 0)) whiteTone.set(k, { ids, tone: own.tone });
  }
  if (clothesColors > 0) {
    for (const [k, kind] of kindOf) {
      if (kind !== PartKind.clothes || heldParts.has(k)) continue;
      const own = clothesPalette(smoothed, parts, k, clothesColors);
      if (!own) continue;
      const ids = own.rgb.map((rgb, t) => add(rgb, own.lab.subarray(t * 3, t * 3 + 3), k));
      if (ids.every((id) => id >= 0)) faceTone.set(k, { ids, tone: own.tone });
    }
  }

  const twins = new Map<number, number>(); // part * 256 + base color -> twin index
  const partTwins = new Map<number, number[]>(); // part -> its twins
  /** When the palette is full: the part's own color closest to `base` (never a color of the photo at large). */
  const nearestTwin = (k: number, base: number) => {
    let best = -1;
    let bestD = Infinity;
    for (const t of partTwins.get(k) ?? faceTone.get(k)?.ids ?? []) {
      const d = labDist2(baseLab, base * 3, Float32Array.from(labs.slice(t * 3, t * 3 + 3)), 0);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  };
  // Dark jeans in shade round to the photo's black: for a piece of clothes that also has dark
  // blue (navy denim), its pixels that came out black but are faintly blue in the photo take
  // its darkest blue instead, so the jeans read as navy, not black.
  const navyOf = new Map<number, number>(); // part * 256 + black base -> navy base
  {
    const sums = new Map<number, number[]>(); // part * 256 + base -> L, a, b, n
    for (let p = 0; p < parts.length; p++) {
      const k = parts[p];
      if (!k || kindOf.get(k) !== PartKind.clothes || faceTone.has(k)) continue;
      const base = indices[p];
      if (group[base] !== 0 || baseLab[base * 3] >= DARK_BLUE_MAX_L) continue;
      const id = k * 256 + base;
      let sum = sums.get(id);
      if (!sum) sums.set(id, (sum = [0, 0, 0, 0]));
      const px = new Float32Array(3);
      rgbToLab(smoothed[p * 4], smoothed[p * 4 + 1], smoothed[p * 4 + 2], px, 0);
      for (let c = 0; c < 3; c++) sum[c] += px[c];
      sum[3]++;
    }
    for (const [id, sum] of sums) {
      const k = Math.floor(id / 256);
      const base = id % 256;
      const ownB = sum[2] / sum[3];
      if (baseLab[base * 3] >= NEAR_BLACK_L || ownB > -NAVY_HINT || baseLab[base * 3 + 2] < -NAVY_HINT) continue;
      // The darkest clearly blue photo color this piece also uses (enough of it).
      let navy = -1;
      for (const [id2, sum2] of sums) {
        if (Math.floor(id2 / 256) !== k || sum2[3] < sum[3] * NAVY_MIN_SHARE) continue;
        const b2 = id2 % 256;
        if (baseLab[b2 * 3 + 2] > -DARK_BLUE_MIN) continue;
        if (navy < 0 || baseLab[b2 * 3] < baseLab[navy * 3]) navy = b2;
      }
      if (navy >= 0) navyOf.set(id, navy);
    }
  }
  // Clothes in the photo's shared colors take the nearest one, and a photo's colors are mostly
  // its background: a black-and-brown print comes out in the bushes' greens, a white shirt in
  // shade in the sky's blue. Where the pixels of a piece of clothes given one shared color are,
  // on average, clearly a different color in the photo, they take that average instead.
  const ownOf = new Map<number, number>(); // part * 256 + base -> palette index
  if (clothesColors === 0) {
    const sums = new Map<number, number[]>(); // part * 256 + base -> L, a, b, n
    const size = new Map<number, number>(); // part -> pixels
    const px = new Float32Array(3);
    for (let p = 0; p < parts.length; p++) {
      const k = parts[p];
      if (!k || kindOf.get(k) !== PartKind.clothes || faceTone.has(k) || whiteTone.get(k)?.tone.has(p)) continue;
      let base = indices[p];
      if (group[base] !== 0) continue;
      base = navyOf.get(k * 256 + base) ?? base;
      const id = k * 256 + base;
      let sum = sums.get(id);
      if (!sum) sums.set(id, (sum = [0, 0, 0, 0]));
      rgbToLab(smoothed[p * 4], smoothed[p * 4 + 1], smoothed[p * 4 + 2], px, 0);
      for (let c = 0; c < 3; c++) sum[c] += px[c];
      sum[3]++;
      size.set(k, (size.get(k) ?? 0) + 1);
    }
    for (const [id, sum] of sums) {
      const k = Math.floor(id / 256);
      const base = id % 256;
      if (sum[3] < size.get(k)! * CLOTHES_OWN_MIN_SHARE) continue;
      const mean = Float32Array.from(sum.slice(0, 3).map((v) => v / sum[3]));
      // Tint counts more than lightness: a gray print given an olive green reads as green.
      const dL = mean[0] - baseLab[base * 3];
      const dA = (mean[1] - baseLab[base * 3 + 1]) * CLOTHES_OWN_TINT;
      const dB = (mean[2] - baseLab[base * 3 + 2]) * CLOTHES_OWN_TINT;
      if (dL * dL + dA * dA + dB * dB < CLOTHES_OWN_MISMATCH * CLOTHES_OWN_MISMATCH) continue;
      const rgb = labToRgb(mean[0], mean[1], mean[2]).map((v) => Math.round(Math.max(0, Math.min(255, v)))) as RGB;
      const lab = new Float32Array(3);
      rgbToLab(rgb[0], rgb[1], rgb[2], lab, 0);
      const own = add(rgb, lab, k);
      if (own < 0) break;
      partTwins.set(k, [...(partTwins.get(k) ?? []), own]);
      ownOf.set(id, own);
    }
  }
  for (let p = 0; p < parts.length; p++) {
    const k = parts[p];
    if (!k) continue;
    const face = faceTone.get(k);
    if (face) {
      indices[p] = face.ids[face.tone.get(p) ?? 0];
      continue;
    }
    const white = whiteTone.get(k)?.tone.get(p);
    if (white !== undefined) {
      indices[p] = whiteTone.get(k)!.ids[white];
      continue;
    }
    let base = indices[p];
    if (group[base] !== 0) continue; // already a part color
    base = navyOf.get(k * 256 + base) ?? base;
    const id = k * 256 + base;
    const own = ownOf.get(id);
    if (own !== undefined) {
      indices[p] = own;
      continue;
    }
    let twin = twins.get(id);
    if (twin === undefined) {
      twin = add(basePalette[base], baseLab.subarray(base * 3, base * 3 + 3), k);
      if (twin >= 0) partTwins.set(k, [...(partTwins.get(k) ?? []), twin]);
      // Out of indices (a big group): the closest color this part already has, so a shoe
      // doesn't take the grass's color and disappear into it.
      else twin = nearestTwin(k, base);
      if (twin < 0) continue;
      twins.set(id, twin);
    }
    indices[p] = twin;
  }
  return {
    palette,
    paletteLab: Float32Array.from(labs),
    group: Uint8Array.from(group),
    mask,
    kind: Uint8Array.from(group, (g) => kindOf.get(g) ?? PartKind.none),
    jaws: chins
      ? faces.flatMap((f, i) =>
          traced(f) ? [{ face: i + 1, outline: roundOutline(f.outline!), skin: [...skinPieces].filter(([, k]) => k === i + 1).map(([piece]) => piece) }] : [],
        )
      : undefined,
  };
}

/**
 * Smooths each traced face's chin: the line where face and neck meet keeps its place but loses
 * its bumps and notches (shading in the photo makes it wobble). Each pixel of the lower face
 * or its neck goes to whichever of the two has most of the pixels around it. Only face and its
 * own neck trade pixels (they're the same skin color), so nothing else on the page moves.
 * Works on the final color map.
 */
export function smoothChins(colorMap: Uint8Array, w: number, h: number, faces: FaceRegions): Uint8Array {
  if (!faces.jaws?.length) return colorMap;
  const out = Uint8Array.from(colorMap);
  const { group, kind } = faces;
  for (const { face, outline, skin } of faces.jaws) {
    if (!skin.length) continue;
    const ys = outline.map((pt) => pt[1]);
    const xs = outline.map((pt) => pt[0]);
    const top = Math.min(...ys), chin = Math.max(...ys);
    const r = Math.max(2, Math.round((chin - top) * CHIN_SMOOTH_RADIUS));
    // The lower half of the face and what's below it, to well past the chin.
    const bx0 = Math.max(0, Math.floor(Math.min(...xs)) - 2 * r);
    const bx1 = Math.min(w - 1, Math.ceil(Math.max(...xs)) + 2 * r);
    const by0 = Math.max(0, Math.round((top + chin) / 2));
    const by1 = Math.min(h - 1, Math.round(chin + (chin - top) * CHIN_SMOOTH_BELOW));
    if (bx1 <= bx0 || by1 <= by0) continue;
    const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
    const isFace = (c: number) => kind[c] === PartKind.face && group[c] === face;
    const isNeck = (c: number) => kind[c] === PartKind.face && skin.includes(group[c]);
    const faceAt = new Float32Array(bw * bh);
    const either = new Float32Array(bw * bh);
    const faceCount = new Map<number, number>();
    const neckCount = new Map<number, number>();
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const c = colorMap[(by0 + y) * w + bx0 + x];
        if (isFace(c)) {
          faceAt[y * bw + x] = either[y * bw + x] = 1;
          faceCount.set(c, (faceCount.get(c) ?? 0) + 1);
        } else if (isNeck(c)) {
          either[y * bw + x] = 1;
          neckCount.set(c, (neckCount.get(c) ?? 0) + 1);
        }
      }
    }
    const main = (m: Map<number, number>) => [...m].sort((a, b) => b[1] - a[1])[0]?.[0];
    const faceColor = main(faceCount);
    const neckColor = main(neckCount);
    if (faceColor === undefined || neckColor === undefined) continue;
    const faceNear = boxBlur(boxBlur(faceAt, bw, bh, r), bw, bh, r);
    const near = boxBlur(boxBlur(either, bw, bh, r), bw, bh, r);
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const i = y * bw + x;
        if (!either[i]) continue;
        const p = (by0 + y) * w + bx0 + x;
        const wantFace = faceNear[i] * 2 >= near[i];
        if (wantFace && !faceAt[i]) out[p] = faceColor;
        else if (!wantFace && faceAt[i]) out[p] = neckColor;
      }
    }
  }
  return out;
}

/** A box blur of radius `r` (sum over the square, edges clamped), rows then columns. */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum;
      sum += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/**
 * A face's own colors, spread over its range of light and dark (lit skin to shadow, lips,
 * brows, a beard), rather than spent on its most unusual colors (bright sunglasses). Starting
 * colors are taken at even steps of lightness, then refined. Each pixel's color index in `tone`.
 */
function facePalette(
  smoothed: Uint8ClampedArray,
  parts: Uint8Array,
  k: number,
  n: number,
): { rgb: RGB[]; lab: Float32Array; tone: Map<number, number> } | null {
  const px: number[] = [];
  for (let p = 0; p < parts.length; p++) if (parts[p] === k) px.push(p);
  if (px.length < n * 20) return null;
  const lab = new Float32Array(px.length * 3);
  px.forEach((p, i) => rgbToLab(smoothed[p * 4], smoothed[p * 4 + 1], smoothed[p * 4 + 2], lab, i * 3));
  const order = px.map((_, i) => i).sort((a, b) => lab[a * 3] - lab[b * 3]);
  const centers = new Float32Array(n * 3);
  // Starting colors at even steps of lightness from the face's darkest to its lightest parts
  // (not even shares of its pixels), so small dark and light features (brows, pupils, teeth)
  // get colors of their own rather than being outnumbered by plain skin.
  const lo = lab[order[Math.floor(order.length * FACE_RANGE_SKIP)] * 3];
  const hi = lab[order[Math.min(order.length - 1, Math.floor(order.length * (1 - FACE_RANGE_SKIP)))] * 3];
  for (let c = 0; c < n; c++) {
    const target = lo + ((hi - lo) * (c + 0.5)) / n;
    // The typical color of the pixels nearest that lightness.
    let j = 0;
    while (j < order.length - 1 && lab[order[j] * 3] < target) j++;
    const from = Math.max(0, j - 20);
    const to = Math.min(order.length, j + 20);
    for (let q = from; q < to; q++) for (let a = 0; a < 3; a++) centers[c * 3 + a] += lab[order[q] * 3 + a] / (to - from);
  }
  const group = new Uint8Array(px.length);
  for (let round = 0; round < 8; round++) {
    const sum = new Float64Array(n * 4);
    for (let i = 0; i < px.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < n; c++) {
        const d = labDist2(lab, i * 3, centers, c * 3);
        if (d < bestD) { bestD = d; best = c; }
      }
      group[i] = best;
      for (let a = 0; a < 3; a++) sum[best * 4 + a] += lab[i * 3 + a];
      sum[best * 4 + 3]++;
    }
    for (let c = 0; c < n; c++) if (sum[c * 4 + 3]) for (let a = 0; a < 3; a++) centers[c * 3 + a] = sum[c * 4 + a] / sum[c * 4 + 3];
  }
  const rgbSum = new Float64Array(n * 4);
  px.forEach((p, i) => {
    for (let a = 0; a < 3; a++) rgbSum[group[i] * 4 + a] += smoothed[p * 4 + a];
    rgbSum[group[i] * 4 + 3]++;
  });
  const rgb = Array.from({ length: n }, (_, c) => [0, 1, 2].map((a) => Math.round(rgbSum[c * 4 + a] / Math.max(1, rgbSum[c * 4 + 3]))) as RGB);
  const out = new Float32Array(n * 3);
  rgb.forEach((c, i) => rgbToLab(c[0], c[1], c[2], out, i * 3));
  const tone = new Map<number, number>();
  px.forEach((p, i) => tone.set(p, group[i]));
  return { rgb, lab: out, tone };
}

/**
 * The white pixels of a piece of clothes, in shades of their own by lightness (darkest,
 * middle and lightest thirds), so folds show. Null when there's little white.
 */
function whiteShades(
  smoothed: Uint8ClampedArray,
  parts: Uint8Array,
  k: number,
): { rgb: RGB[]; lab: Float32Array; tone: Map<number, number> } | null {
  const px: number[] = [];
  const L: number[] = [];
  const lab = new Float32Array(3);
  for (let p = 0; p < parts.length; p++) {
    if (parts[p] !== k) continue;
    rgbToLab(smoothed[p * 4], smoothed[p * 4 + 1], smoothed[p * 4 + 2], lab, 0);
    if (lab[0] < WHITE_MIN_L || Math.hypot(lab[1], lab[2]) > WHITE_MAX_CHROMA) continue;
    px.push(p);
    L.push(lab[0]);
  }
  if (px.length < parts.length * WHITE_MIN_SHARE) return null;
  const order = px.map((_, i) => i).sort((a, b) => L[a] - L[b]);
  const group = new Uint8Array(px.length);
  order.forEach((i, r) => (group[i] = Math.min(WHITE_SHADES - 1, Math.floor((r * WHITE_SHADES) / px.length))));
  const rgbSum = new Float64Array(WHITE_SHADES * 4);
  px.forEach((p, i) => {
    for (let a = 0; a < 3; a++) rgbSum[group[i] * 4 + a] += smoothed[p * 4 + a];
    rgbSum[group[i] * 4 + 3]++;
  });
  const mean = Array.from({ length: WHITE_SHADES }, (_, c) => [0, 1, 2].map((a) => Math.round(rgbSum[c * 4 + a] / Math.max(1, rgbSum[c * 4 + 3]))));
  // Folds in white cloth are faint: the shades are spread further apart in lightness (same
  // hue) so they read on paper.
  const shadeLab = new Float32Array(WHITE_SHADES * 3);
  mean.forEach((c, i) => rgbToLab(c[0], c[1], c[2], shadeLab, i * 3));
  const midL = shadeLab[((WHITE_SHADES - 1) >> 1) * 3];
  const rgb = mean.map((_, i) => {
    const L = Math.min(97, midL + (shadeLab[i * 3] - midL) * WHITE_STRETCH);
    return labToRgb(L, shadeLab[i * 3 + 1], shadeLab[i * 3 + 2]).map((v) => Math.round(Math.max(0, Math.min(255, v)))) as RGB;
  });
  const out = new Float32Array(WHITE_SHADES * 3);
  rgb.forEach((c, i) => rgbToLab(c[0], c[1], c[2], out, i * 3));
  const tone = new Map<number, number>();
  px.forEach((p, i) => tone.set(p, group[i]));
  return { rgb, lab: out, tone };
}

/**
 * A piece of clothing's own `n` colors: its pixels grouped by color (k-means in Lab), each
 * group's average color, and each pixel's group.
 */
function clothesPalette(
  smoothed: Uint8ClampedArray,
  parts: Uint8Array,
  k: number,
  n: number,
): { rgb: RGB[]; lab: Float32Array; tone: Map<number, number> } | null {
  const px: number[] = [];
  for (let p = 0; p < parts.length; p++) if (parts[p] === k) px.push(p);
  if (px.length < n * 20) return null;
  const lab = new Float32Array(px.length * 3);
  px.forEach((p, i) => rgbToLab(smoothed[p * 4], smoothed[p * 4 + 1], smoothed[p * 4 + 2], lab, i * 3));
  // Start from colors as different as possible (each the furthest from those picked so far),
  // so a dark top and dark denim, equally dark, still start apart.
  const centers = new Float32Array(n * 3);
  const step = Math.max(1, Math.floor(px.length / 4000));
  const nearest = new Float64Array(px.length).fill(Infinity);
  let pick = px.map((_, i) => i).sort((a, b) => lab[a * 3] - lab[b * 3])[px.length >> 1];
  for (let c = 0; c < n; c++) {
    centers.set(lab.subarray(pick * 3, pick * 3 + 3), c * 3);
    let far = -1;
    for (let i = 0; i < px.length; i += step) {
      nearest[i] = Math.min(nearest[i], labDist2(lab, i * 3, centers, c * 3));
      if (far < 0 || nearest[i] > nearest[far]) far = i;
    }
    pick = far;
  }
  const group = new Uint8Array(px.length);
  for (let round = 0; round < 8; round++) {
    const sum = new Float64Array(n * 4);
    for (let i = 0; i < px.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < n; c++) {
        const d = labDist2(lab, i * 3, centers, c * 3);
        if (d < bestD) { bestD = d; best = c; }
      }
      group[i] = best;
      for (let a = 0; a < 3; a++) sum[best * 4 + a] += lab[i * 3 + a];
      sum[best * 4 + 3]++;
    }
    for (let c = 0; c < n; c++) if (sum[c * 4 + 3]) for (let a = 0; a < 3; a++) centers[c * 3 + a] = sum[c * 4 + a] / sum[c * 4 + 3];
  }
  const rgbSum = new Float64Array(n * 4);
  px.forEach((p, i) => {
    for (let a = 0; a < 3; a++) rgbSum[group[i] * 4 + a] += smoothed[p * 4 + a];
    rgbSum[group[i] * 4 + 3]++;
  });
  const rgb = Array.from({ length: n }, (_, c) => [0, 1, 2].map((a) => Math.round(rgbSum[c * 4 + a] / Math.max(1, rgbSum[c * 4 + 3]))) as RGB);
  const out = new Float32Array(n * 3);
  rgb.forEach((c, i) => rgbToLab(c[0], c[1], c[2], out, i * 3));
  const tone = new Map<number, number>();
  px.forEach((p, i) => tone.set(p, group[i]));
  return { rgb, lab: out, tone };
}

/**
 * The segmenter sometimes misses part of a face (a cheek in bright light next to blond hair,
 * or a face whose box came out too narrow), leaving it to the background colors. Each face is
 * grown into neighboring pixels of its own skin color, only within a face-sized circle around
 * its center.
 */
function growFaces(parts: Uint8Array, faces: FaceShape[], smoothed: Uint8ClampedArray, w: number, h: number, hairAt?: Uint8Array) {
  const lab = new Float32Array(3);
  const ref = new Float32Array(3);
  faces.forEach((f, i) => {
    const k = i + 1;
    let L = 0, A = 0, B = 0, n = 0, cx = 0, cy = 0;
    const px: number[] = [];
    for (let p = 0; p < parts.length; p++) {
      if (parts[p] !== k) continue;
      rgbToLab(smoothed[p * 4], smoothed[p * 4 + 1], smoothed[p * 4 + 2], lab, 0);
      L += lab[0]; A += lab[1]; B += lab[2]; n++;
      cx += p % w; cy += Math.floor(p / w);
      px.push(p);
    }
    if (n < 8) return;
    ref[0] = L / n; ref[1] = A / n; ref[2] = B / n;
    cx /= n; cy /= n;
    const r = Math.max(f.width, f.height) * FACE_GROW_REACH;
    const tol2 = FACE_GROW_TOLERANCE * FACE_GROW_TOLERANCE;
    for (let s = 0; s < px.length; s++) {
      const p = px[s];
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= parts.length || parts[q] || hairAt?.[q]) continue;
        const qx = q % w;
        const qy = Math.floor(q / w);
        if (Math.hypot(qx - cx, qy - cy) > r || qy >= h) continue;
        rgbToLab(smoothed[q * 4], smoothed[q * 4 + 1], smoothed[q * 4 + 2], lab, 0);
        if (labDist2(lab, 0, ref, 0) > tol2) continue;
        parts[q] = k;
        px.push(q);
      }
    }
    // Fill what the face now encloses (eyes, a smile): anything inside its box that can't be
    // reached from the box's edge without crossing the face.
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (const p of px) {
      const x = p % w;
      const y = (p - x) / w;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const outside = new Uint8Array(bw * bh);
    const stack: number[] = [];
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        if ((x > 0 && y > 0 && x < bw - 1 && y < bh - 1) || parts[(y0 + y) * w + x0 + x] === k) continue;
        outside[y * bw + x] = 1;
        stack.push(y * bw + x);
      }
    }
    while (stack.length) {
      const b = stack.pop()!;
      const x = b % bw;
      for (const c of [x > 0 ? b - 1 : -1, x < bw - 1 ? b + 1 : -1, b - bw, b + bw]) {
        if (c < 0 || c >= outside.length || outside[c]) continue;
        if (parts[(y0 + Math.floor(c / bw)) * w + x0 + (c % bw)] === k) continue;
        outside[c] = 1;
        stack.push(c);
      }
    }
    for (let b = 0; b < outside.length; b++) {
      const p = (y0 + Math.floor(b / bw)) * w + x0 + (b % bw);
      if (!outside[b] && !parts[p]) parts[p] = k;
    }

    // Smooth the outline where strands of hair or shadow bit into it (a closing: grow the
    // face by a few pixels, then shrink it back), taking only pixels no other part has.
    const R = Math.max(2, Math.round(Math.max(f.width, f.height) * FACE_SMOOTH));
    const ox = Math.max(0, x0 - R), oy = Math.max(0, y0 - R);
    const ow = Math.min(w - 1, x1 + R) - ox + 1, oh = Math.min(h - 1, y1 + R) - oy + 1;
    const inside = new Uint8Array(ow * oh);
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) inside[y * ow + x] = parts[(oy + y) * w + ox + x] === k ? 1 : 0;
    const disk: [number, number][] = [];
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= R * R) disk.push([dx, dy]);
    const grown = new Uint8Array(ow * oh);
    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        if (!inside[y * ow + x]) continue;
        for (const [dx, dy] of disk) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < ow && ny < oh) grown[ny * ow + nx] = 1;
        }
      }
    }
    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        const p = (oy + y) * w + ox + x;
        if (inside[y * ow + x] || parts[p] || !grown[y * ow + x]) continue;
        const kept = disk.every(([dx, dy]) => {
          const nx = x + dx, ny = y + dy;
          return nx < 0 || ny < 0 || nx >= ow || ny >= oh || grown[ny * ow + nx];
        });
        if (kept) parts[p] = k;
      }
    }
  });
}

/**
 * Two faces cheek to cheek often come out as one face-skin area, much wider than a face and
 * pinched in between the two. Such an area is cut at its narrowest column into two faces
 * (the hair stays with the first).
 */
function splitDoubleFace(f: FaceShape): FaceShape[] {
  const skin = f.skin;
  if (!skin) return [f];
  const { width: bw, height: bh, data } = skin;
  const cols = new Int32Array(bw);
  let x0 = bw, x1 = -1, y0 = bh, y1 = -1;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (!data[y * bw + x]) continue;
      cols[x]++;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (w < DOUBLE_FACE_WIDTH * h) return [f];
  let cut = -1;
  for (let x = Math.round(x0 + w * 0.3); x <= x0 + w * 0.7; x++) if (cut < 0 || cols[x] < cols[cut]) cut = x;
  let left = 0, right = 0;
  for (let x = x0; x < cut; x++) left = Math.max(left, cols[x]);
  for (let x = cut + 1; x <= x1; x++) right = Math.max(right, cols[x]);
  if (cols[cut] > DOUBLE_FACE_WAIST * Math.min(left, right)) return [f];
  const half = (keep: (x: number) => boolean): FaceShape => {
    const part = data.map((v, i) => (v && keep(i % bw) ? 1 : 0));
    let a = bw, b = -1;
    for (let x = 0; x < bw; x++) if (keep(x) && cols[x]) { a = Math.min(a, x); b = Math.max(b, x); }
    return { ...f, x: skin.x + a, width: b - a + 1, outline: undefined, features: undefined, skin: { ...skin, data: part } };
  };
  const l = half((x) => x < cut);
  const r = half((x) => x >= cut);
  // The hair goes with the face the original box is centered on.
  const onLeft = f.x + f.width / 2 - skin.x < cut;
  return onLeft ? [l, { ...r, hair: undefined }] : [r, { ...l, hair: undefined }];
}

/** A part's usual hue (median Lab a, b) and how colorful that is. */
function usualHue(parts: Uint8Array, k: number, smoothed: Uint8ClampedArray): [number, number, number] | null {
  const px: number[] = [];
  for (let p = 0; p < parts.length; p++) if (parts[p] === k) px.push(p);
  if (!px.length) return null;
  const lab = new Float32Array(px.length * 3);
  px.forEach((p, i) => rgbToLab(smoothed[p * 4], smoothed[p * 4 + 1], smoothed[p * 4 + 2], lab, i * 3));
  const median = (c: number) => Float32Array.from(px, (_, i) => lab[i * 3 + c]).sort()[px.length >> 1];
  const [a, b] = [median(1), median(2)];
  return [a, b, Math.hypot(a, b)];
}

/**
 * Whether a pixel's color (Lab) is much more colorful than hair of this usual hue and far
 * from it: pink or orange flowers held against long hair. Highlights and shadows aren't.
 */
function notHair(lab: ArrayLike<number>, p: number, [a0, b0, chroma0]: [number, number, number]): boolean {
  const a = lab[p * 3 + 1];
  const b = lab[p * 3 + 2];
  return Math.hypot(a - a0, b - b0) > HAIR_COLOR_REACH && Math.hypot(a, b) > chroma0 + HAIR_EXTRA_CHROMA;
}

/** Whether a piece's average color is close to the clothes right around it. */
function looksLikeAround(piece: number[], clothes: RegionMask, smoothed: Uint8ClampedArray, w: number, h: number): boolean {
  const inPiece = new Set(piece);
  const isClothes = (q: number) => {
    const cx = (q % w) - clothes.x;
    const cy = Math.floor(q / w) - clothes.y;
    return cx >= 0 && cy >= 0 && cx < clothes.width && cy < clothes.height && clothes.data[cy * clothes.width + cx] > 0;
  };
  const own = [0, 0, 0];
  const near = [0, 0, 0, 0];
  for (const p of piece) {
    for (let c = 0; c < 3; c++) own[c] += smoothed[p * 4 + c];
    const x = p % w;
    for (const d of [-2, 2, -2 * w, 2 * w]) {
      const q = p + d;
      if (q < 0 || q >= w * h || (d === -2 && x < 2) || (d === 2 && x >= w - 2) || inPiece.has(q) || !isClothes(q)) continue;
      for (let c = 0; c < 3; c++) near[c] += smoothed[q * 4 + c];
      near[3]++;
    }
  }
  if (near[3] < piece.length * 0.05) return false;
  const a = new Float32Array(3);
  const b = new Float32Array(3);
  rgbToLab(own[0] / piece.length, own[1] / piece.length, own[2] / piece.length, a, 0);
  rgbToLab(near[0] / near[3], near[1] / near[3], near[2] / near[3], b, 0);
  return labDist2(a, 0, b, 0) < HELD_LIKE_CLOTHES * HELD_LIKE_CLOTHES;
}

/** Whether a pixel's color (Lab) could be the skin of a face with this typical color. */
function looksLikeSkin(lab: ArrayLike<number>, p: number, face: ArrayLike<number>): boolean {
  return Math.hypot((lab[p * 3] - face[0]) * SKIN_LIGHT_WEIGHT, lab[p * 3 + 1] - face[1], lab[p * 3 + 2] - face[2]) <= SKIN_COLOR_REACH;
}

/**
 * Bits of a person that no part claimed (light hair on a shoulder the segmenter missed, a
 * patch of chest) would get the background's colors and show up as odd spots. Each such
 * pixel within `reach` of a part joins the nearest part, if that part may take it (skin and
 * hair don't take what isn't their color: flowers held up to the chest).
 */
function fillGaps(
  parts: Uint8Array,
  person: Uint8Array,
  w: number,
  h: number,
  reach: number,
  mayTake: (part: number, p: number) => boolean,
) {
  let frontier: number[] = [];
  for (let p = 0; p < parts.length; p++) if (parts[p]) frontier.push(p);
  for (let step = 0; step < reach && frontier.length; step++) {
    const next: number[] = [];
    for (const p of frontier) {
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= w * h || parts[q] || !person[q]) continue;
        if (!mayTake(parts[p], q)) continue;
        parts[q] = parts[p];
        next.push(q);
      }
    }
    frontier = next;
  }
}

/**
 * Splits bare skin (neck, arms, hands, legs, feet) into pieces along the edges visible in the
 * photo, so where one person's arm touches another's back or foot there is still a line, and
 * gives each piece to the face it most likely belongs to (similar color, nearby). Pieces are
 * painted into `parts` with ids from `firstId` (below `limit`); returns piece id -> face part.
 */
function matchBodySkin(
  skin: RegionMask,
  parts: Uint8Array,
  faceMask: Uint8Array,
  faceCount: number,
  lab: Float32Array,
  w: number,
  h: number,
  firstId: number,
  limit: number,
  clothes?: RegionMask,
  /** Each face's chin (y), where known: skin below it is a neck, not the face. */
  chins?: (number | undefined)[],
): Map<number, number> {
  const n = w * h;
  const inSkin = new Uint8Array(n);
  paintSkin(skin, inSkin, 1, w, h);
  for (let p = 0; p < n; p++) if (parts[p]) inSkin[p] = 0;

  // Each face's typical color, center and height.
  const sum = new Float64Array(faceCount * 6); // L, a, b, x, y, n
  const top = new Float64Array(faceCount).fill(Infinity);
  const bottom = new Float64Array(faceCount).fill(-Infinity);
  for (let p = 0; p < n; p++) {
    const k = faceMask[p] - 1;
    if (k < 0) continue;
    const y = Math.floor(p / w);
    for (let c = 0; c < 3; c++) sum[k * 6 + c] += lab[p * 3 + c];
    sum[k * 6 + 3] += p % w;
    sum[k * 6 + 4] += y;
    sum[k * 6 + 5]++;
    top[k] = Math.min(top[k], y);
    bottom[k] = Math.max(bottom[k], y);
  }
  const { piece, count } = splitAlongEdges(inSkin, lab, w, h, limit - firstId);

  let faceH = 1;
  for (let k = 0; k < faceCount; k++) if (sum[k * 6 + 5]) faceH = Math.max(faceH, bottom[k] - top[k] + 1);

  // Skin touching a face (a neck, or part of the face the face mask missed) is that face's.
  const touch = new Int32Array(count * faceCount);
  for (let p = 0; p < n; p++) {
    const i = piece[p];
    if (i < 0 || !inSkin[p]) continue;
    const x = p % w;
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
      if (q >= 0 && q < n && faceMask[q]) touch[i * faceCount + faceMask[q] - 1]++;
    }
  }

  // Skin surrounded by someone's clothes (a chest inside a neckline, arms out of sleeves) is
  // most likely theirs. Clothes are marked with the person's face number (1, 2, …).
  const wears = new Int32Array(count * faceCount);
  const clothesAt = (q: number) => {
    if (!clothes) return 0;
    const cx = (q % w) - clothes.x;
    const cy = Math.floor(q / w) - clothes.y;
    if (cx < 0 || cy < 0 || cx >= clothes.width || cy >= clothes.height) return 0;
    return clothes.data[cy * clothes.width + cx];
  };
  for (let p = 0; p < n; p++) {
    const i = piece[p];
    if (i < 0 || !inSkin[p]) continue;
    const x = p % w;
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
      if (q < 0 || q >= n || piece[q] === i) continue;
      const o = clothesAt(q);
      if (o >= 1 && o <= faceCount) wears[i * faceCount + o - 1]++;
    }
  }

  const owner = new Map<number, number>();
  const inFace = new Set<number>();
  const pieceSum = new Float64Array(count * 6);
  for (let p = 0; p < n; p++) {
    const i = piece[p];
    if (i < 0 || !inSkin[p]) continue;
    for (let c = 0; c < 3; c++) pieceSum[i * 6 + c] += lab[p * 3 + c];
    pieceSum[i * 6 + 3] += p % w;
    pieceSum[i * 6 + 4] += Math.floor(p / w);
    pieceSum[i * 6 + 5]++;
  }
  for (let i = 0; i < count; i++) {
    const m = pieceSum[i * 6 + 5];
    if (!m) continue;
    let touched = -1;
    for (let k = 0; k < faceCount; k++) {
      if (touch[i * faceCount + k] > (touched < 0 ? 0 : touch[i * faceCount + touched])) touched = k;
    }
    if (touched >= 0) {
      // Beside the face rather than below the chin: it is the face itself.
      owner.set(firstId + i, touched + 1);
      if (pieceSum[i * 6 + 4] / m < Math.min(bottom[touched], chins?.[touched] ?? Infinity)) inFace.add(i);
      continue;
    }
    let worn = -1;
    let wornBorder = 0;
    let allBorder = 0;
    for (let k = 0; k < faceCount; k++) {
      const b = wears[i * faceCount + k];
      allBorder += b;
      if (b > wornBorder) {
        wornBorder = b;
        worn = k;
      }
    }
    if (worn >= 0 && wornBorder >= allBorder * CLOTHES_OWNER_SHARE && sum[worn * 6 + 5]) {
      owner.set(firstId + i, worn + 1);
      continue;
    }
    let best = -1;
    let bestScore = Infinity;
    for (let k = 0; k < faceCount; k++) {
      const f = sum[k * 6 + 5];
      if (!f) continue;
      const color = Math.hypot(...[0, 1, 2].map((c) => pieceSum[i * 6 + c] / m - sum[k * 6 + c] / f));
      // People stand side by side and their arms and legs hang below their own face, so
      // sideways distance counts double.
      const dx = (pieceSum[i * 6 + 3] / m - sum[k * 6 + 3] / f) * 2;
      const dy = pieceSum[i * 6 + 4] / m - sum[k * 6 + 4] / f;
      const dist = Math.hypot(dx, dy) / faceH;
      const score = color + SKIN_DISTANCE_WEIGHT * dist;
      if (score < bestScore) {
        bestScore = score;
        best = k;
      }
    }
    if (best >= 0) owner.set(firstId + i, best + 1);
  }
  for (let p = 0; p < n; p++) {
    const i = piece[p];
    if (!inSkin[p] || i < 0 || !owner.has(firstId + i)) continue;
    if (inFace.has(i)) {
      parts[p] = owner.get(firstId + i)!;
      faceMask[p] = parts[p];
    } else parts[p] = firstId + i;
  }
  for (const i of inFace) owner.delete(firstId + i);
  return owner;
}

/**
 * Splits an area (bare skin) into pieces along the edges visible in the photo: where the
 * color changes clearly across a couple of pixels (one limb in front of another). Only edges that close a piece off split it, so a wrinkle or shadow doesn't. Pieces
 * smaller than MIN_PIECE_SHARE of the picture join their neighbors. Returns each pixel's piece
 * (-1 outside the area) and the number of pieces (at most `maxPieces`).
 */
function splitAlongEdges(
  area: Uint8Array,
  lab: Float32Array,
  w: number,
  h: number,
  maxPieces: number,
): { piece: Int32Array; count: number } {
  const n = w * h;
  const S = PIECE_EDGE_SPAN;
  const edge = new Uint8Array(n);
  const across = (a: number, b: number) =>
    area[a] && area[b] && labDist2(lab, a * 3, lab, b * 3) > PIECE_EDGE * PIECE_EDGE;
  for (let y = S; y < h - S; y++) {
    for (let x = S; x < w - S; x++) {
      const p = y * w + x;
      if (area[p] && (across(p - S, p + S) || across(p - S * w, p + S * w))) edge[p] = 1;
    }
  }

  const piece = new Int32Array(n).fill(-1);
  const minPiece = Math.max(40, n * MIN_PIECE_SHARE);
  const visited = new Uint8Array(n);
  const flood = (start: number, ok: (q: number) => boolean) => {
    const pixels = [start];
    visited[start] = 1;
    for (let i = 0; i < pixels.length; i++) {
      const p = pixels[i];
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= n || visited[q] || !ok(q)) continue;
        visited[q] = 1;
        pixels.push(q);
      }
    }
    return pixels;
  };
  // Pieces: areas between edges, big enough to color.
  const found: number[][] = [];
  for (let p = 0; p < n; p++) {
    if (!area[p] || edge[p] || visited[p]) continue;
    const pixels = flood(p, (q) => area[q] === 1 && !edge[q]);
    if (pixels.length >= minPiece) found.push(pixels);
  }
  found.sort((a, b) => b.length - a.length);
  found.length = Math.min(found.length, maxPieces);
  found.forEach((pixels, i) => pixels.forEach((q) => (piece[q] = i)));

  // The rest (edges, specks) joins the nearest piece; a patch that touches no piece is one.
  const grow = () => {
    let frontier: number[] = [];
    for (let p = 0; p < n; p++) if (piece[p] >= 0) frontier.push(p);
    while (frontier.length) {
      const nextFront: number[] = [];
      for (const p of frontier) {
        const x = p % w;
        for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
          if (q < 0 || q >= n || !area[q] || piece[q] >= 0) continue;
          piece[q] = piece[p];
          nextFront.push(q);
        }
      }
      frontier = nextFront;
    }
  };
  grow();
  let count = found.length;
  visited.fill(0);
  for (let p = 0; p < n && count < maxPieces; p++) {
    if (!area[p] || piece[p] >= 0 || visited[p]) continue;
    const pixels = flood(p, (q) => area[q] === 1 && piece[q] < 0);
    pixels.forEach((q) => (piece[q] = count));
    count++;
  }
  grow();
  return { piece, count };
}

/**
 * A face's skin in the photo's own light and shadow, as three tones: its middle tone (first,
 * so arms and legs matching the face get it), its shadows (the eyes, the side of the nose, the
 * mouth, a shaded cheek) and its light. The lightness is only lightly blurred, so those
 * features keep their shapes, and specks join the tone around them. Colors are brightened
 * like any face's.
 */
function facePhotoShading(
  smoothed: Uint8ClampedArray,
  mask: Uint8Array,
  k: number,
  w: number,
): { rgb: RGB[]; lab: Float32Array; tone: Map<number, number> } | null {
  const lab = new Float32Array(3);
  const px: number[] = [];
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let p = 0; p < mask.length; p++) {
    if (mask[p] !== k) continue;
    px.push(p);
    const x = p % w;
    const y = (p - x) / w;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (px.length < 64) return null;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const at = (p: number) => (Math.floor(p / w) - y0) * bw + (p % w) - x0;
  const L = new Float32Array(bw * bh);
  const M = new Float32Array(bw * bh);
  for (const p of px) {
    rgbToLab(smoothed[p * 4], smoothed[p * 4 + 1], smoothed[p * 4 + 2], lab, 0);
    L[at(p)] = lab[0];
    M[at(p)] = 1;
  }
  // Light blur within the face.
  const r = Math.max(1, Math.round(Math.min(bw, bh) * PHOTO_FACE_BLUR));
  const box = (a: Float32Array) => {
    const t = new Float32Array(a.length);
    const out = new Float32Array(a.length);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += a[y * bw + Math.min(bw - 1, Math.max(0, x + d))];
      t[y * bw + x] = s;
    }
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += t[Math.min(bh - 1, Math.max(0, y + d)) * bw + x];
      out[y * bw + x] = s;
    }
    return out;
  };
  const bl = box(L);
  const bm = box(M);
  const soft = px.map((p) => bl[at(p)] / Math.max(1e-6, bm[at(p)]));
  const sorted = [...soft].sort((a, b) => a - b);
  const darkCut = sorted[Math.floor(sorted.length * PHOTO_FACE_DARK)];
  const lightCut = sorted[Math.floor(sorted.length * PHOTO_FACE_LIGHT)];
  // Tones: 0 middle, 1 shadow, 2 light.
  let toneAt = new Int8Array(bw * bh).fill(-1);
  px.forEach((p, i) => (toneAt[at(p)] = soft[i] < darkCut ? 1 : soft[i] >= lightCut ? 2 : 0));
  // Round the shapes: each pixel takes the most common tone around it.
  const counts = new Int32Array(3);
  for (let pass = 0; pass < 2; pass++) {
    const next = Int8Array.from(toneAt);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const i = y * bw + x;
      if (toneAt[i] < 0) continue;
      counts.fill(0);
      for (let v = Math.max(0, y - 1); v <= Math.min(bh - 1, y + 1); v++)
        for (let u = Math.max(0, x - 1); u <= Math.min(bw - 1, x + 1); u++) if (toneAt[v * bw + u] >= 0) counts[toneAt[v * bw + u]]++;
      let best = toneAt[i];
      for (let t = 0; t < 3; t++) if (counts[t] > counts[best]) best = t;
      next[i] = best;
    }
    toneAt = next;
  }
  // Specks of shadow or light join the middle tone.
  const seen = new Uint8Array(bw * bh);
  for (let s = 0; s < toneAt.length; s++) {
    if (seen[s] || toneAt[s] <= 0) continue;
    const t = toneAt[s];
    const piece = [s];
    seen[s] = 1;
    for (let j = 0; j < piece.length; j++) {
      const i = piece[j];
      const x = i % bw;
      for (const q of [x > 0 ? i - 1 : -1, x < bw - 1 ? i + 1 : -1, i - bw, i + bw]) {
        if (q < 0 || q >= toneAt.length || seen[q] || toneAt[q] !== t) continue;
        seen[q] = 1;
        piece.push(q);
      }
    }
    if (piece.length < px.length * PHOTO_FACE_SPECK) for (const i of piece) toneAt[i] = 0;
  }
  const sum = new Float64Array(12);
  const tone = new Map<number, number>();
  for (const p of px) {
    const t = toneAt[at(p)];
    tone.set(p, t);
    for (let c = 0; c < 3; c++) sum[t * 4 + c] += smoothed[p * 4 + c];
    sum[t * 4 + 3]++;
  }
  const middle = [0, 1, 2].map((c) => sum[c] / Math.max(1, sum[3]));
  // Light and shadow are softened toward the middle tone, so they read as the same skin.
  const means = [0, 1, 2].map((t) =>
    sum[t * 4 + 3] ? [0, 1, 2].map((c) => { const v = sum[t * 4 + c] / sum[t * 4 + 3]; return t ? v + (middle[c] - v) * PHOTO_FACE_SOFTEN : v; }) : middle,
  );
  const luma = 0.299 * middle[0] + 0.587 * middle[1] + 0.114 * middle[2];
  const boost = Math.min(FACE_MAX_BOOST, Math.max(1, FACE_MIN_LUMA / Math.max(1, luma)));
  const rgb = means.map((m) => m.map((v) => Math.min(255, Math.round(v * boost))) as RGB);
  const out = new Float32Array(9);
  rgb.forEach((c, i) => rgbToLab(c[0], c[1], c[2], out, i * 3));
  return { rgb, lab: out, tone };
}

/**
 * A face's skin as one or two tones. Light and shadow are judged on a heavily blurred copy of
 * the face's lightness, so the split follows the broad lit and shaded sides of the face, not
 * eyes, brows or a smile (which would otherwise turn into blotches). A face gets a second
 * tone only when its shaded side is clearly darker and a real part of the face; the shadow
 * tone is softened toward the lit one so it reads as shaded skin. Returns each face pixel's
 * tone (0 = shadow or the only tone, 1 = lit).
 */
function faceShading(
  smoothed: Uint8ClampedArray,
  mask: Uint8Array,
  k: number,
  w: number,
  maxTones: 1 | 2,
  brighten = true,
): { rgb: RGB[]; lab: Float32Array; tone: Map<number, number> } | null {
  const lab = new Float32Array(3);
  const px: number[] = [];
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let p = 0; p < mask.length; p++) {
    if (mask[p] !== k) continue;
    px.push(p);
    const x = p % w;
    const y = (p - x) / w;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (px.length < 8) return null;

  // Lightness over the face's box, blurred only within the face.
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const L = new Float32Array(bw * bh);
  const M = new Float32Array(bw * bh);
  const light: number[] = [];
  for (const p of px) {
    const x = (p % w) - x0;
    const y = Math.floor(p / w) - y0;
    rgbToLab(smoothed[p * 4], smoothed[p * 4 + 1], smoothed[p * 4 + 2], lab, 0);
    L[y * bw + x] = lab[0];
    M[y * bw + x] = 1;
    light.push(lab[0]);
  }
  const r = Math.max(2, Math.round(Math.min(bw, bh) * 0.18));
  const blur = (a: Float32Array) => {
    const t = new Float32Array(a.length);
    const out = new Float32Array(a.length);
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        let s = 0;
        for (let d = -r; d <= r; d++) s += a[y * bw + Math.min(bw - 1, Math.max(0, x + d))];
        t[y * bw + x] = s;
      }
    }
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        let s = 0;
        for (let d = -r; d <= r; d++) s += t[Math.min(bh - 1, Math.max(0, y + d)) * bw + x];
        out[y * bw + x] = s;
      }
    }
    return out;
  };
  const bl = blur(L);
  const bm = blur(M);
  const soft = px.map((p) => {
    const i = (Math.floor(p / w) - y0) * bw + ((p % w) - x0);
    return bl[i] / Math.max(1e-6, bm[i]);
  });
  const mid = [...soft].sort((a, b) => a - b)[soft.length >> 1];

  // Mean color of a set of face pixels, leaving out the darkest and brightest 10% (eyes,
  // brows, teeth, glare).
  const sorted = [...light].sort((a, b) => a - b);
  // Hair reads as its lit color (blond hair has deep shadows between strands that would
  // otherwise darken it to brown), so for hair the darker part is left out.
  const lo = sorted[Math.floor(sorted.length * (brighten ? 0.1 : HAIR_DARK_SKIP))];
  const hi = sorted[Math.floor(sorted.length * 0.9)];
  const meanOf = (pick: (i: number) => boolean): RGB | null => {
    let r0 = 0, g0 = 0, b0 = 0, n = 0;
    px.forEach((p, i) => {
      if (!pick(i) || light[i] < lo || light[i] > hi) return;
      r0 += smoothed[p * 4];
      g0 += smoothed[p * 4 + 1];
      b0 += smoothed[p * 4 + 2];
      n++;
    });
    return n ? [r0 / n, g0 / n, b0 / n] : null;
  };

  let means: RGB[];
  const tone = new Map<number, number>();
  const shadow = meanOf((i) => soft[i] < mid);
  const lit = meanOf((i) => soft[i] >= mid);
  const shadowShare = soft.filter((v) => v < mid - 4).length / soft.length;
  let two = maxTones === 2 && !!shadow && !!lit && shadowShare >= MIN_SHADOW_SHARE;
  if (two) {
    const a = new Float32Array(3);
    const b = new Float32Array(3);
    rgbToLab(shadow![0], shadow![1], shadow![2], a, 0);
    rgbToLab(lit![0], lit![1], lit![2], b, 0);
    two = labDist2(a, 0, b, 0) >= TWO_TONE_DISTANCE * TWO_TONE_DISTANCE;
  }
  if (two) {
    // [shadow, lit]: soften the shadow toward the lit tone.
    means = [shadow!.map((v, c) => v + (lit![c] - v) * SHADOW_SOFTEN) as RGB, lit!];
    px.forEach((p, i) => tone.set(p, soft[i] >= mid ? 1 : 0));
    // A small separate piece of one tone (a strip of shade along an edge) joins the other
    // tone, so only big, natural areas of light and shade remain.
    const seen = new Set<number>();
    for (const start of px) {
      if (seen.has(start)) continue;
      const t = tone.get(start)!;
      const piece = [start];
      seen.add(start);
      for (let i = 0; i < piece.length; i++) {
        const p = piece[i];
        const x = p % w;
        for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
          if (q < 0 || seen.has(q) || mask[q] !== k || tone.get(q) !== t) continue;
          seen.add(q);
          piece.push(q);
        }
      }
      if (piece.length < px.length * MIN_TONE_PIECE) for (const p of piece) tone.set(p, 1 - t);
    }
  } else {
    means = [meanOf(() => true) ?? [200, 160, 140]];
    px.forEach((p) => tone.set(p, 0));
  }

  const litTone = means[means.length - 1];
  const litLuma = 0.299 * litTone[0] + 0.587 * litTone[1] + 0.114 * litTone[2];
  const boost = brighten ? Math.min(FACE_MAX_BOOST, Math.max(1, FACE_MIN_LUMA / Math.max(1, litLuma))) : 1;
  // Brightened by raising lightness only: multiplying the red, green and blue would also make
  // the color stronger (a shaded face turning bright orange).
  let rgb = means.map((m) => {
    if (boost === 1) return m.map((v) => Math.min(255, Math.round(v))) as RGB;
    const lab = new Float32Array(3);
    rgbToLab(Math.round(m[0]), Math.round(m[1]), Math.round(m[2]), lab, 0);
    const boosted = new Float32Array(3);
    const b = m.map((v) => Math.min(255, Math.round(v * boost)));
    rgbToLab(b[0], b[1], b[2], boosted, 0);
    return labToRgb(boosted[0], lab[1], lab[2]).map((v) => Math.round(Math.max(0, Math.min(255, v)))) as RGB;
  });
  if (!brighten) {
    // Hair is never a dull blue-gray of its own: that's the sky lighting the top of the head.
    // It keeps its lightness with a natural light-brown tint (gray hair, which is barely
    // bluish, and vivid dyed hair are left alone).
    const hairLab = new Float32Array(3);
    rgb = rgb.map((c) => {
      rgbToLab(c[0], c[1], c[2], hairLab, 0);
      if (hairLab[2] > SKY_HAIR_BLUE || Math.hypot(hairLab[1], hairLab[2]) > HAIR_DYED) return c;
      return labToRgb(hairLab[0], SKY_HAIR_TINT[0], SKY_HAIR_TINT[1]).map((v) => Math.round(Math.max(0, Math.min(255, v)))) as RGB;
    });
  }
  const out = new Float32Array(rgb.length * 3);
  rgb.forEach((c, i) => rgbToLab(c[0], c[1], c[2], out, i * 3));
  return { rgb, lab: out, tone };
}

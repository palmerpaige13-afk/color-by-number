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

import { labDist2, rgbToLab } from "./color";
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
/**
 * Matching bare skin (arms, legs, feet) to a face: color difference (ΔE) plus this much per
 * face height of distance, so a patch goes to the face that looks most like it and is nearby.
 */
const SKIN_DISTANCE_WEIGHT = 5;

export interface FaceRegions {
  palette: RGB[];
  paletteLab: Float32Array;
  /** Per palette entry: 0 for the photo's own colors, k + 1 for twins used by part k. */
  group: Uint8Array;
  /** Per pixel: k + 1 inside face k (faces are the first parts), else 0. */
  mask: Uint8Array;
  /** Per palette entry: what it colors (see PartKind). */
  kind: Uint8Array;
}

/** What a palette color is used for: 0 the photo in general, then face, hair, clothes, pet. */
export const PartKind = { none: 0, face: 1, hair: 2, clothes: 3, pet: 4 } as const;

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
  style: "lines" | "shaded" | "faceless" = "lines",
  bodySkin?: RegionMask,
): FaceRegions {
  // Parts: faces first (ids 1..F), then each face's hair, then animals. Earlier parts win
  // where masks overlap.
  const parts = new Uint8Array(w * h);
  faces.forEach((f, k) => {
    if (f.skin) paintSkin(f.skin, parts, k + 1, w, h);
    else if (f.outline && f.outline.length >= 3) fillPolygon(f.outline, parts, k + 1, w, h);
    else floodSkin(f, smoothed, parts, k + 1, w, h);
  });
  const mask = Uint8Array.from(parts); // faces only
  let next = faces.length + 1;
  const hairParts = new Map<number, number>(); // hair part -> its face's part
  faces.forEach((f, i) => {
    if (!f.hair || next >= 250) return;
    hairParts.set(next, i + 1);
    paintSkin(f.hair, parts, next++, w, h);
  });
  if (bodySkin && faces.length) matchBodySkin(bodySkin, parts, mask, faces.length, smoothed, w, h);
  const kindOf = new Map<number, number>();
  faces.forEach((_, i) => kindOf.set(i + 1, PartKind.face));
  for (const k of hairParts.keys()) kindOf.set(k, PartKind.hair);
  if (clothes && next < 250) {
    kindOf.set(next, PartKind.clothes);
    paintSkin(clothes, parts, next++, w, h);
  }
  for (const a of animals) {
    if (next >= 250) break;
    kindOf.set(next, PartKind.pet);
    paintSkin(a, parts, next++, w, h);
  }

  const palette = [...basePalette];
  const labs: number[] = Array.from(baseLab);
  const group: number[] = basePalette.map(() => 0);
  const add = (rgb: RGB, lab: ArrayLike<number>, k: number) => {
    if (palette.length >= 255) return -1;
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
    faces.forEach((_, i) => shade(mask, i + 1, faceTones, true));
    for (const k of hairParts.keys()) shade(parts, k, 2, false);
  }

  const twins = new Map<number, number>(); // part * 256 + base color -> twin index
  for (let p = 0; p < parts.length; p++) {
    const k = parts[p];
    if (!k) continue;
    const face = faceTone.get(k);
    if (face) {
      indices[p] = face.ids[face.tone.get(p) ?? 0];
      continue;
    }
    const base = indices[p];
    if (group[base] !== 0) continue; // already a part color
    const id = k * 256 + base;
    let twin = twins.get(id);
    if (twin === undefined) {
      twin = add(basePalette[base], baseLab.subarray(base * 3, base * 3 + 3), k);
      if (twin < 0) continue; // out of indices; leave this pixel as it was
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
  };
}

/**
 * Gives each patch of bare skin (a connected stretch of neck, arm, hand, leg or foot) to one
 * face, painting it into `parts` with that face's part id, so the person is one skin color.
 */
function matchBodySkin(
  skin: RegionMask,
  parts: Uint8Array,
  faceMask: Uint8Array,
  faceCount: number,
  smoothed: Uint8ClampedArray,
  w: number,
  h: number,
) {
  const lab = new Float32Array(3);
  const labAt = (p: number) => rgbToLab(smoothed[p * 4], smoothed[p * 4 + 1], smoothed[p * 4 + 2], lab, 0);

  // Each face's typical color, center and height.
  const sum = new Float64Array(faceCount * 6); // L, a, b, x, y, n
  const top = new Float64Array(faceCount).fill(Infinity);
  const bottom = new Float64Array(faceCount).fill(-Infinity);
  for (let p = 0; p < faceMask.length; p++) {
    const k = faceMask[p] - 1;
    if (k < 0) continue;
    labAt(p);
    const y = Math.floor(p / w);
    sum[k * 6] += lab[0];
    sum[k * 6 + 1] += lab[1];
    sum[k * 6 + 2] += lab[2];
    sum[k * 6 + 3] += p % w;
    sum[k * 6 + 4] += y;
    sum[k * 6 + 5]++;
    top[k] = Math.min(top[k], y);
    bottom[k] = Math.max(bottom[k], y);
  }
  let faceH = 1;
  for (let k = 0; k < faceCount; k++) if (sum[k * 6 + 5]) faceH = Math.max(faceH, bottom[k] - top[k] + 1);

  const inSkin = new Uint8Array(w * h);
  paintSkin(skin, inSkin, 1, w, h);
  const seen = new Uint8Array(w * h);
  for (let start = 0; start < inSkin.length; start++) {
    if (!inSkin[start] || seen[start] || parts[start]) continue;
    // One connected patch of bare skin not already claimed by a face or hair.
    const patch: number[] = [];
    const stack = [start];
    seen[start] = 1;
    let L = 0, A = 0, B = 0, X = 0, Y = 0;
    while (stack.length) {
      const p = stack.pop()!;
      patch.push(p);
      labAt(p);
      L += lab[0]; A += lab[1]; B += lab[2];
      const x = p % w;
      const y = (p - x) / w;
      X += x; Y += y;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= inSkin.length || seen[q] || !inSkin[q] || parts[q]) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    const n = patch.length;
    let best = -1;
    let bestScore = Infinity;
    for (let k = 0; k < faceCount; k++) {
      const m = sum[k * 6 + 5];
      if (!m) continue;
      const dE = Math.hypot(L / n - sum[k * 6] / m, A / n - sum[k * 6 + 1] / m, B / n - sum[k * 6 + 2] / m);
      const dist = Math.hypot(X / n - sum[k * 6 + 3] / m, Y / n - sum[k * 6 + 4] / m) / faceH;
      const score = dE + SKIN_DISTANCE_WEIGHT * dist;
      if (score < bestScore) {
        bestScore = score;
        best = k;
      }
    }
    if (best >= 0) for (const p of patch) parts[p] = best + 1;
  }
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
  const lo = sorted[Math.floor(sorted.length * 0.1)];
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
  } else {
    means = [meanOf(() => true) ?? [200, 160, 140]];
    px.forEach((p) => tone.set(p, 0));
  }

  const litTone = means[means.length - 1];
  const litLuma = 0.299 * litTone[0] + 0.587 * litTone[1] + 0.114 * litTone[2];
  const boost = brighten ? Math.min(FACE_MAX_BOOST, Math.max(1, FACE_MIN_LUMA / Math.max(1, litLuma))) : 1;
  const rgb = means.map((m) => m.map((v) => Math.min(255, Math.round(v * boost))) as RGB);
  const out = new Float32Array(rgb.length * 3);
  rgb.forEach((c, i) => rgbToLab(c[0], c[1], c[2], out, i * 3));
  return { rgb, lab: out, tone };
}

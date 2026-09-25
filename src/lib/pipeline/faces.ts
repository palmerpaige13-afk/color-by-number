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
 * Every face pixel takes the nearer of the face's skin tones, so eyes, brows and stray strands of
 * hair inside the outline don't show up as dark hair-colored spots. Distance counts lightness at
 * only LIGHTNESS_WEIGHT, since shadow mostly darkens skin without changing its hue.
 */
const LIGHTNESS_WEIGHT = 0.35;
/**
 * A face in shadow (backlit, under a hat) has truly dark pixels, but people see it as normal
 * skin, and a flat dark-brown face reads as wrong. Faces whose lit tone is darker than this
 * luma (0–255) are brightened, by at most FACE_MAX_BOOST, keeping the lit/shadow difference.
 */
const FACE_MIN_LUMA = 150;
const FACE_MAX_BOOST = 1.9;
/** How far the shadow tone is pulled toward the lit tone, so shadows read as skin. */
const SHADOW_SOFTEN = 0.45;

export interface FaceRegions {
  palette: RGB[];
  paletteLab: Float32Array;
  /** Per palette entry: 0 for the photo's own colors, k + 1 for twins used by part k. */
  group: Uint8Array;
  /** Per pixel: k + 1 inside face k (faces are the first parts), else 0. */
  mask: Uint8Array;
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
  basePalette: RGB[],
  baseLab: Float32Array,
  w: number,
  h: number,
  style: "lines" | "shaded" | "faceless" = "lines",
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
  for (const f of faces) if (f.hair && next < 250) paintSkin(f.hair, parts, next++, w, h);
  for (const a of animals) if (next < 250) paintSkin(a, parts, next++, w, h);

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

  // Faces: their own skin tones.
  const faceTone = new Map<number, { tones: Float32Array; ids: number[] }>();
  if (style !== "lines") {
    faces.forEach((_, i) => {
      const k = i + 1;
      const tones = skinTones(smoothed, mask, k, style === "faceless" ? 1 : 2);
      if (!tones) return;
      const ids = tones.rgb.map((rgb, t) => add(rgb, tones.lab.subarray(t * 3, t * 3 + 3), k));
      if (ids.every((id) => id >= 0)) faceTone.set(k, { tones: tones.lab, ids });
    });
  }

  const lab = new Float32Array(3);
  const twins = new Map<number, number>(); // part * 256 + base color -> twin index
  for (let p = 0; p < parts.length; p++) {
    const k = parts[p];
    if (!k) continue;
    const face = faceTone.get(k);
    if (face) {
      rgbToLab(smoothed[p * 4], smoothed[p * 4 + 1], smoothed[p * 4 + 2], lab, 0);
      let best = 0;
      let bestD = Infinity;
      for (let t = 0; t < face.ids.length; t++) {
        const dl = (lab[0] - face.tones[t * 3]) * LIGHTNESS_WEIGHT;
        const da = lab[1] - face.tones[t * 3 + 1];
        const db = lab[2] - face.tones[t * 3 + 2];
        const d = dl * dl + da * da + db * db;
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
      indices[p] = face.ids[best];
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
  return { palette, paletteLab: Float32Array.from(labs), group: Uint8Array.from(group), mask };
}

/**
 * The face's own skin tones: its pixels split by lightness into `count` groups (lit, shadow),
 * each group's mean color. The shadow tone is softened toward the lit one so it reads as
 * shaded skin rather than as a different material.
 */
function skinTones(
  smoothed: Uint8ClampedArray,
  mask: Uint8Array,
  k: number,
  count: 1 | 2,
): { rgb: RGB[]; lab: Float32Array } | null {
  const lab = new Float32Array(3);
  const px: number[] = [];
  const light: number[] = [];
  for (let p = 0; p < mask.length; p++) {
    if (mask[p] !== k) continue;
    rgbToLab(smoothed[p * 4], smoothed[p * 4 + 1], smoothed[p * 4 + 2], lab, 0);
    px.push(p);
    light.push(lab[0]);
  }
  if (px.length < 8) return null;
  // Ignore the darkest and brightest 10% (eyes, teeth, glare) when finding the skin tones.
  const sorted = [...light].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.1)];
  const hi = sorted[Math.floor(sorted.length * 0.9)];
  const mid = count === 2 ? sorted[sorted.length >> 1] : Infinity;
  const sums = [new Float64Array(4), new Float64Array(4)];
  px.forEach((p, i) => {
    if (light[i] < lo || light[i] > hi) return;
    const s = sums[light[i] >= mid ? 1 : 0];
    s[0] += smoothed[p * 4];
    s[1] += smoothed[p * 4 + 1];
    s[2] += smoothed[p * 4 + 2];
    s[3]++;
  });
  const means = sums.filter((s) => s[3] > 0).map((s): RGB => [s[0] / s[3], s[1] / s[3], s[2] / s[3]]);
  if (means.length === 0) return null;
  if (means.length === 2) {
    // [shadow, lit]: soften the shadow toward the lit tone.
    const [dark, lit] = means;
    means[0] = dark.map((v, c) => v + (lit[c] - v) * SHADOW_SOFTEN) as RGB;
  }
  const lit = means[means.length - 1];
  const litLuma = 0.299 * lit[0] + 0.587 * lit[1] + 0.114 * lit[2];
  const boost = Math.min(FACE_MAX_BOOST, Math.max(1, FACE_MIN_LUMA / Math.max(1, litLuma)));
  const rgb = means.map((m) => m.map((v) => Math.min(255, Math.round(v * boost))) as RGB);
  const out = new Float32Array(rgb.length * 3);
  rgb.forEach((c, i) => rgbToLab(c[0], c[1], c[2], out, i * 3));
  return { rgb, lab: out };
}

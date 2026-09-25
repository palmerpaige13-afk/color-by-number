// Faces. Skin, hair and background are often close in color, so after quantizing, a face can
// share colors with what's around it and melt into it: no outline gets drawn where two
// touching areas have the same palette color.
//
// To keep every face distinct, each face's pixels get their own "twin" palette entries (same
// colors, new indices). Shading inside the face survives as separate shapes, but every face
// pixel differs from every background pixel by index, so the face is always outlined, and
// region merging keeps face shapes and background shapes apart (see `group`).
//
// The face area comes from, in order of preference: a face-skin segmentation mask (works at
// any angle, excludes hair), the landmark outline (jaw, chin, hairline), or a flood fill of
// skin-colored pixels outward from the cheeks.

import { labDist2, rgbToLab } from "./color";
import type { FaceShape, RGB, RegionMask } from "./types";

/** ΔE from the face's typical skin color within which a pixel counts as skin (fallback). */
const SKIN_TOLERANCE = 20;

export interface FaceRegions {
  palette: RGB[];
  paletteLab: Float32Array;
  /** Per palette entry: 0 for the photo's own colors, k + 1 for twins used by face k. */
  group: Uint8Array;
  /** Per pixel: k + 1 inside face k, else 0. */
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
  basePalette: RGB[],
  baseLab: Float32Array,
  w: number,
  h: number,
  faceless = false,
): FaceRegions {
  const mask = new Uint8Array(w * h);
  faces.forEach((f, k) => {
    if (f.skin) paintSkin(f.skin, mask, k + 1, w, h);
    else if (f.outline && f.outline.length >= 3) fillPolygon(f.outline, mask, k + 1, w, h);
    else floodSkin(f, smoothed, mask, k + 1, w, h);
  });

  const palette = [...basePalette];
  const labs: number[] = Array.from(baseLab);
  const group: number[] = basePalette.map(() => 0);
  // Faceless: each face is a single shape in its most common color.
  const faceColor = new Map<number, number>();
  if (faceless) {
    const counts = faces.map(() => new Uint32Array(basePalette.length));
    for (let p = 0; p < mask.length; p++) if (mask[p]) counts[mask[p] - 1][indices[p]]++;
    counts.forEach((c, k) => faceColor.set(k + 1, c.indexOf(Math.max(...c))));
  }

  const twins = new Map<number, number>(); // face * 256 + base color -> twin index
  for (let p = 0; p < mask.length; p++) {
    const k = mask[p];
    if (!k) continue;
    const base = faceColor.get(k) ?? indices[p];
    const id = k * 256 + base;
    let twin = twins.get(id);
    if (twin === undefined) {
      if (palette.length >= 255) continue; // out of indices; leave this pixel as it was
      twin = palette.length;
      twins.set(id, twin);
      palette.push(basePalette[base]);
      labs.push(baseLab[base * 3], baseLab[base * 3 + 1], baseLab[base * 3 + 2]);
      group.push(k);
    }
    indices[p] = twin;
  }
  return { palette, paletteLab: Float32Array.from(labs), group: Uint8Array.from(group), mask };
}

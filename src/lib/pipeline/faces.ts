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
/** A face-skin area this many times wider than tall, pinched to this share of its halves'
 * height between them, is two faces. */
/** Growing a face into missed skin: within this share of its size from its center, and this ΔE. */
const FACE_GROW_REACH = 0.6;
const FACE_GROW_TOLERANCE = 9;
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
  faces = faces.flatMap(splitDoubleFace);
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
  faces.forEach((f, k) => {
    if (f.skin) {
      const skin = f.skin;
      const data = skin.data.map((v, i) => (v && nearer(k, skin.x + (i % skin.width), skin.y + Math.floor(i / skin.width)) ? 1 : 0));
      paintSkin({ ...skin, data }, parts, k + 1, w, h);
    }
    else if (f.outline && f.outline.length >= 3) fillPolygon(f.outline, parts, k + 1, w, h);
    else floodSkin(f, smoothed, parts, k + 1, w, h);
  });
  growFaces(parts, faces, smoothed, w, h);
  const mask = Uint8Array.from(parts); // faces only
  let next = faces.length + 1;
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
    bodySkin && faces.length ? matchBodySkin(bodySkin, parts, mask, faces.length, lab, w, h, next, 250) : new Map<number, number>();
  for (const k of skinPieces.keys()) next = Math.max(next, k + 1);
  const kindOf = new Map<number, number>();
  for (const k of skinPieces.keys()) kindOf.set(k, PartKind.face);
  faces.forEach((_, i) => kindOf.set(i + 1, PartKind.face));
  for (const k of hairParts.keys()) kindOf.set(k, PartKind.hair);
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
    for (const [piece, k] of skinPieces) {
      const tone = faceTone.get(k);
      if (!tone) continue;
      const base = tone.ids[0];
      const id = add(palette[base], labs.slice(base * 3, base * 3 + 3), piece);
      if (id >= 0) faceTone.set(piece, { ids: [id], tone: new Map() });
    }
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
 * The segmenter sometimes misses part of a face (a cheek in bright light next to blond hair,
 * or a face whose box came out too narrow), leaving it to the background colors. Each face is
 * grown into neighboring pixels of its own skin color, only within a face-sized circle around
 * its center.
 */
function growFaces(parts: Uint8Array, faces: FaceShape[], smoothed: Uint8ClampedArray, w: number, h: number) {
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
        if (q < 0 || q >= parts.length || parts[q]) continue;
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
): Map<number, number> {
  const n = w * h;
  const inSkin = new Uint8Array(n);
  paintSkin(skin, inSkin, 1, w, h);
  for (let p = 0; p < n; p++) if (parts[p]) inSkin[p] = 0;
  const { piece, count } = splitAlongEdges(inSkin, lab, w, h, limit - firstId);

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
      if (pieceSum[i * 6 + 4] / m < bottom[touched]) inFace.add(i);
      continue;
    }
    let best = -1;
    let bestScore = Infinity;
    for (let k = 0; k < faceCount; k++) {
      const f = sum[k * 6 + 5];
      if (!f) continue;
      const color = Math.hypot(...[0, 1, 2].map((c) => pieceSum[i * 6 + c] / m - sum[k * 6 + c] / f));
      const dist = Math.hypot(pieceSum[i * 6 + 3] / m - sum[k * 6 + 3] / f, pieceSum[i * 6 + 4] / m - sum[k * 6 + 4] / f) / faceH;
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

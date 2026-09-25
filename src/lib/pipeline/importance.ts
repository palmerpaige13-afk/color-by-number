// Importance map: 0..1 per pixel, higher where detail should survive simplification.
// Built from detected subjects (faces, people, animals) plus a "man-made structure" score
// that picks out buildings: dense, straight, strong edges (windows, walls, rooflines) as
// opposed to foliage and grass, whose edges are just as strong but point every which way.

import type { FaceShape } from "./types";

/** Detected subject box, in working-raster pixels (faces may carry landmark contours). */
export interface SubjectBox extends FaceShape {
  kind: "face" | "person" | "animal";
}

const SUBJECT_WEIGHT: Record<SubjectBox["kind"], number> = { face: 1, person: 0.6, animal: 0.55 };
const STRUCTURE_WEIGHT = 0.7;

/** Separable box blur (running sums), radius r. */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / (2 * r + 1);
      sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / (2 * r + 1);
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

const smoothstep = (lo: number, hi: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

/** Structure-tensor coherence of strong edges, averaged over a neighborhood. */
export function structureMap(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const n = w * h;
  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  const g = boxBlur(gray, w, h, 1);

  const jxx = new Float32Array(n);
  const jyy = new Float32Array(n);
  const jxy = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const gx =
        g[p - w + 1] + 2 * g[p + 1] + g[p + w + 1] - g[p - w - 1] - 2 * g[p - 1] - g[p + w - 1];
      const gy =
        g[p + w - 1] + 2 * g[p + w] + g[p + w + 1] - g[p - w - 1] - 2 * g[p - w] - g[p - w + 1];
      jxx[p] = gx * gx;
      jyy[p] = gy * gy;
      jxy[p] = gx * gy;
    }
  }

  // Local orientation over a small window: coherence is 1 for a single straight edge,
  // ~0 for texture with no dominant direction.
  const r = Math.max(2, Math.round(Math.max(w, h) / 150));
  const sxx = boxBlur(jxx, w, h, r);
  const syy = boxBlur(jyy, w, h, r);
  const sxy = boxBlur(jxy, w, h, r);
  const edgy = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const tr = sxx[p] + syy[p];
    if (tr < 1) continue;
    const coherence = Math.sqrt((sxx[p] - syy[p]) ** 2 + 4 * sxy[p] ** 2) / tr;
    // Sobel magnitude^2 of ~2500 is a clear edge (~12 gray levels per px after blur).
    edgy[p] = smoothstep(0.55, 0.9, coherence) * smoothstep(400, 4000, tr);
  }

  // Buildings are *dense* in straight edges; a lone horizon or fence line is not.
  const density = boxBlur(edgy, w, h, Math.round(Math.max(w, h) / 30));
  const out = new Float32Array(n);
  for (let p = 0; p < n; p++) out[p] = STRUCTURE_WEIGHT * smoothstep(0.2, 0.4, density[p]);
  return out;
}

/**
 * Soft ellipse per subject box, max-combined with the structure map. The main subject wins:
 * each subject's weight scales with its size relative to the largest of its kind, so people
 * in the background get less priority than the person the photo is of. When a photo has a
 * clear main subject, buildings behind it are treated as background too.
 */
export function importanceMap(
  structure: Float32Array | null,
  subjects: SubjectBox[],
  w: number,
  h: number,
): { importance: Float32Array; buildings: boolean } {
  const size = (s: SubjectBox) => s.width * s.height;
  const largest: Partial<Record<SubjectBox["kind"], number>> = {};
  for (const s of subjects) largest[s.kind] = Math.max(largest[s.kind] ?? 0, size(s));
  const hasMainSubject = subjects.some((s) => s.kind !== "face" && size(s) > 0.08 * w * h);

  const out = new Float32Array(w * h);
  let buildingPx = 0;
  if (structure) {
    const k = hasMainSubject ? 0.4 : 1;
    for (let p = 0; p < out.length; p++) {
      out[p] = structure[p] * k;
      if (out[p] >= 0.35) buildingPx++;
    }
  }
  for (const s of subjects) {
    const prominence = Math.sqrt(size(s) / (largest[s.kind] || 1));
    const weight = SUBJECT_WEIGHT[s.kind] * Math.max(0.25, prominence);
    // Faces: pad so hair, ears and chin are included.
    const pad = s.kind === "face" ? 0.35 : 0.05;
    const cx = s.x + s.width / 2;
    const cy = s.y + s.height / 2;
    const rx = (s.width / 2) * (1 + pad);
    const ry = (s.height / 2) * (1 + pad);
    const x0 = Math.max(0, Math.floor(cx - rx));
    const x1 = Math.min(w - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(h - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d >= 1) continue;
        const v = weight * (1 - smoothstep(0.6, 1, d));
        const p = y * w + x;
        if (v > out[p]) out[p] = v;
      }
    }
  }
  return { importance: out, buildings: buildingPx > 0.03 * w * h };
}

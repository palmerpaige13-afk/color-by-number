// k-means++ color quantization in Lab space.

import { labDist2, rgbToLab } from "./color";
import type { RGB } from "./types";

const MAX_SAMPLES = 40_000;
const MAX_ITERS = 24;

// Small seeded PRNG so the same photo + settings always gives the same result.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface QuantizeResult {
  /** Palette index per pixel. */
  indices: Uint8Array;
  palette: RGB[];
  /** Palette colors in Lab, 3 floats per entry. */
  paletteLab: Float32Array;
}

/**
 * `weights` (0..1 per pixel) biases the palette toward important pixels: they are sampled up to
 * 2.5x more often, so e.g. skin tones get their own colors instead of merging into the background.
 * Pixels with `exclude` set are never sampled (a cut-out background), so no palette colors are
 * spent on them.
 */
export function quantize(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  k: number,
  weights?: Float32Array,
  exclude?: Uint8Array,
): QuantizeResult {
  const n = w * h;
  const lab = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], lab, i * 3);

  const rand = mulberry32(0x5eed);
  let eligible = n;
  if (exclude) for (let i = 0; i < n; i++) eligible -= exclude[i];
  const sampleCount = Math.min(eligible, MAX_SAMPLES);
  const samples = new Uint32Array(sampleCount);
  for (let i = 0; i < sampleCount; ) {
    const p = Math.floor(rand() * n);
    if (exclude?.[p]) continue;
    if (!weights || rand() < 0.4 + 0.6 * weights[p]) samples[i++] = p;
  }

  // k-means++ seeding.
  const centers = new Float32Array(k * 3);
  const first = samples[Math.floor(rand() * sampleCount)];
  centers.set(lab.subarray(first * 3, first * 3 + 3), 0);
  const nearest = new Float64Array(sampleCount).fill(Infinity);
  for (let c = 1; c < k; c++) {
    let total = 0;
    for (let s = 0; s < sampleCount; s++) {
      const d = labDist2(lab, samples[s] * 3, centers, (c - 1) * 3);
      if (d < nearest[s]) nearest[s] = d;
      total += nearest[s];
    }
    let target = rand() * total;
    let pick = sampleCount - 1;
    for (let s = 0; s < sampleCount; s++) {
      target -= nearest[s];
      if (target <= 0) {
        pick = s;
        break;
      }
    }
    centers.set(lab.subarray(samples[pick] * 3, samples[pick] * 3 + 3), c * 3);
  }

  // Lloyd iterations on the sample.
  const sums = new Float64Array(k * 3);
  const counts = new Uint32Array(k);
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    sums.fill(0);
    counts.fill(0);
    for (let s = 0; s < sampleCount; s++) {
      const p = samples[s] * 3;
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = labDist2(lab, p, centers, c * 3);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      sums[best * 3] += lab[p];
      sums[best * 3 + 1] += lab[p + 1];
      sums[best * 3 + 2] += lab[p + 2];
      counts[best]++;
    }
    let shift = 0;
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue;
      for (let j = 0; j < 3; j++) {
        const v = sums[c * 3 + j] / counts[c];
        shift = Math.max(shift, Math.abs(v - centers[c * 3 + j]));
        centers[c * 3 + j] = v;
      }
    }
    if (shift < 0.25) break;
  }

  // Assign every pixel; the palette color is the mean RGB of its members.
  const assign = new Uint8Array(n);
  const rgbSums = new Float64Array(k * 3);
  const rgbCounts = new Uint32Array(k);
  for (let i = 0; i < n; i++) {
    let best = 0;
    let bestD = Infinity;
    for (let c = 0; c < k; c++) {
      const d = labDist2(lab, i * 3, centers, c * 3);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    assign[i] = best;
    rgbSums[best * 3] += data[i * 4];
    rgbSums[best * 3 + 1] += data[i * 4 + 1];
    rgbSums[best * 3 + 2] += data[i * 4 + 2];
    rgbCounts[best]++;
  }

  // Drop empty clusters and order the palette dark -> light so the key reads naturally.
  const used: number[] = [];
  for (let c = 0; c < k; c++) if (rgbCounts[c] > 0) used.push(c);
  used.sort((a, b) => centers[a * 3] - centers[b * 3]);
  const remap = new Uint8Array(k);
  const palette: RGB[] = [];
  const paletteLab = new Float32Array(used.length * 3);
  used.forEach((c, idx) => {
    remap[c] = idx;
    const rgb: RGB = [
      Math.round(rgbSums[c * 3] / rgbCounts[c]),
      Math.round(rgbSums[c * 3 + 1] / rgbCounts[c]),
      Math.round(rgbSums[c * 3 + 2] / rgbCounts[c]),
    ];
    palette.push(rgb);
    rgbToLab(rgb[0], rgb[1], rgb[2], paletteLab, idx * 3);
  });
  for (let i = 0; i < n; i++) assign[i] = remap[assign[i]];

  return { indices: assign, palette, paletteLab };
}

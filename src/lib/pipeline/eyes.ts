// Pet eyes. A dog or cat's eyes are often only a few pixels across, and in dark fur they
// vanish entirely, yet a pet without eyes looks wrong. So each pet gets two eyes, printed
// already colored in: found as the two best matching dark spots (darker than the fur around
// them) in the head, or, when there's no clear pair, placed where a pet's eyes usually are.
//
// The head is found from the detector's box around the pet together with the traced outline:
// the segmenter often misses a fluffy head entirely (the outline stops at the shoulders) while
// the box always includes it.

import type { Box, RegionMask } from "./types";

export interface Eye {
  x: number;
  y: number;
  r: number;
}

/** The head is taken as this top share of the pet's box (a sitting dog's head is ~35%). */
const HEAD_SHARE = 0.38;
/** An eye must be at least this much darker (0–255) than the fur around it on nearly every side. */
const EYE_CONTRAST = 35;
/** ...and dark in itself. */
const EYE_MAX_LUMA = 80;

export function petEyes(data: Uint8ClampedArray, pet: RegionMask & { box?: Box }, w: number, h: number): Eye[] {
  const outline = outlineBox(pet);
  const box = pet.box ?? outline;
  if (!box || !outline) return [];
  // Where the head is: if the outline starts well below the top of the box, the segmenter
  // missed the head and it's the part of the box above the outline; otherwise the top of it.
  const missedHead = outline.y - box.y > box.height * 0.2;
  const top = Math.max(0, Math.floor(box.y));
  // (A missed head still overlaps the top of the traced body, down to the chin.)
  const headH = Math.max(4, missedHead ? (outline.y - box.y) * 1.5 : box.height * HEAD_SHARE);
  // The head sits above the top of the body: center on the outline's topmost rows.
  const cx = topCenter(pet) ?? box.x + box.width / 2;
  const headW = Math.max(4, Math.min(box.width, headH * 1.2));
  const left = Math.max(0, Math.floor(cx - headW / 2));
  const right = Math.min(w - 1, Math.ceil(cx + headW / 2));

  const luma = (x: number, y: number) => {
    const p = (y * w + x) * 4;
    return 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  };

  // Pixels clearly darker than their surroundings (a ring a few pixels out), in the head.
  const ring = Math.max(2, Math.round(headW * 0.06));
  const y0 = top + Math.floor(headH * 0.15);
  const y1 = Math.min(h - 1, top + Math.ceil(headH * 0.85));
  const dark = new Set<number>();
  for (let y = y0; y <= y1; y++) {
    for (let x = left; x <= right; x++) {
      const l = luma(x, y);
      if (l > EYE_MAX_LUMA) continue;
      // Lighter on nearly every side, like an eye; not just the dark side of a fur edge.
      let lighter = 0;
      for (const [dx, dy] of [[ring, 0], [-ring, 0], [0, ring], [0, -ring], [ring, ring], [-ring, -ring], [ring, -ring], [-ring, ring]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && luma(xx, yy) - l >= EYE_CONTRAST) lighter++;
      }
      if (lighter >= 6) dark.add(y * w + x);
    }
  }

  // Group into spots.
  const spots: { x: number; y: number; n: number; lum: number }[] = [];
  const seen = new Set<number>();
  const maxArea = (headW * 0.2) ** 2;
  for (const start of dark) {
    if (seen.has(start)) continue;
    const stack = [start];
    seen.add(start);
    let n = 0;
    let sx = 0;
    let sy = 0;
    let sl = 0;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p - x) / w;
      n++;
      sx += x;
      sy += y;
      sl += luma(x, y);
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (dark.has(q) && !seen.has(q)) {
          seen.add(q);
          stack.push(q);
        }
      }
    }
    if (n >= 2 && n <= maxArea) spots.push({ x: sx / n, y: sy / n, n, lum: sl / n });
  }

  // Best pair: level with each other, a plausible distance apart, dark and similar in size,
  // and about 40% of the way down the head (ears are above, the nose below).
  let best: [(typeof spots)[0], (typeof spots)[0]] | null = null;
  let bestScore = Infinity;
  for (let a = 0; a < spots.length; a++) {
    for (let b = a + 1; b < spots.length; b++) {
      const [p, q] = [spots[a], spots[b]];
      const dx = Math.abs(p.x - q.x);
      const dy = Math.abs(p.y - q.y);
      if (dy > headH * 0.15 || dx < headW * 0.15 || dx > headW * 0.5) continue;
      const sizeMatch = Math.abs(Math.log(p.n / q.n));
      const off = Math.abs(((p.y + q.y) / 2 - top) / headH - 0.42);
      const score = (p.lum + q.lum) / 255 + sizeMatch + (dy / headH) * 2 + off * 2;
      if (score < bestScore) {
        bestScore = score;
        best = [p, q];
      }
    }
  }

  const r = Math.max(1.6, headW * 0.028);
  if (best) {
    return best.map((s) => ({ x: s.x + 0.5, y: s.y + 0.5, r: Math.min(r * 1.6, Math.max(r, Math.sqrt(s.n / Math.PI))) }));
  }
  // No clear pair: where a pet facing the camera has its eyes.
  const y = top + headH * 0.45;
  return [
    { x: cx - headW * 0.12, y, r },
    { x: cx + headW * 0.12, y, r },
  ];
}

/** Mean x of the outline's topmost rows (the top of the body, under the head). */
function topCenter(pet: RegionMask): number | null {
  for (let y = 0; y < pet.height; y++) {
    let sum = 0;
    let n = 0;
    for (let yy = y; yy < Math.min(pet.height, y + 4); yy++) {
      for (let x = 0; x < pet.width; x++) {
        if (pet.data[yy * pet.width + x]) {
          sum += pet.x + x;
          n++;
        }
      }
    }
    if (n >= 6) return sum / n;
  }
  return null;
}

function outlineBox(pet: RegionMask): Box | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = 0; y < pet.height; y++) {
    for (let x = 0; x < pet.width; x++) {
      if (!pet.data[y * pet.width + x]) continue;
      x0 = Math.min(x0, pet.x + x);
      y0 = Math.min(y0, pet.y + y);
      x1 = Math.max(x1, pet.x + x);
      y1 = Math.max(y1, pet.y + y);
    }
  }
  return x1 >= x0 ? { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 } : null;
}

export interface Nose {
  x: number;
  y: number;
  /** Half-width and half-height. */
  rx: number;
  ry: number;
}

/**
 * The pet's nose, printed already colored in: the darkest spot on the muzzle below the eyes
 * (darker than the muzzle around it), or where a pet's nose usually sits.
 */
export function petNose(data: Uint8ClampedArray, eyes: Eye[], w: number, h: number): Nose | null {
  if (eyes.length !== 2) return null;
  const [a, b] = eyes;
  const d = Math.max(3, Math.hypot(a.x - b.x, a.y - b.y));
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const luma = (x: number, y: number) => {
    const p = (Math.round(y) * w + Math.round(x)) * 4;
    return 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  };
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

  // Search the muzzle: centered under the eyes, from half an eye-gap to two eye-gaps down.
  const ring = Math.max(2, Math.round(d * 0.35));
  let best: { x: number; y: number; score: number } | null = null;
  for (let y = Math.round(my + d * 0.5); y <= Math.round(my + d * 2); y++) {
    for (let x = Math.round(mx - d * 0.5); x <= Math.round(mx + d * 0.5); x++) {
      if (!inside(x, y)) continue;
      const l = luma(x, y);
      if (l > EYE_MAX_LUMA) continue;
      let lighter = 0;
      for (const [dx, dy] of [[ring, 0], [-ring, 0], [0, ring], [0, -ring], [ring, ring], [-ring, -ring], [ring, -ring], [-ring, ring]]) {
        if (inside(x + dx, y + dy) && luma(x + dx, y + dy) - l >= EYE_CONTRAST) lighter++;
      }
      if (lighter < 5) continue;
      // Prefer dark, centered, and close to the usual spot (about one eye-gap below the eyes).
      const score = l / 255 + Math.abs(x - mx) / d + Math.abs(y - (my + d * 1.1)) / d;
      if (!best || score < best.score) best = { x, y, score };
    }
  }
  const x = best ? best.x + 0.5 : mx;
  const y = best ? best.y + 0.5 : my + d * 1.1;
  return { x, y, rx: Math.max(1.5, d * 0.3), ry: Math.max(1.2, d * 0.2) };
}

/**
 * Finds a pet's nose and eyes in a close-up of its head (pixels of any size, e.g. taken from
 * the full-resolution photo): the nose as the strongest dark spot with lighter fur around it,
 * and the eyes placed from it in dog proportions. Returns positions in the close-up's pixels,
 * or null if no nose is found.
 */
export function findPetFace(
  data: Uint8ClampedArray,
  W: number,
  H: number,
): { eyes: Eye[]; nose: Nose | null } | null {
  const luma = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) luma[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  const ring = Math.max(2, Math.round(W * 0.035));
  const dirs = [[ring, 0], [-ring, 0], [0, ring], [0, -ring], [ring, ring], [-ring, -ring], [ring, -ring], [-ring, ring]];
  const dark = new Uint8Array(W * H);
  for (let y = ring; y < H - ring; y++) {
    for (let x = ring; x < W - ring; x++) {
      const l = luma[y * W + x];
      if (l > 90) continue;
      let lighter = 0;
      for (const [dx, dy] of dirs) if (luma[(y + dy) * W + x + dx] - l >= 30) lighter++;
      if (lighter >= 5) dark[y * W + x] = 1;
    }
  }

  type Spot = { x: number; y: number; n: number; lum: number; w: number; h: number };
  const spots: Spot[] = [];
  const seen = new Uint8Array(W * H);
  const maxArea = (W * 0.12) ** 2;
  for (let start = 0; start < W * H; start++) {
    if (!dark[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let n = 0, sx = 0, sy = 0, sl = 0;
    let x0 = W, x1 = 0, y0 = H, y1 = 0;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % W;
      const y = (p - x) / W;
      n++;
      sx += x;
      sy += y;
      sl += luma[p];
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) {
        if (q >= 0 && q < W * H && dark[q] && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (n >= 4 && n <= maxArea) spots.push({ x: sx / n, y: sy / n, n, lum: sl / n, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }

  // The nose is the most reliable feature: a dark spot surrounded by the lighter muzzle on
  // nearly every side. (Eyes are often inside dark fur, and the dark side of a fur edge only
  // has light on one side.) Take the dark spot with the lightest, most complete ring around it.
  const ringStats = (s: Spot) => {
    const r = Math.max(s.w, s.h) * 0.8 + 2;
    let lighter = 0;
    let sum = 0;
    let n = 0;
    for (let k = 0; k < 16; k++) {
      const x = Math.round(s.x + Math.cos((k / 16) * Math.PI * 2) * r);
      const y = Math.round(s.y + Math.sin((k / 16) * Math.PI * 2) * r);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const l = luma[y * W + x];
      n++;
      sum += l;
      if (l - s.lum >= 40) lighter++;
    }
    return { lighter, mean: n ? sum / n : 0 };
  };
  let nose: Spot | null = null;
  let noseScore = -Infinity;
  for (const s of spots) {
    if (s.y < H * 0.25 || s.w > s.h * 3 || s.h > s.w * 3) continue;
    const ring = ringStats(s);
    if (ring.lighter < 11) continue;
    const score = (ring.mean - s.lum) * Math.sqrt(s.n);
    if (score > noseScore) {
      noseScore = score;
      nose = s;
    }
  }
  if (!nose) return null;

  // Eyes from the nose, in dog proportions: ~2 nose-widths apart and about that far above.
  const noseW = Math.max(nose.w, nose.h * 1.3);
  const gap = Math.min(W * 0.3, Math.max(W * 0.08, noseW * 2));
  const ey = nose.y - gap * 0.9;
  const eye = (x: number) => ({ x: x + 0.5, y: ey + 0.5, r: Math.max(1.5, gap * 0.13) });
  return {
    eyes: [eye(nose.x - gap / 2), eye(nose.x + gap / 2)],
    nose: {
      x: nose.x + 0.5,
      y: nose.y + 0.5,
      rx: Math.min(gap * 0.22, Math.max(nose.w / 2, gap * 0.15)),
      ry: Math.min(gap * 0.17, Math.max(nose.h / 2, gap * 0.11)),
    },
  };
}

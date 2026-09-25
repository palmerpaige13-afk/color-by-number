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
  const headH = Math.max(4, missedHead ? outline.y - box.y : box.height * HEAD_SHARE);
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
  // and high in the head (a nose is a single dark spot lower down).
  let best: [(typeof spots)[0], (typeof spots)[0]] | null = null;
  let bestScore = Infinity;
  for (let a = 0; a < spots.length; a++) {
    for (let b = a + 1; b < spots.length; b++) {
      const [p, q] = [spots[a], spots[b]];
      const dx = Math.abs(p.x - q.x);
      const dy = Math.abs(p.y - q.y);
      if (dy > headH * 0.2 || dx < headW * 0.08 || dx > headW * 0.5) continue;
      const sizeMatch = Math.abs(Math.log(p.n / q.n));
      const low = ((p.y + q.y) / 2 - top) / headH;
      const score = (p.lum + q.lum) / 255 + sizeMatch + (dy / headH) * 2 + low;
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

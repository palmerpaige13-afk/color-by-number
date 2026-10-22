// Mystery pages from a photo: the picture cut into random puzzle-like pieces (Voronoi cells),
// small where the photo has detail (a face, a hand) and bigger where it's plain, each in the
// photo's color there. The pieces never follow the picture's outlines, and pieces of one color
// that touch are given colors one shade apart (the same to the eye), so they stay separate
// shapes and no outline of the picture shows on the page to color. Every shade has its own
// number, handed out at random, so the numbers don't give it away either.

import { SIZE, type HalloweenDesign } from "@/lib/halloween/designs";
import type { HalloweenPage } from "@/lib/halloween/make";
import { labToRgb, rgbToLab } from "@/lib/pipeline/color";

export interface CellOptions {
  /** Smallest and biggest spacing between pieces (drawing units; the picture is 400 wide). */
  small: number;
  big: number;
  /** Colors (before shades). */
  colors: number;
  seed: string;
}

export const CELL_DEFAULTS: CellOptions = { small: 6, big: 17, colors: 14, seed: "mystery" };

function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

type Pt = [number, number];

/** Box blur of a single-channel image, radius r, done twice (close to a Gaussian). */
function blur(a: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(a.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let x = -r; x <= r; x++) s += a[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = s / (2 * r + 1);
        s += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = s / (2 * r + 1);
        s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
  }
}

/** The photo as a mystery drawing (400 wide, its own shape). */
export async function mysteryDesign(id: string, title: string, src: string, opt: CellOptions = CELL_DEFAULTS): Promise<HalloweenDesign> {
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = src;
  });
  const W = SIZE;
  const H = Math.round((SIZE * img.naturalHeight) / img.naturalWidth);
  // The photo at one pixel per drawing unit, in Lab.
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, W, H);
  const rgba = ctx.getImageData(0, 0, W, H).data;
  const lab = new Float32Array(W * H * 3);
  for (let p = 0; p < W * H; p++) rgbToLab(rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2], lab, p * 3);

  // Detail: how much the color changes, spread out a little, 0 (plain) to 1 (busy).
  const detail = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      let g = 0;
      for (let k = 0; k < 3; k++) {
        const dx = lab[(p + 1) * 3 + k] - lab[(p - 1) * 3 + k];
        const dy = lab[(p + W) * 3 + k] - lab[(p - W) * 3 + k];
        g += dx * dx + dy * dy;
      }
      detail[p] = Math.sqrt(g);
    }
  }
  blur(detail, W, H, 4);
  const sorted = Float32Array.from(detail).sort();
  const hi = sorted[Math.floor(sorted.length * 0.9)] || 1;
  for (let p = 0; p < W * H; p++) detail[p] = Math.min(1, detail[p] / hi);
  const spacing = (x: number, y: number) => {
    const d = detail[Math.min(H - 1, Math.max(0, Math.round(y))) * W + Math.min(W - 1, Math.max(0, Math.round(x)))];
    return opt.big - (opt.big - opt.small) * Math.pow(d, 0.7);
  };

  // Seeds: random points no closer than the local spacing (dart throwing on a bucket grid).
  const rand = seeded(opt.seed);
  const B = opt.small;
  const gw = Math.ceil(W / B), gh = Math.ceil(H / B);
  const grid: number[][] = Array.from({ length: gw * gh }, () => []);
  const seeds: Pt[] = [];
  const reach = Math.ceil(opt.big / B);
  const tryAdd = (x: number, y: number) => {
    const s = spacing(x, y);
    const gx = Math.floor(x / B), gy = Math.floor(y / B);
    for (let yy = Math.max(0, gy - reach); yy <= Math.min(gh - 1, gy + reach); yy++) {
      for (let xx = Math.max(0, gx - reach); xx <= Math.min(gw - 1, gx + reach); xx++) {
        for (const j of grid[yy * gw + xx]) {
          const [qx, qy] = seeds[j];
          const m = Math.min(s, spacing(qx, qy));
          if ((qx - x) ** 2 + (qy - y) ** 2 < m * m) return;
        }
      }
    }
    grid[gy * gw + gx].push(seeds.length);
    seeds.push([x, y]);
  };
  for (let i = 0; i < W * H * 0.08; i++) tryAdd(rand() * W, rand() * H);

  // Two rounds of evening out (each seed to the middle of its piece), so pieces are rounder.
  const owner = new Int32Array(W * H);
  const assign = () => {
    const g2 = Math.ceil(opt.big / B) + 1;
    const bucket: number[][] = Array.from({ length: gw * gh }, () => []);
    seeds.forEach(([x, y], i) => bucket[Math.min(gh - 1, Math.floor(y / B)) * gw + Math.min(gw - 1, Math.floor(x / B))].push(i));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const gx = Math.floor(x / B), gy = Math.floor(y / B);
        let best = -1, bd = Infinity;
        for (let r = 1; r <= g2 + 2 && (best < 0 || r <= g2); r++) {
          for (let yy = Math.max(0, gy - r); yy <= Math.min(gh - 1, gy + r); yy++) {
            for (let xx = Math.max(0, gx - r); xx <= Math.min(gw - 1, gx + r); xx++) {
              for (const j of bucket[yy * gw + xx]) {
                const d = (seeds[j][0] - x) ** 2 + (seeds[j][1] - y) ** 2;
                if (d < bd) { bd = d; best = j; }
              }
            }
          }
          if (best >= 0) break;
        }
        owner[y * W + x] = best;
      }
    }
  };
  for (let round = 0; round < 2; round++) {
    assign();
    const sum = new Float64Array(seeds.length * 3);
    for (let p = 0; p < W * H; p++) {
      const i = owner[p];
      sum[i * 3] += p % W;
      sum[i * 3 + 1] += Math.floor(p / W);
      sum[i * 3 + 2]++;
    }
    seeds.forEach((s, i) => {
      if (sum[i * 3 + 2]) { s[0] = sum[i * 3] / sum[i * 3 + 2] + 0.5; s[1] = sum[i * 3 + 1] / sum[i * 3 + 2] + 0.5; }
    });
  }
  assign();

  // Each piece's own color (its average), then the photo's colors picked from all the pieces.
  const n = seeds.length;
  const avg = new Float64Array(n * 4);
  for (let p = 0; p < W * H; p++) {
    const i = owner[p];
    for (let k = 0; k < 3; k++) avg[i * 4 + k] += lab[p * 3 + k];
    avg[i * 4 + 3]++;
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) avg[i * 4 + k] /= avg[i * 4 + 3] || 1;
  const K = opt.colors;
  const centers: number[][] = [];
  // k-means++ start, then refine.
  centers.push([avg[0], avg[1], avg[2]]);
  while (centers.length < K) {
    const d = Array.from({ length: n }, (_, i) => Math.min(...centers.map((cc) => (avg[i * 4] - cc[0]) ** 2 + (avg[i * 4 + 1] - cc[1]) ** 2 + (avg[i * 4 + 2] - cc[2]) ** 2)) * avg[i * 4 + 3]);
    let t = rand() * d.reduce((a, b) => a + b, 0);
    let pick = 0;
    for (; pick < n - 1 && t > d[pick]; pick++) t -= d[pick];
    centers.push([avg[pick * 4], avg[pick * 4 + 1], avg[pick * 4 + 2]]);
  }
  const cls = new Int32Array(n);
  for (let it = 0; it < 12; it++) {
    for (let i = 0; i < n; i++) {
      let best = 0, bd = Infinity;
      centers.forEach((cc, k) => {
        const d = (avg[i * 4] - cc[0]) ** 2 + (avg[i * 4 + 1] - cc[1]) ** 2 + (avg[i * 4 + 2] - cc[2]) ** 2;
        if (d < bd) { bd = d; best = k; }
      });
      cls[i] = best;
    }
    const s = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { s[cls[i]][k] += avg[i * 4 + k] * avg[i * 4 + 3]; if (k === 0) s[cls[i]][3] += avg[i * 4 + 3]; }
    s.forEach((v, k) => { if (v[3]) centers[k] = [v[0] / v[3], v[1] / v[3], v[2] / v[3]]; });
  }

  // Which pieces touch.
  const near = Array.from({ length: n }, () => new Set<number>());
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = owner[y * W + x];
      if (x + 1 < W && owner[y * W + x + 1] !== a) { near[a].add(owner[y * W + x + 1]); near[owner[y * W + x + 1]].add(a); }
      if (y + 1 < H && owner[(y + 1) * W + x] !== a) { near[a].add(owner[(y + 1) * W + x]); near[owner[(y + 1) * W + x]].add(a); }
    }
  }
  // Shades: touching pieces of one color get different shades (in a random order, so a color's
  // shades are spread through the picture rather than in bands).
  const shade = new Int32Array(n).fill(-1);
  const order = Array.from({ length: n }, (_, i) => i).sort(() => rand() - 0.5);
  for (const i of order) {
    const used = new Set<number>();
    for (const j of near[i]) if (cls[j] === cls[i] && shade[j] >= 0) used.add(shade[j]);
    let s = 0;
    while (used.has(s)) s++;
    shade[i] = s;
  }
  // Each shade a color a hair different (the same to the eye), as its own paint.
  const paint = (k: number, s: number) => {
    const [r, g, b] = labToRgb(centers[k][0], centers[k][1], centers[k][2]).map((v) => Math.round(Math.max(0, Math.min(255, v))));
    const rr = Math.max(0, Math.min(255, r + (s % 2 ? 1 : 0) * (r > 250 ? -1 : 1)));
    const gg = Math.max(0, Math.min(255, g + (Math.floor(s / 2) % 2 ? 1 : 0) * (g > 250 ? -1 : 1)));
    const bb = Math.max(0, Math.min(255, b + (Math.floor(s / 4) % 2 ? 1 : 0) * (b > 250 ? -1 : 1)));
    // Never pure white (paper) or the ink color.
    return `#${[rr, gg, bb].map((v) => Math.min(252, v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  };

  // Each piece as a polygon: its box, cut by the halfway line to each nearby seed.
  const polys: string[] = [];
  for (let i = 0; i < n; i++) {
    const [sx, sy] = seeds[i];
    let poly: Pt[] = [[0, 0], [W, 0], [W, H], [0, H]];
    for (const j of near[i]) {
      const [tx, ty] = seeds[j];
      const mx = (sx + tx) / 2, my = (sy + ty) / 2, nx = tx - sx, ny = ty - sy;
      const inside = (p: Pt) => (p[0] - mx) * nx + (p[1] - my) * ny <= 0;
      const out: Pt[] = [];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k], b = poly[(k + 1) % poly.length];
        const ia = inside(a), ib = inside(b);
        if (ia) out.push(a);
        if (ia !== ib) {
          const da = (a[0] - mx) * nx + (a[1] - my) * ny, db = (b[0] - mx) * nx + (b[1] - my) * ny;
          const t = da / (da - db);
          out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
      poly = out;
      if (poly.length < 3) break;
    }
    if (poly.length < 3) continue;
    polys.push(`<polygon points="${poly.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ")}" fill="${paint(cls[i], shade[i])}"/>`);
  }
  return { id, title, height: H, shapes: polys.join(""), ink: "" };
}

/**
 * Hands out the numbers at random (1…N over all the shades), so neither the order of the key
 * nor the numbers on the page hint at the picture. The key lists every number.
 */
export function shuffleNumbers(hp: HalloweenPage, seed: string): HalloweenPage {
  const rand = seeded(seed);
  const key = hp.page.key;
  const perm = key.map((_, i) => i + 1).sort(() => rand() - 0.5);
  const to = new Map(key.map((k, i) => [k.n, perm[i]]));
  const numbers = hp.page.numbers.map((m) => Uint8Array.from(m, (v) => (v ? (to.get(v) ?? v) : 0)));
  const newKey = key.map((k) => ({ n: to.get(k.n)!, rgb: k.rgb })).sort((a, b) => a.n - b.n);
  return { ...hp, page: { ...hp.page, numbers, key: newKey } };
}

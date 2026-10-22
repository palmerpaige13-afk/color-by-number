// Mystery pages: a picture as a honeycomb of same-sized cells, each in the picture's color
// there. The page to color is just numbered hexagons, so nothing gives the picture away until
// it's colored in. Cells are drawn slightly apart (white grout), so neighbors in the same
// color stay separate shapes.

import { SIZE, type HalloweenDesign } from "@/lib/halloween/designs";

/** Cells across the picture. */
export const HEX_ACROSS = 22;

function loadSvg(markup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't draw the picture"));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });
}

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** The design as a honeycomb: each cell takes the color most of it has (the drawing's details included). */
export async function hexDesign(design: HalloweenDesign, across = HEX_ACROSS): Promise<HalloweenDesign> {
  const H = design.height ?? SIZE;
  const R = 2;
  const img = await loadSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${H}" width="${SIZE * R}" height="${H * R}" shape-rendering="crispEdges">${design.shapes}${design.ink}</svg>`);
  const c = document.createElement("canvas");
  c.width = SIZE * R;
  c.height = H * R;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  // The drawing's own paints, and its ink as a dark paint of its own; white highlights read as cream.
  const paints = [...new Set([...design.shapes.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase()))];
  // Ink (eyes) is a near-black paint of its own: true ink would be left uncolored.
  paints.push("#3B302C");
  // White highlights (eye shines) would be blank paper: they're a pale cream to color.
  paints.push("#F6F0E2");
  const rgbs = paints.map(hex);
  const nearest = (r: number, g: number, b: number) => {
    let best = 0, bd = Infinity;
    rgbs.forEach((c, i) => {
      const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  };
  // Pointy-top hexagons: width w, rows 3/4 of the height apart, every other row shifted half a cell.
  const w = SIZE / across;
  const r = w / Math.sqrt(3);
  const dy = r * 1.5;
  const rows = Math.ceil(H / dy) + 1;
  const cells: string[] = [];
  for (let row = 0; row < rows; row++) {
    const cy = row * dy;
    const shift = row % 2 ? w / 2 : 0;
    for (let col = -1; col <= across; col++) {
      const cx = col * w + shift + w / 2;
      // Whole cells only (a honeycomb edge): a cut cell is too small for its number.
      if (cx - w / 2 < 0 || cx + w / 2 > SIZE || cy - r < 0 || cy + r > H) continue;
      // Vote over points inside the cell.
      const votes = new Map<number, number>();
      for (let sy = -0.8; sy <= 0.8; sy += 0.2) {
        for (let sx = -0.8; sx <= 0.8; sx += 0.2) {
          const x = Math.round((cx + sx * w * 0.5) * R), y = Math.round((cy + sy * r) * R);
          if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
          const p = (y * c.width + x) * 4;
          // Pure white (shines) reads as the pale cream.
          const k = data[p] > 250 && data[p + 1] > 250 && data[p + 2] > 250 ? paints.length - 1 : nearest(data[p], data[p + 1], data[p + 2]);
          votes.set(k, (votes.get(k) ?? 0) + 1);
        }
      }
      if (!votes.size) continue;
      const k = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const s = 0.9; // grout
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = ((60 * i - 30) * Math.PI) / 180;
        return `${(cx + r * s * Math.cos(a)).toFixed(2)},${(cy + r * s * Math.sin(a)).toFixed(2)}`;
      }).join(" ");
      cells.push(`<polygon points="${pts}" fill="${paints[k]}"/>`);
    }
  }
  return { id: `${design.id}-hex`, title: design.title, height: design.height, shapes: cells.join(""), ink: "" };
}

import type { HalloweenPage } from "@/lib/halloween/make";

/** A small repeatable random number generator. */
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

/** A color gets one more number for every this many cells (up to five). */
const CELLS_PER_NUMBER = 90;

/**
 * Hides the picture in the numbers too: each color gets several numbers (more for colors with
 * many cells), handed out at random to its cells, and the numbers are shuffled among the
 * colors, so the numbered sheet reads as random digits. The key lists every number's color.
 */
export function scrambleNumbers(hp: HalloweenPage): HalloweenPage {
  const rand = seeded(hp.design.id);
  const layer = hp.page.layers[0].result;
  const count = new Map<number, number>(); // palette color -> cells
  for (let i = 0; i < layer.regionCount; i++) {
    const c = layer.regionColor[i];
    if (c === layer.background) continue;
    count.set(c, (count.get(c) ?? 0) + 1);
  }
  // How many numbers each color gets, then which ones (shuffled 1…N).
  // Every color with more than a few cells gets at least three numbers, big areas more, so
  // no clump of one number traces a shape.
  const per = [...count.entries()].map(([c, n]) => ({ c, k: n < 6 ? 1 : n < 16 ? 2 : Math.min(5, 3 + Math.floor(n / CELLS_PER_NUMBER)) }));
  const total = per.reduce((t, p) => t + p.k, 0);
  const nums = Array.from({ length: total }, (_, i) => i + 1).sort(() => rand() - 0.5);
  const of = new Map<number, number[]>();
  let at = 0;
  for (const p of per) of.set(p.c, nums.slice(at, (at += p.k)));
  const labels = [
    Array.from({ length: layer.regionCount }, (_, i) => {
      const list = of.get(layer.regionColor[i]);
      return list ? String(list[Math.floor(rand() * list.length)]) : undefined;
    }),
  ];
  const key = [...of.entries()].flatMap(([c, list]) => list.map((n) => ({ n, rgb: layer.palette[c] }))).sort((a, b) => a.n - b.n);
  // Each color's first number stands for it in the colored picture.
  const numbers = hp.page.numbers.map((m) => Uint8Array.from(m, (_, c) => of.get(c)?.[0] ?? 0));
  return { ...hp, page: { ...hp.page, labels, key, numbers } };
}

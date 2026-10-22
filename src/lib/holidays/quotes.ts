// Quote pages: a short saying in big letters to color, framed by flowers, drawn here (so
// they're free to use and sell), the same way as the holiday pictures (see
// halloween/designs.ts): 400 × 400 flat colors, with small words and stems printed already.
// DRAFT: five options of each of two sayings, to show; the letters are SVG text for now.

import { C, INK, flower, line, star, type HalloweenDesign } from "@/lib/halloween/designs";

/** A leaf pointing up, centered at (cx, cy), turned by `deg`. */
function leaf(cx: number, cy: number, s: number, deg: number, fill: string) {
  return `<path transform="translate(${cx} ${cy}) rotate(${deg}) scale(${s})" d="M0 -30 Q20 -12 14 10 Q7 24 0 30 Q-7 24 -14 10 Q-20 -12 0 -30 Z" fill="${fill}"/>`;
}

/** A poppy: four round petals and a dark middle. */
function poppy(cx: number, cy: number, r: number, petal: string, dark: string) {
  const p = [0, 90, 180, 270]
    .map((a) => {
      const t = (a * Math.PI) / 180;
      return `<circle cx="${(cx + r * 0.5 * Math.cos(t)).toFixed(1)}" cy="${(cy + r * 0.5 * Math.sin(t)).toFixed(1)}" r="${r * 0.62}" fill="${petal}"/>`;
    })
    .join("");
  return `${p}<circle cx="${cx}" cy="${cy}" r="${r * 0.3}" fill="${dark}"/>`;
}

/** A daisy: eight long petals around a round middle. */
function daisy(cx: number, cy: number, r: number, petal: string, middle: string) {
  const p = Array.from({ length: 8 }, (_, i) => `<ellipse cx="${cx}" cy="${cy - r * 0.62}" rx="${r * 0.22}" ry="${r * 0.42}" transform="rotate(${i * 45} ${cx} ${cy})" fill="${petal}"/>`).join("");
  return `${p}<circle cx="${cx}" cy="${cy}" r="${r * 0.32}" fill="${middle}"/>`;
}

/** A rose seen from above: rings of petals, darker toward the middle. */
function rose(cx: number, cy: number, r: number, outer: string, mid: string, inner: string) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${outer}"/><circle cx="${cx + r * 0.08}" cy="${cy - r * 0.05}" r="${r * 0.66}" fill="${mid}"/><circle cx="${cx - r * 0.05}" cy="${cy + r * 0.04}" r="${r * 0.32}" fill="${inner}"/>`;
}

/** A tulip on its stem (stem printed): a cup of three petals. */
function tulip(x: number, y: number, s: number, petal: string, side: string) {
  return `<path transform="translate(${x} ${y}) scale(${s})" d="M-16 -10 Q-18 -34 -8 -40 L0 -26 L8 -40 Q18 -34 16 -10 Q0 4 -16 -10 Z" fill="${petal}"/><path transform="translate(${x} ${y}) scale(${s})" d="M-8 -40 Q0 -48 8 -40 L0 -26 Z" fill="${side}"/>`;
}

/** A butterfly: two pairs of wings and a body. */
function butterfly(cx: number, cy: number, s: number, top: string, bottom: string) {
  return (
    `<g transform="translate(${cx} ${cy}) scale(${s})">` +
    `<ellipse cx="-14" cy="-8" rx="14" ry="11" fill="${top}"/><ellipse cx="14" cy="-8" rx="14" ry="11" fill="${top}"/>` +
    `<ellipse cx="-10" cy="10" rx="9" ry="8" fill="${bottom}"/><ellipse cx="10" cy="10" rx="9" ry="8" fill="${bottom}"/>` +
    `<ellipse cx="0" cy="0" rx="3" ry="16" fill="${C.brown}"/></g>`
  );
}

/** A lavender sprig: buds up a stem (stem printed). */
function lavender(x: number, y: number, h: number, bud: string) {
  return Array.from({ length: 6 }, (_, i) => `<ellipse cx="${x + (i % 2 ? 4 : -4)}" cy="${y - i * (h / 6)}" rx="6" ry="9" fill="${bud}"/>`).join("");
}

/** A colored frame around a cream card. */
function frame(band: string, card = C.cream) {
  return `<rect width="400" height="400" fill="${band}"/><rect x="20" y="20" width="360" height="360" rx="14" fill="${card}"/>`;
}

/** Big letters to color: each letter is a shape of its own, squeezed or stretched to `width`. */
function word(text: string, x: number, y: number, size: number, fill: string, font: string, width?: number, extra = "") {
  const fit = width ? ` textLength="${width}" lengthAdjust="spacingAndGlyphs"` : "";
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="${font}" font-weight="bold" font-size="${size}"${fit} ${extra} fill="${fill}">${text}</text>`;
}

/** Small words printed already (too thin to color). */
function small(text: string, x: number, y: number, size: number, font = "Georgia, serif") {
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="${font}" font-style="italic" font-size="${size}" fill="${INK}">${text}</text>`;
}

/** Letters each in their own color. */
function rainbow(text: string, x: number, y: number, size: number, colors: string[], font: string, width: number) {
  const spans = [...text].map((ch, i) => `<tspan fill="${colors[i % colors.length]}">${ch}</tspan>`).join("");
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="${font}" font-weight="bold" font-size="${size}" textLength="${width}" lengthAdjust="spacingAndGlyphs">${spans}</text>`;
}

/** A sunflower: a ring of pointed petals around a big middle. */
function sunflower(cx: number, cy: number, r: number, petal: string, middle: string) {
  const p = Array.from({ length: 12 }, (_, i) => `<ellipse cx="${cx}" cy="${cy - r * 0.7}" rx="${r * 0.2}" ry="${r * 0.38}" transform="rotate(${i * 30} ${cx} ${cy})" fill="${petal}"/>`).join("");
  return `${p}<circle cx="${cx}" cy="${cy}" r="${r * 0.45}" fill="${middle}"/>`;
}

/** A ring of flowers and leaves around (cx, cy), `n` places, every `every`th a flower. */
function wreath(cx: number, cy: number, R: number, n: number, every: number, flowers: ((x: number, y: number) => string)[], leaves: string[]) {
  let f = 0;
  return Array.from({ length: n }, (_, i) => {
    const a = (i * 2 * Math.PI) / n - Math.PI / 2;
    const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
    return i % every === 0 ? flowers[f++ % flowers.length](x, y) : leaf(x, y, 0.8, (i * 360) / n + 90, leaves[i % leaves.length]);
  }).join("");
}

/** Leaves all the way round the card, alternating colors. */
function garland(leaves: string[]) {
  const out: string[] = [];
  for (let i = 0; i < 9; i++) {
    const x = 44 + i * 39;
    out.push(leaf(x, 40, 0.6, 90, leaves[i % leaves.length]), leaf(x, 360, 0.6, 90, leaves[(i + 1) % leaves.length]));
  }
  for (let i = 1; i < 8; i++) {
    const y = 40 + i * 40;
    out.push(leaf(40, y, 0.6, 0, leaves[(i + 1) % leaves.length]), leaf(360, y, 0.6, 0, leaves[i % leaves.length]));
  }
  return out.join("");
}

/** A flower pot. */
function pot(cx: number, top: number, w: number, h: number, body: string, rim: string) {
  return `<path d="M${cx - w / 2} ${top + 14} L${cx + w / 2} ${top + 14} L${cx + w * 0.38} ${top + h} L${cx - w * 0.38} ${top + h} Z" fill="${body}"/><rect x="${cx - w / 2 - 6}" y="${top}" width="${w + 12}" height="18" rx="4" fill="${rim}"/>`;
}

const BORDER = `<rect x="28" y="28" width="344" height="344" rx="10" fill="none" stroke="${INK}" stroke-width="2"/>`;
const BLOOM_LINE = (y: number, size = 26, font?: string) => small("where you are planted", 200, y, size, font);
const GROW_LINES = (y: number, size = 24, font?: string) => `${small("through what you", 200, y, size, font)}${small("go through", 200, y + size + 4, size, font)}`;

export const QUOTES: HalloweenDesign[] = [
  // Bloom where you are planted
  {
    id: "q-bloom-poppies",
    title: "Bloom: Poppies",
    shapes: `
      ${frame(C.mint)}
      ${word("Bloom", 200, 200, 92, C.magenta, "Rockwell, Georgia, serif", 300)}
      ${leaf(70, 330, 1.1, -20, C.green)}${leaf(100, 300, 0.9, 25, C.darkGreen)}${leaf(330, 330, 1.1, 20, C.green)}${leaf(300, 300, 0.9, -25, C.darkGreen)}
      ${poppy(70, 280, 34, C.red, C.navy)}${poppy(330, 280, 34, C.orange, C.navy)}
      ${poppy(130, 340, 24, C.pink, C.maroon)}${poppy(270, 340, 24, C.peach, C.maroon)}
      ${daisy(200, 345, 24, C.ghost, C.yellow)}
      ${leaf(60, 80, 0.8, -40, C.green)}${leaf(100, 60, 0.8, 40, C.darkGreen)}${leaf(140, 58, 0.7, -60, C.lime)}
      ${leaf(340, 80, 0.8, 40, C.green)}${leaf(300, 60, 0.8, -40, C.darkGreen)}${leaf(260, 58, 0.7, 60, C.lime)}
      ${flower(200, 64, 14, C.lilac, C.gold)}`,
    ink: `${BLOOM_LINE(248, 26, "Rockwell, Georgia, serif")}${line("M60 90 Q120 40 190 62 M340 90 Q280 40 210 62", 3)}${BORDER}`,
  },
  {
    id: "q-bloom-wreath",
    title: "Bloom: Flower Wreath",
    shapes: `
      ${frame(C.pink)}
      ${wreath(200, 200, 142, 14, 2, [(x, y) => rose(x, y, 26, C.red, C.pink, C.maroon), (x, y) => poppy(x, y, 30, C.yellow, C.brown), (x, y) => poppy(x, y, 30, C.orange, C.navy), (x, y) => flower(x, y, 16, C.lilac, C.gold)], [C.green, C.darkGreen])}
      ${word("Bloom", 200, 196, 76, C.purple, "'Arial Rounded MT Bold', Arial, sans-serif", 210)}`,
    ink: `${BLOOM_LINE(236, 19, "'Arial Rounded MT Bold', Arial, sans-serif")}${BORDER}`,
  },
  {
    id: "q-bloom-arch",
    title: "Bloom: Flower Arch",
    shapes: `
      ${frame(C.lilac)}
      ${[0, 1, 2, 3, 4, 5].map((i) => leaf(56, 330 - i * 48, 0.75, i % 2 ? 40 : -40, i % 2 ? C.green : C.darkGreen) + leaf(344, 330 - i * 48, 0.75, i % 2 ? -40 : 40, i % 2 ? C.darkGreen : C.green)).join("")}
      ${[0, 1, 2, 3, 4].map((i) => leaf(110 + i * 45, 50, 0.7, 90 + (i % 2 ? 30 : -30), i % 2 ? C.lime : C.green)).join("")}
      ${poppy(60, 120, 24, C.red, C.navy)}${poppy(340, 120, 24, C.red, C.navy)}
      ${daisy(62, 230, 22, C.ghost, C.gold)}${daisy(338, 230, 22, C.ghost, C.gold)}
      ${rose(200, 52, 22, C.pink, C.magenta, C.maroon)}
      ${lavender(120, 350, 70, C.purple)}${lavender(280, 350, 70, C.purple)}
      ${poppy(165, 340, 22, C.orange, C.brown)}${poppy(235, 340, 22, C.peach, C.brown)}
      ${word("Bloom", 200, 190, 84, C.teal, "Superclarendon, Georgia, serif", 250)}`,
    ink: `${BLOOM_LINE(240, 22, "Superclarendon, Georgia, serif")}${line("M56 360 L56 60 Q200 20 344 60 L344 360 M120 360 L120 290 M280 360 L280 290", 2.5)}${BORDER}`,
  },
  {
    id: "q-bloom-garden",
    title: "Bloom: Flower Garden",
    shapes: `
      ${frame(C.sky)}
      ${word("Bloom", 200, 122, 92, C.magenta, "'Marker Felt', 'Comic Sans MS', sans-serif", 290)}
      ${butterfly(60, 196, 1, C.yellow, C.orange)}${butterfly(340, 196, 1, C.lilac, C.purple)}
      <rect x="20" y="336" width="360" height="44" fill="${C.green}"/>
      ${tulip(60, 280, 1.4, C.red, C.maroon)}${sunflower(120, 236, 30, C.yellow, C.brown)}${tulip(180, 284, 1.4, C.pink, C.magenta)}
      ${poppy(240, 236, 28, C.orange, C.navy)}${tulip(300, 280, 1.4, C.purple, C.darkPurple)}${daisy(348, 236, 22, C.ghost, C.gold)}
      ${leaf(90, 310, 0.9, -40, C.darkGreen)}${leaf(150, 310, 0.9, 40, C.darkGreen)}${leaf(270, 310, 0.9, -40, C.darkGreen)}${leaf(330, 310, 0.9, 40, C.lime)}`,
    ink: `${BLOOM_LINE(170, 26, "'Marker Felt', 'Comic Sans MS', sans-serif")}${line("M60 280 L60 340 M120 266 L120 340 M180 284 L180 340 M240 264 L240 340 M300 280 L300 340 M348 258 L348 340", 3)}${BORDER}`,
  },
  {
    id: "q-bloom-rainbow",
    title: "Bloom: Rainbow Letters",
    shapes: `
      ${frame(C.yellow)}
      ${rainbow("Bloom", 200, 205, 96, [C.red, C.orange, C.gold, C.green, C.blue], "'Chalkboard SE', 'Comic Sans MS', sans-serif", 270)}
      ${Array.from({ length: 7 }, (_, i) => flower(62 + i * 46, 62, 13, [C.pink, C.lilac, C.peach, C.mint][i % 4], C.gold)).join("")}
      ${Array.from({ length: 7 }, (_, i) => flower(62 + i * 46, 338, 13, [C.lilac, C.peach, C.mint, C.pink][i % 4], C.gold)).join("")}
      ${leaf(56, 200, 1, 0, C.green)}${leaf(344, 200, 1, 0, C.green)}`,
    ink: `${BLOOM_LINE(254, 26, "'Chalkboard SE', 'Comic Sans MS', sans-serif")}${BORDER}`,
  },
  // Grow through what you go through
  {
    id: "q-grow-crest",
    title: "Grow: Daisy Crest",
    shapes: `
      ${frame(C.tan)}
      ${word("Grow", 200, 205, 100, C.teal, "'American Typewriter', Georgia, serif", 270)}
      ${daisy(200, 92, 36, C.yellow, C.brown)}${daisy(140, 104, 26, C.ghost, C.gold)}${daisy(260, 104, 26, C.ghost, C.gold)}
      ${leaf(95, 112, 1, -70, C.green)}${leaf(305, 112, 1, 70, C.green)}${leaf(110, 80, 0.8, -30, C.darkGreen)}${leaf(290, 80, 0.8, 30, C.darkGreen)}
      <circle cx="172" cy="56" r="8" fill="${C.purple}"/><circle cx="228" cy="56" r="8" fill="${C.purple}"/><circle cx="200" cy="44" r="8" fill="${C.darkPurple}"/>
      ${daisy(200, 322, 32, C.orange, C.brown)}${daisy(146, 314, 22, C.pink, C.gold)}${daisy(254, 314, 22, C.pink, C.gold)}
      ${leaf(102, 320, 1, -100, C.green)}${leaf(298, 320, 1, 100, C.green)}${leaf(118, 348, 0.8, -130, C.darkGreen)}${leaf(282, 348, 0.8, 130, C.darkGreen)}
      <circle cx="176" cy="356" r="7" fill="${C.purple}"/><circle cx="224" cy="356" r="7" fill="${C.purple}"/>`,
    ink: `${GROW_LINES(244, 24, "'American Typewriter', Georgia, serif")}${BORDER}`,
  },
  {
    id: "q-grow-wreath",
    title: "Grow: Leaf Wreath",
    shapes: `
      ${frame(C.mint)}
      ${wreath(200, 200, 142, 15, 3, [(x, y) => sunflower(x, y, 30, C.yellow, C.brown), (x, y) => rose(x, y, 26, C.peach, C.orange, C.darkOrange), (x, y) => flower(x, y, 16, C.ghost, C.gold)], [C.green, C.darkGreen, C.lime])}
      ${word("Grow", 200, 194, 80, C.darkGreen, "Futura, 'Trebuchet MS', sans-serif", 200)}`,
    ink: `${GROW_LINES(228, 19, "Futura, 'Trebuchet MS', sans-serif")}${BORDER}`,
  },
  {
    id: "q-grow-sprout",
    title: "Grow: Little Sprout",
    shapes: `
      ${frame(C.peach)}
      ${word("Grow", 200, 112, 92, C.green, "'Chalkboard SE', 'Comic Sans MS', sans-serif", 260)}
      ${pot(200, 300, 110, 70, C.darkOrange, C.orange)}
      ${leaf(176, 262, 1.3, -55, C.green)}${leaf(224, 262, 1.3, 55, C.lime)}${leaf(186, 226, 1, -40, C.darkGreen)}${leaf(214, 226, 1, 40, C.green)}
      ${flower(200, 196, 14, C.pink, C.gold)}
      ${butterfly(320, 230, 1, C.lilac, C.purple)}
      <circle cx="80" cy="250" r="22" fill="${C.yellow}"/>`,
    ink: `${GROW_LINES(158, 24, "'Chalkboard SE', 'Comic Sans MS', sans-serif")}${line("M200 300 L200 206", 3)}${BORDER}`,
  },
  {
    id: "q-grow-sunflowers",
    title: "Grow: Sunflowers",
    shapes: `
      ${frame(C.sky)}
      ${sunflower(62, 74, 32, C.yellow, C.brown)}${sunflower(338, 96, 28, C.gold, C.brown)}${sunflower(200, 300, 30, C.yellow, C.brown)}
      ${leaf(44, 300, 1.1, -30, C.green)}${leaf(80, 310, 1, 30, C.darkGreen)}${leaf(320, 300, 1.1, -30, C.green)}${leaf(356, 310, 1, 30, C.darkGreen)}${leaf(160, 320, 0.9, -60, C.green)}${leaf(240, 320, 0.9, 60, C.darkGreen)}
      <rect x="20" y="340" width="360" height="40" fill="${C.green}"/>
      ${word("Grow", 200, 190, 90, C.orange, "'Arial Black', Arial, sans-serif", 220)}`,
    ink: `${GROW_LINES(226, 20, "Georgia, serif")}${line("M62 106 L62 340 M338 124 L338 340 M200 330 L200 340", 3.5)}${BORDER}`,
  },
  {
    id: "q-grow-rainbow",
    title: "Grow: Rainbow Letters",
    shapes: `
      ${frame(C.lilac)}
      ${garland([C.green, C.lime, C.darkGreen])}
      ${rainbow("Grow", 200, 200, 100, [C.red, C.orange, C.green, C.blue], "Impact, 'Arial Black', sans-serif", 250)}
      ${flower(70, 70, 14, C.pink, C.gold)}${flower(330, 70, 14, C.yellow, C.orange)}${flower(70, 330, 14, C.yellow, C.orange)}${flower(330, 330, 14, C.pink, C.gold)}`,
    ink: `${GROW_LINES(246, 24, "Impact, 'Arial Black', sans-serif")}${BORDER}`,
  },
];

// ---- Grown-up quote pages: botanical line-art style, softer colors, script letters. ----

/** Muted paints for the grown-up pages. */
const M = {
  sage: "#9CAF88",
  olive: "#6B7B4B",
  forest: "#3F5B3A",
  rose: "#D9A3A0",
  dustyRose: "#B97470",
  blush: "#F0CFC4",
  mustard: "#D9A441",
  ochre: "#B9832F",
  lavender: "#A99BC9",
  plum: "#6E4E78",
  cream: "#FBF5E8",
  linen: "#EFE6D2",
  terracotta: "#C2694A",
  slateBlue: "#6F86A0",
  wheat: "#E3CB92",
} as const;

/** Thin double-line frame on a linen card, like a framed print. */
function printFrame(card: string = M.cream, band: string = M.linen) {
  return `<rect width="400" height="400" fill="${band}"/><rect x="18" y="18" width="364" height="364" fill="${card}"/>`;
}
const PRINT_BORDER = `<rect x="26" y="26" width="348" height="348" fill="none" stroke="${INK}" stroke-width="1.6"/><rect x="31" y="31" width="338" height="338" fill="none" stroke="${INK}" stroke-width="0.8"/>`;

/** A slim pointed leaf. */
function slimLeaf(cx: number, cy: number, len: number, deg: number, fill: string) {
  return `<path transform="translate(${cx} ${cy}) rotate(${deg})" d="M0 ${-len} Q${len * 0.42} ${-len * 0.25} 0 ${len * 0.35} Q${-len * 0.42} ${-len * 0.25} 0 ${-len} Z" fill="${fill}"/>`;
}

/** Leaves along a curve from (x0,y0) through (qx,qy) to (x1,y1), alternating sides, each growing from the stem (printed). */
function vine(x0: number, y0: number, qx: number, qy: number, x1: number, y1: number, n: number, len: number, fills: string[]) {
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * qx + t * t * x1;
    const y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * qy + t * t * y1;
    const dx = 2 * (1 - t) * (qx - x0) + 2 * t * (x1 - qx);
    const dy = 2 * (1 - t) * (qy - y0) + 2 * t * (y1 - qy);
    const th = Math.atan2(dy, dx) + ((i % 2 ? 1 : -1) * 50 * Math.PI) / 180;
    const cx = x + Math.cos(th) * len * 0.35, cy = y + Math.sin(th) * len * 0.35;
    out.push(slimLeaf(cx, cy, len, (th * 180) / Math.PI + 90, fills[i % fills.length]));
  }
  return out.join("");
}
const vineStem = (x0: number, y0: number, qx: number, qy: number, x1: number, y1: number) => `M${x0} ${y0} Q${qx} ${qy} ${x1} ${y1}`;

/** A fern frond: paired leaflets up a stem (stem printed), pointing `deg`. */
function fern(x: number, y: number, len: number, deg: number, fill: string, fill2: string) {
  const out: string[] = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const d = (i / n) * len;
    const s = (1 - i / n) * len * 0.28 + 4;
    out.push(slimLeaf(-s * 0.6, -d, s, -60, i % 2 ? fill : fill2), slimLeaf(s * 0.6, -d, s, 60, i % 2 ? fill2 : fill));
  }
  return `<g transform="translate(${x} ${y}) rotate(${deg})">${out.join("")}</g>`;
}
const fernStem = (x: number, y: number, len: number, deg: number) => `<g transform="translate(${x} ${y}) rotate(${deg})">${line(`M0 0 L0 ${-len}`, 1.4)}</g>`;

/** A big open poppy: five ruffled petals, a dark middle. */
function bigPoppy(cx: number, cy: number, r: number, petal: string, shade: string, middle: string) {
  const p = Array.from({ length: 5 }, (_, i) => {
    const a = (i * 72 - 90) * (Math.PI / 180);
    return `<ellipse cx="${(cx + r * 0.48 * Math.cos(a)).toFixed(1)}" cy="${(cy + r * 0.48 * Math.sin(a)).toFixed(1)}" rx="${r * 0.56}" ry="${r * 0.48}" transform="rotate(${i * 72} ${(cx + r * 0.48 * Math.cos(a)).toFixed(1)} ${(cy + r * 0.48 * Math.sin(a)).toFixed(1)})" fill="${i % 2 ? shade : petal}"/>`;
  }).join("");
  return `${p}<circle cx="${cx}" cy="${cy}" r="${r * 0.26}" fill="${middle}"/>`;
}

/** A clover head: a cluster of small round florets. */
function clover(cx: number, cy: number, r: number, a: string, b: string) {
  const out: string[] = [];
  for (let ring = 0; ring < 3; ring++) {
    const n = [1, 6, 10][ring], rr = [0, r * 0.45, r * 0.85][ring];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2 + ring;
      out.push(`<circle cx="${(cx + rr * Math.cos(t)).toFixed(1)}" cy="${(cy + rr * Math.sin(t) * 0.9).toFixed(1)}" r="${r * 0.32}" fill="${(i + ring) % 2 ? a : b}"/>`);
    }
  }
  return out.join("");
}

/** A many-petaled daisy or cosmos. */
function cosmos(cx: number, cy: number, r: number, petal: string, petal2: string, middle: string, n = 12) {
  const p = Array.from({ length: n }, (_, i) => `<ellipse cx="${cx}" cy="${cy - r * 0.58}" rx="${r * 0.17}" ry="${r * 0.4}" transform="rotate(${(i * 360) / n} ${cx} ${cy})" fill="${i % 2 ? petal2 : petal}"/>`).join("");
  return `${p}<circle cx="${cx}" cy="${cy}" r="${r * 0.26}" fill="${middle}"/>`;
}

/** A tall lavender or wheat spike: buds in pairs up a stem. */
function spike(x: number, y: number, h: number, deg: number, fill: string, fill2: string) {
  const out = Array.from({ length: 9 }, (_, i) => `<ellipse cx="${i % 2 ? 3.5 : -3.5}" cy="${-i * (h / 9)}" rx="4.5" ry="7" transform="rotate(${i % 2 ? 25 : -25} ${i % 2 ? 3.5 : -3.5} ${-i * (h / 9)})" fill="${i % 3 ? fill : fill2}"/>`).join("");
  return `<g transform="translate(${x} ${y}) rotate(${deg})">${out}</g>`;
}

/** An ivy leaf: three pointed lobes. */
function ivy(cx: number, cy: number, s: number, deg: number, fill: string) {
  return `<path transform="translate(${cx} ${cy}) rotate(${deg}) scale(${s})" d="M0 -16 L5 -6 L15 -8 L10 2 L14 10 L0 7 L-14 10 L-10 2 L-15 -8 L-5 -6 Z" fill="${fill}"/>`;
}

/** A berry sprig: small round berries. */
function berries(cx: number, cy: number, fill: string) {
  return [[0, 0], [7, -5], [-6, -6], [2, -11], [9, 4]].map(([dx, dy]) => `<circle cx="${cx + dx}" cy="${cy + dy}" r="3.6" fill="${fill}"/>`).join("");
}

/** Script word: thickened with an outline in its own color so the letters are wide enough to color. */
function script(text: string, x: number, y: number, size: number, fill: string, font: string, width: number) {
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="${font}" font-size="${size}" textLength="${width}" lengthAdjust="spacingAndGlyphs" fill="${fill}" stroke="${fill}" stroke-width="4.5" stroke-linejoin="round">${text}</text>`;
}
/** Classic serif line printed already. */
function serifLine(text: string, x: number, y: number, size: number, font = "Didot, 'Bodoni 72', Georgia, serif", width?: number) {
  const fit = width ? ` textLength="${width}" lengthAdjust="spacingAndGlyphs"` : "";
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="${font}" font-size="${size}"${fit} fill="${INK}">${text}</text>`;
}

const SNELL = "'Snell Roundhand', 'Apple Chancery', 'Brush Script MT', cursive";
const SAVOYE = "'Savoye LET', 'Snell Roundhand', cursive";
const CHANCERY = "'Apple Chancery', 'Snell Roundhand', cursive";

export const QUOTES_ADULT: HalloweenDesign[] = [
  {
    id: "qa-bloom-meadow",
    title: "Bloom: Wildflower Meadow",
    shapes: `
      ${printFrame()}
      ${vine(60, 330, 50, 180, 110, 60, 9, 22, [M.sage, M.olive])}${vine(340, 330, 350, 180, 290, 60, 9, 22, [M.olive, M.sage])}
      ${vine(110, 60, 200, 30, 290, 60, 8, 20, [M.sage, M.forest])}
      ${bigPoppy(76, 240, 26, M.terracotta, M.dustyRose, M.forest)}${bigPoppy(326, 214, 24, M.rose, M.dustyRose, M.forest)}
      ${bigPoppy(84, 92, 20, M.blush, M.rose, M.olive)}${clover(312, 84, 14, M.rose, M.dustyRose)}
      ${clover(148, 344, 12, M.lavender, M.plum)}${clover(250, 340, 13, M.rose, M.dustyRose)}${clover(200, 352, 11, M.lavender, M.plum)}
      ${spike(112, 342, 80, -8, M.lavender, M.plum)}${spike(292, 342, 80, 8, M.lavender, M.plum)}
      ${fern(170, 366, 70, -24, M.sage, M.olive)}${fern(232, 366, 70, 24, M.olive, M.sage)}
      ${cosmos(330, 296, 18, M.cream, M.wheat, M.mustard)}${cosmos(66, 300, 16, M.wheat, M.cream, M.ochre)}
      ${script("Bloom", 200, 186, 84, M.dustyRose, SNELL, 210)}`,
    ink: `${serifLine("where you are", 200, 226, 22)}${serifLine("planted", 200, 254, 26)}
      ${line(`${vineStem(60, 330, 50, 180, 110, 60)} ${vineStem(340, 330, 350, 180, 290, 60)} ${vineStem(110, 60, 200, 30, 290, 60)}`, 1.4)}
      ${line("M148 356 L148 372 M250 352 L250 372 M200 362 L200 372", 1.2)}
      ${fernStem(170, 366, 70, -24)}${fernStem(232, 366, 70, 24)}${PRINT_BORDER}`,
  },
  {
    id: "qa-bloom-crest",
    title: "Bloom: Poppy Crest",
    shapes: `
      ${printFrame(M.cream, M.blush)}
      ${bigPoppy(200, 86, 30, M.terracotta, M.dustyRose, M.forest)}${cosmos(150, 96, 18, M.wheat, M.cream, M.ochre)}${cosmos(250, 96, 18, M.wheat, M.cream, M.ochre)}
      ${vine(170, 90, 110, 70, 60, 120, 6, 21, [M.sage, M.olive])}${vine(230, 90, 290, 70, 340, 120, 6, 21, [M.olive, M.sage])}
      ${berries(114, 112, M.plum)}${berries(286, 112, M.plum)}
      ${spike(176, 70, 46, -30, M.lavender, M.plum)}${spike(224, 70, 46, 30, M.lavender, M.plum)}
      ${script("Bloom", 200, 210, 92, M.forest, SAVOYE, 230)}
      ${bigPoppy(200, 320, 24, M.rose, M.blush, M.olive)}${clover(156, 326, 12, M.rose, M.dustyRose)}${clover(244, 326, 12, M.rose, M.dustyRose)}
      ${vine(180, 324, 120, 340, 70, 316, 6, 20, [M.sage, M.forest])}${vine(220, 324, 280, 340, 330, 316, 6, 20, [M.forest, M.sage])}`,
    ink: `${serifLine("where you are planted", 200, 258, 20, undefined, 230)}
      ${line(`${vineStem(170, 90, 110, 70, 60, 120)} ${vineStem(230, 90, 290, 70, 340, 120)} ${vineStem(180, 324, 120, 340, 70, 316)} ${vineStem(220, 324, 280, 340, 330, 316)}`, 1.4)}${PRINT_BORDER}`,
  },
  {
    id: "qa-grow-garland",
    title: "Grow: Daisy Garland",
    shapes: `
      ${printFrame(M.cream, M.sage)}
      ${cosmos(200, 92, 28, M.cream, M.wheat, M.mustard, 16)}${cosmos(148, 100, 20, M.mustard, M.wheat, M.ochre)}${cosmos(252, 100, 20, M.mustard, M.wheat, M.ochre)}
      ${vine(130, 104, 90, 80, 52, 130, 6, 21, [M.sage, M.olive])}${vine(270, 104, 310, 80, 348, 130, 6, 21, [M.olive, M.sage])}
      ${ivy(70, 146, 1, -20, M.forest)}${ivy(330, 146, 1, 20, M.forest)}${ivy(96, 160, 0.8, 10, M.olive)}${ivy(304, 160, 0.8, -10, M.olive)}
      ${berries(176, 64, M.plum)}${berries(224, 64, M.plum)}${spike(110, 96, 40, -60, M.wheat, M.ochre)}${spike(290, 96, 40, 60, M.wheat, M.ochre)}
      ${script("Grow", 200, 216, 96, M.dustyRose, SNELL, 200)}
      ${cosmos(200, 324, 24, M.cream, M.wheat, M.mustard, 16)}${cosmos(154, 330, 16, M.rose, M.blush, M.ochre)}${cosmos(246, 330, 16, M.rose, M.blush, M.ochre)}
      ${vine(180, 330, 120, 350, 66, 330, 6, 20, [M.sage, M.forest])}${vine(220, 330, 280, 350, 334, 330, 6, 20, [M.forest, M.sage])}`,
    ink: `${serifLine("through what you", 200, 254, 22)}${serifLine("go through", 200, 284, 28)}
      ${line(`${vineStem(130, 104, 90, 80, 52, 130)} ${vineStem(270, 104, 310, 80, 348, 130)} ${vineStem(180, 330, 120, 350, 66, 330)} ${vineStem(220, 330, 280, 350, 334, 330)}`, 1.4)}
      <path d="M40 52 L40 40 L52 40 M348 40 L360 40 L360 52 M40 348 L40 360 L52 360 M348 360 L360 360 L360 348" fill="none" stroke="${INK}" stroke-width="1.4"/>${PRINT_BORDER}`,
  },
  {
    id: "qa-grow-wreath",
    title: "Grow: Botanical Wreath",
    shapes: `
      ${printFrame(M.cream, M.lavender)}
      ${Array.from({ length: 22 }, (_, i) => {
        const a = (i / 22) * Math.PI * 2;
        const x = 200 + 142 * Math.cos(a), y = 200 + 142 * Math.sin(a);
        return slimLeaf(x, y, 22, (a * 180) / Math.PI + (i % 2 ? 40 : 140), i % 3 ? M.sage : M.olive);
      }).join("")}
      ${bigPoppy(200, 58, 22, M.terracotta, M.dustyRose, M.forest)}${bigPoppy(200, 342, 22, M.rose, M.dustyRose, M.forest)}
      ${cosmos(80, 120, 16, M.wheat, M.cream, M.ochre)}${cosmos(320, 280, 16, M.wheat, M.cream, M.ochre)}
      ${clover(320, 120, 12, M.lavender, M.plum)}${clover(80, 280, 12, M.lavender, M.plum)}
      ${berries(60, 200, M.plum)}${berries(340, 200, M.plum)}
      ${script("Grow", 200, 200, 84, M.plum, CHANCERY, 180)}`,
    ink: `${serifLine("through what you", 200, 238, 19)}${serifLine("go through", 200, 264, 24)}
      <circle cx="200" cy="200" r="142" fill="none" stroke="${INK}" stroke-width="1.2"/>${PRINT_BORDER}`,
  },
];

// ---- 5 × 7 grown-up cards: 400 × 560, about 60–90 shapes (half an hour), 10–12 colors. ----

const CARD_H = 560;

/** A card's colors: card, band around it, three leaf greens, flowers (main, shade, accent, light), word, centers. */
interface Palette { card: string; band: string; leaves: [string, string, string]; main: string; shade: string; accent: string; light: string; word: string; center: string }
const PAL: Record<string, Palette> = {
  rose: { card: M.cream, band: M.blush, leaves: [M.sage, M.olive, M.forest], main: M.dustyRose, shade: M.rose, accent: M.mustard, light: M.blush, word: M.dustyRose, center: M.forest },
  terracotta: { card: M.cream, band: M.linen, leaves: [M.sage, M.olive, M.forest], main: M.terracotta, shade: M.dustyRose, accent: M.mustard, light: M.wheat, word: M.forest, center: M.plum },
  lavender: { card: M.cream, band: M.lavender, leaves: [M.sage, M.olive, M.forest], main: M.lavender, shade: M.plum, accent: M.rose, light: M.blush, word: M.plum, center: M.ochre },
  harvest: { card: M.cream, band: M.wheat, leaves: [M.sage, M.olive, M.forest], main: M.mustard, shade: M.ochre, accent: M.terracotta, light: M.wheat, word: M.terracotta, center: M.forest },
  blue: { card: M.cream, band: M.slateBlue, leaves: [M.sage, M.olive, M.forest], main: M.slateBlue, shade: M.lavender, accent: M.rose, light: M.blush, word: M.slateBlue, center: M.ochre },
};

const CARD_BORDER = `<rect x="22" y="22" width="356" height="516" fill="none" stroke="${INK}" stroke-width="1.6"/><rect x="28" y="28" width="344" height="504" fill="none" stroke="${INK}" stroke-width="0.8"/>`;
const cardFrame = (p: Palette) => `<rect width="400" height="${CARD_H}" fill="${p.band}"/><rect x="14" y="14" width="372" height="532" fill="${p.card}"/>`;

/** Card-sized botanicals: every petal and bud wide enough for a number on a 5 × 7 card. */
const cosmos8 = (cx: number, cy: number, r: number, petal: string, petal2: string, middle: string) => {
  const p = Array.from({ length: 8 }, (_, i) => `<ellipse cx="${cx}" cy="${cy - r * 0.6}" rx="${r * 0.27}" ry="${r * 0.42}" transform="rotate(${i * 45} ${cx} ${cy})" fill="${i % 2 ? petal2 : petal}"/>`).join("");
  return `${p}<circle cx="${cx}" cy="${cy}" r="${r * 0.3}" fill="${middle}"/>`;
};
const budSpike = (x: number, y: number, deg: number, fill: string, fill2: string) =>
  `<g transform="translate(${x} ${y}) rotate(${deg})">${Array.from({ length: 5 }, (_, i) => `<ellipse cx="${i % 2 ? 6 : -6}" cy="${-i * 15}" rx="8" ry="11" transform="rotate(${i % 2 ? 22 : -22} ${i % 2 ? 6 : -6} ${-i * 15})" fill="${i % 2 ? fill : fill2}"/>`).join("")}<ellipse cx="0" cy="-78" rx="7" ry="10" fill="${fill}"/></g>`;
const bloomBall = (cx: number, cy: number, a: string, b: string) =>
  [[0, 0], [0, -17], [15, -8], [15, 9], [0, 17], [-15, 9], [-15, -8]].map(([dx, dy], i) => `<circle cx="${cx + dx}" cy="${cy + dy}" r="8.5" fill="${i % 2 ? a : b}"/>`).join("");
const LEAF = 38;

/** A spray of flowers and leaves centered at (cx, cy), opening up (dir -1) or down (dir 1). */
function spray(cx: number, cy: number, dir: 1 | -1, p: Palette) {
  const [a, b, c] = p.leaves;
  const s = dir;
  return {
    shapes:
      vine(cx - 20, cy, cx - 90, cy + s * 30, cx - 160, cy - s * 8, 4, LEAF, [a, b]) +
      vine(cx + 20, cy, cx + 90, cy + s * 30, cx + 160, cy - s * 8, 4, LEAF, [b, a]) +
      budSpike(cx - 52, cy - s * 6, s < 0 ? -30 : 210, p.shade, p.main) +
      budSpike(cx + 52, cy - s * 6, s < 0 ? 30 : 150, p.shade, p.main) +
      slimLeaf(cx - 30, cy + s * 28, LEAF, s < 0 ? 200 : -20, c) + slimLeaf(cx + 30, cy + s * 28, LEAF, s < 0 ? 160 : 20, c) +
      cosmos8(cx - 64, cy + s * 4, 30, p.light, M.wheat, p.accent) +
      cosmos8(cx + 64, cy + s * 4, 30, p.light, M.wheat, p.accent) +
      bigPoppy(cx, cy, 34, p.main, p.shade, p.center),
    ink: line(`${vineStem(cx - 20, cy, cx - 90, cy + s * 30, cx - 160, cy - s * 8)} ${vineStem(cx + 20, cy, cx + 90, cy + s * 30, cx + 160, cy - s * 8)}`, 1.4),
  };
}

/** The saying: a big script word to color, and its other words printed in a classic serif. */
function saying(word: string, rest: string[], y: number, p: Palette, wordFont: string, restFont: string, wordW = 250) {
  return {
    shapes: `<text x="200" y="${y}" text-anchor="middle" font-family="${wordFont}" font-weight="900" font-size="104" textLength="${wordW}" lengthAdjust="spacingAndGlyphs" fill="${p.word}" stroke="${p.word}" stroke-width="5" stroke-linejoin="round">${word}</text>`,
    ink: rest.map((t, i) => serifLine(t, 200, y + 44 + i * 34, i === rest.length - 1 ? 30 : 24, restFont)).join(""),
  };
}

type Layout = (p: Palette) => { shapes: string; ink: string; textY: number };

/** A small sprig to fill a gap: a few leaves on a short stem (printed) and a flower at its tip. */
function sprig(x: number, y: number, deg: number, p: Palette, flower: "cosmos" | "ball" | "bud" | "poppy") {
  const [a, b, c] = p.leaves;
  const t = (deg * Math.PI) / 180;
  const tx = x + Math.sin(t) * 70, ty = y - Math.cos(t) * 70;
  const head =
    flower === "cosmos" ? cosmos8(tx, ty, 26, p.light, M.wheat, p.accent)
    : flower === "ball" ? bloomBall(tx, ty, p.main, p.shade)
    : flower === "bud" ? budSpike(tx, ty + 20, deg, p.shade, p.main)
    : bigPoppy(tx, ty, 26, p.main, p.shade, p.center);
  return {
    shapes: vine(x, y, x + Math.sin(t) * 35 + 10, y - Math.cos(t) * 35, tx, ty, 3, LEAF, [a, b, c]) + head,
    ink: line(vineStem(x, y, x + Math.sin(t) * 35 + 10, y - Math.cos(t) * 35, tx, ty), 1.4),
  };
}
function fill(...parts: { shapes: string; ink: string }[]) {
  return { shapes: parts.map((q) => q.shapes).join(""), ink: parts.map((q) => q.ink).join("") };
}
/** Extra sprigs for a layout's empty spots. */
const FILL: Record<string, (p: Palette) => { shapes: string; ink: string }> = {
  crest: (p) => fill(sprig(44, 410, 55, p, "ball"), sprig(356, 410, -55, p, "ball"), sprig(38, 330, 8, p, "bud"), sprig(362, 330, -8, p, "bud")),
  arch: (p) => fill(sprig(40, 120, 150, p, "cosmos"), sprig(360, 120, -150, p, "cosmos"), sprig(160, 500, -12, p, "ball"), sprig(240, 500, 12, p, "bud")),
  wreath: (p) => fill(sprig(44, 50, 135, p, "cosmos"), sprig(356, 50, -135, p, "cosmos"), sprig(44, 510, 45, p, "ball"), sprig(356, 510, -45, p, "ball")),
  meadow: (p) => fill(sprig(40, 150, 30, p, "cosmos"), sprig(360, 150, -30, p, "cosmos"), sprig(40, 300, 20, p, "bud"), sprig(360, 300, -20, p, "bud")),
  corners: (p) => fill(sprig(40, 470, 35, p, "ball"), sprig(360, 470, -35, p, "ball"), sprig(36, 400, 6, p, "bud"), sprig(364, 400, -6, p, "bud")),
};

const LAYOUTS: Record<string, Layout> = {
  crest: (p) => {
    const top = spray(200, 112, -1, p), bottom = spray(200, 452, 1, p);
    return { shapes: top.shapes + bottom.shapes, ink: top.ink + bottom.ink, textY: 262 };
  },
  arch: (p) => {
    const [a, b, c] = p.leaves;
    return {
      shapes:
        vine(70, 500, 50, 260, 120, 80, 7, LEAF, [a, b]) + vine(330, 500, 350, 260, 280, 80, 7, LEAF, [b, a]) +
        vine(120, 80, 200, 50, 280, 80, 4, LEAF, [c, a]) +
        bigPoppy(200, 70, 30, p.main, p.shade, p.center) +
        bigPoppy(70, 470, 34, p.main, p.shade, p.center) + bigPoppy(330, 470, 34, p.accent, p.shade, p.center) +
        cosmos8(132, 488, 30, p.light, M.wheat, p.accent) + cosmos8(268, 488, 30, p.light, M.wheat, p.accent) +
        bloomBall(200, 496, p.shade, p.main) +
        cosmos8(64, 200, 30, p.light, M.wheat, p.accent) + cosmos8(336, 200, 30, p.light, M.wheat, p.accent),
      ink: line(`${vineStem(70, 500, 50, 260, 120, 80)} ${vineStem(330, 500, 350, 260, 280, 80)} ${vineStem(120, 80, 200, 50, 280, 80)}`, 1.4),
      textY: 250,
    };
  },
  wreath: (p) => {
    const [a, b, c] = p.leaves;
    const n = 20;
    const ring = Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2;
      const x = 200 + 150 * Math.cos(t), y = 290 + 200 * Math.sin(t);
      if (i % 10 === 0) return bigPoppy(x, y, 32, p.main, p.shade, p.center);
      if (i % 10 === 3 || i % 10 === 7) return cosmos8(x, y, 30, p.light, M.wheat, p.accent);
      const tang = (Math.atan2(200 * Math.cos(t), -150 * Math.sin(t)) * 180) / Math.PI;
      return slimLeaf(x, y, LEAF, tang + (i % 2 ? 40 : -40), [a, b, c][i % 3]);
    }).join("");
    return { shapes: ring + bigPoppy(200, 90, 30, p.accent, p.shade, p.center) + bigPoppy(200, 490, 30, p.accent, p.shade, p.center), ink: `<ellipse cx="200" cy="290" rx="150" ry="200" fill="none" stroke="${INK}" stroke-width="1.2"/>`, textY: 262 };
  },
  meadow: (p) => {
    const [a, b, c] = p.leaves;
    const stems = [
      [60, 330, 0], [110, 380, 1], [160, 350, 2], [200, 400, 3], [240, 350, 2], [290, 380, 1], [340, 330, 0],
    ] as const;
    const heads = stems.map(([x, y, k]) =>
      k === 0 ? bigPoppy(x, y, 34, p.main, p.shade, p.center) : k === 1 ? cosmos8(x, y, 30, p.light, M.wheat, p.accent) : k === 2 ? budSpike(x, y + 40, 0, p.shade, p.main) : bloomBall(x, y, p.main, p.shade),
    ).join("");
    const leaves = [70, 130, 180, 220, 270, 330].map((x, i) => slimLeaf(x, 500 - (i % 2) * 20, 44, i % 2 ? 30 : -30, [a, b, c][i % 3])).join("");
    return {
      shapes: heads + leaves +  +  + vine(110, 70, 200, 40, 290, 70, 6, LEAF, [a, b]) + bigPoppy(200, 56, 24, p.accent, p.shade, p.center),
      ink: line(stems.map(([x, y]) => `M${x} ${y + 24} L${x} 532`).join(" ") + ` ${vineStem(110, 70, 200, 40, 290, 70)}`, 1.4) ,
      textY: 200,
    };
  },
  corners: (p) => {
    const [a, b, c] = p.leaves;
    const corner = (x: number, y: number, sx: number, sy: number) =>
      vine(x, y, x + sx * 90, y, x + sx * 130, y + sy * 30, 4, LEAF, [a, b]) +
      vine(x, y, x, y + sy * 90, x + sx * 30, y + sy * 140, 4, LEAF, [b, c]) +
      cosmos8(x + sx * 56, y + sy * 52, 30, p.light, M.wheat, p.accent) +
      bigPoppy(x + sx * 14, y + sy * 14, 30, p.main, p.shade, p.center);
    return {
      shapes: corner(50, 50, 1, 1) + corner(350, 50, -1, 1) + corner(50, 510, 1, -1) + corner(350, 510, -1, -1) + bloomBall(200, 470, p.shade, p.main) + bloomBall(200, 96, p.shade, p.main),
      ink: line([[50, 50, 1, 1], [350, 50, -1, 1], [50, 510, 1, -1], [350, 510, -1, -1]].map(([x, y, sx, sy]) => `${vineStem(x, y, x + sx * 90, y, x + sx * 130, y + sy * 30)} ${vineStem(x, y, x, y + sy * 90, x + sx * 30, y + sy * 140)}`).join(" "), 1.4),
      textY: 268,
    };
  },
};

const BLOOM = { word: "Bloom", rest: ["where you are", "planted"] };
const GROW = { word: "Grow", rest: ["through what you", "go through"] };
const DIDOT = "Didot, 'Bodoni 72', Georgia, serif";
const BASK = "Baskerville, 'Hoefler Text', Georgia, serif";
const CASLON = "'Big Caslon', 'Hoefler Text', Georgia, serif";
const BODONI = "'Bodoni 72', Didot, Georgia, serif";
const HOEFLER = "'Hoefler Text', Baskerville, Georgia, serif";

function card(id: string, title: string, q: { word: string; rest: string[] }, layout: string, pal: string, wordFont: string, restFont: string, wordW?: number): HalloweenDesign {
  const p = PAL[pal];
  const base = LAYOUTS[layout](p);
  const extra = FILL[layout](p);
  // Everything stays inside the frame: a leaf poking past it is trimmed.
  const clip = `<clipPath id="in-${id}"><rect x="28" y="28" width="344" height="504"/></clipPath>`;
  const l = { shapes: `${clip}<g clip-path="url(#in-${id})">${base.shapes}${extra.shapes}</g>`, ink: `<g clip-path="url(#in-${id})">${base.ink}${extra.ink}</g>`, textY: base.textY };
  const t = saying(q.word, q.rest, l.textY, p, wordFont, restFont, wordW ?? (q.word.length > 4 ? 260 : 220));
  return { id, title, height: CARD_H, shapes: cardFrame(p) + l.shapes + t.shapes, ink: `${clip.replace(`in-${id}`, `ink-${id}`)}`.replace(/^/, "") + l.ink.replace(`url(#in-${id})`, `url(#ink-${id})`) + t.ink + CARD_BORDER };
}

export const QUOTE_CARDS: HalloweenDesign[] = [
  card("qc-bloom-crest", "Bloom: Poppy Crest", BLOOM, "crest", "rose", SNELL, DIDOT),
  card("qc-bloom-arch", "Bloom: Wildflower Arch", BLOOM, "arch", "terracotta", SAVOYE, BASK),
  card("qc-bloom-wreath", "Bloom: Oval Wreath", BLOOM, "wreath", "lavender", CHANCERY, CASLON),
  card("qc-bloom-meadow", "Bloom: Meadow", BLOOM, "meadow", "harvest", SNELL, BODONI),
  card("qc-bloom-corners", "Bloom: Corner Bouquets", BLOOM, "corners", "blue", SAVOYE, HOEFLER),
  card("qc-grow-crest", "Grow: Poppy Crest", GROW, "crest", "harvest", CHANCERY, BASK),
  card("qc-grow-arch", "Grow: Wildflower Arch", GROW, "arch", "lavender", SNELL, DIDOT),
  card("qc-grow-wreath", "Grow: Oval Wreath", GROW, "wreath", "terracotta", SAVOYE, BODONI),
  card("qc-grow-meadow", "Grow: Meadow", GROW, "meadow", "blue", CHANCERY, HOEFLER),
  card("qc-grow-corners", "Grow: Corner Bouquets", GROW, "corners", "rose", SNELL, CASLON),
];

/** A pine tree: three stacked tiers (each a shape) on a trunk. */
function pine(x: number, base: number, h: number, a: string, b: string, trunk: string) {
  const w = h * 0.5;
  const tier = (top: number, bottom: number, half: number, fill: string) => `<path d="M${x} ${top} L${x + half} ${bottom} L${x - half} ${bottom} Z" fill="${fill}"/>`;
  return (
    `<rect x="${x - h * 0.05}" y="${base - h * 0.14}" width="${h * 0.1}" height="${h * 0.14}" fill="${trunk}"/>` +
    tier(base - h * 0.5, base - h * 0.12, w * 0.5, a) + tier(base - h * 0.78, base - h * 0.42, w * 0.4, b) + tier(base - h, base - h * 0.68, w * 0.3, a)
  );
}

/** A toadstool: a round cap with spots, on a stem. */
function mushroom(x: number, y: number, s: number, cap: string, stem: string, spot: string) {
  return (
    `<rect x="${x - 6 * s}" y="${y - 16 * s}" width="${12 * s}" height="${16 * s}" rx="${3 * s}" fill="${stem}"/>` +
    `<path d="M${x - 20 * s} ${y - 14 * s} Q${x} ${y - 44 * s} ${x + 20 * s} ${y - 14 * s} Z" fill="${cap}"/>` +
    `<circle cx="${x - 7 * s}" cy="${y - 24 * s}" r="${4.5 * s}" fill="${spot}"/><circle cx="${x + 8 * s}" cy="${y - 22 * s}" r="${4 * s}" fill="${spot}"/>`
  );
}

const ADVENTURE: HalloweenDesign = (() => {
  const sky = "#E9D6B8";
  const pal = { card: M.cream, band: M.sage };
  const shapes = `
    <rect width="400" height="${CARD_H}" fill="${pal.band}"/><rect x="14" y="14" width="372" height="532" fill="${pal.card}"/>
    <clipPath id="adv"><rect x="28" y="28" width="344" height="504"/></clipPath>
    <g clip-path="url(#adv)">
      <rect x="28" y="250" width="344" height="140" fill="${sky}"/>
      <circle cx="270" cy="300" r="36" fill="${M.mustard}"/>
      <path d="M28 380 L110 280 L170 340 L230 260 L320 350 L372 300 L372 400 L28 400 Z" fill="${M.slateBlue}"/>
      <path d="M110 280 L128 302 L116 300 L104 306 Z M230 260 L250 284 L236 280 L222 290 Z" fill="${M.cream}"/>
      <path d="M28 400 Q120 360 210 395 Q300 370 372 390 L372 430 L28 430 Z" fill="${M.lavender}"/>
      <path d="M28 430 Q140 400 240 428 Q320 410 372 420 L372 532 L28 532 Z" fill="${M.olive}"/>
      <path d="M150 532 Q190 490 210 460 Q222 440 206 424 L222 424 Q240 446 228 470 Q212 500 230 532 Z" fill="${M.wheat}"/>
      ${pine(60, 470, 150, M.forest, M.olive, M.ochre)}${pine(110, 452, 110, M.sage, M.forest, M.ochre)}
      ${pine(330, 470, 160, M.forest, M.sage, M.ochre)}${pine(286, 450, 110, M.olive, M.forest, M.ochre)}
      ${pine(160, 426, 70, M.forest, M.sage, M.ochre)}${pine(250, 424, 74, M.sage, M.forest, M.ochre)}
      ${vine(96, 532, 80, 500, 90, 456, 3, LEAF, [M.sage, M.forest])}${vine(304, 532, 320, 500, 310, 456, 3, LEAF, [M.forest, M.sage])}
      ${mushroom(148, 526, 1.6, M.terracotta, M.cream, M.blush)}${mushroom(262, 524, 1.3, M.dustyRose, M.cream, M.blush)}
      ${bloomBall(46, 512, M.rose, M.dustyRose)}${bloomBall(354, 512, M.lavender, M.plum)}
      ${vine(40, 60, 120, 40, 180, 70, 4, LEAF, [M.sage, M.olive])}${vine(360, 60, 280, 40, 220, 70, 4, LEAF, [M.olive, M.sage])}
      ${cosmos8(200, 64, 26, M.wheat, M.cream, M.terracotta)}
    </g>
    <text x="200" y="196" text-anchor="middle" font-family="${SNELL}" font-weight="900" font-size="100" textLength="330" lengthAdjust="spacingAndGlyphs" fill="${M.terracotta}" stroke="${M.terracotta}" stroke-width="7.5" stroke-linejoin="round">Adventure</text>`;
  const ink = `
    <clipPath id="adv-ink"><rect x="28" y="28" width="344" height="504"/></clipPath>
    <g clip-path="url(#adv-ink)">
      ${line(`${vineStem(96, 532, 80, 500, 90, 456)} ${vineStem(304, 532, 320, 500, 310, 456)}`, 1.4)}
      ${line(`${vineStem(40, 60, 120, 40, 180, 70)} ${vineStem(360, 60, 280, 40, 220, 70)}`, 1.4)}
      ${line("M150 300 q6 -6 12 0 q6 -6 12 0 M184 280 q5 -5 10 0 q5 -5 10 0", 1.6)}
    </g>
    ${serifLine("and so the", 200, 118, 26, DIDOT)}${serifLine("begins", 200, 240, 30, DIDOT)}
    ${CARD_BORDER}`;
  return { id: "qc-adventure", title: "And So the Adventure Begins", height: CARD_H, shapes, ink };
})();

QUOTE_CARDS.push(ADVENTURE);

// ---- More "And so the adventure begins" forest cards. ----

/** The saying: "and so the" above, the big script word, "begins" below. */
function adventureText(y: number, color: string, wordFont: string, restFont: string, size = 100, stroke = 7.5) {
  return {
    shapes: `<text x="200" y="${y}" text-anchor="middle" font-family="${wordFont}" font-weight="900" font-size="${size}" textLength="330" lengthAdjust="spacingAndGlyphs" fill="${color}" stroke="${color}" stroke-width="${stroke}" stroke-linejoin="round">Adventure</text>`,
    ink: serifLine("and so the", 200, y - 86, 26, restFont) + serifLine("begins", 200, y + 44, 30, restFont),
  };
}

/** A card of the forest set: frame, a scene clipped to the card, the saying on top. */
function forestCard(id: string, title: string, band: string, scene: string, sceneInk: string, text: { shapes: string; ink: string }): HalloweenDesign {
  const clip = (k: string) => `<clipPath id="${k}"><rect x="28" y="28" width="344" height="504"/></clipPath>`;
  return {
    id,
    title,
    height: CARD_H,
    shapes: `<rect width="400" height="${CARD_H}" fill="${band}"/><rect x="14" y="14" width="372" height="532" fill="${M.cream}"/>${clip(`${id}-s`)}<g clip-path="url(#${id}-s)">${scene}</g>${text.shapes}`,
    ink: `${clip(`${id}-i`)}<g clip-path="url(#${id}-i)">${sceneInk}</g>${text.ink}${CARD_BORDER}`,
  };
}

/** A canvas tent: two halves and a dark door. */
function tent(x: number, base: number, w: number, a: string, b: string, door: string) {
  const h = w * 0.8;
  return `<path d="M${x} ${base - h} L${x - w / 2} ${base} L${x} ${base} Z" fill="${a}"/><path d="M${x} ${base - h} L${x + w / 2} ${base} L${x} ${base} Z" fill="${b}"/><path d="M${x} ${base - h * 0.55} L${x - w * 0.16} ${base} L${x + w * 0.16} ${base} Z" fill="${door}"/>`;
}

/** A campfire: crossed logs and three flames. */
function campfire(x: number, base: number, log: string, f1: string, f2: string, f3: string) {
  return (
    `<rect x="${x - 34}" y="${base - 12}" width="68" height="12" rx="5" transform="rotate(-14 ${x} ${base - 6})" fill="${log}"/>` +
    `<rect x="${x - 34}" y="${base - 12}" width="68" height="12" rx="5" transform="rotate(14 ${x} ${base - 6})" fill="${log}"/>` +
    `<path d="M${x - 22} ${base - 10} Q${x - 30} ${base - 44} ${x - 8} ${base - 64} Q${x - 4} ${base - 36} ${x + 2} ${base - 10} Z" fill="${f1}"/>` +
    `<path d="M${x - 4} ${base - 10} Q${x - 6} ${base - 60} ${x + 10} ${base - 84} Q${x + 30} ${base - 44} ${x + 22} ${base - 10} Z" fill="${f2}"/>` +
    `<path d="M${x - 2} ${base - 12} Q${x + 2} ${base - 36} ${x + 8} ${base - 46} Q${x + 16} ${base - 30} ${x + 12} ${base - 12} Z" fill="${f3}"/>`
  );
}

/** A log cabin: walls, roof, door, window, chimney. */
function cabin(x: number, base: number, w: number, wall: string, roof: string, door: string, glass: string) {
  const h = w * 0.55;
  return (
    `<rect x="${x + w * 0.22}" y="${base - h - w * 0.42}" width="${w * 0.1}" height="${w * 0.3}" fill="${roof}"/>` +
    `<rect x="${x - w / 2}" y="${base - h}" width="${w}" height="${h}" fill="${wall}"/>` +
    `<path d="M${x - w * 0.6} ${base - h + 4} L${x} ${base - h - w * 0.38} L${x + w * 0.6} ${base - h + 4} Z" fill="${roof}"/>` +
    `<rect x="${x - w * 0.1}" y="${base - h * 0.62}" width="${w * 0.2}" height="${h * 0.62}" fill="${door}"/>` +
    `<rect x="${x + w * 0.2}" y="${base - h * 0.75}" width="${w * 0.2}" height="${w * 0.17}" fill="${glass}"/>` +
    `<rect x="${x - w * 0.4}" y="${base - h * 0.75}" width="${w * 0.2}" height="${w * 0.17}" fill="${glass}"/>`
  );
}

/** A soft cloud of three puffs. */
function cloud(x: number, y: number, s: number, fill: string) {
  return `<g fill="${fill}"><circle cx="${x - 18 * s}" cy="${y}" r="${14 * s}"/><circle cx="${x}" cy="${y - 8 * s}" r="${18 * s}"/><circle cx="${x + 20 * s}" cy="${y}" r="${13 * s}"/><rect x="${x - 30 * s}" y="${y}" width="${62 * s}" height="${12 * s}" rx="${6 * s}"/></g>`;
}

const birds = (x: number, y: number) => line(`M${x} ${y} q6 -6 12 0 q6 -6 12 0 M${x + 32} ${y - 18} q5 -5 10 0 q5 -5 10 0`, 1.6);

const LAKE = forestCard(
  "qc-adventure-lake",
  "Adventure: Mountain Lake",
  M.slateBlue,
  `
    <rect x="28" y="250" width="344" height="130" fill="${M.blush}"/>
    ${cloud(110, 300, 1, M.cream)}${cloud(300, 280, 0.8, M.cream)}
    <path d="M28 380 L130 270 L190 330 L260 250 L372 370 L372 400 L28 400 Z" fill="${M.lavender}"/>
    <path d="M130 270 L150 292 L136 290 L122 296 Z M260 250 L282 274 L266 270 L250 280 Z" fill="${M.cream}"/>
    <path d="M28 390 L372 390 L372 470 L28 470 Z" fill="${M.slateBlue}"/>
    <path d="M140 428 L260 428 Q248 450 200 450 Q152 450 140 428 Z" fill="${M.terracotta}"/>
    <path d="M28 470 Q200 440 372 470 L372 532 L28 532 Z" fill="${M.olive}"/>
    <path d="M28 500 Q200 480 372 500 L372 532 L28 532 Z" fill="${M.wheat}"/>
    ${pine(58, 470, 170, M.forest, M.olive, M.ochre)}${pine(106, 440, 110, M.sage, M.forest, M.ochre)}
    ${pine(342, 470, 170, M.forest, M.sage, M.ochre)}${pine(294, 440, 110, M.olive, M.forest, M.ochre)}
    ${bloomBall(160, 512, M.rose, M.dustyRose)}${bloomBall(240, 514, M.mustard, M.ochre)}
    ${vine(40, 60, 120, 40, 180, 70, 4, LEAF, [M.sage, M.olive])}${vine(360, 60, 280, 40, 220, 70, 4, LEAF, [M.olive, M.sage])}
    ${cosmos8(200, 64, 26, M.blush, M.cream, M.slateBlue)}`,
  `${line(`${vineStem(40, 60, 120, 40, 180, 70)} ${vineStem(360, 60, 280, 40, 220, 70)} M226 404 L246 446`, 1.4)}${birds(180, 330)}${line("M120 410 L160 410 M230 420 L280 420 M90 452 L130 452", 1.2)}`,
  adventureText(196, M.slateBlue, "'Brush Script MT', 'Snell Roundhand', cursive", BASK, 112, 3),
);

const CAMPFIRE = forestCard(
  "qc-adventure-campfire",
  "Adventure: Campfire Night",
  M.plum,
  `
    <rect x="28" y="250" width="344" height="200" fill="${M.plum}"/>
    <circle cx="300" cy="294" r="28" fill="${M.cream}"/>
    ${star(80, 280, 12, M.mustard)}${star(150, 270, 10, M.wheat)}${star(220, 300, 11, M.mustard)}${star(120, 330, 9, M.wheat)}
    <path d="M28 420 L110 330 L180 390 L260 320 L372 410 L372 440 L28 440 Z" fill="${M.slateBlue}"/>
    <path d="M28 430 Q200 400 372 430 L372 532 L28 532 Z" fill="${M.forest}"/>
    <path d="M28 470 Q200 450 372 470 L372 532 L28 532 Z" fill="${M.olive}"/>
    ${pine(50, 470, 160, M.forest, M.sage, M.ochre)}${pine(350, 470, 160, M.sage, M.forest, M.ochre)}${pine(96, 440, 100, M.sage, M.olive, M.ochre)}
    ${tent(270, 488, 110, M.mustard, M.ochre, M.plum)}
    ${campfire(150, 514, M.ochre, M.terracotta, M.mustard, M.wheat)}
    ${mushroom(330, 524, 1.2, M.dustyRose, M.cream, M.blush)}
    ${vine(40, 60, 120, 40, 180, 70, 4, LEAF, [M.sage, M.olive])}${vine(360, 60, 280, 40, 220, 70, 4, LEAF, [M.olive, M.sage])}
    ${bigPoppy(200, 64, 26, M.terracotta, M.dustyRose, M.plum)}`,
  `${line(`${vineStem(40, 60, 120, 40, 180, 70)} ${vineStem(360, 60, 280, 40, 220, 70)}`, 1.4)}`,
  adventureText(204, M.plum, CHANCERY, BODONI, 78),
);

const CABIN = forestCard(
  "qc-adventure-cabin",
  "Adventure: Cabin in the Woods",
  M.olive,
  `
    <rect x="28" y="250" width="344" height="180" fill="${M.linen}"/>
    <circle cx="96" cy="300" r="30" fill="${M.mustard}"/>
    ${cloud(260, 290, 0.9, M.cream)}
    <path d="M28 410 Q110 350 200 380 Q290 340 372 390 L372 430 L28 430 Z" fill="${M.sage}"/>
    <path d="M28 430 Q200 400 372 430 L372 532 L28 532 Z" fill="${M.olive}"/>
    <path d="M168 532 Q186 500 196 480 Q204 466 196 456 L210 456 Q220 470 212 486 Q202 506 214 532 Z" fill="${M.wheat}"/>
    ${cabin(200, 456, 120, M.ochre, M.terracotta, M.forest, M.wheat)}
    ${pine(56, 480, 170, M.forest, M.sage, M.ochre)}${pine(344, 480, 170, M.sage, M.forest, M.ochre)}${pine(104, 452, 110, M.olive, M.forest, M.ochre)}${pine(298, 452, 110, M.forest, M.olive, M.ochre)}
    ${bloomBall(120, 514, M.rose, M.dustyRose)}${bloomBall(284, 514, M.lavender, M.plum)}
    ${vine(40, 60, 120, 40, 180, 70, 4, LEAF, [M.sage, M.olive])}${vine(360, 60, 280, 40, 220, 70, 4, LEAF, [M.olive, M.sage])}
    ${cosmos8(200, 64, 26, M.wheat, M.cream, M.terracotta)}`,
  `${line(`${vineStem(40, 60, 120, 40, 180, 70)} ${vineStem(360, 60, 280, 40, 220, 70)}`, 1.4)}${line("M238 356 q-10 -12 0 -24 q10 -12 0 -24", 1.6)}${birds(150, 320)}`,
  adventureText(196, M.forest, SNELL, CASLON),
);

const BRIDGE = forestCard(
  "qc-adventure-bridge",
  "Adventure: River Crossing",
  M.terracotta,
  `
    <rect x="28" y="250" width="344" height="160" fill="${M.blush}"/>
    <circle cx="200" cy="330" r="40" fill="${M.mustard}"/>
    <path d="M28 390 L120 300 L200 370 L280 300 L372 390 L372 420 L28 420 Z" fill="${M.dustyRose}"/>
    <path d="M28 410 Q200 380 372 410 L372 532 L28 532 Z" fill="${M.olive}"/>
    <path d="M180 410 Q150 450 190 470 Q240 500 200 532 L260 532 Q290 500 240 470 Q200 450 220 410 Z" fill="${M.slateBlue}"/>
    <rect x="150" y="462" width="130" height="14" fill="${M.ochre}"/>
    <rect x="156" y="446" width="10" height="30" fill="${M.terracotta}"/><rect x="264" y="446" width="10" height="30" fill="${M.terracotta}"/>
    ${pine(60, 470, 170, M.forest, M.sage, M.ochre)}${pine(340, 470, 170, M.sage, M.forest, M.ochre)}${pine(110, 440, 100, M.olive, M.forest, M.ochre)}${pine(296, 440, 100, M.forest, M.olive, M.ochre)}
    ${bloomBall(80, 512, M.mustard, M.ochre)}${bloomBall(330, 512, M.rose, M.dustyRose)}${mushroom(130, 526, 1.2, M.terracotta, M.cream, M.blush)}
    ${vine(40, 60, 120, 40, 180, 70, 4, LEAF, [M.sage, M.olive])}${vine(360, 60, 280, 40, 220, 70, 4, LEAF, [M.olive, M.sage])}
    ${bigPoppy(200, 64, 26, M.mustard, M.ochre, M.forest)}`,
  `${line(`${vineStem(40, 60, 120, 40, 180, 70)} ${vineStem(360, 60, 280, 40, 220, 70)} M161 446 Q215 426 269 446`, 1.4)}${line("M196 488 q8 -4 16 0 M214 510 q8 -4 16 0", 1.2)}${birds(90, 300)}`,
  adventureText(198, M.terracotta, "Luminari, 'Apple Chancery', serif", HOEFLER, 70, 5),
);

const SUMMIT = forestCard(
  "qc-adventure-summit",
  "Adventure: Summit Trail",
  M.forest,
  `
    <rect x="28" y="250" width="344" height="200" fill="${M.linen}"/>
    ${cloud(90, 290, 0.9, M.cream)}${cloud(320, 310, 0.8, M.cream)}
    <path d="M28 470 L200 300 L372 470 Z" fill="${M.slateBlue}"/>
    <path d="M200 300 L236 336 L216 332 L200 344 L184 332 L164 336 Z" fill="${M.cream}"/>
    <rect x="198" y="266" width="4" height="36" fill="${M.ochre}"/><path d="M202 268 L234 279 L202 290 Z" fill="${M.terracotta}"/>
    <path d="M28 450 Q100 400 170 440 L28 470 Z M372 450 Q300 400 230 440 L372 470 Z" fill="${M.lavender}"/>
    <path d="M28 460 Q200 430 372 460 L372 532 L28 532 Z" fill="${M.olive}"/>
    <path d="M186 532 Q206 500 190 480 Q176 462 204 440 L216 446 Q196 464 208 480 Q224 504 206 532 Z" fill="${M.wheat}"/>
    ${pine(56, 490, 160, M.forest, M.sage, M.ochre)}${pine(344, 490, 160, M.sage, M.forest, M.ochre)}${pine(110, 470, 100, M.olive, M.forest, M.ochre)}${pine(290, 470, 100, M.forest, M.olive, M.ochre)}
    ${bloomBall(150, 516, M.rose, M.dustyRose)}${bloomBall(260, 516, M.mustard, M.ochre)}
    ${vine(40, 60, 120, 40, 180, 70, 4, LEAF, [M.sage, M.olive])}${vine(360, 60, 280, 40, 220, 70, 4, LEAF, [M.olive, M.sage])}
    ${cosmos8(200, 64, 26, M.lavender, M.blush, M.ochre)}`,
  `${line(`${vineStem(40, 60, 120, 40, 180, 70)} ${vineStem(360, 60, 280, 40, 220, 70)}`, 1.4)}${birds(250, 290)}`,
  adventureText(204, M.forest, CHANCERY, DIDOT, 78),
);

QUOTE_CARDS.push(LAKE, CAMPFIRE, CABIN, BRIDGE, SUMMIT);

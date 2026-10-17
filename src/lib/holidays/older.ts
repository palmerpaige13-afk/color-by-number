// Harder ready-made pages for ages 7–9 (ten a holiday, with multiplication problems): more and
// smaller shapes than the pages for ages 5–6, drawn the same way (see halloween/designs.ts):
// patterned backgrounds (sunbursts, quilt blocks, stained glass), feathers and leaves in rows.

import { C, INK, eye, flower, line, star, wrapped, type HalloweenDesign } from "@/lib/halloween/designs";

const f = (n: number) => n.toFixed(1);

/** Sunburst: `n` wedges around (cx, cy) out past the picture's edge, in `colors` by turn. */
function sunburst(cx: number, cy: number, n: number, colors: string[]) {
  const R = 700;
  return Array.from({ length: n }, (_, i) => {
    const a0 = (i / n) * 2 * Math.PI, a1 = ((i + 1) / n) * 2 * Math.PI;
    return `<path d="M${cx} ${cy} L${f(cx + R * Math.cos(a0))} ${f(cy + R * Math.sin(a0))} L${f(cx + R * Math.cos(a1))} ${f(cy + R * Math.sin(a1))} Z" fill="${colors[i % colors.length]}"/>`;
  }).join("");
}

/**
 * Stained glass: rings around (cx, cy) cut into wedges, each piece in the next color, so
 * neighbors always differ (`colors` should have a length not dividing evenly into `n`).
 */
function glass(cx: number, cy: number, radii: number[], n: number, colors: string[]) {
  const out: string[] = [];
  radii.forEach((r1, ri) => {
    const r0 = ri ? radii[ri - 1] : 0;
    const off = ri % 2 ? Math.PI / n : 0;
    for (let i = 0; i < n; i++) {
      const a0 = off + (i / n) * 2 * Math.PI, a1 = off + ((i + 1) / n) * 2 * Math.PI;
      const p = (r: number, a: number) => `${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`;
      const d = r0 ? `M${p(r0, a0)} L${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 0 0 ${p(r0, a0)} Z` : `M${cx} ${cy} L${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} Z`;
      out.push(`<path d="${d}" fill="${colors[(i + ri * 2) % colors.length]}"/>`);
    }
  });
  return out.join("");
}

/** Petals in a ring around (cx, cy): `n` ellipses at radius `r`, alternating colors. */
function petals(cx: number, cy: number, n: number, r: number, rx: number, ry: number, colors: string[], turn = 0) {
  return Array.from({ length: n }, (_, i) => {
    const a = turn + (i / n) * 2 * Math.PI;
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${rx}" ry="${ry}" transform="rotate(${f((a * 180) / Math.PI + 90)} ${f(x)} ${f(y)})" fill="${colors[i % colors.length]}"/>`;
  }).join("");
}

/** Quilt blocks: a grid of squares split corner to corner, the halves in alternating colors. */
function quilt(cell: number, colors: [string, string, string, string]) {
  const out: string[] = [];
  for (let r = 0; r < Math.ceil(400 / cell); r++) {
    for (let c = 0; c < Math.ceil(400 / cell); c++) {
      const x = c * cell, y = r * cell, flip = (r + c) % 2;
      const [a, b] = (r + c) % 4 < 2 ? [colors[0], colors[1]] : [colors[2], colors[3]];
      const t1 = flip ? `M${x} ${y} L${x + cell} ${y} L${x} ${y + cell} Z` : `M${x} ${y} L${x + cell} ${y} L${x + cell} ${y + cell} Z`;
      out.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${b}"/><path d="${t1}" fill="${a}"/>`);
    }
  }
  return out.join("");
}

/** Feathers or scales: rows of half circles, each row shifted, colors by turn. */
function scales(x0: number, y0: number, w: number, h: number, r: number, colors: string[]) {
  const out: string[] = [];
  for (let row = 0, y = y0 + h; y > y0 - r; row++, y -= r * 0.9) {
    for (let x = x0 - (row % 2) * r; x < x0 + w + r; x += r * 2) {
      out.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${colors[(row + Math.round(x / (2 * r))) % colors.length]}"/>`);
    }
  }
  return out.join("");
}

/** A maple leaf centered at (cx, cy), turned by `deg`. */
function maple(cx: number, cy: number, s: number, deg: number, fill: string) {
  return `<path transform="translate(${cx} ${cy}) rotate(${deg}) scale(${s})" d="M0 -34 L8 -16 L24 -22 L18 -4 L32 2 L14 10 L18 26 L0 18 L-18 26 L-14 10 L-32 2 L-18 -4 L-24 -22 L-8 -16 Z" fill="${fill}"/>`;
}

/** A window with four panes in two colors, and its frame. */
function window4(x: number, y: number, w: number, h: number, a: string, b: string, frame: string) {
  const hw = (w - 6) / 2, hh = (h - 6) / 2;
  return (
    `<rect x="${x - 4}" y="${y - 4}" width="${w + 8}" height="${h + 8}" fill="${frame}"/>` +
    `<rect x="${x}" y="${y}" width="${hw}" height="${hh}" fill="${a}"/><rect x="${x + hw + 6}" y="${y}" width="${hw}" height="${hh}" fill="${b}"/>` +
    `<rect x="${x}" y="${y + hh + 6}" width="${hw}" height="${hh}" fill="${b}"/><rect x="${x + hw + 6}" y="${y + hh + 6}" width="${hw}" height="${hh}" fill="${a}"/>`
  );
}

/** A pumpkin in three lobes, with its stem and leaf. */
function pumpkin(cx: number, cy: number, rx: number, ry: number, side: string, mid: string) {
  return (
    `<rect x="${f(cx - rx * 0.1)}" y="${f(cy - ry - rx * 0.3)}" width="${f(rx * 0.2)}" height="${f(rx * 0.4)}" rx="3" fill="${C.brown}"/>` +
    `<path d="M${cx} ${f(cy - ry - rx * 0.12)} Q${f(cx + rx * 0.5)} ${f(cy - ry - rx * 0.55)} ${f(cx + rx * 0.7)} ${f(cy - ry - rx * 0.1)} Q${f(cx + rx * 0.35)} ${f(cy - ry + rx * 0.05)} ${cx} ${f(cy - ry - rx * 0.12)} Z" fill="${C.green}"/>` +
    `<ellipse cx="${f(cx - rx * 0.4)}" cy="${cy}" rx="${f(rx * 0.6)}" ry="${ry}" fill="${side}"/>` +
    `<ellipse cx="${f(cx + rx * 0.4)}" cy="${cy}" rx="${f(rx * 0.6)}" ry="${ry}" fill="${side}"/>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${f(rx * 0.42)}" ry="${ry}" fill="${mid}"/>`
  );
}

/** A present with a ribbon and bow. */
function present(x: number, y: number, w: number, h: number, box: string, ribbon: string) {
  const m = x + w / 2;
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${box}"/><rect x="${m - 7}" y="${y}" width="14" height="${h}" fill="${ribbon}"/>` +
    `<path d="M${m} ${y} Q${m - 26} ${y - 26} ${m - 26} ${y - 4} Z M${m} ${y} Q${m + 26} ${y - 26} ${m + 26} ${y - 4} Z" fill="${ribbon}"/>`
  );
}

/** Six-line snowflakes in ink. */
function flakes(points: [number, number][], r = 8) {
  return points
    .map(([x, y]) => line([0, 60, 120].map((a) => { const dx = r * Math.cos((a * Math.PI) / 180), dy = r * Math.sin((a * Math.PI) / 180); return `M${f(x - dx)} ${f(y - dy)} L${f(x + dx)} ${f(y + dy)}`; }).join(" "), 2.5))
    .join("");
}

/** A penguin standing at (cx, base), `s` its size. */
function penguin(cx: number, base: number, s: number, scarf: string) {
  const top = base - 150 * s;
  return (
    `<ellipse cx="${cx}" cy="${f(base - 70 * s)}" rx="${f(56 * s)}" ry="${f(76 * s)}" fill="${C.slate}"/>` +
    `<ellipse cx="${cx}" cy="${f(base - 60 * s)}" rx="${f(38 * s)}" ry="${f(58 * s)}" fill="${C.ghost}"/>` +
    `<circle cx="${cx}" cy="${f(top + 30 * s)}" r="${f(40 * s)}" fill="${C.slate}"/>` +
    `<ellipse cx="${cx}" cy="${f(top + 36 * s)}" rx="${f(28 * s)}" ry="${f(24 * s)}" fill="${C.ghost}"/>` +
    `<path d="M${f(cx - 8 * s)} ${f(top + 40 * s)} L${f(cx + 8 * s)} ${f(top + 40 * s)} L${cx} ${f(top + 52 * s)} Z" fill="${C.orange}"/>` +
    `<rect x="${f(cx - 40 * s)}" y="${f(top + 62 * s)}" width="${f(80 * s)}" height="${f(16 * s)}" rx="${f(8 * s)}" fill="${scarf}"/>` +
    `<ellipse cx="${f(cx - 22 * s)}" cy="${f(base + 2)}" rx="${f(20 * s)}" ry="${f(8 * s)}" fill="${C.orange}"/><ellipse cx="${f(cx + 22 * s)}" cy="${f(base + 2)}" rx="${f(20 * s)}" ry="${f(8 * s)}" fill="${C.orange}"/>`
  );
}

export const HALLOWEEN_OLDER: HalloweenDesign[] = [
  {
    id: "ho-patch",
    title: "Pumpkin Patch",
    shapes: `
      ${sunburst(200, 120, 18, [C.navy, C.darkPurple])}
      <circle cx="200" cy="110" r="56" fill="${C.yellow}"/>
      <circle cx="184" cy="98" r="12" fill="${C.gold}"/><circle cx="218" cy="126" r="9" fill="${C.gold}"/>
      <path d="M0 230 Q100 200 200 228 Q300 200 400 230 L400 400 L0 400 Z" fill="${C.darkGreen}"/>
      <path d="M0 300 Q120 270 220 300 Q320 280 400 300 L400 400 L0 400 Z" fill="${C.green}"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<path d="M${i * 54} 236 L${i * 54 + 14} 214 L${i * 54 + 28} 236 L${i * 54 + 28} 290 L${i * 54} 290 Z" fill="${C.tan}"/>`).join("")}
      <rect x="0" y="252" width="400" height="10" fill="${C.brown}"/>
      ${pumpkin(80, 320, 60, 42, C.orange, C.gold)}
      ${pumpkin(210, 300, 52, 36, C.darkOrange, C.orange)}
      ${pumpkin(330, 330, 58, 40, C.orange, C.peach)}
      ${pumpkin(150, 372, 40, 26, C.gold, C.yellow)}
      ${pumpkin(270, 378, 38, 24, C.darkOrange, C.gold)}
      ${star(40, 40, 16, C.yellow)}${star(360, 40, 16, C.yellow)}${star(320, 160, 10, C.yellow)}${star(70, 160, 10, C.yellow)}`,
    ink: `${eye(196, 318, 6, 8)}${eye(224, 318, 6, 8)}${line("M200 334 Q210 342 220 334", 4)}`,
  },
  {
    id: "ho-mansion",
    title: "Haunted Mansion",
    shapes: `
      <rect width="400" height="400" fill="${C.darkPurple}"/>
      <circle cx="80" cy="70" r="44" fill="${C.yellow}"/>
      <path d="M0 160 Q60 140 120 160 Q180 140 240 160 Q320 140 400 160 L400 186 Q320 166 240 186 Q180 166 120 186 Q60 166 0 186 Z" fill="${C.lilac}"/>
      <path d="M0 360 Q200 330 400 360 L400 400 L0 400 Z" fill="${C.darkGreen}"/>
      <rect x="250" y="80" width="80" height="270" fill="${C.slate}"/>
      <path d="M240 84 L290 20 L340 84 Z" fill="${C.navy}"/>
      <rect x="60" y="170" width="200" height="180" fill="${C.purple}"/>
      <path d="M44 176 L160 96 L276 176 Z" fill="${C.navy}"/>
      <path d="M100 150 L160 110 L220 150 Z" fill="${C.maroon}"/>
      ${window4(84, 196, 44, 44, C.yellow, C.gold, C.brown)}
      ${window4(192, 196, 44, 44, C.gold, C.yellow, C.brown)}
      ${window4(84, 272, 44, 44, C.gold, C.yellow, C.brown)}
      ${window4(270, 110, 40, 40, C.yellow, C.gold, C.brown)}
      ${window4(270, 190, 40, 40, C.gold, C.yellow, C.brown)}
      ${window4(270, 270, 40, 40, C.yellow, C.gold, C.brown)}
      <path d="M180 350 L180 288 Q206 260 232 288 L232 350 Z" fill="${C.brown}"/>
      <path d="M160 350 L252 350 L264 372 L148 372 Z" fill="${C.gray}"/>
      <path d="M350 372 L350 320 Q370 300 390 320 L390 372 Z" fill="${C.gray}"/>
      <path d="M10 372 L10 326 Q28 308 46 326 L46 372 Z" fill="${C.gray}"/>
      ${pumpkin(130, 372, 22, 14, C.orange, C.gold)}`,
    ink: `<circle cx="222" cy="322" r="4" fill="${INK}"/>${line("M370 330 L370 360 M360 340 L380 340 M28 334 L28 362 M18 344 L38 344", 4)}
      <path d="M150 60 Q160 48 170 56 Q176 46 182 56 Q192 48 202 60 Q190 58 182 66 Q176 60 170 66 Q162 58 150 60 Z" fill="${INK}"/>
      <path d="M330 40 Q338 31 346 37 Q350 29 355 37 Q363 31 371 40 Q362 38 355 44 Q350 39 346 44 Q339 38 330 40 Z" fill="${INK}"/>`,
  },
  {
    id: "ho-witch",
    title: "Witch's Flight",
    shapes: `
      ${glass(200, 200, [210, 300], 16, [C.navy, C.blue, C.darkPurple])}
      <circle cx="200" cy="190" r="130" fill="${C.yellow}"/>
      ${[[150, 140, 18], [250, 120, 12], [240, 240, 20], [150, 250, 12], [200, 190, 10]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.gold}"/>`).join("")}
      <path d="M0 330 Q100 300 200 330 Q300 300 400 330 L400 400 L0 400 Z" fill="${C.slate}"/>
      <path d="M0 370 Q120 350 240 372 Q320 360 400 370 L400 400 L0 400 Z" fill="${C.darkGreen}"/>
      <path d="M80 230 L330 196" stroke="${C.brown}" stroke-width="10" stroke-linecap="round"/>
      <path d="M316 180 L380 160 L384 230 L326 214 Z" fill="${C.tan}"/>
      <path d="M150 226 Q160 180 200 170 Q240 180 250 216 Z" fill="${C.purple}"/>
      <path d="M170 228 L150 262 L176 258 Z M228 220 L246 256 L222 250 Z" fill="${C.darkPurple}"/>
      <circle cx="200" cy="150" r="22" fill="${C.lime}"/>
      <path d="M160 132 L240 132 L210 70 Q200 50 230 40 Q186 44 186 82 Z" fill="${C.darkPurple}"/>
      <rect x="180" y="118" width="44" height="12" fill="${C.orange}"/>
      <ellipse cx="200" cy="134" rx="50" ry="8" fill="${C.purple}"/>
      ${star(50, 60, 14, C.yellow)}${star(350, 60, 12, C.yellow)}${star(340, 290, 10, C.yellow)}${star(60, 290, 10, C.yellow)}`,
    ink: `${eye(193, 150, 4)}${eye(209, 150, 4)}${line("M194 162 Q201 167 208 162", 3)}`,
  },
  {
    id: "ho-cat",
    title: "Stained Glass Cat",
    shapes: `
      ${glass(200, 200, [90, 170, 300], 12, [C.teal, C.purple, C.orange, C.blue, C.magenta])}
      <circle cx="200" cy="200" r="60" fill="${C.yellow}"/>
      <path d="M200 380 Q120 380 128 300 Q134 250 170 236 L160 180 L186 206 Q200 200 214 206 L240 180 L230 236 Q266 250 272 300 Q280 380 200 380 Z" fill="${C.slate}"/>
      <path d="M270 360 Q340 350 330 290 Q326 260 350 250" fill="none" stroke="${C.slate}" stroke-width="18" stroke-linecap="round"/>
      <ellipse cx="200" cy="330" rx="34" ry="40" fill="${C.gray}"/>
      <path d="M170 196 L166 186 L180 196 Z M230 196 L234 186 L220 196 Z" fill="${C.pink}"/>
      <ellipse cx="184" cy="236" rx="10" ry="10" fill="${C.lime}"/><ellipse cx="216" cy="236" rx="10" ry="10" fill="${C.lime}"/>`,
    ink: `<ellipse cx="184" cy="236" rx="3" ry="8" fill="${INK}"/><ellipse cx="216" cy="236" rx="3" ry="8" fill="${INK}"/>
      <path d="M196 252 L204 252 L200 258 Z" fill="${INK}"/>${line("M180 258 L150 252 M180 264 L152 268 M220 258 L250 252 M220 264 L248 268", 2.5)}`,
  },
  {
    id: "ho-owl",
    title: "Feathered Owl",
    shapes: `
      <rect width="400" height="400" fill="${C.navy}"/>
      <circle cx="320" cy="80" r="50" fill="${C.yellow}"/>
      ${star(60, 50, 14, C.yellow)}${star(140, 30, 10, C.yellow)}${star(40, 160, 10, C.yellow)}
      <rect x="0" y="340" width="400" height="26" rx="13" fill="${C.brown}"/>
      ${maple(60, 350, 1, -30, C.orange)}${maple(340, 352, 1, 30, C.red)}
      <path d="M130 140 L120 70 L170 110 Z M270 140 L280 70 L230 110 Z" fill="${C.darkOrange}"/>
      <ellipse cx="200" cy="230" rx="100" ry="120" fill="${C.brown}"/>
      <defs><clipPath id="belly"><ellipse cx="200" cy="270" rx="62" ry="72"/></clipPath></defs>
      <g clip-path="url(#belly)">${scales(130, 196, 140, 150, 16, [C.tan, C.cream, C.peach])}</g>
      <path d="M104 210 Q80 290 130 330 Q150 270 128 210 Z M296 210 Q320 290 270 330 Q250 270 272 210 Z" fill="${C.darkOrange}"/>
      ${petals(160, 176, 10, 36, 9, 14, [C.gold, C.orange])}
      ${petals(240, 176, 10, 36, 9, 14, [C.orange, C.gold])}
      <circle cx="160" cy="176" r="26" fill="${C.cream}"/><circle cx="240" cy="176" r="26" fill="${C.cream}"/>
      <path d="M188 200 L212 200 L200 224 Z" fill="${C.yellow}"/>
      <ellipse cx="176" cy="344" rx="16" ry="9" fill="${C.orange}"/><ellipse cx="224" cy="344" rx="16" ry="9" fill="${C.orange}"/>`,
    ink: `${eye(160, 178, 12)}${eye(240, 178, 12)}`,
  },
  {
    id: "ho-candy-jar",
    title: "Candy Jar",
    shapes: `
      ${quilt(50, [C.lilac, C.mint, C.mint, C.lilac])}
      <rect x="0" y="350" width="400" height="50" fill="${C.brown}"/>
      <rect x="140" y="60" width="120" height="34" rx="8" fill="${C.purple}"/>
      <rect x="130" y="86" width="140" height="18" rx="6" fill="${C.darkPurple}"/>
      <path d="M110 120 Q110 100 140 100 L260 100 Q290 100 290 120 L300 330 Q300 360 270 360 L130 360 Q100 360 100 330 Z" fill="${C.ghost}"/>
      <defs><clipPath id="jar"><path d="M114 160 L286 160 L296 330 Q296 354 270 354 L130 354 Q104 354 104 330 Z"/></clipPath></defs>
      <g clip-path="url(#jar)">
        <rect x="100" y="160" width="200" height="200" fill="${C.pink}"/>
        ${[[130, 190, C.red], [180, 180, C.yellow], [230, 192, C.green], [272, 186, C.orange], [150, 240, C.blue], [205, 236, C.magenta], [256, 244, C.lime], [124, 296, C.gold], [176, 290, C.teal], [228, 298, C.red], [278, 300, C.purple], [150, 340, C.orange], [210, 340, C.yellow], [262, 344, C.green]].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="20" fill="${c}"/>`).join("")}
      </g>
      ${wrapped(60, 380, 11, C.red, C.yellow)}${wrapped(340, 380, 11, C.blue, C.orange)}
      <rect x="168" y="200" width="64" height="40" rx="6" fill="${C.cream}"/>`,
    ink: `${line("M180 214 L220 214 M184 226 L216 226", 3)}`,
  },
  {
    id: "ho-sugar-skull",
    title: "Sugar Skull",
    shapes: `
      ${sunburst(200, 200, 20, [C.teal, C.mint])}
      <circle cx="200" cy="200" r="168" fill="${C.purple}"/>
      ${petals(200, 200, 16, 150, 14, 24, [C.pink, C.yellow, C.orange, C.lime])}
      <circle cx="200" cy="180" r="112" fill="${C.ghost}"/>
      <rect x="140" y="250" width="120" height="86" rx="22" fill="${C.ghost}"/>
      ${petals(150, 180, 8, 38, 10, 14, [C.red, C.orange])}
      ${petals(250, 180, 8, 38, 10, 14, [C.blue, C.teal])}
      <circle cx="150" cy="180" r="28" fill="${C.cream}"/><circle cx="250" cy="180" r="28" fill="${C.cream}"/>
      ${flower(200, 108, 14, C.magenta, C.yellow)}
      <path d="M200 226 L188 248 L212 248 Z" fill="${C.pink}"/>
      ${[0, 1, 2, 3, 4].map((i) => `<rect x="${154 + i * 19}" y="276" width="15" height="30" rx="4" fill="${i % 2 ? C.lilac : C.cream}"/>`).join("")}`,
    ink: `${eye(150, 182, 14)}${eye(250, 182, 14)}`,
  },
  {
    id: "ho-web",
    title: "Spider Web Window",
    shapes: `
      <rect width="400" height="400" fill="${C.darkPurple}"/>
      ${glass(200, 190, [50, 95, 140, 185], 10, [C.lilac, C.purple, C.blue])}
      <rect x="0" y="0" width="400" height="20" fill="${C.brown}"/><rect x="0" y="380" width="400" height="20" fill="${C.brown}"/>
      <rect x="0" y="0" width="20" height="400" fill="${C.brown}"/><rect x="380" y="0" width="20" height="400" fill="${C.brown}"/>
      <circle cx="200" cy="246" r="34" fill="${C.slate}"/><circle cx="200" cy="200" r="22" fill="${C.slate}"/>
      <circle cx="190" cy="252" r="8" fill="${C.red}"/><circle cx="212" cy="240" r="7" fill="${C.red}"/>
      ${pumpkin(70, 350, 34, 22, C.orange, C.gold)}${pumpkin(330, 350, 34, 22, C.darkOrange, C.orange)}`,
    ink: `${line("M200 20 L200 178", 3)}${eye(193, 198, 4)}${eye(207, 198, 4)}
      ${line("M172 236 Q140 216 128 240 M170 252 Q136 252 126 276 M228 236 Q260 216 272 240 M230 252 Q264 252 274 276 M176 266 Q156 290 160 310 M224 266 Q244 290 240 310", 5)}`,
  },
  {
    id: "ho-lantern",
    title: "Jack-o'-Lantern Sunburst",
    shapes: `
      ${sunburst(200, 220, 24, [C.yellow, C.gold, C.orange])}
      ${petals(200, 220, 14, 168, 22, 34, [C.purple, C.darkPurple])}
      <rect x="186" y="66" width="28" height="44" rx="6" fill="${C.brown}"/>
      <path d="M210 90 Q250 50 290 74 Q250 104 210 90 Z" fill="${C.green}"/>
      <ellipse cx="140" cy="230" rx="80" ry="110" fill="${C.darkOrange}"/>
      <ellipse cx="260" cy="230" rx="80" ry="110" fill="${C.darkOrange}"/>
      <ellipse cx="200" cy="230" rx="66" ry="118" fill="${C.orange}"/>
      <path d="M150 190 L184 190 L167 160 Z M216 190 L250 190 L233 160 Z" fill="${C.yellow}"/>
      <path d="M190 220 L210 220 L200 204 Z" fill="${C.yellow}"/>
      <path d="M130 250 Q200 330 270 250 L250 262 L236 248 L220 266 L200 250 L180 266 L164 248 L150 262 Z" fill="${C.yellow}"/>`,
    ink: "",
  },
  {
    id: "ho-ghosts",
    title: "Ghost Parade",
    shapes: `
      ${quilt(50, [C.navy, C.blue, C.darkPurple, C.navy])}
      <path d="M0 340 Q200 310 400 340 L400 400 L0 400 Z" fill="${C.darkGreen}"/>
      ${[[90, 230, C.orange, C.yellow], [200, 200, C.purple, C.lilac], [310, 240, C.green, C.lime]].map(([x, y, a, b]) => `
        <path d="M${x} ${+y - 90} C${+x - 56} ${+y - 90} ${+x - 64} ${+y - 30} ${+x - 64} ${+y + 20} L${+x - 64} ${+y + 90} Q${+x - 48} ${+y + 74} ${+x - 32} ${+y + 90} Q${+x - 16} ${+y + 106} ${x} ${+y + 90} Q${+x + 16} ${+y + 74} ${+x + 32} ${+y + 90} Q${+x + 48} ${+y + 106} ${+x + 64} ${+y + 90} L${+x + 64} ${+y + 20} C${+x + 64} ${+y - 30} ${+x + 56} ${+y - 90} ${x} ${+y - 90} Z" fill="${C.ghost}"/>
        <rect x="${+x - 60}" y="${+y + 10}" width="120" height="18" fill="${a}"/>
        <rect x="${+x - 60}" y="${+y + 28}" width="120" height="14" fill="${b}"/>
        <ellipse cx="${+x - 30}" cy="${+y - 10}" rx="10" ry="7" fill="${C.pink}"/><ellipse cx="${+x + 30}" cy="${+y - 10}" rx="10" ry="7" fill="${C.pink}"/>`).join("")}
      ${star(40, 40, 14, C.yellow)}${star(360, 50, 14, C.yellow)}`,
    ink: `${[[90, 230], [200, 200], [310, 240]].map(([x, y]) => `${eye(x - 16, y - 30, 7, 10)}${eye(x + 16, y - 30, 7, 10)}<ellipse cx="${x}" cy="${y - 4}" rx="6" ry="8" fill="${INK}"/>`).join("")}`,
  },
];

export const THANKSGIVING_OLDER: HalloweenDesign[] = [
  {
    id: "to-turkey",
    title: "Fancy Turkey",
    shapes: `
      ${sunburst(200, 230, 20, [C.sky, C.mint])}
      ${petals(200, 230, 13, 130, 26, 52, [C.red, C.orange, C.gold, C.brown, C.maroon], Math.PI)}
      ${petals(200, 230, 11, 92, 22, 40, [C.yellow, C.darkOrange, C.peach], Math.PI + 0.2)}
      <path d="M0 300 Q200 276 400 300 L400 400 L0 400 Z" fill="${C.green}"/>
      <ellipse cx="200" cy="262" rx="70" ry="80" fill="${C.brown}"/>
      <defs><clipPath id="chest"><ellipse cx="200" cy="282" rx="46" ry="52"/></clipPath></defs>
      <g clip-path="url(#chest)">${scales(150, 230, 100, 110, 12, [C.tan, C.gold, C.peach])}</g>
      <circle cx="200" cy="170" r="42" fill="${C.brown}"/>
      <path d="M188 184 L212 184 L200 204 Z" fill="${C.gold}"/>
      <path d="M200 198 Q190 218 200 230 Q212 218 204 198 Z" fill="${C.red}"/>`,
    ink: `${eye(184, 164, 8, 10)}${eye(216, 164, 8, 10)}${line("M182 340 L178 366 M168 366 L190 366 M218 340 L222 366 M210 366 L232 366", 5)}`,
  },
  {
    id: "to-tree",
    title: "Autumn Tree",
    shapes: `
      <rect width="400" height="400" fill="${C.sky}"/>
      <path d="M0 320 Q200 296 400 320 L400 400 L0 400 Z" fill="${C.green}"/>
      <path d="M180 330 L186 220 L140 170 L152 162 L190 200 L194 140 L206 140 L210 196 L250 156 L260 166 L214 220 L220 330 Z" fill="${C.brown}"/>
      ${[[120, 120, C.red], [200, 90, C.orange], [280, 120, C.gold], [90, 190, C.darkOrange], [160, 170, C.yellow], [240, 170, C.red], [310, 190, C.orange], [140, 240, C.gold], [270, 240, C.maroon], [200, 60, C.gold]].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="44" fill="${c}"/>`).join("")}
      ${maple(70, 360, 1, -20, C.red)}${maple(130, 380, 0.9, 30, C.gold)}${maple(300, 370, 1, 10, C.orange)}${maple(350, 350, 0.9, -40, C.maroon)}
      <path d="M40 60 Q38 40 60 40 Q70 24 92 32 Q110 26 116 46 Q134 48 130 66 Z" fill="${C.ghost}"/>`,
    ink: "",
  },
  {
    id: "to-table",
    title: "Harvest Table",
    shapes: `
      ${quilt(50, [C.cream, C.peach, C.peach, C.cream])}
      <rect x="0" y="230" width="400" height="170" fill="${C.red}"/>
      ${Array.from({ length: 8 }, (_, i) => `<rect x="${i * 50 + 18}" y="230" width="14" height="170" fill="${C.maroon}"/>`).join("")}
      <rect x="0" y="290" width="400" height="14" fill="${C.maroon}"/><rect x="0" y="350" width="400" height="14" fill="${C.maroon}"/>
      <ellipse cx="200" cy="270" rx="90" ry="36" fill="${C.gray}"/>
      <ellipse cx="200" cy="262" rx="72" ry="26" fill="${C.tan}"/>
      <path d="M140 262 Q150 200 200 196 Q250 200 260 262 Z" fill="${C.brown}"/>
      <path d="M170 210 L150 176 Q160 170 168 178 L186 204 Z M232 210 L252 176 Q242 170 234 178 L216 204 Z" fill="${C.cream}"/>
      <rect x="40" y="130" width="22" height="110" fill="${C.ghost}"/><rect x="338" y="130" width="22" height="110" fill="${C.ghost}"/>
      <path d="M51 100 Q40 118 51 128 Q62 118 51 100 Z M349 100 Q338 118 349 128 Q360 118 349 100 Z" fill="${C.yellow}"/>
      <circle cx="96" cy="300" r="22" fill="${C.red}"/><circle cx="304" cy="300" r="22" fill="${C.lime}"/>
      ${pumpkin(300, 214, 30, 20, C.orange, C.gold)}${pumpkin(100, 216, 28, 18, C.gold, C.yellow)}`,
    ink: `${line("M96 278 L98 270 M304 278 L306 270", 4)}`,
  },
  {
    id: "to-fox",
    title: "Fox in the Leaves",
    shapes: `
      <rect width="400" height="400" fill="${C.cream}"/>
      ${[[40, 50, C.red, -20], [120, 30, C.gold, 30], [290, 40, C.orange, 10], [370, 70, C.maroon, -30], [30, 170, C.orange, 40], [370, 190, C.gold, -10], [50, 290, C.maroon, 20], [360, 300, C.red, 40]].map(([x, y, c, d]) => maple(+x, +y, 1.1, +d, String(c))).join("")}
      <path d="M0 340 Q200 316 400 340 L400 400 L0 400 Z" fill="${C.green}"/>
      <path d="M280 340 Q370 330 350 240 Q340 200 300 200 Q330 260 260 300 Z" fill="${C.darkOrange}"/>
      <path d="M330 300 Q360 300 350 250 Q336 280 320 290 Z" fill="${C.ghost}"/>
      <path d="M140 340 L150 230 L250 230 L262 340 Z" fill="${C.orange}"/>
      <path d="M170 340 L180 250 L222 250 L232 340 Z" fill="${C.ghost}"/>
      <path d="M200 240 L120 180 L130 100 L170 140 L230 140 L270 100 L280 180 Z" fill="${C.orange}"/>
      <path d="M134 116 L140 150 L160 140 Z M266 116 L260 150 L240 140 Z" fill="${C.slate}"/>
      <path d="M200 240 L140 186 L176 180 L200 200 L224 180 L260 186 Z" fill="${C.ghost}"/>
      <path d="M192 226 L208 226 L200 240 Z" fill="${C.slate}"/>`,
    ink: `${eye(176, 172, 7, 9)}${eye(224, 172, 7, 9)}`,
  },
  {
    id: "to-quilt",
    title: "Pumpkin Quilt",
    shapes: `
      ${quilt(50, [C.gold, C.cream, C.green, C.peach])}
      <circle cx="200" cy="210" r="140" fill="${C.brown}"/>
      <circle cx="200" cy="210" r="124" fill="${C.cream}"/>
      ${pumpkin(200, 230, 100, 76, C.orange, C.darkOrange)}
      <ellipse cx="128" cy="230" rx="22" ry="54" fill="${C.gold}"/>
      <ellipse cx="272" cy="230" rx="22" ry="54" fill="${C.gold}"/>`,
    ink: "",
  },
  {
    id: "to-mandala",
    title: "Leaf Mandala",
    shapes: `
      ${sunburst(200, 200, 16, [C.cream, C.peach])}
      <circle cx="200" cy="200" r="180" fill="${C.brown}"/>
      ${petals(200, 200, 16, 156, 16, 26, [C.red, C.gold])}
      <circle cx="200" cy="200" r="128" fill="${C.cream}"/>
      ${Array.from({ length: 8 }, (_, i) => maple(200 + 92 * Math.cos((i * Math.PI) / 4), 200 + 92 * Math.sin((i * Math.PI) / 4), 0.95, i * 45 + 90, [C.orange, C.darkOrange, C.maroon, C.gold][i % 4])).join("")}
      ${petals(200, 200, 10, 46, 12, 20, [C.green, C.lime])}
      <circle cx="200" cy="200" r="30" fill="${C.yellow}"/>`,
    ink: "",
  },
  {
    id: "to-ship",
    title: "Mayflower",
    shapes: `
      <rect width="400" height="400" fill="${C.sky}"/>
      <circle cx="340" cy="60" r="30" fill="${C.yellow}"/>
      <rect x="0" y="290" width="400" height="110" fill="${C.blue}"/>
      ${[310, 340, 370].map((y, i) => `<path d="M0 ${y} Q50 ${y - 16} 100 ${y} Q150 ${y + 16} 200 ${y} Q250 ${y - 16} 300 ${y} Q350 ${y + 16} 400 ${y} L400 ${y + 30} L0 ${y + 30} Z" fill="${[C.navy, C.teal, C.navy][i]}"/>`).join("")}
      <path d="M50 250 L350 250 L310 320 L90 320 Z" fill="${C.brown}"/>
      <rect x="54" y="250" width="292" height="16" fill="${C.tan}"/><rect x="74" y="282" width="252" height="12" fill="${C.tan}"/>
      <path d="M300 250 L350 220 L350 250 Z" fill="${C.maroon}"/>
      ${[120, 200, 280].map((x) => `<rect x="${x - 6}" y="60" width="12" height="190" fill="${C.brown}"/>`).join("")}
      ${[[120, 100, 90, C.cream], [200, 80, 110, C.ghost], [280, 110, 80, C.cream]].map(([x, y, h, c]) => `<path d="M${+x - 44} ${y} L${+x + 44} ${y} Q${+x + 52} ${+y + +h / 2} ${+x + 44} ${+y + +h} L${+x - 44} ${+y + +h} Q${+x - 36} ${+y + +h / 2} ${+x - 44} ${y} Z" fill="${c}"/>`).join("")}
      <path d="M206 40 L240 50 L206 60 Z" fill="${C.red}"/>`,
    ink: `${line("M40 120 Q48 112 56 120 Q64 112 72 120 M320 140 Q328 132 336 140 Q344 132 352 140", 3)}`,
  },
  {
    id: "to-scarecrow",
    title: "Scarecrow Field",
    shapes: `
      ${sunburst(200, 60, 16, [C.sky, C.mint])}
      <path d="M0 250 Q200 220 400 250 L400 400 L0 400 Z" fill="${C.gold}"/>
      ${Array.from({ length: 6 }, (_, i) => `<path d="M${i * 70 + 10} 400 L${i * 70 + 24} 270 L${i * 70 + 38} 400 Z" fill="${i % 2 ? C.green : C.darkGreen}"/>`).join("")}
      <rect x="192" y="220" width="16" height="180" fill="${C.brown}"/>
      <path d="M110 220 L290 220 L276 320 L124 320 Z" fill="${C.blue}"/>
      <rect x="172" y="236" width="56" height="84" fill="${C.red}"/>
      <rect x="128" y="250" width="30" height="30" fill="${C.yellow}"/><rect x="244" y="270" width="28" height="28" fill="${C.green}"/>
      <rect x="70" y="224" width="60" height="32" rx="10" fill="${C.blue}"/><rect x="270" y="224" width="60" height="32" rx="10" fill="${C.blue}"/>
      <path d="M50 232 L72 222 L72 262 L50 252 Z M350 232 L328 222 L328 262 L350 252 Z" fill="${C.yellow}"/>
      <circle cx="200" cy="170" r="52" fill="${C.cream}"/>
      <ellipse cx="200" cy="118" rx="92" ry="16" fill="${C.tan}"/>
      <path d="M150 118 Q158 58 200 58 Q242 58 250 118 Z" fill="${C.tan}"/>
      <rect x="156" y="98" width="88" height="16" fill="${C.purple}"/>
      <path d="M192 172 L208 172 L200 188 Z" fill="${C.orange}"/>
      <path d="M300 120 Q320 100 340 120 L350 140 L300 140 Z" fill="${C.slate}"/>`,
    ink: `${eye(182, 160, 7)}${eye(218, 160, 7)}${line("M180 200 Q200 214 220 200", 4)}${eye(326, 124, 4)}
      ${line("M200 236 L200 320 M140 300 L160 300 M252 300 L268 300", 3)}`,
  },
  {
    id: "to-pies",
    title: "Pie Shelf",
    shapes: `
      <rect width="400" height="400" fill="${C.mint}"/>
      ${[150, 300].map((y) => `<rect x="20" y="${y}" width="360" height="20" fill="${C.brown}"/>`).join("")}
      ${[[90, C.darkOrange], [200, C.maroon], [310, C.gold]].map(([x, c]) => `<path d="M${+x - 54} 150 L${+x + 54} 150 L${+x + 44} 120 L${+x - 44} 120 Z" fill="${C.tan}"/><ellipse cx="${x}" cy="120" rx="44" ry="12" fill="${c}"/>`).join("")}
      ${[60, 120, 180, 240, 300].map((x, i) => `<rect x="${x - 2}" y="210" width="44" height="90" rx="8" fill="${[C.red, C.purple, C.gold, C.green, C.orange][i]}"/><rect x="${x + 2}" y="198" width="36" height="16" rx="4" fill="${C.gray}"/><rect x="${x + 4}" y="240" width="32" height="26" fill="${C.cream}"/>`).join("")}
      ${pumpkin(350, 270, 22, 16, C.orange, C.gold)}
      <rect x="0" y="320" width="400" height="80" fill="${C.tan}"/>
      ${Array.from({ length: 5 }, (_, i) => `<rect x="${i * 80 + 30}" y="330" width="40" height="60" fill="${C.brown}"/>`).join("")}`,
    ink: `${[90, 200, 310].map((x) => line(`M${x - 30} 116 L${x + 30} 124 M${x - 30} 124 L${x + 30} 116`, 3)).join("")}`,
  },
  {
    id: "to-cornucopia",
    title: "Big Cornucopia",
    shapes: `
      ${quilt(50, [C.cream, C.peach, C.peach, C.cream])}
      <rect x="0" y="320" width="400" height="80" fill="${C.brown}"/>
      <defs><clipPath id="horn"><path d="M30 120 Q120 60 240 110 L270 300 Q150 330 70 270 Q60 200 30 120 Z"/></clipPath></defs>
      <g clip-path="url(#horn)">${Array.from({ length: 10 }, (_, i) => `<rect x="${i * 30}" y="0" width="30" height="400" fill="${i % 2 ? C.tan : C.gold}"/>`).join("")}</g>
      <ellipse cx="256" cy="205" rx="34" ry="96" fill="${C.brown}"/>
      <circle cx="300" cy="140" r="34" fill="${C.red}"/><circle cx="330" cy="210" r="32" fill="${C.orange}"/>
      <path d="M260 270 Q250 320 284 326 Q318 320 302 270 Q292 254 280 256 Q268 254 260 270 Z" fill="${C.lime}"/>
      ${[[340, 280], [362, 300], [344, 312], [366, 330], [324, 300]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="${C.purple}"/>`).join("")}
      <path d="M290 90 Q300 60 330 70 Q316 96 290 90 Z" fill="${C.green}"/>
      ${maple(60, 340, 1, -20, C.red)}${maple(140, 360, 0.9, 20, C.orange)}`,
    ink: `${line("M300 106 L304 92 M280 256 L282 244", 4)}`,
  },
];

export const CHRISTMAS_OLDER: HalloweenDesign[] = [
  {
    id: "co-tree",
    title: "Grand Tree",
    shapes: `
      ${quilt(50, [C.navy, C.blue, C.blue, C.navy])}
      <path d="M0 340 Q200 316 400 340 L400 400 L0 400 Z" fill="${C.ghost}"/>
      <rect x="180" y="300" width="40" height="50" fill="${C.brown}"/>
      <path d="M200 50 L300 170 L100 170 Z" fill="${C.green}"/>
      <path d="M200 110 L320 250 L80 250 Z" fill="${C.darkGreen}"/>
      <path d="M200 180 L340 320 L60 320 Z" fill="${C.green}"/>
      <path d="M130 150 Q200 180 262 140 L272 152 Q200 196 120 162 Z" fill="${C.gold}"/>
      <path d="M110 230 Q200 270 290 222 L300 236 Q200 288 100 244 Z" fill="${C.red}"/>
      <path d="M90 300 Q200 336 316 292 L326 306 Q200 352 80 314 Z" fill="${C.gold}"/>
      ${[[170, 130, C.red], [230, 120, C.blue], [150, 200, C.purple], [250, 200, C.yellow], [200, 214, C.pink], [130, 276, C.blue], [270, 270, C.purple], [200, 284, C.red]].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="12" fill="${c}"/>`).join("")}
      ${star(200, 50, 30, C.yellow)}
      ${present(50, 330, 60, 40, C.red, C.gold)}${present(290, 326, 70, 44, C.purple, C.mint)}`,
    ink: "",
  },
  {
    id: "co-gingerbread-house",
    title: "Gingerbread House",
    shapes: `
      <rect width="400" height="400" fill="${C.sky}"/>
      <path d="M0 330 Q200 306 400 330 L400 400 L0 400 Z" fill="${C.ghost}"/>
      <rect x="90" y="180" width="220" height="160" fill="${C.tan}"/>
      <path d="M70 196 L200 80 L330 196 Z" fill="${C.ghost}"/>
      <defs><clipPath id="roof"><path d="M86 190 L200 92 L314 190 Z"/></clipPath></defs>
      <g clip-path="url(#roof)">${scales(80, 92, 240, 100, 14, [C.pink, C.mint, C.lilac])}</g>
      ${window4(116, 210, 40, 40, C.yellow, C.gold, C.ghost)}${window4(244, 210, 40, 40, C.gold, C.yellow, C.ghost)}
      <path d="M176 340 L176 270 Q200 246 224 270 L224 340 Z" fill="${C.brown}"/>
      ${[110, 140, 260, 290].map((x, i) => `<circle cx="${x}" cy="292" r="12" fill="${[C.red, C.green, C.yellow, C.purple][i]}"/>`).join("")}
      ${[100, 300].map((x) => `<rect x="${x - 6}" y="250" width="12" height="90" fill="${C.ghost}"/>`).join("")}
      ${Array.from({ length: 7 }, (_, i) => `<circle cx="${100 + i * 33}" cy="348" r="10" fill="${[C.red, C.green, C.yellow, C.blue, C.pink, C.orange, C.purple][i]}"/>`).join("")}`,
    ink: `${[100, 300].map((x) => line(`M${x - 6} 262 L${x + 6} 256 M${x - 6} 286 L${x + 6} 280 M${x - 6} 310 L${x + 6} 304`, 3)).join("")}<circle cx="214" cy="306" r="4" fill="${INK}"/>`,
  },
  {
    id: "co-globe",
    title: "Snow Globe",
    shapes: `
      ${quilt(50, [C.lilac, C.pink, C.pink, C.lilac])}
      <path d="M100 330 L300 330 L320 380 L80 380 Z" fill="${C.maroon}"/>
      <rect x="110" y="340" width="180" height="20" fill="${C.gold}"/>
      <circle cx="200" cy="200" r="140" fill="${C.sky}"/>
      <path d="M64 240 Q200 210 336 240 Q330 300 280 330 L120 330 Q70 300 64 240 Z" fill="${C.ghost}"/>
      <rect x="160" y="190" width="80" height="60" fill="${C.red}"/>
      <path d="M150 196 L200 150 L250 196 Z" fill="${C.ghost}"/>
      <rect x="190" y="220" width="20" height="30" fill="${C.brown}"/>
      ${window4(168, 200, 16, 16, C.yellow, C.gold, C.ghost)}
      <path d="M90 250 L110 180 L130 250 Z M270 250 L290 170 L310 250 Z" fill="${C.darkGreen}"/>
      ${star(110, 176, 8, C.yellow)}${star(290, 166, 8, C.yellow)}`,
    ink: `${flakes([[120, 110], [200, 90], [280, 110], [150, 150], [260, 140], [230, 120]], 7)}`,
  },
  {
    id: "co-nutcracker",
    title: "Nutcracker",
    shapes: `
      ${sunburst(200, 140, 18, [C.mint, C.cream])}
      <rect x="0" y="360" width="400" height="40" fill="${C.brown}"/>
      <rect x="150" y="270" width="40" height="90" fill="${C.blue}"/><rect x="210" y="270" width="40" height="90" fill="${C.blue}"/>
      <rect x="146" y="340" width="48" height="20" fill="${C.slate}"/><rect x="206" y="340" width="48" height="20" fill="${C.slate}"/>
      <rect x="140" y="170" width="120" height="110" rx="10" fill="${C.red}"/>
      <rect x="140" y="250" width="120" height="20" fill="${C.slate}"/><rect x="188" y="252" width="24" height="16" fill="${C.gold}"/>
      <rect x="110" y="176" width="30" height="90" rx="12" fill="${C.red}"/><rect x="260" y="176" width="30" height="90" rx="12" fill="${C.red}"/>
      <circle cx="125" cy="272" r="13" fill="${C.peach}"/><circle cx="275" cy="272" r="13" fill="${C.peach}"/>
      ${[190, 214, 238].map((y) => `<circle cx="200" cy="${y}" r="6" fill="${C.gold}"/>`).join("")}
      <rect x="160" y="96" width="80" height="80" rx="8" fill="${C.peach}"/>
      <path d="M160 150 Q200 186 240 150 L240 176 L160 176 Z" fill="${C.ghost}"/>
      <rect x="156" y="30" width="88" height="70" fill="${C.slate}"/><rect x="150" y="90" width="100" height="14" fill="${C.gold}"/>
      ${star(200, 60, 14, C.yellow)}
      <ellipse cx="178" cy="136" rx="9" ry="6" fill="${C.pink}"/><ellipse cx="222" cy="136" rx="9" ry="6" fill="${C.pink}"/>`,
    ink: `${eye(184, 122, 6)}${eye(216, 122, 6)}${line("M186 152 L214 152", 4)}`,
  },
  {
    id: "co-sleigh",
    title: "Santa's Sleigh",
    shapes: `
      <rect width="400" height="400" fill="${C.navy}"/>
      <circle cx="200" cy="170" r="130" fill="${C.yellow}"/>
      <circle cx="160" cy="130" r="16" fill="${C.gold}"/><circle cx="250" cy="200" r="20" fill="${C.gold}"/>
      <path d="M0 330 Q200 300 400 330 L400 400 L0 400 Z" fill="${C.ghost}"/>
      <path d="M90 250 L280 250 Q320 250 320 210 L340 206 Q344 280 280 290 L110 290 Q80 280 90 250 Z" fill="${C.red}"/>
      <rect x="96" y="262" width="200" height="12" fill="${C.gold}"/>
      ${present(120, 200, 50, 50, C.green, C.yellow)}${present(180, 210, 46, 40, C.blue, C.pink)}${present(234, 196, 40, 54, C.purple, C.gold)}
      <path d="M70 310 L310 310 Q340 310 344 290" fill="none" stroke="${C.slate}" stroke-width="8" stroke-linecap="round"/>
      ${star(40, 40, 12, C.yellow)}${star(360, 50, 12, C.yellow)}${star(350, 300, 10, C.yellow)}`,
    ink: `${line("M300 296 L300 310 M120 290 L120 310", 6)}
      ${flakes([[40, 140], [370, 160], [60, 250], [340, 110]])}`,
  },
  {
    id: "co-snow-mandala",
    title: "Snowflake Mandala",
    shapes: `
      ${glass(200, 200, [60, 110, 160, 290], 12, [C.blue, C.sky, C.ghost, C.navy, C.mint])}
      ${petals(200, 200, 6, 70, 14, 40, [C.lilac])}
      <circle cx="200" cy="200" r="26" fill="${C.yellow}"/>`,
    ink: `${line([0, 60, 120].map((a) => { const dx = 150 * Math.cos((a * Math.PI) / 180), dy = 150 * Math.sin((a * Math.PI) / 180); return `M${f(200 - dx)} ${f(200 - dy)} L${f(200 + dx)} ${f(200 + dy)}`; }).join(" "), 3)}`,
  },
  {
    id: "co-fireplace",
    title: "Cozy Fireplace",
    shapes: `
      ${Array.from({ length: 10 }, (_, r) => Array.from({ length: 6 }, (_, i) => `<rect x="${i * 80 - (r % 2) * 40}" y="${r * 40}" width="80" height="40" fill="${[C.peach, C.tan, C.cream][(2 * i + 2 - (r % 2)) % 3]}"/>`).join("")).join("")}
      <rect x="20" y="70" width="360" height="30" fill="${C.brown}"/>
      <path d="M90 360 L90 200 Q200 140 310 200 L310 360 Z" fill="${C.slate}"/>
      <path d="M130 360 Q120 300 160 270 Q160 300 200 250 Q240 300 240 270 Q280 300 270 360 Z" fill="${C.orange}"/>
      <path d="M160 360 Q156 320 180 300 Q190 326 210 300 Q236 320 230 360 Z" fill="${C.yellow}"/>
      <rect x="110" y="350" width="180" height="20" rx="8" fill="${C.brown}"/>
      ${[[90, C.red, C.ghost], [200, C.green, C.ghost], [310, C.blue, C.ghost]].map(([x, a, b]) => `<path d="M${+x - 22} 100 L${+x + 22} 100 L${+x + 22} 160 Q${+x + 22} 176 ${+x + 40} 180 Q${+x + 50} 196 ${+x + 30} 200 L${+x - 4} 194 Q${+x - 22} 190 ${+x - 22} 170 Z" fill="${a}"/><rect x="${+x - 26}" y="96" width="52" height="20" rx="6" fill="${b}"/>`).join("")}
      <path d="M20 66 Q60 86 100 66 Q140 86 180 66 Q220 86 260 66 Q300 86 340 66 Q360 76 380 66 L380 56 L20 56 Z" fill="${C.darkGreen}"/>`,
    ink: "",
  },
  {
    id: "co-wreath",
    title: "Fancy Wreath",
    shapes: `
      ${quilt(50, [C.cream, C.peach, C.peach, C.cream])}
      <circle cx="200" cy="210" r="160" fill="${C.darkGreen}"/>
      ${petals(200, 210, 18, 136, 16, 30, [C.green, C.lime, C.teal])}
      ${petals(200, 210, 14, 100, 12, 22, [C.lime, C.green])}
      <circle cx="200" cy="210" r="80" fill="${C.cream}"/>
      ${Array.from({ length: 10 }, (_, i) => `<circle cx="${f(200 + 120 * Math.cos((i * Math.PI) / 5 + 0.3))}" cy="${f(210 + 120 * Math.sin((i * Math.PI) / 5 + 0.3))}" r="10" fill="${C.red}"/>`).join("")}
      <path d="M200 70 L146 30 L146 108 Z M200 70 L254 30 L254 108 Z" fill="${C.red}"/>
      <path d="M190 80 L160 150 L180 150 L200 100 Z M210 80 L240 150 L220 150 L200 100 Z" fill="${C.maroon}"/>
      <circle cx="200" cy="70" r="16" fill="${C.gold}"/>`,
    ink: "",
  },
  {
    id: "co-ornaments",
    title: "Ornament Trio",
    shapes: `
      <rect width="400" height="400" fill="${C.darkGreen}"/>
      ${[[80, 200, 66, [C.red, C.gold, C.ghost]], [200, 240, 80, [C.blue, C.sky, C.gold]], [320, 200, 66, [C.purple, C.pink, C.ghost]]].map(([x, y, r, cs], i) => `
        <defs><clipPath id="orn${i}"><circle cx="${x}" cy="${y}" r="${r}"/></clipPath></defs>
        <g clip-path="url(#orn${i})">${Array.from({ length: 8 }, (_, k) => `<rect x="${+x - +r}" y="${+y - +r + k * ((2 * +r) / 8)}" width="${2 * +r}" height="${(2 * +r) / 8 + 0.5}" fill="${(cs as string[])[k % 3]}"/>`).join("")}</g>
        <rect x="${+x - 16}" y="${+y - +r - 16}" width="32" height="20" rx="3" fill="${C.gray}"/>`).join("")}
      ${star(40, 50, 14, C.yellow)}${star(200, 40, 16, C.yellow)}${star(360, 50, 14, C.yellow)}${star(40, 360, 12, C.yellow)}${star(360, 360, 12, C.yellow)}`,
    ink: `${line("M80 118 L80 0 M200 144 L200 60 M320 118 L320 0", 3)}`,
  },
  {
    id: "co-penguins",
    title: "Penguin Family",
    shapes: `
      <rect width="400" height="400" fill="${C.navy}"/>
      <path d="M0 80 Q100 40 200 90 Q300 140 400 80 L400 120 Q300 180 200 130 Q100 80 0 120 Z" fill="${C.mint}"/>
      <path d="M0 140 Q120 100 220 150 Q320 196 400 150 L400 180 Q320 226 220 180 Q120 130 0 170 Z" fill="${C.lilac}"/>
      <path d="M0 300 Q200 270 400 300 L400 400 L0 400 Z" fill="${C.ghost}"/>
      <path d="M260 300 Q260 220 330 220 Q400 220 400 300 Z" fill="${C.sky}"/>
      <path d="M310 300 L310 270 Q330 250 350 270 L350 300 Z" fill="${C.blue}"/>
      ${penguin(100, 320, 1, C.red)}${penguin(200, 330, 0.75, C.green)}${penguin(160, 340, 0.5, C.yellow)}`,
    ink: `${[[100, 320, 1], [200, 330, 0.75], [160, 340, 0.5]].map(([x, b, s]) => `${eye(x - 10 * s, b - 150 * s + 28 * s, 5 * s + 1)}${eye(x + 10 * s, b - 150 * s + 28 * s, 5 * s + 1)}`).join("")}
      ${line("M260 280 L400 280 M280 260 L380 260 M300 240 L360 240", 2.5)}${flakes([[60, 220], [320, 30], [260, 210]])}`,
  },
];

// Christmas party pages (grown-up): detailed, colorful drawings on Letter, 400 × 530, drawn
// here so they're free to use. Every colored shape is a shape to color.

import { INK, line, star, type HalloweenDesign } from "@/lib/halloween/designs";

const P = {
  red: "#C8323C",
  cranberry: "#8E1F35",
  pink: "#EE8FA6",
  blush: "#F7C9CF",
  emerald: "#2E8B57",
  forest: "#1F5E3D",
  mint: "#9ED9B8",
  gold: "#E5B53A",
  butter: "#F6DE8A",
  cream: "#FBF1DD",
  navy: "#243B6B",
  sky: "#8EC5E8",
  ice: "#DDEFF8",
  teal: "#2A9D8F",
  plum: "#6B3A7A",
  lilac: "#B9A3D9",
  orange: "#E9823A",
  brown: "#7A4A2A",
  tan: "#C99A6B",
  snow: "#F4F7FA",
  slate: "#5B6577",
  charcoal: "#3A3A44",
} as const;

export const PARTY_H = 530;

/** A present: box, lid, ribbon and bow, with a pattern on the box. */
function present(x: number, y: number, w: number, h: number, box: string, ribbon: string, pattern: "stripes" | "dots" | "plain" | "checks", dot: string) {
  const lid = h * 0.2;
  let pat = "";
  if (pattern === "stripes") {
    for (let i = 1; i < 6; i += 2) pat += `<rect x="${x + (w * i) / 6}" y="${y + lid}" width="${w / 6}" height="${h - lid}" fill="${dot}"/>`;
  } else if (pattern === "dots") {
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) pat += `<circle cx="${x + w * (0.18 + c * 0.32)}" cy="${y + lid + (h - lid) * (0.3 + r * 0.42)}" r="${Math.min(w, h) * 0.07}" fill="${dot}"/>`;
  } else if (pattern === "checks") {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) if ((r + c) % 2) pat += `<rect x="${x + (w * c) / 4}" y="${y + lid + ((h - lid) * r) / 3}" width="${w / 4}" height="${(h - lid) / 3}" fill="${dot}"/>`;
  }
  const rw = w * 0.14;
  return (
    `<rect x="${x}" y="${y + lid}" width="${w}" height="${h - lid}" fill="${box}"/>${pat}` +
    `<rect x="${x - 4}" y="${y}" width="${w + 8}" height="${lid}" fill="${box}"/>` +
    `<rect x="${x + w / 2 - rw / 2}" y="${y}" width="${rw}" height="${h}" fill="${ribbon}"/>` +
    `<rect x="${x - 4}" y="${y + lid + (h - lid) * 0.45}" width="${w + 8}" height="${rw * 0.8}" fill="${ribbon}"/>` +
    `<ellipse cx="${x + w / 2 - w * 0.15}" cy="${y - 8}" rx="${w * 0.16}" ry="${10}" transform="rotate(-20 ${x + w / 2 - w * 0.15} ${y - 8})" fill="${ribbon}"/>` +
    `<ellipse cx="${x + w / 2 + w * 0.15}" cy="${y - 8}" rx="${w * 0.16}" ry="${10}" transform="rotate(20 ${x + w / 2 + w * 0.15} ${y - 8})" fill="${ribbon}"/>`
  );
}

/** A round ornament with a band and a cap. */
function bauble(cx: number, cy: number, r: number, a: string, band: string) {
  return `<rect x="${cx - r * 0.3}" y="${cy - r - 6}" width="${r * 0.6}" height="8" fill="${P.gold}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${a}"/><rect x="${cx - r}" y="${cy - r * 0.22}" width="${r * 2}" height="${r * 0.44}" fill="${band}" clip-path="circle(${r}px at ${cx}px ${cy}px)"/>`;
}

/** A tree tier: a wavy-bottomed triangle. */
function tier(cx: number, top: number, bottom: number, half: number, fill: string) {
  const n = 5;
  let d = `M${cx} ${top} L${cx + half} ${bottom}`;
  for (let i = n; i > 0; i--) {
    const x1 = cx - half + (2 * half * i) / n;
    const x0 = cx - half + (2 * half * (i - 1)) / n;
    d += ` Q${(x0 + x1) / 2} ${bottom + 14} ${x0} ${bottom}`;
  }
  return `<path d="${d} Z" fill="${fill}"/>`;
}

const snowflake = (cx: number, cy: number, r: number) =>
  line(Array.from({ length: 3 }, (_, i) => {
    const a = (i * Math.PI) / 3;
    return `M${cx - r * Math.cos(a)} ${cy - r * Math.sin(a)} L${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
  }).join(" "), 1.6);

const FRAME = `<rect x="10" y="10" width="380" height="${PARTY_H - 20}" fill="none" stroke="${INK}" stroke-width="1.6"/>`;

const TREE: HalloweenDesign = {
  id: "party-tree",
  title: "Christmas Tree and Presents",
  height: PARTY_H,
  shapes: `
    <rect width="400" height="${PARTY_H}" fill="${P.navy}"/>
    ${Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => `<path d="M${c * 50 + (r % 2 ? 25 : 0)} ${r * 50 - 25} l25 25 l-25 25 l-25 -25 Z" fill="${(r + c) % 3 ? "#2E4A80" : "#1C2F58"}"/>`).join("")).join("")}
    ${[[40, 60], [350, 90], [70, 200], [330, 230], [30, 330], [365, 340], [120, 30], [290, 40]].map(([x, y], i) => star(x, y, 9 + (i % 3) * 2, i % 2 ? P.butter : P.gold)).join("")}
    <rect x="0" y="420" width="400" height="${PARTY_H - 420}" fill="${P.ice}"/>
    <path d="M0 420 Q100 400 200 418 Q300 400 400 420 L400 440 Q300 426 200 442 Q100 426 0 440 Z" fill="${P.sky}"/>
    <rect x="186" y="380" width="28" height="44" fill="${P.brown}"/>
    ${tier(200, 270, 390, 140, P.forest)}${tier(200, 180, 300, 112, P.emerald)}${tier(200, 100, 214, 84, P.forest)}${tier(200, 52, 130, 56, P.emerald)}
    <path d="M90 360 Q200 330 310 360 L310 368 Q200 340 90 368 Z" fill="${P.gold}"/>
    <path d="M118 272 Q200 248 282 272 L282 280 Q200 256 118 280 Z" fill="${P.red}"/>
    <path d="M140 190 Q200 172 260 190 L260 198 Q200 180 140 198 Z" fill="${P.gold}"/>
    ${bauble(130, 350, 13, P.red, P.butter)}${bauble(200, 384, 12, P.lilac, P.plum)}${bauble(268, 344, 13, P.sky, P.navy)}
    ${bauble(160, 300, 11, P.pink, P.cranberry)}${bauble(240, 296, 11, P.butter, P.orange)}
    ${bauble(150, 240, 11, P.teal, P.mint)}${bauble(252, 236, 11, P.red, P.blush)}${bauble(200, 220, 10, P.lilac, P.plum)}
    ${bauble(176, 160, 10, P.orange, P.butter)}${bauble(226, 150, 10, P.pink, P.red)}${bauble(200, 108, 9, P.sky, P.ice)}
    ${[[120, 330], [170, 340], [230, 336], [280, 326], [140, 260], [180, 270], [222, 268], [262, 258], [160, 202], [242, 198], [184, 140], [216, 136], [114, 380], [286, 380], [150, 386], [250, 384]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="5" fill="${[P.butter, P.pink, P.sky, P.mint][i % 4]}"/>`).join("")}
    ${star(200, 44, 26, P.gold)}${star(200, 46, 12, P.butter)}
    ${present(40, 400, 80, 70, P.red, P.gold, "stripes", P.cranberry)}
    ${present(128, 420, 64, 54, P.teal, P.red, "dots", P.mint)}
    ${present(214, 410, 70, 64, P.plum, P.butter, "checks", P.lilac)}
    ${present(292, 396, 74, 78, P.emerald, P.pink, "dots", P.butter)}
    ${present(92, 470, 60, 44, P.orange, P.navy, "plain", P.butter)}
    ${present(250, 478, 66, 38, P.pink, P.emerald, "stripes", P.blush)}`,
  ink: `${snowflake(60, 120, 8)}${snowflake(345, 160, 8)}${snowflake(90, 270, 7)}${snowflake(320, 290, 7)}${FRAME}`,
};

const SNOWMAN: HalloweenDesign = {
  id: "party-snowman",
  title: "Snowman",
  height: PARTY_H,
  shapes: `
    <rect width="400" height="${PARTY_H}" fill="${P.sky}"/>
    ${Array.from({ length: 5 }, (_, i) => `<rect x="0" y="${i * 60}" width="400" height="30" fill="#A8D3EE"/>`).join("")}
    <circle cx="320" cy="80" r="34" fill="${P.butter}"/>
    <path d="M0 300 L70 200 L130 280 L200 190 L280 290 L340 220 L400 290 L400 340 L0 340 Z" fill="${P.lilac}"/>
    <path d="M70 200 L86 222 L72 218 L58 224 Z M200 190 L218 214 L202 210 L186 218 Z M340 220 L354 238 L342 236 L328 242 Z" fill="${P.snow}"/>
    <path d="M0 330 Q200 300 400 330 L400 ${PARTY_H} L0 ${PARTY_H} Z" fill="${P.ice}"/>
    <path d="M0 380 Q120 350 240 380 Q320 360 400 380 L400 420 Q300 400 200 420 Q100 400 0 420 Z" fill="${P.snow}"/>
    ${Array.from({ length: 9 }, (_, i) => `<rect x="${8 + i * 44}" y="440" width="12" height="44" fill="${P.tan}"/><path d="M${8 + i * 44} 440 l6 -8 l6 8 Z" fill="${P.tan}"/>`).join("")}
    <rect x="0" y="452" width="400" height="8" fill="${P.brown}"/><rect x="0" y="470" width="400" height="8" fill="${P.brown}"/>
    <path d="M0 482 Q200 456 400 482 L400 ${PARTY_H} L0 ${PARTY_H} Z" fill="${P.snow}"/>
    ${tier(120, 300, 360, 22, P.emerald)}${tier(120, 280, 320, 16, P.forest)}${tier(280, 310, 368, 22, P.forest)}${tier(280, 290, 330, 16, P.emerald)}
    ${tier(56, 280, 400, 46, P.forest)}${tier(56, 240, 320, 36, P.emerald)}<rect x="50" y="398" width="12" height="20" fill="${P.brown}"/>
    ${tier(346, 300, 410, 40, P.emerald)}${tier(346, 264, 334, 30, P.forest)}<rect x="340" y="408" width="12" height="18" fill="${P.brown}"/>
    <circle cx="200" cy="420" r="78" fill="${P.snow}"/>
    <circle cx="200" cy="298" r="58" fill="${P.snow}"/>
    <circle cx="200" cy="200" r="46" fill="${P.snow}"/>
    <path d="M154 250 Q200 270 246 250 L248 268 Q200 290 152 268 Z" fill="${P.red}"/>
    <path d="M176 258 Q182 262 190 264 L190 282 Q182 280 174 276 Z M210 264 Q218 262 226 258 L228 276 Q220 280 210 282 Z" fill="${P.butter}"/>
    <path d="M226 262 L250 262 L256 330 L232 330 Z" fill="${P.red}"/>
    <rect x="232" y="290" width="22" height="8" fill="${P.butter}"/><rect x="234" y="310" width="20" height="8" fill="${P.butter}"/>
    <rect x="148" y="146" width="104" height="14" rx="4" fill="${P.charcoal}"/>
    <rect x="164" y="88" width="72" height="62" fill="${P.charcoal}"/>
    <rect x="164" y="128" width="72" height="12" fill="${P.red}"/>
    <path d="M222 120 q8 -10 16 0 q-8 10 -16 0 Z" fill="${P.emerald}"/><circle cx="230" cy="122" r="4" fill="${P.red}"/>
    <path d="M200 200 L240 210 L200 214 Z" fill="${P.orange}"/>
    <circle cx="200" cy="300" r="7" fill="${P.charcoal}"/><circle cx="200" cy="330" r="7" fill="${P.charcoal}"/><circle cx="200" cy="400" r="8" fill="${P.charcoal}"/>
    <circle cx="176" cy="210" r="8" fill="${P.blush}"/><circle cx="224" cy="214" r="8" fill="${P.blush}"/>
    <path d="M142 286 L82 250 L78 240 L90 244 L144 278 Z" fill="${P.brown}"/>
    <path d="M258 286 L318 246 L330 244 L322 254 L256 278 Z" fill="${P.brown}"/>
    <path d="M60 470 Q80 446 104 460 L108 476 Q82 466 64 484 Z" fill="${P.teal}"/>
    ${present(270, 440, 56, 46, P.red, P.gold, "dots", P.butter)}${present(100, 452, 48, 40, P.plum, P.mint, "stripes", P.lilac)}`,
  ink: `<circle cx="184" cy="190" r="5" fill="${INK}"/><circle cx="214" cy="190" r="5" fill="${INK}"/>
    ${line("M182 226 Q200 236 218 226", 2.4)}
    ${[[40, 60], [120, 120], [270, 150], [370, 160], [100, 220], [300, 230], [30, 170], [160, 50], [380, 40]].map(([x, y]) => snowflake(x, y, 7)).join("")}${FRAME}`,
};

/** A stocking hanging from (x, y): cuff, leg and foot, toe and heel patches. */
function stocking(x: number, y: number, body: string, cuff: string, patch: string) {
  return (
    `<path d="M${x} ${y + 20} L${x + 44} ${y + 20} L${x + 44} ${y + 96} Q${x + 44} ${y + 124} ${x + 12} ${y + 126} L${x - 26} ${y + 126} Q${x - 42} ${y + 110} ${x - 24} ${y + 96} L${x} ${y + 84} Z" fill="${body}"/>` +
    `<path d="M${x - 26} ${y + 126} Q${x - 42} ${y + 110} ${x - 24} ${y + 96} L${x - 10} ${y + 104} Q${x - 18} ${y + 116} ${x - 6} ${y + 126} Z" fill="${patch}"/>` +
    `<path d="M${x + 44} ${y + 96} Q${x + 44} ${y + 124} ${x + 12} ${y + 126} L${x + 22} ${y + 106} L${x + 44} ${y + 100} Z" fill="${patch}"/>` +
    `<rect x="${x - 4}" y="${y}" width="52" height="24" rx="6" fill="${cuff}"/>`
  );
}

const FIREPLACE: HalloweenDesign = {
  id: "party-fireplace",
  title: "Cozy Fireplace",
  height: PARTY_H,
  shapes: `
    <rect width="400" height="${PARTY_H}" fill="${P.cream}"/>
    ${Array.from({ length: 8 }, (_, i) => `<rect x="${i * 50}" y="0" width="25" height="${PARTY_H}" fill="${P.blush}"/>`).join("")}
    <rect x="0" y="470" width="400" height="${PARTY_H - 470}" fill="${P.brown}"/>
    <rect x="40" y="200" width="320" height="270" fill="${P.red}"/>
    ${Array.from({ length: 5 }, (_, r) => Array.from({ length: 6 }, (_, c) => `<rect x="${44 + c * 53 + (r % 2 ? 26 : 0)}" y="${204 + r * 54}" width="${r % 2 && c === 5 ? 22 : 48}" height="50" fill="${r % 2 ? P.cranberry : P.red}"/>`).join("")).join("")}
    <rect x="110" y="300" width="180" height="170" rx="6" fill="${P.charcoal}"/>
    <rect x="130" y="440" width="140" height="18" rx="6" fill="${P.brown}"/><rect x="146" y="424" width="110" height="18" rx="6" fill="${P.tan}"/>
    <path d="M150 432 Q140 380 172 350 Q170 390 190 400 Q186 360 206 330 Q222 380 228 400 Q240 380 236 352 Q266 386 252 432 Z" fill="${P.orange}"/>
    <path d="M176 432 Q170 400 190 380 Q194 410 206 414 Q210 390 222 380 Q236 404 228 432 Z" fill="${P.gold}"/>
    <path d="M196 432 Q192 414 202 404 Q212 416 210 432 Z" fill="${P.butter}"/>
    <rect x="24" y="182" width="352" height="24" fill="${P.tan}"/>
    <path d="M24 186 Q70 210 116 186 Q162 210 208 186 Q254 210 300 186 Q346 210 376 186 L376 196 Q346 220 300 196 Q254 220 208 196 Q162 220 116 196 Q70 220 24 196 Z" fill="${P.emerald}"/>
    ${stocking(70, 196, P.red, P.snow, P.emerald)}${stocking(170, 196, P.emerald, P.snow, P.red)}${stocking(268, 196, P.plum, P.snow, P.gold)}
    ${bauble(116, 214, 8, P.gold, P.red)}${bauble(208, 214, 8, P.sky, P.navy)}${bauble(300, 214, 8, P.pink, P.cranberry)}
    <rect x="160" y="70" width="80" height="100" rx="40" fill="${P.gold}"/><rect x="170" y="80" width="60" height="80" rx="30" fill="${P.ice}"/>
    ${tier(70, 120, 180, 30, P.forest)}${tier(70, 96, 140, 22, P.emerald)}<rect x="62" y="178" width="16" height="6" fill="${P.brown}"/>
    ${tier(330, 120, 180, 30, P.forest)}${tier(330, 96, 140, 22, P.emerald)}<rect x="322" y="178" width="16" height="6" fill="${P.brown}"/>
    <rect x="124" y="140" width="14" height="42" fill="${P.butter}"/><path d="M131 124 Q124 134 131 140 Q138 134 131 124 Z" fill="${P.orange}"/>
    <rect x="262" y="140" width="14" height="42" fill="${P.butter}"/><path d="M269 124 Q262 134 269 140 Q276 134 269 124 Z" fill="${P.orange}"/>
    ${present(300, 420, 60, 50, P.teal, P.red, "dots", P.mint)}${present(30, 430, 56, 40, P.gold, P.emerald, "stripes", P.butter)}`,
  ink: `${snowflake(200, 120, 14)}${FRAME}`,
};

export const PARTY: HalloweenDesign[] = [TREE, SNOWMAN, FIREPLACE];

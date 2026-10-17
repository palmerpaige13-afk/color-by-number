// Fifteen ready-made Christmas pictures, drawn here (so they're free to use and give away),
// the same way as the Halloween ones (see halloween/designs.ts): 400 × 400 flat colors, with
// ink details printed already filled in.

import { C, INK, eye, line, star, type HalloweenDesign } from "@/lib/halloween/designs";

/** Snowflakes: small ink stars of six lines. */
function flakes(points: [number, number][], r = 9) {
  return points
    .map(([x, y]) =>
      line(
        [0, 60, 120]
          .map((a) => {
            const dx = (r * Math.cos((a * Math.PI) / 180)).toFixed(1);
            const dy = (r * Math.sin((a * Math.PI) / 180)).toFixed(1);
            return `M${x - +dx} ${y - +dy} L${x + +dx} ${y + +dy}`;
          })
          .join(" "),
        2.5,
      ),
    )
    .join("");
}

/** Holly: two leaves and three berries at (cx, cy). */
function holly(cx: number, cy: number, s = 1) {
  return (
    `<path transform="translate(${cx} ${cy}) scale(${s})" d="M0 0 Q-20 -24 -50 -14 Q-30 6 0 0 Z M0 0 Q20 -24 50 -14 Q30 6 0 0 Z" fill="${C.darkGreen}"/>` +
    `<circle cx="${cx - 9 * s}" cy="${cy + 2 * s}" r="${9 * s}" fill="${C.red}"/><circle cx="${cx + 9 * s}" cy="${cy + 2 * s}" r="${9 * s}" fill="${C.red}"/><circle cx="${cx}" cy="${cy - 10 * s}" r="${9 * s}" fill="${C.red}"/>`
  );
}

/** A present: box, lid band and ribbon. */
function present(x: number, y: number, w: number, h: number, box: string, ribbon: string) {
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${box}"/>` +
    `<rect x="${x + w / 2 - 9}" y="${y}" width="18" height="${h}" fill="${ribbon}"/>` +
    `<path d="M${x + w / 2} ${y} Q${x + w / 2 - 30} ${y - 30} ${x + w / 2 - 30} ${y - 6} Z M${x + w / 2} ${y} Q${x + w / 2 + 30} ${y - 30} ${x + w / 2 + 30} ${y - 6} Z" fill="${ribbon}"/>`
  );
}

export const CHRISTMAS: HalloweenDesign[] = [
  {
    id: "xm-tree",
    title: "Christmas Tree",
    shapes: `
      <rect width="400" height="400" fill="${C.navy}"/>
      <path d="M0 340 Q200 310 400 340 L400 400 L0 400 Z" fill="${C.ghost}"/>
      <rect x="180" y="300" width="40" height="50" fill="${C.brown}"/>
      <path d="M200 50 L310 200 L90 200 Z" fill="${C.green}"/>
      <path d="M200 130 L340 310 L60 310 Z" fill="${C.darkGreen}"/>
      <path d="M200 90 L290 200 L110 200 Z" fill="${C.green}"/>
      ${[[160, 180, C.red], [240, 170, C.blue], [130, 280, C.gold], [200, 250, C.red], [270, 280, C.purple], [200, 160, C.yellow]].map(([x, y, f]) => `<circle cx="${x}" cy="${y}" r="15" fill="${f}"/>`).join("")}
      ${star(200, 50, 32, C.yellow)}
      ${present(60, 320, 70, 50, C.red, C.gold)}
      ${present(270, 316, 80, 54, C.blue, C.pink)}`,
    ink: flakes([[40, 50], [350, 60], [60, 180], [350, 190], [30, 280], [370, 280]]),
  },
  {
    id: "xm-santa",
    title: "Santa",
    shapes: `
      <rect width="400" height="400" fill="${C.sky}"/>
      <path d="M200 260 Q90 260 70 400 L330 400 Q310 260 200 260 Z" fill="${C.red}"/>
      <rect x="180" y="300" width="40" height="100" fill="${C.ghost}"/>
      <path d="M110 200 Q100 330 200 350 Q300 330 290 200 Z" fill="${C.ghost}"/>
      <circle cx="200" cy="180" r="76" fill="${C.peach}"/>
      <path d="M130 200 Q140 280 200 290 Q260 280 270 200 Q240 230 200 226 Q160 230 130 200 Z" fill="${C.ghost}"/>
      <circle cx="200" cy="200" r="16" fill="${C.pink}"/>
      <path d="M120 130 Q160 30 290 60 Q330 90 340 150 L300 140 Q260 90 220 100 Z" fill="${C.red}"/>
      <rect x="110" y="118" width="190" height="34" rx="17" fill="${C.ghost}"/>
      <circle cx="342" cy="160" r="22" fill="${C.ghost}"/>
      <ellipse cx="156" cy="196" rx="14" ry="9" fill="${C.pink}"/>
      <ellipse cx="244" cy="196" rx="14" ry="9" fill="${C.pink}"/>`,
    ink: `${eye(176, 176, 9, 11)}${eye(224, 176, 9, 11)}${line("M184 240 Q200 252 216 240", 5)}`,
  },
  {
    id: "xm-snowman",
    title: "Snowman",
    shapes: `
      <rect width="400" height="400" fill="${C.blue}"/>
      <path d="M0 330 Q200 300 400 330 L400 400 L0 400 Z" fill="${C.ghost}"/>
      <circle cx="200" cy="290" r="90" fill="${C.ghost}"/>
      <circle cx="200" cy="170" r="66" fill="${C.ghost}"/>
      <rect x="140" y="214" width="120" height="26" rx="13" fill="${C.red}"/>
      <rect x="226" y="224" width="26" height="70" rx="8" fill="${C.red}"/>
      <rect x="150" y="56" width="100" height="60" fill="${C.slate}"/>
      <rect x="126" y="108" width="148" height="18" rx="6" fill="${C.slate}"/>
      <rect x="150" y="88" width="100" height="16" fill="${C.green}"/>
      <path d="M200 170 L250 182 L200 190 Z" fill="${C.orange}"/>
      <ellipse cx="168" cy="190" rx="12" ry="8" fill="${C.pink}"/>
      <ellipse cx="232" cy="190" rx="12" ry="8" fill="${C.pink}"/>`,
    ink: `${eye(180, 152, 8)}${eye(220, 152, 8)}${line("M180 200 Q200 212 220 200", 4)}
      <circle cx="200" cy="270" r="7" fill="${INK}"/><circle cx="200" cy="300" r="7" fill="${INK}"/><circle cx="200" cy="330" r="7" fill="${INK}"/>
      ${line("M130 260 L70 220 M90 232 L76 206 M270 260 L330 220 M310 232 L324 206", 6)}
      ${flakes([[50, 60], [340, 50], [60, 160], [350, 160], [30, 260], [370, 270]])}`,
  },
  {
    id: "xm-reindeer",
    title: "Reindeer",
    shapes: `
      <rect width="400" height="400" fill="${C.mint}"/>
      <path d="M164 112 Q132 76 140 22 M142 64 Q116 56 106 32 M150 88 Q178 70 182 44 M236 112 Q268 76 260 22 M258 64 Q284 56 294 32 M250 88 Q222 70 218 44" fill="none" stroke="${C.tan}" stroke-width="16" stroke-linecap="round"/>
      <path d="M130 140 L96 116 Q100 150 130 160 Z M270 140 L304 116 Q300 150 270 160 Z" fill="${C.brown}"/>
      <path d="M120 300 Q90 400 120 400 L280 400 Q310 400 280 300 Z" fill="${C.brown}"/>
      <ellipse cx="200" cy="190" rx="80" ry="100" fill="${C.brown}"/>
      <ellipse cx="200" cy="250" rx="54" ry="44" fill="${C.tan}"/>
      <circle cx="200" cy="226" r="22" fill="${C.red}"/>
      <rect x="130" y="300" width="140" height="26" rx="13" fill="${C.green}"/>
      <circle cx="200" cy="336" r="16" fill="${C.gold}"/>
      <ellipse cx="156" cy="210" rx="12" ry="8" fill="${C.pink}"/>
      <ellipse cx="244" cy="210" rx="12" ry="8" fill="${C.pink}"/>`,
    ink: `${eye(176, 176, 10, 12)}${eye(224, 176, 10, 12)}${line("M184 268 Q200 280 216 268", 5)}`,
  },
  {
    id: "xm-gingerbread",
    title: "Gingerbread Friend",
    shapes: `
      <rect width="400" height="400" fill="${C.pink}"/>
      ${Array.from({ length: 10 }, (_, i) => `<rect x="${i * 40}" y="350" width="40" height="50" fill="${i % 2 ? C.cream : C.red}"/>`).join("")}
      <path d="M200 40 Q260 40 260 100 Q260 140 240 150 L320 170 Q350 180 340 210 Q330 230 300 222 L260 212 L270 290 L310 340 Q320 360 296 370 Q280 376 268 360 L200 300 L132 360 Q120 376 104 370 Q80 360 90 340 L130 290 L140 212 L100 222 Q70 230 60 210 Q50 180 80 170 L160 150 Q140 140 140 100 Q140 40 200 40 Z" fill="${C.tan}"/>
      <circle cx="200" cy="190" r="12" fill="${C.red}"/>
      <circle cx="200" cy="230" r="12" fill="${C.green}"/>
      <circle cx="200" cy="270" r="12" fill="${C.red}"/>
      <ellipse cx="168" cy="118" rx="12" ry="8" fill="${C.pink}"/>
      <ellipse cx="232" cy="118" rx="12" ry="8" fill="${C.pink}"/>
      ${holly(330, 60, 1)}`,
    ink: `${eye(180, 92, 8)}${eye(220, 92, 8)}${line("M182 124 Q200 138 218 124", 4)}
      <path d="M86 188 Q100 180 114 188 M286 188 Q300 180 314 188 M110 340 Q118 350 128 346 M290 340 Q282 350 272 346" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`,
  },
  {
    id: "xm-stocking",
    title: "Stocking",
    shapes: `
      ${Array.from({ length: 10 }, (_, r) => Array.from({ length: 6 }, (_, i) => `<rect x="${i * 80 - (r % 2) * 40}" y="${r * 40}" width="80" height="40" fill="${[C.slate, C.gray, C.tan][(2 * i + 2 - (r % 2)) % 3]}"/>`).join("")).join("")}
      <rect x="0" y="40" width="400" height="40" fill="${C.brown}"/>
      <path d="M140 110 L260 110 L260 260 Q260 290 300 300 Q330 310 320 340 Q306 370 260 360 L190 340 Q140 326 140 280 Z" fill="${C.red}"/>
      <rect x="126" y="80" width="148" height="50" rx="10" fill="${C.ghost}"/>
      <path d="M140 250 L200 250 L200 310 Q170 300 150 280 Z" fill="${C.green}"/>
      <path d="M262 286 Q300 286 318 314 L300 344 Q280 330 262 330 Z" fill="${C.green}"/>
      <rect x="236" y="20" width="18" height="70" fill="${C.pink}" transform="rotate(14 245 55)"/>
      ${holly(200, 108, 0.8)}`,
    ink: "",
  },
  {
    id: "xm-ornament",
    title: "Ornament",
    shapes: `
      <rect width="400" height="400" fill="${C.darkGreen}"/>
      <defs><clipPath id="ball"><circle cx="200" cy="230" r="130"/></clipPath></defs>
      <g clip-path="url(#ball)">
        <rect x="0" y="100" width="400" height="80" fill="${C.red}"/>
        <rect x="0" y="180" width="400" height="40" fill="${C.gold}"/>
        <rect x="0" y="220" width="400" height="60" fill="${C.blue}"/>
        <rect x="0" y="280" width="400" height="40" fill="${C.gold}"/>
        <rect x="0" y="320" width="400" height="80" fill="${C.red}"/>
      </g>
      <rect x="170" y="80" width="60" height="30" rx="4" fill="${C.gray}"/>
      <path d="M200 70 Q160 30 150 60 Q160 80 200 70 Z M200 70 Q240 30 250 60 Q240 80 200 70 Z" fill="${C.magenta}"/>
      ${star(60, 60, 22, C.yellow)}
      ${star(340, 340, 22, C.yellow)}
      ${star(340, 70, 16, C.yellow)}
      ${star(60, 340, 16, C.yellow)}`,
    ink: `${line("M200 70 L200 80", 4)}${eye(176, 244, 9)}${eye(224, 244, 9)}${line("M184 262 Q200 274 216 262", 4)}`,
  },
  {
    id: "xm-canes",
    title: "Candy Canes",
    shapes: `
      <rect width="400" height="400" fill="${C.mint}"/>
      <defs>
        <clipPath id="cane1"><path d="M170 360 L170 130 Q170 66 115 66 Q60 66 60 124 L92 124 Q92 98 115 98 Q138 98 138 130 L138 360 Z"/></clipPath>
        <clipPath id="cane2"><path d="M230 360 L230 130 Q230 66 285 66 Q340 66 340 124 L308 124 Q308 98 285 98 Q262 98 262 130 L262 360 Z"/></clipPath>
      </defs>
      <g clip-path="url(#cane1)">
        <rect x="0" y="0" width="400" height="400" fill="${C.ghost}"/>
        ${Array.from({ length: 9 }, (_, i) => `<path d="M0 ${i * 50} L400 ${i * 50 - 140} L400 ${i * 50 - 115} L0 ${i * 50 + 25} Z" fill="${C.red}"/>`).join("")}
      </g>
      <g clip-path="url(#cane2)">
        <rect x="0" y="0" width="400" height="400" fill="${C.ghost}"/>
        ${Array.from({ length: 9 }, (_, i) => `<path d="M0 ${i * 50 - 140} L400 ${i * 50} L400 ${i * 50 + 25} L0 ${i * 50 - 115} Z" fill="${C.green}"/>`).join("")}
      </g>
      <path d="M200 240 Q150 200 140 240 Q150 270 200 250 Z M200 240 Q250 200 260 240 Q250 270 200 250 Z" fill="${C.red}"/>
      <circle cx="200" cy="246" r="14" fill="${C.maroon}"/>
      ${holly(70, 360, 1)}${holly(330, 360, 1)}`,
    ink: "",
  },
  {
    id: "xm-presents",
    title: "Presents",
    shapes: `
      <rect width="400" height="400" fill="${C.lilac}"/>
      <rect x="0" y="350" width="400" height="50" fill="${C.brown}"/>
      ${present(40, 230, 140, 120, C.red, C.gold)}
      ${present(200, 260, 160, 90, C.green, C.red)}
      ${present(80, 120, 100, 90, C.blue, C.yellow)}
      ${present(230, 150, 90, 90, C.purple, C.mint)}`,
    ink: flakes([[40, 50], [200, 40], [360, 60], [370, 200]]),
  },
  {
    id: "xm-wreath",
    title: "Wreath",
    shapes: `
      <rect width="400" height="400" fill="${C.cream}"/>
      <circle cx="200" cy="200" r="150" fill="${C.darkGreen}"/>
      <circle cx="200" cy="200" r="90" fill="${C.cream}"/>
      ${Array.from({ length: 8 }, (_, i) => {
        const a = (i * 45 * Math.PI) / 180;
        return `<circle cx="${(200 + 120 * Math.cos(a)).toFixed(1)}" cy="${(200 + 120 * Math.sin(a)).toFixed(1)}" r="22" fill="${C.green}"/>`;
      }).join("")}
      ${[[90, 140], [310, 140], [110, 290], [290, 290], [200, 330]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="${C.red}"/>`).join("")}
      <path d="M200 70 L150 30 L150 100 Z M200 70 L250 30 L250 100 Z" fill="${C.red}"/>
      <path d="M190 80 L160 150 L180 150 L200 100 Z M210 80 L240 150 L220 150 L200 100 Z" fill="${C.maroon}"/>
      <circle cx="200" cy="70" r="16" fill="${C.maroon}"/>`,
    ink: "",
  },
  {
    id: "xm-penguin",
    title: "Penguin",
    shapes: `
      <rect width="400" height="400" fill="${C.sky}"/>
      <path d="M0 330 Q200 300 400 330 L400 400 L0 400 Z" fill="${C.ghost}"/>
      <ellipse cx="200" cy="240" rx="110" ry="130" fill="${C.slate}"/>
      <ellipse cx="200" cy="260" rx="74" ry="100" fill="${C.ghost}"/>
      <path d="M96 220 Q60 280 90 320 Q110 270 110 230 Z M304 220 Q340 280 310 320 Q290 270 290 230 Z" fill="${C.slate}"/>
      <path d="M200 70 Q140 70 120 130 L280 130 Q260 70 200 70 Z" fill="${C.red}"/>
      <rect x="110" y="124" width="180" height="28" rx="14" fill="${C.ghost}"/>
      <circle cx="200" cy="62" r="18" fill="${C.ghost}"/>
      <path d="M186 204 L214 204 L200 224 Z" fill="${C.orange}"/>
      <rect x="130" y="230" width="140" height="22" rx="11" fill="${C.green}"/>
      <rect x="236" y="238" width="22" height="60" rx="8" fill="${C.green}"/>
      <ellipse cx="160" cy="364" rx="30" ry="12" fill="${C.orange}"/>
      <ellipse cx="240" cy="364" rx="30" ry="12" fill="${C.orange}"/>
      <ellipse cx="160" cy="208" rx="12" ry="8" fill="${C.pink}"/>
      <ellipse cx="240" cy="208" rx="12" ry="8" fill="${C.pink}"/>`,
    ink: `${eye(176, 184, 10, 12)}${eye(224, 184, 10, 12)}${flakes([[50, 60], [350, 60], [40, 200], [360, 200]])}`,
  },
  {
    id: "xm-bells",
    title: "Jingle Bells",
    shapes: `
      <rect width="400" height="400" fill="${C.sky}"/>
      <path d="M140 120 Q80 130 80 240 L60 300 L220 300 L200 240 Q200 130 140 120 Z" fill="${C.gold}"/>
      <path d="M260 120 Q320 130 320 240 L340 300 L180 300 L200 240 Q200 130 260 120 Z" fill="${C.yellow}"/>
      <circle cx="140" cy="314" r="20" fill="${C.brown}"/>
      <circle cx="260" cy="314" r="20" fill="${C.brown}"/>
      <path d="M200 100 L130 60 L130 140 Z M200 100 L270 60 L270 140 Z" fill="${C.green}"/>
      <circle cx="200" cy="100" r="20" fill="${C.darkGreen}"/>
      ${holly(70, 360, 1)}${holly(330, 360, 1)}`,
    ink: flakes([[40, 50], [360, 50], [40, 200], [360, 200]]),
  },
  {
    id: "xm-mittens",
    title: "Mittens",
    shapes: `
      <rect width="400" height="400" fill="${C.sky}"/>
      <path d="M70 120 Q70 60 130 60 Q190 60 190 130 L190 300 L70 300 Z" fill="${C.red}"/>
      <path d="M70 180 Q30 170 30 210 Q30 250 70 250 Z" fill="${C.red}"/>
      <rect x="62" y="290" width="136" height="50" rx="10" fill="${C.ghost}"/>
      <rect x="70" y="170" width="120" height="30" fill="${C.ghost}"/>
      <path d="M210 120 Q210 60 270 60 Q330 60 330 130 L330 300 L210 300 Z" fill="${C.green}"/>
      <path d="M330 180 Q370 170 370 210 Q370 250 330 250 Z" fill="${C.green}"/>
      <rect x="202" y="290" width="136" height="50" rx="10" fill="${C.ghost}"/>
      <rect x="210" y="170" width="120" height="30" fill="${C.ghost}"/>
      ${star(130, 240, 22, C.yellow)}
      ${star(270, 240, 22, C.yellow)}`,
    ink: `${line("M130 340 Q200 390 270 340", 5)}${flakes([[40, 40], [360, 40], [200, 30]])}`,
  },
  {
    id: "xm-cocoa",
    title: "Hot Cocoa",
    shapes: `
      <rect width="400" height="400" fill="${C.lilac}"/>
      <rect x="0" y="320" width="400" height="80" fill="${C.brown}"/>
      <path d="M280 160 Q350 160 350 230 Q350 290 280 290 L280 260 Q320 260 320 230 Q320 190 280 190 Z" fill="${C.blue}"/>
      <path d="M100 130 L300 130 L286 330 Q200 350 114 330 Z" fill="${C.blue}"/>
      <ellipse cx="200" cy="130" rx="100" ry="22" fill="${C.brown}"/>
      <rect x="140" y="104" width="34" height="30" rx="6" fill="${C.ghost}"/>
      <rect x="186" y="96" width="34" height="30" rx="6" fill="${C.ghost}"/>
      <rect x="230" y="106" width="34" height="30" rx="6" fill="${C.ghost}"/>
      <rect x="112" y="210" width="178" height="40" fill="${C.ghost}"/>
      ${star(200, 230, 18, C.yellow)}`,
    ink: `${line("M160 90 Q150 70 162 54 Q174 38 164 20 M240 90 Q230 70 242 54 Q254 38 244 20", 5)}
      ${eye(170, 280, 8)}${eye(230, 280, 8)}${line("M186 300 Q200 310 214 300", 4)}`,
  },
  {
    id: "xm-house",
    title: "Snowy House",
    shapes: `
      <rect width="400" height="400" fill="${C.navy}"/>
      <circle cx="330" cy="70" r="34" fill="${C.yellow}"/>
      <path d="M0 320 Q200 290 400 320 L400 400 L0 400 Z" fill="${C.ghost}"/>
      <rect x="250" y="110" width="30" height="60" fill="${C.maroon}"/>
      <rect x="90" y="190" width="220" height="140" fill="${C.red}"/>
      <path d="M70 200 L200 100 L330 200 Z" fill="${C.ghost}"/>
      <rect x="120" y="220" width="50" height="50" fill="${C.yellow}"/>
      <rect x="230" y="220" width="50" height="50" fill="${C.yellow}"/>
      <path d="M176 330 L176 270 Q200 250 224 270 L224 330 Z" fill="${C.brown}"/>
      <path d="M20 330 L50 250 L80 330 Z" fill="${C.darkGreen}"/>
      <path d="M320 330 L355 240 L390 330 Z" fill="${C.darkGreen}"/>
      ${star(60, 60, 16, C.yellow)}
      ${star(160, 40, 12, C.yellow)}`,
    ink: `${line("M145 220 L145 270 M120 245 L170 245 M255 220 L255 270 M230 245 L280 245", 4)}
      <circle cx="216" cy="300" r="5" fill="${INK}"/>${flakes([[40, 160], [370, 170], [110, 80], [240, 50]])}`,
  },
];

// Fifteen ready-made Thanksgiving pictures, drawn here (so they're free to use and give away),
// the same way as the Halloween ones (see halloween/designs.ts): 400 × 400 flat colors, with
// ink details printed already filled in.

import { C, INK, eye, line, type HalloweenDesign } from "@/lib/halloween/designs";

/** A simple leaf pointing up, centered at (cx, cy), turned by `deg`. */
function leaf(cx: number, cy: number, s: number, deg: number, fill: string) {
  return `<path transform="translate(${cx} ${cy}) rotate(${deg}) scale(${s})" d="M0 -30 Q22 -12 16 10 Q8 26 0 30 Q-8 26 -16 10 Q-22 -12 0 -30 Z" fill="${fill}"/>`;
}

/** A maple leaf centered at (cx, cy), turned by `deg`. */
function maple(cx: number, cy: number, s: number, deg: number, fill: string) {
  return `<path transform="translate(${cx} ${cy}) rotate(${deg}) scale(${s})" d="M0 -34 L8 -16 L24 -22 L18 -4 L32 2 L14 10 L18 26 L0 18 L-18 26 L-14 10 L-32 2 L-18 -4 L-24 -22 L-8 -16 Z" fill="${fill}"/>`;
}

/** A round pumpkin with its stem: two side lobes and a middle. */
function pumpkin(cx: number, cy: number, rx: number, ry: number, side: string, middle: string) {
  return (
    `<rect x="${cx - rx * 0.12}" y="${cy - ry - rx * 0.28}" width="${rx * 0.24}" height="${rx * 0.36}" rx="3" fill="${C.brown}"/>` +
    `<ellipse cx="${cx - rx * 0.32}" cy="${cy}" rx="${rx * 0.68}" ry="${ry}" fill="${side}"/>` +
    `<ellipse cx="${cx + rx * 0.32}" cy="${cy}" rx="${rx * 0.68}" ry="${ry}" fill="${side}"/>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.42}" ry="${ry}" fill="${middle}"/>`
  );
}

export const THANKSGIVING: HalloweenDesign[] = [
  {
    id: "tg-turkey",
    title: "Happy Turkey",
    shapes: `
      <rect width="400" height="400" fill="${C.sky}"/>
      <path d="M0 330 Q200 300 400 330 L400 400 L0 400 Z" fill="${C.green}"/>
      <ellipse cx="200" cy="230" rx="160" ry="150" fill="${C.red}"/>
      <ellipse cx="200" cy="236" rx="128" ry="118" fill="${C.orange}"/>
      <ellipse cx="200" cy="242" rx="96" ry="88" fill="${C.yellow}"/>
      <ellipse cx="200" cy="270" rx="78" ry="84" fill="${C.brown}"/>
      <ellipse cx="200" cy="292" rx="44" ry="50" fill="${C.tan}"/>
      <circle cx="200" cy="168" r="50" fill="${C.brown}"/>
      <path d="M186 186 L214 186 L200 210 Z" fill="${C.gold}"/>
      <path d="M200 204 Q190 226 200 240 Q212 226 204 204 Z" fill="${C.red}"/>
      <ellipse cx="170" cy="190" rx="12" ry="8" fill="${C.pink}"/>
      <ellipse cx="230" cy="190" rx="12" ry="8" fill="${C.pink}"/>`,
    ink: `${eye(182, 160, 9, 11)}${eye(218, 160, 9, 11)}
      ${line("M180 352 L176 378 M164 378 L188 378 M220 352 L224 378 M212 378 L236 378", 6)}`,
  },
  {
    id: "tg-pie",
    title: "Pumpkin Pie",
    shapes: `
      ${Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => `<rect x="${c * 50}" y="${r * 50}" width="50" height="50" fill="${(r + c) % 2 ? C.cream : C.red}"/>`).join("")).join("")}
      <ellipse cx="200" cy="240" rx="170" ry="110" fill="${C.gray}"/>
      <ellipse cx="200" cy="230" rx="150" ry="94" fill="${C.tan}"/>
      <ellipse cx="200" cy="230" rx="124" ry="74" fill="${C.darkOrange}"/>
      <path d="M200 230 L320 196 Q330 230 316 262 Z" fill="${C.cream}"/>
      <path d="M150 196 Q140 170 166 166 Q172 146 196 156 Q220 146 226 168 Q252 172 240 198 Z" fill="${C.ghost}"/>
      ${leaf(70, 70, 1.2, -30, C.orange)}
      ${leaf(330, 70, 1.2, 30, C.gold)}
      ${leaf(330, 340, 1.2, 150, C.brown)}`,
    ink: `${line("M200 230 L320 196 M200 230 L316 262", 3)}`,
  },
  {
    id: "tg-cornucopia",
    title: "Cornucopia",
    shapes: `
      <rect width="400" height="400" fill="${C.cream}"/>
      <rect x="0" y="300" width="400" height="100" fill="${C.brown}"/>
      <path d="M40 120 Q120 70 230 110 L260 290 Q150 320 70 260 Q60 200 40 120 Z" fill="${C.tan}"/>
      <path d="M40 120 Q20 110 12 132 Q30 150 52 140 Z" fill="${C.gold}"/>
      <path d="M90 104 Q110 190 140 300" fill="none" stroke="${C.gold}" stroke-width="16"/>
      <path d="M160 96 Q180 190 200 306" fill="none" stroke="${C.gold}" stroke-width="16"/>
      <ellipse cx="250" cy="200" rx="40" ry="96" fill="${C.brown}"/>
      <circle cx="300" cy="150" r="42" fill="${C.red}"/>
      <circle cx="318" cy="244" r="40" fill="${C.orange}"/>
      <path d="M252 270 Q240 330 280 336 Q320 330 300 270 Q290 250 276 252 Q262 250 252 270 Z" fill="${C.lime}"/>
      ${[[350, 300], [372, 270], [350, 336], [380, 312], [366, 352]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="16" fill="${C.purple}"/>`).join("")}
      ${leaf(300, 90, 1.1, 20, C.green)}`,
    ink: `${line("M300 108 L304 90 M276 252 L280 236", 5)}`,
  },
  {
    id: "tg-leaves",
    title: "Autumn Leaves",
    shapes: `
      <rect width="400" height="400" fill="${C.sky}"/>
      <path d="M0 320 Q200 290 400 320 L400 400 L0 400 Z" fill="${C.green}"/>
      ${maple(110, 110, 2.4, -15, C.red)}
      ${maple(290, 120, 2.2, 20, C.orange)}
      ${maple(200, 250, 2.6, 5, C.gold)}
      ${maple(80, 290, 1.8, -30, C.darkOrange)}
      ${maple(330, 300, 1.8, 30, C.maroon)}
      ${leaf(200, 70, 1.4, 60, C.brown)}`,
    ink: `${line("M110 150 L114 196 M290 158 L282 200 M200 296 L198 340 M80 318 L72 348 M330 328 L340 358", 4)}`,
  },
  {
    id: "tg-hat",
    title: "Pilgrim Hat",
    shapes: `
      <rect width="400" height="400" fill="${C.gold}"/>
      <rect x="0" y="300" width="400" height="100" fill="${C.brown}"/>
      <ellipse cx="200" cy="296" rx="170" ry="40" fill="${C.slate}"/>
      <path d="M110 290 L130 90 Q200 70 270 90 L290 290 Z" fill="${C.slate}"/>
      <path d="M118 210 L282 210 L290 290 L110 290 Z" fill="${C.navy}"/>
      <rect x="168" y="218" width="64" height="58" rx="6" fill="${C.yellow}"/>
      <rect x="184" y="232" width="32" height="30" rx="3" fill="${C.navy}"/>
      ${maple(60, 360, 1.3, -20, C.red)}
      ${maple(340, 360, 1.3, 25, C.orange)}
      ${leaf(60, 80, 1.4, -40, C.darkOrange)}
      ${leaf(340, 70, 1.4, 40, C.red)}`,
    ink: "",
  },
  {
    id: "tg-corn",
    title: "Corn on the Cob",
    shapes: `
      <rect width="400" height="400" fill="${C.lilac}"/>
      <defs><clipPath id="cob"><ellipse cx="200" cy="190" rx="70" ry="150"/></clipPath></defs>
      <g clip-path="url(#cob)">
        ${Array.from({ length: 10 }, (_, i) => `<rect x="0" y="${40 + i * 30}" width="400" height="30" fill="${i % 2 ? C.gold : C.yellow}"/>`).join("")}
      </g>
      <path d="M200 380 Q110 300 100 150 Q150 230 190 300 Z" fill="${C.green}"/>
      <path d="M200 380 Q290 300 300 150 Q250 230 210 300 Z" fill="${C.darkGreen}"/>
      <path d="M180 360 L220 360 L214 396 L186 396 Z" fill="${C.lime}"/>
      ${leaf(60, 80, 1.3, -30, C.orange)}
      ${leaf(340, 330, 1.3, 30, C.red)}`,
    ink: `${eye(180, 150, 9, 12)}${eye(220, 150, 9, 12)}${line("M184 186 Q200 200 216 186", 5)}`,
  },
  {
    id: "tg-apples",
    title: "Apple Basket",
    shapes: `
      <rect width="400" height="400" fill="${C.mint}"/>
      <path d="M0 330 Q200 310 400 330 L400 400 L0 400 Z" fill="${C.green}"/>
      <circle cx="140" cy="180" r="50" fill="${C.red}"/>
      <circle cx="250" cy="170" r="52" fill="${C.lime}"/>
      <circle cx="200" cy="140" r="46" fill="${C.maroon}"/>
      <path d="M70 200 L330 200 L300 350 L100 350 Z" fill="${C.tan}"/>
      <rect x="84" y="240" width="232" height="26" fill="${C.brown}"/>
      <rect x="94" y="296" width="212" height="26" fill="${C.brown}"/>
      <rect x="60" y="190" width="280" height="24" rx="12" fill="${C.brown}"/>
      ${leaf(214, 92, 0.9, 30, C.green)}`,
    ink: `${line("M90 200 Q200 40 310 200", 8)}${line("M200 96 L198 112", 5)}`,
  },
  {
    id: "tg-scarecrow",
    title: "Scarecrow",
    shapes: `
      <rect width="400" height="400" fill="${C.sky}"/>
      <path d="M0 330 Q200 300 400 330 L400 400 L0 400 Z" fill="${C.gold}"/>
      <rect x="190" y="230" width="20" height="170" fill="${C.brown}"/>
      <path d="M90 230 L310 230 L290 330 L110 330 Z" fill="${C.red}"/>
      <rect x="150" y="230" width="100" height="100" fill="${C.blue}"/>
      <rect x="60" y="236" width="70" height="34" rx="10" fill="${C.red}"/>
      <rect x="270" y="236" width="70" height="34" rx="10" fill="${C.red}"/>
      <path d="M40 240 L64 230 L64 276 L40 266 Z M360 240 L336 230 L336 276 L360 266 Z" fill="${C.yellow}"/>
      <circle cx="200" cy="170" r="62" fill="${C.cream}"/>
      <ellipse cx="200" cy="108" rx="110" ry="18" fill="${C.tan}"/>
      <path d="M140 108 Q150 40 200 40 Q250 40 260 108 Z" fill="${C.tan}"/>
      <rect x="148" y="86" width="104" height="20" fill="${C.darkOrange}"/>
      <path d="M190 172 L210 172 L200 192 Z" fill="${C.orange}"/>
      <ellipse cx="166" cy="190" rx="12" ry="8" fill="${C.pink}"/>
      <ellipse cx="234" cy="190" rx="12" ry="8" fill="${C.pink}"/>
      ${pumpkin(70, 360, 44, 30, C.orange, C.gold)}
      ${pumpkin(330, 360, 44, 30, C.darkOrange, C.orange)}`,
    ink: `${eye(178, 158, 9)}${eye(222, 158, 9)}${line("M176 206 Q200 222 224 206", 5)}
      ${line("M160 230 L160 330 M200 230 L200 330 M240 230 L240 330 M150 280 L250 280", 3)}`,
  },
  {
    id: "tg-squirrel",
    title: "Little Squirrel",
    shapes: `
      <rect width="400" height="400" fill="${C.cream}"/>
      <path d="M0 340 Q200 320 400 340 L400 400 L0 400 Z" fill="${C.green}"/>
      <path d="M250 340 Q370 330 350 200 Q340 100 260 80 Q300 140 290 200 Q280 260 220 280 Z" fill="${C.darkOrange}"/>
      <ellipse cx="190" cy="270" rx="70" ry="80" fill="${C.orange}"/>
      <ellipse cx="190" cy="290" rx="40" ry="52" fill="${C.peach}"/>
      <circle cx="180" cy="160" r="58" fill="${C.orange}"/>
      <path d="M140 120 L136 76 L170 104 Z M216 108 L232 70 L240 116 Z" fill="${C.darkOrange}"/>
      <ellipse cx="190" cy="186" rx="24" ry="18" fill="${C.peach}"/>
      <ellipse cx="190" cy="294" rx="28" ry="32" fill="${C.brown}"/>
      <path d="M162 272 Q190 250 218 272 L218 280 L162 280 Z" fill="${C.tan}"/>
      ${maple(70, 90, 1.5, -20, C.red)}
      ${leaf(340, 60, 1.3, 30, C.gold)}`,
    ink: `${eye(166, 150, 9)}${eye(206, 150, 9)}<ellipse cx="190" cy="178" rx="7" ry="5" fill="${INK}"/>${line("M182 192 Q190 198 198 192", 4)}`,
  },
  {
    id: "tg-sunflower",
    title: "Sunflower",
    shapes: `
      <rect width="400" height="400" fill="${C.sky}"/>
      <rect x="190" y="230" width="20" height="170" fill="${C.green}"/>
      <path d="M200 330 Q130 270 90 300 Q140 350 200 330 Z" fill="${C.darkGreen}"/>
      <path d="M200 300 Q270 240 320 270 Q260 320 200 300 Z" fill="${C.green}"/>
      ${Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 * Math.PI) / 180;
        return `<ellipse cx="${(200 + 90 * Math.cos(a)).toFixed(1)}" cy="${(160 + 90 * Math.sin(a)).toFixed(1)}" rx="34" ry="20" transform="rotate(${i * 30} ${(200 + 90 * Math.cos(a)).toFixed(1)} ${(160 + 90 * Math.sin(a)).toFixed(1)})" fill="${i % 2 ? C.gold : C.yellow}"/>`;
      }).join("")}
      <circle cx="200" cy="160" r="66" fill="${C.brown}"/>
      <ellipse cx="170" cy="182" rx="12" ry="8" fill="${C.pink}"/>
      <ellipse cx="230" cy="182" rx="12" ry="8" fill="${C.pink}"/>`,
    ink: `${eye(180, 150, 9)}${eye(220, 150, 9)}${line("M182 180 Q200 196 218 180", 5)}`,
  },
  {
    id: "tg-cider",
    title: "Warm Cider",
    shapes: `
      <rect width="400" height="400" fill="${C.peach}"/>
      <rect x="0" y="320" width="400" height="80" fill="${C.brown}"/>
      <path d="M270 170 Q350 170 350 240 Q350 300 270 300 L270 270 Q320 270 320 240 Q320 200 270 200 Z" fill="${C.red}"/>
      <path d="M110 140 L290 140 L280 330 Q200 350 120 330 Z" fill="${C.red}"/>
      <ellipse cx="200" cy="140" rx="90" ry="20" fill="${C.darkOrange}"/>
      <rect x="120" y="220" width="166" height="36" fill="${C.cream}"/>
      <rect x="230" y="60" width="16" height="100" rx="6" fill="${C.tan}" transform="rotate(20 238 110)"/>
      ${maple(70, 80, 1.4, -20, C.orange)}
      ${maple(340, 80, 1.2, 25, C.gold)}`,
    ink: `${line("M160 110 Q150 90 162 74 Q174 58 164 40 M200 110 Q190 90 202 74 Q214 58 204 40", 5)}
      ${line("M150 236 L170 236 M190 236 L210 236 M230 236 L250 236", 4)}`,
  },
  {
    id: "tg-ship",
    title: "Sailing Ship",
    shapes: `
      <rect width="400" height="400" fill="${C.sky}"/>
      <circle cx="340" cy="60" r="34" fill="${C.yellow}"/>
      <rect x="0" y="290" width="400" height="110" fill="${C.blue}"/>
      <path d="M0 330 Q50 310 100 330 Q150 350 200 330 Q250 310 300 330 Q350 350 400 330 L400 400 L0 400 Z" fill="${C.navy}"/>
      <path d="M60 250 L340 250 L300 320 L100 320 Z" fill="${C.brown}"/>
      <rect x="60" y="250" width="280" height="22" fill="${C.tan}"/>
      <rect x="192" y="60" width="16" height="190" fill="${C.brown}"/>
      <path d="M120 80 L280 80 Q290 140 280 200 L120 200 Q110 140 120 80 Z" fill="${C.cream}"/>
      <path d="M208 40 L250 52 L208 64 Z" fill="${C.red}"/>
      <path d="M40 120 Q38 100 60 100 Q70 84 92 92 Q110 86 116 106 Q134 108 130 126 Z" fill="${C.ghost}"/>`,
    ink: `${line("M200 80 L200 200", 3)}`,
  },
  {
    id: "tg-pumpkins",
    title: "Harvest Pumpkins",
    shapes: `
      <rect width="400" height="400" fill="${C.lilac}"/>
      <rect x="40" y="270" width="320" height="90" rx="10" fill="${C.yellow}"/>
      <rect x="40" y="300" width="320" height="22" fill="${C.gold}"/>
      <rect x="0" y="360" width="400" height="40" fill="${C.green}"/>
      ${pumpkin(130, 220, 80, 56, C.orange, C.gold)}
      ${pumpkin(280, 230, 70, 46, C.darkOrange, C.orange)}
      ${pumpkin(210, 120, 56, 40, C.cream, C.peach)}
      ${maple(50, 60, 1.3, -20, C.red)}
      ${maple(350, 60, 1.3, 20, C.orange)}`,
    ink: "",
  },
  {
    id: "tg-hedgehog",
    title: "Hedgehog",
    shapes: `
      <rect width="400" height="400" fill="${C.cream}"/>
      <path d="M0 330 Q200 310 400 330 L400 400 L0 400 Z" fill="${C.green}"/>
      <path d="M70 320 L60 270 L90 260 L80 210 L120 210 L120 160 L160 170 L170 120 L210 140 L230 100 L260 140 L290 120 L300 170 L340 180 L330 230 L360 260 L340 320 Z" fill="${C.brown}"/>
      <path d="M260 320 Q330 320 340 270 Q330 200 270 200 Q220 220 230 320 Z" fill="${C.tan}"/>
      <circle cx="342" cy="270" r="10" fill="${C.slate}"/>
      <ellipse cx="290" cy="290" rx="14" ry="9" fill="${C.pink}"/>
      ${maple(170, 190, 1.4, -20, C.red)}
      ${leaf(120, 260, 1.2, -50, C.gold)}
      ${maple(220, 270, 1.2, 15, C.orange)}`,
    ink: `${eye(296, 254, 8)}${line("M310 296 Q320 302 330 296", 4)}${line("M120 320 L120 340 M260 320 L260 340", 6)}`,
  },
  {
    id: "tg-barn",
    title: "Fall Barn",
    shapes: `
      <rect width="400" height="400" fill="${C.sky}"/>
      <path d="M0 260 Q100 220 200 250 Q300 220 400 250 L400 400 L0 400 Z" fill="${C.green}"/>
      <path d="M0 320 Q200 290 400 320 L400 400 L0 400 Z" fill="${C.gold}"/>
      <rect x="290" y="120" width="70" height="200" fill="${C.gray}"/>
      <path d="M290 120 Q325 80 360 120 Z" fill="${C.slate}"/>
      <path d="M80 320 L80 180 L170 110 L260 180 L260 320 Z" fill="${C.red}"/>
      <path d="M66 190 L170 100 L274 190 L260 196 L170 120 L80 196 Z" fill="${C.cream}"/>
      <rect x="130" y="230" width="80" height="90" fill="${C.maroon}"/>
      <rect x="150" y="150" width="40" height="34" fill="${C.yellow}"/>
      <circle cx="60" cy="150" r="44" fill="${C.orange}"/>
      <rect x="54" y="180" width="12" height="80" fill="${C.brown}"/>`,
    ink: `${line("M130 230 L210 320 M210 230 L130 320", 5)}`,
  },
];

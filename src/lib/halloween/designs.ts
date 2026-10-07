// Fifteen ready-made Halloween pictures, drawn here (so they're free to use and give away).
// Each is a 400 × 400 drawing in flat colors: every colored shape becomes a shape to color,
// numbered by its color. `ink` is drawn on top already filled in (eyes, mouths, whiskers):
// details too small to color, printed black like a pet's eyes on a photo page.

export interface HalloweenDesign {
  id: string;
  title: string;
  /** Flat colored shapes, SVG, in a 400 × 400 box. Fills must be colors from `C`. */
  shapes: string;
  /** Details printed already filled in: SVG in INK (and white for highlights). */
  ink: string;
}

/** The drawing box. */
export const SIZE = 400;

/** Paint colors. */
export const C = {
  orange: "#F5892B",
  darkOrange: "#D25E1E",
  yellow: "#FFD447",
  cream: "#FFF1CF",
  lime: "#BFE36A",
  green: "#5DB548",
  darkGreen: "#2F7D4A",
  lilac: "#CBAEEE",
  purple: "#8B55C6",
  navy: "#323C7A",
  pink: "#F7A6C7",
  red: "#E04B4B",
  tan: "#D9A86C",
  brown: "#8A5530",
  ghost: "#E3E8F2",
  gray: "#A4AAB6",
  slate: "#5A5F6E",
  sky: "#7EC8E3",
  blue: "#4A78C9",
  teal: "#2A9D8F",
  mint: "#A8E6CF",
  peach: "#FFC2A6",
  gold: "#E8A93A",
  magenta: "#D44D9C",
  maroon: "#9B2D4A",
  darkPurple: "#5B2E8C",
} as const;

/** The printed-black details. */
export const INK = "#222222";

/** A five-pointed star centered at (cx, cy). */
function star(cx: number, cy: number, r: number, fill: string) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.48 : r;
    return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  });
  return `<polygon points="${pts.join(" ")}" fill="${fill}"/>`;
}

/** A cute eye: an ink oval with a white shine. */
function eye(cx: number, cy: number, rx: number, ry = rx) {
  const s = Math.max(2.5, rx * 0.38);
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${INK}"/><circle cx="${cx + rx * 0.3}" cy="${cy - ry * 0.35}" r="${s}" fill="#fff"/>`;
}

/** Flower: five petals around a center. */
function flower(cx: number, cy: number, r: number, petal: string, center: string) {
  const petals = Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return `<circle cx="${(cx + r * Math.cos(a)).toFixed(1)}" cy="${(cy + r * Math.sin(a)).toFixed(1)}" r="${r * 0.85}" fill="${petal}"/>`;
  });
  return `${petals.join("")}<circle cx="${cx}" cy="${cy}" r="${r * 0.75}" fill="${center}"/>`;
}

/** A wrapped candy: a round middle with a twist of wrapper either side. */
function wrapped(cx: number, cy: number, r: number, candy: string, wrapper: string) {
  return (
    `<path d="M${cx} ${cy} L${cx - 2.4 * r} ${cy - r} L${cx - 2.4 * r} ${cy + r} Z M${cx} ${cy} L${cx + 2.4 * r} ${cy - r} L${cx + 2.4 * r} ${cy + r} Z" fill="${wrapper}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${candy}"/>`
  );
}

/** An ink line. */
function line(d: string, w = 5) {
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/**
 * Brick colors. Bricks in offset rows touch two neighbors in their row and two above and
 * below; coloring by (2 × column − row offset) mod 3 keeps every touching pair different.
 */
const BRICKS = [C.maroon, C.red, C.peach];

export const DESIGNS: HalloweenDesign[] = [
  {
    id: "pumpkin",
    title: "Happy Pumpkin",
    shapes: `
      <rect width="400" height="400" fill="${C.sky}"/>
      <circle cx="345" cy="55" r="34" fill="${C.yellow}"/>
      <path d="M30 78 Q28 54 54 56 Q62 34 90 42 Q114 34 120 58 Q142 60 138 80 Z" fill="${C.ghost}"/>
      <path d="M0 300 Q100 262 200 292 Q300 262 400 296 L400 400 L0 400 Z" fill="${C.darkGreen}"/>
      <path d="M0 352 Q120 326 220 350 Q320 330 400 352 L400 400 L0 400 Z" fill="${C.green}"/>
      <path d="M184 112 L180 56 Q196 42 216 52 L218 112 Z" fill="${C.brown}"/>
      <path d="M214 74 Q248 26 296 50 Q258 92 214 74 Z" fill="${C.lime}"/>
      <path d="M184 80 Q150 34 108 56 Q146 96 184 80 Z" fill="${C.green}"/>
      <ellipse cx="138" cy="232" rx="96" ry="124" fill="${C.darkOrange}"/>
      <ellipse cx="262" cy="232" rx="96" ry="124" fill="${C.darkOrange}"/>
      <ellipse cx="200" cy="234" rx="84" ry="134" fill="${C.orange}"/>
      <ellipse cx="146" cy="268" rx="20" ry="13" fill="${C.pink}"/>
      <ellipse cx="254" cy="268" rx="20" ry="13" fill="${C.pink}"/>
      <rect x="44" y="318" width="16" height="18" rx="3" fill="${C.brown}"/>
      <ellipse cx="52" cy="360" rx="44" ry="32" fill="${C.gold}"/>
      <ellipse cx="52" cy="360" rx="18" ry="32" fill="${C.peach}"/>
      <rect x="342" y="322" width="16" height="18" rx="3" fill="${C.brown}"/>
      <ellipse cx="350" cy="364" rx="42" ry="30" fill="${C.orange}"/>
      <ellipse cx="350" cy="364" rx="17" ry="30" fill="${C.gold}"/>`,
    ink: `${eye(166, 218, 14, 19)}${eye(234, 218, 14, 19)}${line("M176 262 Q200 290 224 262", 7)}`,
  },
  {
    id: "ghost",
    title: "Little Ghost",
    shapes: `
      <rect width="400" height="400" fill="${C.navy}"/>
      <circle cx="335" cy="70" r="42" fill="${C.yellow}"/>
      <circle cx="322" cy="58" r="10" fill="${C.gold}"/>
      <circle cx="350" cy="88" r="12" fill="${C.gold}"/>
      ${star(55, 60, 28, C.yellow)}
      ${star(140, 36, 16, C.yellow)}
      ${star(372, 190, 16, C.yellow)}
      ${star(30, 200, 16, C.yellow)}
      <path d="M0 330 Q200 290 400 330 L400 400 L0 400 Z" fill="${C.darkPurple}"/>
      <path d="M0 372 Q200 346 400 372 L400 400 L0 400 Z" fill="${C.darkGreen}"/>
      <path d="M22 370 L22 300 Q50 262 78 300 L78 370 Z" fill="${C.gray}"/>
      <path d="M322 372 L322 306 Q350 270 378 306 L378 372 Z" fill="${C.gray}"/>
      <path d="M200 70 C125 70 100 135 100 205 L100 340 Q120 318 140 338 Q160 358 180 338 Q200 318 220 338 Q240 358 260 338 Q280 318 300 340 L300 205 C300 135 275 70 200 70 Z" fill="${C.ghost}"/>
      <ellipse cx="150" cy="226" rx="18" ry="12" fill="${C.pink}"/>
      <ellipse cx="250" cy="226" rx="18" ry="12" fill="${C.pink}"/>
      <path d="M262 92 L230 70 L230 116 Z M262 92 L294 70 L294 116 Z" fill="${C.purple}"/>
      <circle cx="262" cy="92" r="11" fill="${C.lilac}"/>
      ${wrapped(200, 290, 16, C.orange, C.magenta)}`,
    ink: `${eye(172, 190, 12, 17)}${eye(228, 190, 12, 17)}<ellipse cx="200" cy="236" rx="12" ry="15" fill="${INK}"/>
      ${line("M50 300 L50 340 M36 314 L64 314 M350 312 L350 350 M336 326 L364 326", 5)}`,
  },
  {
    id: "cat",
    title: "Sweet Black Cat",
    shapes: `
      <rect width="400" height="400" fill="${C.darkPurple}"/>
      <circle cx="68" cy="78" r="44" fill="${C.yellow}"/>
      ${star(340, 50, 20, C.yellow)}
      ${star(250, 30, 14, C.yellow)}
      ${[-20, 46, 112, 178, 244, 310, 376].map((x) => `<path d="M${x} 400 L${x} 290 L${x + 25} 262 L${x + 50} 290 L${x + 50} 400 Z" fill="${C.tan}"/>`).join("")}
      <rect x="0" y="330" width="400" height="20" fill="${C.brown}"/>
      <path d="M270 335 Q350 330 345 255 Q342 215 365 190" fill="none" stroke="${C.slate}" stroke-width="30" stroke-linecap="round"/>
      <ellipse cx="200" cy="292" rx="88" ry="82" fill="${C.slate}"/>
      <path d="M132 135 L126 52 L190 98 Z M268 135 L274 52 L210 98 Z" fill="${C.slate}"/>
      <circle cx="200" cy="170" r="82" fill="${C.slate}"/>
      <path d="M142 118 L139 70 L178 100 Z M258 118 L261 70 L222 100 Z" fill="${C.pink}"/>
      <ellipse cx="200" cy="305" rx="48" ry="52" fill="${C.gray}"/>
      <rect x="148" y="236" width="104" height="18" rx="9" fill="${C.red}"/>
      <circle cx="200" cy="262" r="13" fill="${C.gold}"/>
      <ellipse cx="166" cy="162" rx="24" ry="24" fill="${C.lime}"/>
      <ellipse cx="234" cy="162" rx="24" ry="24" fill="${C.lime}"/>
      <path d="M182 188 L218 188 L200 210 Z" fill="${C.pink}"/>
      <ellipse cx="170" cy="368" rx="26" ry="14" fill="${C.gray}"/>
      <ellipse cx="230" cy="368" rx="26" ry="14" fill="${C.gray}"/>`,
    ink: `<ellipse cx="166" cy="162" rx="6" ry="15" fill="${INK}"/><ellipse cx="234" cy="162" rx="6" ry="15" fill="${INK}"/>
      ${line("M200 210 Q192 226 180 220 M200 210 Q208 226 220 220", 5)}
      ${line("M150 196 L100 186 M150 206 L102 214 M250 196 L300 186 M250 206 L298 214", 4)}`,
  },
  {
    id: "bat",
    title: "Bat and Moon",
    shapes: `
      <rect width="400" height="400" fill="${C.navy}"/>
      ${star(40, 40, 24, C.yellow)}
      ${star(362, 44, 18, C.yellow)}
      ${star(40, 362, 18, C.yellow)}
      ${star(362, 360, 24, C.yellow)}
      <circle cx="200" cy="200" r="150" fill="${C.yellow}"/>
      <circle cx="112" cy="282" r="20" fill="${C.gold}"/>
      <circle cx="288" cy="290" r="22" fill="${C.gold}"/>
      <circle cx="200" cy="320" r="14" fill="${C.gold}"/>
      <circle cx="292" cy="78" r="14" fill="${C.gold}"/>
      <path d="M200 175 C160 115 90 105 30 140 Q66 162 54 208 Q90 190 110 225 Q132 196 162 230 Q178 202 200 216 Z" fill="${C.purple}"/>
      <path d="M200 175 C240 115 310 105 370 140 Q334 162 346 208 Q310 190 290 225 Q268 196 238 230 Q222 202 200 216 Z" fill="${C.purple}"/>
      <path d="M172 160 L166 112 L196 146 Z M228 160 L234 112 L204 146 Z" fill="${C.darkPurple}"/>
      <circle cx="200" cy="168" r="36" fill="${C.darkPurple}"/>
      <ellipse cx="200" cy="228" rx="38" ry="46" fill="${C.darkPurple}"/>
      <ellipse cx="200" cy="236" rx="22" ry="30" fill="${C.lilac}"/>`,
    ink: `${eye(186, 162, 8)}${eye(214, 162, 8)}${line("M186 182 Q200 190 214 182", 4)}
      <path d="M190 185 L194 196 L198 187 Z M210 185 L206 196 L202 187 Z" fill="#fff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      ${line("M166 190 L72 196 M168 202 L116 212 M234 190 L328 196 M232 202 L284 212", 4)}`,
  },
  {
    id: "candy-corn",
    title: "Candy Corn Friend",
    shapes: `
      <rect width="400" height="400" fill="${C.teal}"/>
      ${[[40, 60], [350, 90], [60, 250], [340, 260], [110, 150], [300, 170], [40, 160], [360, 340], [60, 340]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="15" fill="${C.mint}"/>`).join("")}
      <path d="M0 372 Q200 352 400 372 L400 400 L0 400 Z" fill="${C.green}"/>
      <defs><clipPath id="cc"><path d="M200 50 Q216 50 226 78 L322 318 Q334 362 290 362 L110 362 Q66 362 78 318 L174 78 Q184 50 200 50 Z"/></clipPath></defs>
      <g clip-path="url(#cc)">
        <rect x="0" y="0" width="400" height="156" fill="${C.cream}"/>
        <rect x="0" y="156" width="400" height="110" fill="${C.orange}"/>
        <rect x="0" y="266" width="400" height="134" fill="${C.yellow}"/>
      </g>
      <ellipse cx="200" cy="56" rx="54" ry="11" fill="${C.darkPurple}"/>
      <path d="M170 50 L214 2 L232 50 Z" fill="${C.purple}"/>
      <ellipse cx="156" cy="230" rx="15" ry="10" fill="${C.pink}"/>
      <ellipse cx="244" cy="230" rx="15" ry="10" fill="${C.pink}"/>
      <ellipse cx="166" cy="386" rx="24" ry="10" fill="${C.brown}"/>
      <ellipse cx="234" cy="386" rx="24" ry="10" fill="${C.brown}"/>`,
    ink: `${eye(176, 202, 10, 13)}${eye(224, 202, 10, 13)}${line("M186 230 Q200 244 214 230", 5)}
      ${line("M172 362 L172 378 M228 362 L228 378 M100 250 Q70 240 58 210 M300 250 Q330 240 342 210", 6)}`,
  },
  {
    id: "witch-hat",
    title: "Witch's Hat",
    shapes: `
      <rect width="400" height="400" fill="${C.blue}"/>
      <circle cx="330" cy="80" r="42" fill="${C.yellow}"/>
      <circle cx="350" cy="66" r="38" fill="${C.blue}"/>
      ${star(60, 70, 30, C.yellow)}
      ${star(150, 30, 16, C.yellow)}
      ${star(360, 200, 20, C.yellow)}
      ${star(40, 200, 16, C.yellow)}
      <path d="M0 400 L0 340 Q200 316 400 340 L400 400 Z" fill="${C.darkGreen}"/>
      <ellipse cx="200" cy="318" rx="160" ry="36" fill="${C.navy}"/>
      <path d="M112 300 L188 92 Q204 44 262 50 Q222 72 226 112 L290 300 Z" fill="${C.purple}"/>
      <path d="M128 256 L274 256 L290 300 L112 300 Z" fill="${C.green}"/>
      <rect x="172" y="260" width="58" height="36" rx="4" fill="${C.gold}"/>
      <path d="M180 166 L222 160 L228 204 L186 210 Z" fill="${C.lilac}"/>
      ${star(262, 50, 16, C.gold)}
      <rect x="53" y="306" width="14" height="20" rx="3" fill="${C.brown}"/>
      <ellipse cx="60" cy="350" rx="40" ry="28" fill="${C.orange}"/>
      <ellipse cx="60" cy="350" rx="16" ry="28" fill="${C.darkOrange}"/>`,
    ink: `${line("M178 176 L188 172 M184 196 L194 194 M220 164 L230 170 M224 196 L234 194", 4)}`,
  },
  {
    id: "spider",
    title: "Friendly Spider",
    shapes: `
      <rect width="400" height="400" fill="${C.lilac}"/>
      <path d="M0 360 Q200 330 400 360 L400 400 L0 400 Z" fill="${C.green}"/>
      <circle cx="200" cy="240" r="92" fill="${C.slate}"/>
      <circle cx="160" cy="300" r="14" fill="${C.magenta}"/>
      <circle cx="240" cy="300" r="14" fill="${C.magenta}"/>
      <circle cx="200" cy="316" r="12" fill="${C.magenta}"/>
      <ellipse cx="148" cy="270" rx="18" ry="12" fill="${C.pink}"/>
      <ellipse cx="252" cy="270" rx="18" ry="12" fill="${C.pink}"/>
      <path d="M200 156 L168 136 L168 176 Z M200 156 L232 136 L232 176 Z" fill="${C.red}"/>
      <circle cx="200" cy="156" r="11" fill="${C.pink}"/>
      <rect x="40" y="320" width="14" height="24" rx="3" fill="${C.brown}"/>
      <ellipse cx="47" cy="366" rx="38" ry="26" fill="${C.orange}"/>
      ${wrapped(345, 372, 14, C.yellow, C.blue)}`,
    ink: `${line("M0 0 L150 0 M0 0 L130 75 M0 0 L75 130 M0 0 L0 150 M50 0 Q45 22 43 25 Q22 45 0 50 M100 0 Q90 45 87 50 Q45 90 0 100 M145 0 Q132 68 126 73 Q68 132 0 145", 3)}
      ${line("M400 0 L250 0 M400 0 L270 75 M400 0 L325 130 M400 0 L400 150 M350 0 Q355 22 357 25 Q378 45 400 50 M300 0 Q310 45 313 50 Q355 90 400 100 M255 0 Q268 68 274 73 Q332 132 400 145", 3)}
      ${line("M200 0 L200 146", 4)}
      ${line("M118 200 Q70 160 40 190 M112 232 Q60 222 30 260 M116 268 Q70 290 52 340 M132 300 Q110 340 110 380", 9)}
      ${line("M282 200 Q330 160 360 190 M288 232 Q340 222 370 260 M284 268 Q330 290 348 340 M268 300 Q290 340 290 380", 9)}
      <circle cx="172" cy="232" r="22" fill="#fff" stroke="${INK}" stroke-width="4"/><circle cx="228" cy="232" r="22" fill="#fff" stroke="${INK}" stroke-width="4"/>
      ${eye(176, 236, 11)}${eye(224, 236, 11)}${line("M182 280 Q200 296 218 280", 5)}`,
  },
  {
    id: "haunted-house",
    title: "Spooky House",
    shapes: `
      <rect width="400" height="400" fill="${C.blue}"/>
      <circle cx="320" cy="80" r="50" fill="${C.yellow}"/>
      <path d="M270 140 Q268 120 290 120 Q300 104 322 112 Q344 106 350 126 Q372 128 368 148 Z" fill="${C.gray}"/>
      ${star(40, 40, 18, C.yellow)}
      ${star(170, 30, 14, C.yellow)}
      <rect x="244" y="96" width="30" height="64" fill="${C.slate}"/>
      <path d="M0 400 L0 342 Q200 300 400 342 L400 400 Z" fill="${C.darkGreen}"/>
      <path d="M30 360 L40 230 Q20 200 10 180 L22 176 Q36 200 46 214 Q50 190 70 170 L80 178 Q62 200 58 230 L66 360 Z" fill="${C.brown}"/>
      <rect x="110" y="170" width="180" height="182" fill="${C.purple}"/>
      <path d="M86 184 L200 80 L314 184 Z" fill="${C.navy}"/>
      <circle cx="200" cy="146" r="20" fill="${C.yellow}"/>
      <rect x="132" y="200" width="50" height="50" fill="${C.yellow}"/>
      <rect x="218" y="200" width="50" height="50" fill="${C.yellow}"/>
      <path d="M174 352 L174 290 Q200 258 226 290 L226 352 Z" fill="${C.brown}"/>
      <path d="M164 352 L236 352 L246 372 L154 372 Z" fill="${C.gray}"/>
      <path d="M150 372 L250 372 L262 400 L138 400 Z" fill="${C.tan}"/>
      <path d="M312 370 L312 316 Q336 290 360 316 L360 370 Z" fill="${C.gray}"/>
      <ellipse cx="96" cy="370" rx="30" ry="22" fill="${C.orange}"/>
      <rect x="90" y="340" width="14" height="12" fill="${C.green}"/>`,
    ink: `${line("M157 200 L157 250 M132 225 L182 225 M243 200 L243 250 M218 225 L268 225", 4)}
      <circle cx="216" cy="322" r="5" fill="${INK}"/>
      ${line("M336 308 L336 340 M324 320 L348 320", 5)}
      <path d="M60 70 Q70 58 80 66 Q86 56 92 66 Q102 58 112 70 Q100 68 92 76 Q86 70 80 76 Q72 68 60 70 Z" fill="${INK}"/>
      <path d="M100 120 Q108 111 116 117 Q120 109 125 117 Q133 111 141 120 Q132 118 125 124 Q120 119 116 124 Q109 118 100 120 Z" fill="${INK}"/>`,
  },
  {
    id: "candy",
    title: "Treats",
    shapes: `
      <rect width="400" height="400" fill="${C.mint}"/>
      ${Array.from({ length: 20 }, (_, i) => `<rect x="${(i % 10) * 40}" y="${340 + Math.floor(i / 10) * 30}" width="40" height="30" fill="${(i + Math.floor(i / 10)) % 2 ? C.cream : C.red}"/>`).join("")}
      <defs><clipPath id="wrap"><ellipse cx="200" cy="90" rx="72" ry="50"/></clipPath></defs>
      <path d="M136 90 L60 42 Q78 90 60 138 Z M264 90 L340 42 Q322 90 340 138 Z" fill="${C.purple}"/>
      <ellipse cx="200" cy="90" rx="72" ry="50" fill="${C.orange}"/>
      <g clip-path="url(#wrap)"><path d="M150 30 L180 30 L130 150 L100 150 Z M225 30 L255 30 L205 150 L175 150 Z" fill="${C.yellow}"/></g>
      <rect x="104" y="250" width="22" height="90" fill="${C.tan}"/>
      <circle cx="115" cy="236" r="70" fill="${C.pink}"/>
      <circle cx="115" cy="236" r="48" fill="${C.sky}"/>
      <circle cx="115" cy="236" r="26" fill="${C.magenta}"/>
      <rect x="236" y="186" width="118" height="154" fill="${C.brown}"/>
      <rect x="236" y="272" width="118" height="68" fill="${C.blue}"/>
      ${wrapped(180, 300, 13, C.gold, C.green)}
      ${wrapped(36, 170, 13, C.lime, C.red)}
      ${wrapped(370, 160, 13, C.peach, C.teal)}`,
    ink: `${line("M276 186 L276 272 M314 186 L314 272 M236 229 L354 229", 4)}`,
  },
  {
    id: "mummy",
    title: "Cute Mummy",
    shapes: `
      <rect width="400" height="400" fill="${C.darkPurple}"/>
      ${star(40, 50, 22, C.yellow)}
      ${star(360, 60, 18, C.yellow)}
      ${star(30, 220, 14, C.yellow)}
      ${star(370, 200, 14, C.yellow)}
      <path d="M0 376 Q200 356 400 376 L400 400 L0 400 Z" fill="${C.darkGreen}"/>
      <defs>
        <clipPath id="body"><path d="M120 300 Q120 268 160 268 L240 268 Q280 268 280 300 L292 400 L108 400 Z"/></clipPath>
        <clipPath id="arms"><path d="M40 282 L130 282 L130 322 L40 322 Q24 302 40 282 Z M270 282 L360 282 Q376 302 360 322 L270 322 Z"/></clipPath>
        <clipPath id="head"><circle cx="200" cy="170" r="118"/></clipPath>
      </defs>
      <g clip-path="url(#arms)">
        <rect x="0" y="260" width="400" height="80" fill="${C.cream}"/>
        <path d="M70 260 L92 260 L92 340 L70 340 Z M308 260 L330 260 L330 340 L308 340 Z" fill="${C.tan}"/>
      </g>
      <g clip-path="url(#body)">
        <rect x="0" y="260" width="400" height="140" fill="${C.cream}"/>
        <path d="M0 316 L400 290 L400 314 L0 340 Z M0 370 L400 344 L400 368 L0 394 Z" fill="${C.tan}"/>
      </g>
      <g clip-path="url(#head)">
        <rect x="0" y="0" width="400" height="400" fill="${C.cream}"/>
        <path d="M0 84 L400 62 L400 102 L0 124 Z M0 236 L400 214 L400 254 L0 276 Z" fill="${C.tan}"/>
        <rect x="0" y="136" width="400" height="58" fill="${C.slate}"/>
      </g>
      <path d="M268 62 L240 44 L240 82 Z M268 62 L296 44 L296 82 Z" fill="${C.orange}"/>
      <circle cx="268" cy="62" r="9" fill="${C.gold}"/>
      <ellipse cx="142" cy="214" rx="18" ry="11" fill="${C.pink}"/>
      <ellipse cx="258" cy="214" rx="18" ry="11" fill="${C.pink}"/>`,
    ink: `<circle cx="160" cy="165" r="22" fill="#fff"/><circle cx="240" cy="165" r="22" fill="#fff"/>
      ${eye(164, 168, 11)}${eye(236, 168, 11)}${line("M186 222 Q200 234 214 222", 5)}`,
  },
  {
    id: "monster",
    title: "Frankie the Monster",
    shapes: `
      <rect width="400" height="400" fill="${C.teal}"/>
      <path d="M40 30 L80 30 L62 70 L86 70 L40 140 L52 88 L30 88 Z" fill="${C.yellow}"/>
      <path d="M330 30 L370 30 L352 70 L376 70 L330 140 L342 88 L320 88 Z" fill="${C.yellow}"/>
      <path d="M110 330 L290 330 L330 400 L70 400 Z" fill="${C.navy}"/>
      <path d="M200 356 L166 338 L166 374 Z M200 356 L234 338 L234 374 Z" fill="${C.red}"/>
      <circle cx="200" cy="356" r="10" fill="${C.gold}"/>
      <rect x="44" y="240" width="56" height="34" rx="6" fill="${C.gray}"/>
      <rect x="300" y="240" width="56" height="34" rx="6" fill="${C.gray}"/>
      <ellipse cx="92" cy="220" rx="20" ry="32" fill="${C.darkGreen}"/>
      <ellipse cx="308" cy="220" rx="20" ry="32" fill="${C.darkGreen}"/>
      <rect x="92" y="80" width="216" height="260" rx="44" fill="${C.green}"/>
      <path d="M92 160 L92 118 Q92 64 146 64 L254 64 Q308 64 308 118 L308 160 L284 134 L260 160 L236 134 L212 160 L188 134 L164 160 L140 134 L116 160 Z" fill="${C.slate}"/>
      <ellipse cx="136" cy="262" rx="20" ry="13" fill="${C.pink}"/>
      <ellipse cx="264" cy="262" rx="20" ry="13" fill="${C.pink}"/>`,
    ink: `<ellipse cx="160" cy="214" rx="24" ry="26" fill="#fff" stroke="${INK}" stroke-width="4"/><ellipse cx="240" cy="214" rx="24" ry="26" fill="#fff" stroke="${INK}" stroke-width="4"/>
      ${eye(162, 220, 11)}${eye(238, 220, 11)}${line("M134 178 L184 184 M266 178 L216 184", 8)}
      ${line("M164 292 L236 292 M176 282 L176 302 M200 282 L200 302 M224 282 L224 302", 5)}
      ${line("M250 100 L280 120 M256 92 L250 108 M268 102 L262 116", 4)}`,
  },
  {
    id: "skull",
    title: "Flower Skull",
    shapes: `
      <rect width="400" height="400" fill="${C.darkPurple}"/>
      <circle cx="200" cy="210" r="178" fill="${C.lilac}"/>
      <circle cx="200" cy="190" r="118" fill="${C.ghost}"/>
      <rect x="138" y="250" width="124" height="96" rx="24" fill="${C.ghost}"/>
      <path d="M200 140 Q186 118 172 132 Q162 146 200 170 Q238 146 228 132 Q214 118 200 140 Z" fill="${C.magenta}"/>
      ${[0, 1, 2, 3, 4].map((i) => `<circle cx="${128 + i * 14}" cy="${246 + (i % 2) * 8}" r="7" fill="${C.teal}"/><circle cx="${216 + i * 14}" cy="${246 + ((i + 1) % 2) * 8}" r="7" fill="${C.teal}"/>`).join("")}
      <path d="M120 74 Q90 40 60 60 Q90 92 120 74 Z M280 74 Q310 40 340 60 Q310 92 280 74 Z" fill="${C.green}"/>
      ${flower(120, 82, 22, C.pink, C.yellow)}
      ${flower(200, 58, 24, C.peach, C.gold)}
      ${flower(280, 82, 22, C.blue, C.yellow)}`,
    ink: `<ellipse cx="156" cy="200" rx="30" ry="34" fill="${INK}"/><ellipse cx="244" cy="200" rx="30" ry="34" fill="${INK}"/>
      <circle cx="165" cy="189" r="9" fill="#fff"/><circle cx="253" cy="189" r="9" fill="#fff"/>
      <path d="M200 246 L188 268 L212 268 Z" fill="${INK}"/>
      ${line("M164 300 L236 300 M176 290 L176 314 M200 290 L200 314 M224 290 L224 314", 5)}`,
  },
  {
    id: "owl",
    title: "Night Owl",
    shapes: `
      <rect width="400" height="400" fill="${C.navy}"/>
      ${star(40, 40, 20, C.yellow)}
      ${star(370, 50, 16, C.yellow)}
      ${star(30, 240, 14, C.yellow)}
      ${star(372, 250, 14, C.yellow)}
      <circle cx="200" cy="158" r="140" fill="${C.yellow}"/>
      <rect x="20" y="320" width="360" height="30" rx="15" fill="${C.maroon}"/>
      <path d="M260 336 Q300 300 336 316 Q302 346 260 336 Z" fill="${C.green}"/>
      <path d="M140 336 Q100 300 64 316 Q98 346 140 336 Z" fill="${C.darkGreen}"/>
      <path d="M126 120 L120 56 L176 100 Z M274 120 L280 56 L224 100 Z" fill="${C.brown}"/>
      <ellipse cx="200" cy="215" rx="96" ry="120" fill="${C.brown}"/>
      <path d="M108 200 Q84 270 128 318 Q150 260 130 200 Z M292 200 Q316 270 272 318 Q250 260 270 200 Z" fill="${C.darkOrange}"/>
      <ellipse cx="200" cy="262" rx="58" ry="66" fill="${C.tan}"/>
      <circle cx="162" cy="170" r="36" fill="${C.cream}"/>
      <circle cx="238" cy="170" r="36" fill="${C.cream}"/>
      <path d="M184 196 L216 196 L200 226 Z" fill="${C.orange}"/>
      <ellipse cx="200" cy="104" rx="46" ry="10" fill="${C.darkPurple}"/>
      <path d="M172 100 L206 32 L230 100 Z" fill="${C.purple}"/>
      <path d="M183 78 L222 78 L227 96 L177 96 Z" fill="${C.lime}"/>
      <ellipse cx="174" cy="336" rx="18" ry="11" fill="${C.orange}"/>
      <ellipse cx="226" cy="336" rx="18" ry="11" fill="${C.orange}"/>`,
    ink: `${eye(166, 172, 16)}${eye(234, 172, 16)}
      ${line("M180 250 L190 260 L200 250 L210 260 L220 250 M170 280 L180 290 L190 280 M210 280 L220 290 L230 280", 4)}
      ${line("M112 236 Q122 240 130 232 M114 270 Q124 274 134 266 M288 236 Q278 240 270 232 M286 270 Q276 274 266 266", 4)}`,
  },
  {
    id: "treat-bucket",
    title: "Trick-or-Treat Pail",
    shapes: `
      <rect width="400" height="400" fill="${C.sky}"/>
      ${star(50, 50, 22, C.yellow)}
      ${star(350, 60, 18, C.yellow)}
      <path d="M0 330 Q200 300 400 330 L400 400 L0 400 Z" fill="${C.green}"/>
      <circle cx="152" cy="150" r="32" fill="${C.purple}"/>
      <rect x="232" y="120" width="18" height="70" fill="${C.tan}"/>
      <circle cx="241" cy="104" r="34" fill="${C.pink}"/>
      <circle cx="200" cy="146" r="26" fill="${C.yellow}"/>
      <circle cx="274" cy="170" r="20" fill="${C.teal}"/>
      <path d="M92 182 L308 182 L284 360 Q200 382 116 360 Z" fill="${C.orange}"/>
      <rect x="78" y="164" width="244" height="30" rx="15" fill="${C.darkOrange}"/>
      ${wrapped(46, 360, 13, C.red, C.blue)}
      ${wrapped(354, 366, 13, C.lime, C.purple)}
      <path d="M326 300 L344 300 L335 324 Z" fill="${C.cream}"/>`,
    ink: `${line("M84 178 Q200 0 316 178", 8)}
      <path d="M140 236 L176 236 L158 206 Z M224 236 L260 236 L242 206 Z" fill="${INK}"/>
      <path d="M140 274 L160 290 L180 276 L200 292 L220 276 L240 290 L260 274 Q240 330 200 330 Q160 330 140 274 Z" fill="${INK}"/>`,
  },
  {
    id: "cauldron",
    title: "Bubbling Cauldron",
    shapes: `
      ${Array.from({ length: 10 }, (_, r) => Array.from({ length: 6 }, (_, i) => `<rect x="${i * 80 - (r % 2) * 40}" y="${r * 40 - 20}" width="80" height="40" fill="${BRICKS[(2 * i + 2 - (r % 2)) % 3]}"/>`).join("")).join("")}
      <rect x="0" y="340" width="400" height="60" fill="${C.tan}"/>
      <path d="M140 372 Q130 320 165 300 Q162 330 200 290 Q238 330 235 300 Q270 320 260 372 Z" fill="${C.orange}"/>
      <path d="M172 372 Q166 340 186 326 Q194 346 214 326 Q234 340 228 372 Z" fill="${C.yellow}"/>
      <rect x="110" y="364" width="180" height="22" rx="11" fill="${C.brown}"/>
      <ellipse cx="200" cy="240" rx="134" ry="90" fill="${C.slate}"/>
      <path d="M332 150 L390 40" stroke="${C.tan}" stroke-width="16" stroke-linecap="round"/>
      <ellipse cx="200" cy="176" rx="146" ry="30" fill="${C.gray}"/>
      <ellipse cx="200" cy="174" rx="122" ry="18" fill="${C.green}"/>
      <path d="M120 180 Q110 210 124 222 Q138 210 128 180 Z" fill="${C.green}"/>
      <circle cx="150" cy="140" r="22" fill="${C.lime}"/>
      <circle cx="232" cy="120" r="28" fill="${C.lime}"/>
      <circle cx="190" cy="74" r="16" fill="${C.lime}"/>
      <circle cx="268" cy="62" r="12" fill="${C.lime}"/>`,
    ink: `${eye(172, 252, 12, 15)}${eye(228, 252, 12, 15)}${line("M182 290 Q200 304 218 290", 5)}`,
  },
];

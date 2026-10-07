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

/** An ink line. */
function line(d: string, w = 5) {
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

export const DESIGNS: HalloweenDesign[] = [
  {
    id: "pumpkin",
    title: "Happy Pumpkin",
    shapes: `
      <path d="M184 112 L180 56 Q196 42 216 52 L218 112 Z" fill="${C.brown}"/>
      <path d="M214 74 Q248 26 296 50 Q258 92 214 74 Z" fill="${C.green}"/>
      <ellipse cx="138" cy="232" rx="96" ry="124" fill="${C.darkOrange}"/>
      <ellipse cx="262" cy="232" rx="96" ry="124" fill="${C.darkOrange}"/>
      <ellipse cx="200" cy="234" rx="84" ry="134" fill="${C.orange}"/>
      <ellipse cx="146" cy="268" rx="20" ry="13" fill="${C.pink}"/>
      <ellipse cx="254" cy="268" rx="20" ry="13" fill="${C.pink}"/>`,
    ink: `${eye(166, 218, 14, 19)}${eye(234, 218, 14, 19)}${line("M176 262 Q200 290 224 262", 7)}`,
  },
  {
    id: "ghost",
    title: "Little Ghost",
    shapes: `
      ${star(70, 90, 34, C.yellow)}
      ${star(340, 300, 30, C.yellow)}
      ${star(335, 70, 22, C.yellow)}
      <path d="M200 70 C125 70 100 135 100 205 L100 340 Q120 318 140 338 Q160 358 180 338 Q200 318 220 338 Q240 358 260 338 Q280 318 300 340 L300 205 C300 135 275 70 200 70 Z" fill="${C.ghost}"/>
      <ellipse cx="150" cy="226" rx="18" ry="12" fill="${C.pink}"/>
      <ellipse cx="250" cy="226" rx="18" ry="12" fill="${C.pink}"/>
      <path d="M262 92 L230 70 L230 116 Z M262 92 L294 70 L294 116 Z" fill="${C.purple}"/>
      <circle cx="262" cy="92" r="11" fill="${C.lilac}"/>`,
    ink: `${eye(172, 190, 12, 17)}${eye(228, 190, 12, 17)}<ellipse cx="200" cy="236" rx="12" ry="15" fill="${INK}"/>`,
  },
  {
    id: "cat",
    title: "Sweet Black Cat",
    shapes: `
      <path d="M270 335 Q350 330 345 255 Q342 215 365 190" fill="none" stroke="${C.slate}" stroke-width="30" stroke-linecap="round"/>
      <ellipse cx="200" cy="292" rx="88" ry="82" fill="${C.slate}"/>
      <path d="M132 135 L126 52 L190 98 Z M268 135 L274 52 L210 98 Z" fill="${C.slate}"/>
      <circle cx="200" cy="170" r="82" fill="${C.slate}"/>
      <path d="M142 118 L139 70 L178 100 Z M258 118 L261 70 L222 100 Z" fill="${C.pink}"/>
      <ellipse cx="200" cy="305" rx="48" ry="52" fill="${C.gray}"/>
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
      <circle cx="200" cy="200" r="160" fill="${C.yellow}"/>
      <path d="M200 175 C160 115 90 105 30 140 Q66 162 54 208 Q90 190 110 225 Q132 196 162 230 Q178 202 200 216 Z" fill="${C.purple}"/>
      <path d="M200 175 C240 115 310 105 370 140 Q334 162 346 208 Q310 190 290 225 Q268 196 238 230 Q222 202 200 216 Z" fill="${C.purple}"/>
      <path d="M172 160 L166 112 L196 146 Z M228 160 L234 112 L204 146 Z" fill="${C.purple}"/>
      <circle cx="200" cy="168" r="36" fill="${C.purple}"/>
      <ellipse cx="200" cy="228" rx="38" ry="46" fill="${C.purple}"/>
      <ellipse cx="200" cy="236" rx="22" ry="30" fill="${C.lilac}"/>`,
    ink: `${eye(186, 162, 8)}${eye(214, 162, 8)}${line("M186 182 Q200 190 214 182", 4)}
      <path d="M190 185 L194 196 L198 187 Z M210 185 L206 196 L202 187 Z" fill="#fff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`,
  },
  {
    id: "candy-corn",
    title: "Candy Corn Friend",
    shapes: `
      <defs><clipPath id="cc"><path d="M200 36 Q216 36 226 66 L322 318 Q334 362 290 362 L110 362 Q66 362 78 318 L174 66 Q184 36 200 36 Z"/></clipPath></defs>
      <g clip-path="url(#cc)">
        <rect x="0" y="0" width="400" height="150" fill="${C.cream}"/>
        <rect x="0" y="150" width="400" height="115" fill="${C.orange}"/>
        <rect x="0" y="265" width="400" height="135" fill="${C.yellow}"/>
      </g>
      <ellipse cx="156" cy="226" rx="15" ry="10" fill="${C.pink}"/>
      <ellipse cx="244" cy="226" rx="15" ry="10" fill="${C.pink}"/>`,
    ink: `${eye(176, 198, 10, 13)}${eye(224, 198, 10, 13)}${line("M186 226 Q200 240 214 226", 5)}`,
  },
  {
    id: "witch-hat",
    title: "Witch's Hat",
    shapes: `
      ${star(70, 110, 32, C.yellow)}
      ${star(335, 150, 26, C.yellow)}
      ${star(320, 60, 18, C.yellow)}
      <ellipse cx="200" cy="318" rx="160" ry="36" fill="${C.navy}"/>
      <path d="M112 300 L188 92 Q204 44 262 50 Q222 72 226 112 L290 300 Z" fill="${C.purple}"/>
      <path d="M128 256 L274 256 L290 300 L112 300 Z" fill="${C.green}"/>
      <rect x="172" y="260" width="58" height="36" rx="4" fill="${C.yellow}"/>
      <path d="M180 166 L222 160 L228 204 L186 210 Z" fill="${C.lilac}"/>`,
    ink: `${line("M178 176 L188 172 M184 196 L194 194 M220 164 L230 170 M224 196 L234 194", 4)}`,
  },
  {
    id: "spider",
    title: "Friendly Spider",
    shapes: `
      <circle cx="200" cy="240" r="92" fill="${C.slate}"/>
      <ellipse cx="148" cy="270" rx="18" ry="12" fill="${C.pink}"/>
      <ellipse cx="252" cy="270" rx="18" ry="12" fill="${C.pink}"/>
      <path d="M200 156 L168 136 L168 176 Z M200 156 L232 136 L232 176 Z" fill="${C.red}"/>
      <circle cx="200" cy="156" r="11" fill="${C.pink}"/>`,
    ink: `${line("M200 0 L200 146", 4)}
      ${line("M118 200 Q70 160 40 190 M112 232 Q60 222 30 260 M116 268 Q70 290 52 340 M132 300 Q110 340 110 380", 9)}
      ${line("M282 200 Q330 160 360 190 M288 232 Q340 222 370 260 M284 268 Q330 290 348 340 M268 300 Q290 340 290 380", 9)}
      <circle cx="172" cy="232" r="22" fill="#fff" stroke="${INK}" stroke-width="4"/><circle cx="228" cy="232" r="22" fill="#fff" stroke="${INK}" stroke-width="4"/>
      ${eye(176, 236, 11)}${eye(224, 236, 11)}${line("M182 280 Q200 296 218 280", 5)}`,
  },
  {
    id: "haunted-house",
    title: "Spooky House",
    shapes: `
      <circle cx="320" cy="80" r="50" fill="${C.yellow}"/>
      <rect x="244" y="96" width="30" height="64" fill="${C.slate}"/>
      <path d="M0 400 L0 342 Q200 300 400 342 L400 400 Z" fill="${C.darkGreen}"/>
      <rect x="110" y="170" width="180" height="182" fill="${C.purple}"/>
      <path d="M86 184 L200 80 L314 184 Z" fill="${C.navy}"/>
      <circle cx="200" cy="146" r="20" fill="${C.yellow}"/>
      <rect x="132" y="200" width="50" height="50" fill="${C.yellow}"/>
      <rect x="218" y="200" width="50" height="50" fill="${C.yellow}"/>
      <path d="M174 352 L174 290 Q200 258 226 290 L226 352 Z" fill="${C.brown}"/>
      <ellipse cx="290" cy="346" rx="30" ry="24" fill="${C.orange}"/>
      <rect x="281" y="308" width="18" height="18" rx="3" fill="${C.green}"/>`,
    ink: `${line("M157 200 L157 250 M132 225 L182 225 M243 200 L243 250 M218 225 L268 225", 4)}
      <circle cx="216" cy="322" r="5" fill="${INK}"/>
      <path d="M60 70 Q70 58 80 66 Q86 56 92 66 Q102 58 112 70 Q100 68 92 76 Q86 70 80 76 Q72 68 60 70 Z" fill="${INK}"/>
      <path d="M100 120 Q108 111 116 117 Q120 109 125 117 Q133 111 141 120 Q132 118 125 124 Q120 119 116 124 Q109 118 100 120 Z" fill="${INK}"/>`,
  },
  {
    id: "candy",
    title: "Treats",
    shapes: `
      <defs><clipPath id="wrap"><ellipse cx="200" cy="100" rx="72" ry="50"/></clipPath></defs>
      <path d="M136 100 L60 52 Q78 100 60 148 Z M264 100 L340 52 Q322 100 340 148 Z" fill="${C.purple}"/>
      <ellipse cx="200" cy="100" rx="72" ry="50" fill="${C.orange}"/>
      <g clip-path="url(#wrap)"><path d="M150 40 L180 40 L130 160 L100 160 Z M225 40 L255 40 L205 160 L175 160 Z" fill="${C.yellow}"/></g>
      <rect x="110" y="250" width="22" height="140" rx="6" fill="${C.tan}"/>
      <circle cx="121" cy="240" r="72" fill="${C.pink}"/>
      <circle cx="121" cy="240" r="50" fill="${C.cream}"/>
      <circle cx="121" cy="240" r="28" fill="${C.pink}"/>
      <rect x="236" y="196" width="118" height="180" rx="8" fill="${C.brown}"/>
      <rect x="236" y="292" width="118" height="84" rx="8" fill="${C.red}"/>
      <rect x="236" y="292" width="118" height="20" fill="${C.red}"/>`,
    ink: `${line("M276 196 L276 292 M314 196 L314 292 M236 244 L354 244", 4)}`,
  },
  {
    id: "mummy",
    title: "Cute Mummy",
    shapes: `
      <defs><clipPath id="head"><circle cx="200" cy="205" r="140"/></clipPath></defs>
      <g clip-path="url(#head)">
        <rect x="0" y="0" width="400" height="400" fill="${C.cream}"/>
        <path d="M0 96 L400 70 L400 112 L0 138 Z M0 276 L400 250 L400 292 L0 318 Z" fill="${C.tan}"/>
        <rect x="0" y="168" width="400" height="62" fill="${C.slate}"/>
      </g>
      <ellipse cx="140" cy="262" rx="20" ry="13" fill="${C.pink}"/>
      <ellipse cx="260" cy="262" rx="20" ry="13" fill="${C.pink}"/>`,
    ink: `<circle cx="160" cy="199" r="24" fill="#fff"/><circle cx="240" cy="199" r="24" fill="#fff"/>
      ${eye(164, 202, 12)}${eye(236, 202, 12)}${line("M184 272 Q200 286 216 272", 5)}`,
  },
  {
    id: "monster",
    title: "Frankie the Monster",
    shapes: `
      <path d="M110 330 L290 330 L330 400 L70 400 Z" fill="${C.navy}"/>
      <rect x="44" y="240" width="56" height="34" rx="6" fill="${C.gray}"/>
      <rect x="300" y="240" width="56" height="34" rx="6" fill="${C.gray}"/>
      <rect x="92" y="80" width="216" height="260" rx="44" fill="${C.green}"/>
      <path d="M92 160 L92 118 Q92 64 146 64 L254 64 Q308 64 308 118 L308 160 L284 134 L260 160 L236 134 L212 160 L188 134 L164 160 L140 134 L116 160 Z" fill="${C.slate}"/>
      <ellipse cx="136" cy="262" rx="20" ry="13" fill="${C.pink}"/>
      <ellipse cx="264" cy="262" rx="20" ry="13" fill="${C.pink}"/>`,
    ink: `<ellipse cx="160" cy="214" rx="24" ry="26" fill="#fff" stroke="${INK}" stroke-width="4"/><ellipse cx="240" cy="214" rx="24" ry="26" fill="#fff" stroke="${INK}" stroke-width="4"/>
      ${eye(162, 220, 11)}${eye(238, 220, 11)}${line("M134 178 L184 184 M266 178 L216 184", 8)}
      ${line("M164 292 L236 292 M176 282 L176 302 M200 282 L200 302 M224 282 L224 302", 5)}`,
  },
  {
    id: "skull",
    title: "Flower Skull",
    shapes: `
      <circle cx="200" cy="205" r="178" fill="${C.lilac}"/>
      <circle cx="200" cy="180" r="118" fill="${C.ghost}"/>
      <rect x="138" y="240" width="124" height="96" rx="24" fill="${C.ghost}"/>
      <circle cx="285" cy="74" r="20" fill="${C.pink}"/><circle cx="315" cy="94" r="20" fill="${C.pink}"/>
      <circle cx="305" cy="128" r="20" fill="${C.pink}"/><circle cx="267" cy="128" r="20" fill="${C.pink}"/>
      <circle cx="257" cy="94" r="20" fill="${C.pink}"/>
      <circle cx="286" cy="102" r="16" fill="${C.yellow}"/>
      <path d="M232 128 Q206 112 196 132 Q218 146 232 128 Z" fill="${C.green}"/>`,
    ink: `<ellipse cx="156" cy="192" rx="32" ry="36" fill="${INK}"/><ellipse cx="244" cy="192" rx="32" ry="36" fill="${INK}"/>
      <circle cx="166" cy="180" r="10" fill="#fff"/><circle cx="254" cy="180" r="10" fill="#fff"/>
      <path d="M200 236 L188 258 L212 258 Z" fill="${INK}"/>
      ${line("M164 290 L236 290 M176 280 L176 304 M200 280 L200 304 M224 280 L224 304", 5)}`,
  },
  {
    id: "owl",
    title: "Night Owl",
    shapes: `
      <circle cx="200" cy="158" r="140" fill="${C.yellow}"/>
      <rect x="20" y="320" width="360" height="30" rx="15" fill="${C.slate}"/>
      <path d="M260 336 Q300 300 336 316 Q302 346 260 336 Z" fill="${C.green}"/>
      <path d="M126 120 L120 56 L176 100 Z M274 120 L280 56 L224 100 Z" fill="${C.brown}"/>
      <ellipse cx="200" cy="215" rx="96" ry="120" fill="${C.brown}"/>
      <path d="M108 200 Q84 270 128 318 Q150 260 130 200 Z M292 200 Q316 270 272 318 Q250 260 270 200 Z" fill="${C.darkOrange}"/>
      <ellipse cx="200" cy="262" rx="58" ry="66" fill="${C.tan}"/>
      <circle cx="162" cy="170" r="36" fill="${C.cream}"/>
      <circle cx="238" cy="170" r="36" fill="${C.cream}"/>
      <path d="M184 196 L216 196 L200 226 Z" fill="${C.orange}"/>
      <ellipse cx="174" cy="336" rx="18" ry="11" fill="${C.orange}"/>
      <ellipse cx="226" cy="336" rx="18" ry="11" fill="${C.orange}"/>`,
    ink: `${eye(166, 172, 16)}${eye(234, 172, 16)}
      ${line("M180 250 L190 260 L200 250 L210 260 L220 250 M170 280 L180 290 L190 280 M210 280 L220 290 L230 280", 4)}`,
  },
  {
    id: "treat-bucket",
    title: "Trick-or-Treat Pail",
    shapes: `
      <circle cx="152" cy="150" r="32" fill="${C.purple}"/>
      <rect x="232" y="120" width="18" height="70" fill="${C.tan}"/>
      <circle cx="241" cy="104" r="34" fill="${C.pink}"/>
      <circle cx="200" cy="146" r="26" fill="${C.yellow}"/>
      <circle cx="262" cy="166" r="22" fill="${C.green}"/>
      <path d="M92 182 L308 182 L284 360 Q200 382 116 360 Z" fill="${C.orange}"/>
      <rect x="78" y="164" width="244" height="30" rx="15" fill="${C.darkOrange}"/>`,
    ink: `${line("M84 178 Q200 0 316 178", 8)}
      <path d="M140 236 L176 236 L158 206 Z M224 236 L260 236 L242 206 Z" fill="${INK}"/>
      <path d="M140 274 L160 290 L180 276 L200 292 L220 276 L240 290 L260 274 Q240 330 200 330 Q160 330 140 274 Z" fill="${INK}"/>`,
  },
  {
    id: "cauldron",
    title: "Bubbling Cauldron",
    shapes: `
      <path d="M110 390 L290 350 L296 370 L116 410 Z M110 350 L290 390 L284 410 L104 370 Z" fill="${C.brown}"/>
      <path d="M150 370 Q140 320 175 300 Q170 330 200 290 Q230 330 225 300 Q260 320 250 370 Z" fill="${C.orange}"/>
      <ellipse cx="200" cy="262" rx="134" ry="100" fill="${C.slate}"/>
      <ellipse cx="200" cy="176" rx="146" ry="30" fill="${C.gray}"/>
      <ellipse cx="200" cy="174" rx="122" ry="18" fill="${C.green}"/>
      <circle cx="150" cy="140" r="22" fill="${C.lime}"/>
      <circle cx="232" cy="120" r="28" fill="${C.lime}"/>
      <circle cx="190" cy="74" r="16" fill="${C.lime}"/>
      <circle cx="268" cy="62" r="12" fill="${C.lime}"/>`,
    ink: `${eye(172, 252, 12, 15)}${eye(228, 252, 12, 15)}${line("M182 290 Q200 304 218 290", 5)}`,
  },
];

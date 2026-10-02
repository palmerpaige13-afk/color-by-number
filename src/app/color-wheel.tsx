"use client";

// A color wheel for making a new paint color: drag around the wheel to choose the color
// (around = hue, out from the middle = how strong), and the slider below for light or dark.
// Common colors (hair, skin, clothes) are one tap away, and a color code from online can be
// typed in.

import { useEffect, useRef, useState } from "react";
import type { RGB } from "@/lib/pipeline";

const SIZE = 200;

/** Colors people often need when fixing a page, in groups, one tap to use. */
const COMMON: { group: string; colors: { name: string; rgb: RGB }[] }[] = [
  {
    group: "Hair",
    colors: [
      { name: "Platinum", rgb: [230, 212, 170] },
      { name: "Blonde", rgb: [210, 168, 96] },
      { name: "Dark blonde", rgb: [178, 140, 88] },
      { name: "Light brown", rgb: [150, 108, 70] },
      { name: "Brunette", rgb: [107, 68, 35] },
      { name: "Dark brown", rgb: [62, 42, 30] },
      { name: "Black", rgb: [30, 27, 27] },
      { name: "Red", rgb: [168, 78, 40] },
      { name: "Gray", rgb: [160, 158, 155] },
    ],
  },
  {
    group: "Skin",
    colors: [
      { name: "Fair", rgb: [243, 210, 190] },
      { name: "Light", rgb: [230, 180, 150] },
      { name: "Medium", rgb: [200, 140, 100] },
      { name: "Tan", rgb: [168, 107, 69] },
      { name: "Deep", rgb: [110, 68, 40] },
    ],
  },
  {
    group: "Clothes",
    colors: [
      { name: "White", rgb: [247, 247, 247] },
      { name: "Light gray", rgb: [200, 200, 200] },
      { name: "Dark gray", rgb: [90, 90, 92] },
      { name: "Black", rgb: [27, 27, 27] },
      { name: "Navy", rgb: [31, 45, 74] },
      { name: "Jeans", rgb: [74, 106, 143] },
      { name: "Light jeans", rgb: [140, 165, 190] },
      { name: "Khaki", rgb: [195, 176, 145] },
    ],
  },
  {
    group: "Flowers and leaves",
    colors: [
      { name: "Pink", rgb: [225, 150, 170] },
      { name: "Rose", rgb: [195, 90, 120] },
      { name: "Lavender", rgb: [180, 155, 200] },
      { name: "Leaf green", rgb: [90, 120, 60] },
      { name: "Dark leaf", rgb: [50, 70, 40] },
    ],
  },
];

/**
 * A color code as people find it online: "#6B4423", "6b4423", "#abc", or numbers like
 * "107, 68, 35" or "rgb(107, 68, 35)". Null if it isn't one.
 */
export function parseColorCode(text: string): RGB | null {
  const t = text.trim().toLowerCase();
  const hex = t.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
  }
  const nums = t.replace(/^rgba?\(|\)$/g, "").split(/[\s,]+/).filter(Boolean);
  if (nums.length === 3 && nums.every((n) => /^\d{1,3}$/.test(n) && Number(n) <= 255)) return nums.map(Number) as RGB;
  return null;
}

/** The color as a code like #6B4423. */
const toCode = (rgb: RGB) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();

function hsvToRgb(h: number, s: number, v: number): RGB {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1)];
}

function rgbToHsv([r, g, b]: RGB): [number, number, number] {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r / 255) h = 60 * (((g - b) / 255 / d) % 6);
    else if (max === g / 255) h = 60 * ((b - r) / 255 / d + 2);
    else h = 60 * ((r - g) / 255 / d + 4);
  }
  return [(h + 360) % 360, max ? d / max : 0, max];
}

export function ColorWheel({ start, onUse, onCancel }: { start: RGB; onUse: (rgb: RGB) => void; onCancel: () => void }) {
  const [hsv, setHsv] = useState(() => rgbToHsv(start));
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState(false);
  const wheel = useRef<HTMLCanvasElement>(null);
  const [h, s, v] = hsv;
  const rgb = hsvToRgb(h, s, v);

  // The wheel, drawn at the chosen lightness.
  useEffect(() => {
    const c = wheel.current;
    if (!c) return;
    c.width = c.height = SIZE;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(SIZE, SIZE);
    const r0 = SIZE / 2;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = x + 0.5 - r0;
        const dy = y + 0.5 - r0;
        const d = Math.hypot(dx, dy) / r0;
        if (d > 1) continue;
        const [R, G, B] = hsvToRgb(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360, d, v);
        const q = (y * SIZE + x) * 4;
        img.data[q] = R;
        img.data[q + 1] = G;
        img.data[q + 2] = B;
        img.data[q + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [v]);

  function pickAt(e: React.PointerEvent<HTMLCanvasElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - box.left - box.width / 2;
    const dy = e.clientY - box.top - box.height / 2;
    const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    setHsv([hue, Math.min(1, Math.hypot(dx, dy) / (box.width / 2)), v]);
  }

  // Where the chosen color is on the wheel.
  const mx = 50 + 50 * s * Math.cos((h * Math.PI) / 180);
  const my = 50 + 50 * s * Math.sin((h * Math.PI) / 180);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-violet-200 bg-white p-3 dark:border-violet-900 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative h-[200px] w-[200px] shrink-0">
          <canvas
            ref={wheel}
            className="h-full w-full cursor-crosshair touch-none rounded-full"
            onPointerDown={(e) => {
              try {
                e.currentTarget.setPointerCapture(e.pointerId); // keep following a straying finger
              } catch {
                // not a real pointer (nothing to capture)
              }
              pickAt(e);
            }}
            onPointerMove={(e) => {
              if (e.buttons || e.pointerType === "touch") pickAt(e);
            }}
          />
          <span
            className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/40"
            style={{ left: `${mx}%`, top: `${my}%`, background: `rgb(${rgb.join(",")})` }}
          />
        </div>
        <div className="flex min-w-40 flex-1 flex-col gap-3">
          <div className="flex items-center gap-3">
            <span
              className="h-12 w-12 shrink-0 rounded-lg border border-zinc-300"
              style={{ background: `rgb(${rgb.join(",")})` }}
            />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Your new color</span>
          </div>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Light or dark
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={v}
              onChange={(e) => setHsv([h, s, Number(e.target.value)])}
              className="w-full accent-violet-600"
            />
          </label>
        </div>
      </div>
      <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        Color code from online (like #6B4423)
        <span className="flex gap-2">
          <input
            type="text"
            value={code}
            placeholder={toCode(rgb)}
            onChange={(e) => {
              setCode(e.target.value);
              const found = parseColorCode(e.target.value);
              setCodeError(!found && e.target.value.trim() !== "");
              if (found) setHsv(rgbToHsv(found));
            }}
            className="w-40 rounded-lg border border-zinc-300 px-2 py-1 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          {codeError && <span className="self-center text-xs text-red-700 dark:text-red-400">That isn&apos;t a color code yet.</span>}
        </span>
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-sm text-zinc-700 dark:text-zinc-300">Common colors (tap one to use it)</span>
        {COMMON.map(({ group, colors }) => (
          <div key={group} className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 text-xs font-semibold text-zinc-500">{group}</span>
            {colors.map(({ name, rgb: c }) => (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => onUse(c)}
                className="flex w-14 flex-col items-center gap-0.5 text-[10px] leading-tight text-zinc-600 dark:text-zinc-400"
              >
                <span className="h-7 w-7 rounded-full border border-zinc-300 shadow-sm" style={{ background: `rgb(${c.join(",")})` }} />
                {name}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onUse(rgb)}
          className="rounded-full bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-700"
        >
          Use this color
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

"use client";

// A color wheel for making a new paint color: drag around the wheel to choose the color
// (around = hue, out from the middle = how strong), and the slider below for light or dark.

import { useEffect, useRef, useState } from "react";
import type { RGB } from "@/lib/pipeline";

const SIZE = 200;

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

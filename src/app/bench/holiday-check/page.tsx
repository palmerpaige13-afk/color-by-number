"use client";

// Test bench only: shape counts of every holiday page, to check a change to page-making.

import { useEffect } from "react";
import { DESIGNS } from "@/lib/halloween/designs";
import { THANKSGIVING } from "@/lib/holidays/thanksgiving";
import { CHRISTMAS } from "@/lib/holidays/christmas";
import { CHRISTMAS_OLDER, HALLOWEEN_OLDER, THANKSGIVING_OLDER } from "@/lib/holidays/older";
import { makeHalloweenPage } from "@/lib/halloween/make";
import { fitOnPaper, fontFraction } from "@/lib/print";

const FIT = fitOnPaper(1, "letter");

export default function Check() {
  useEffect(() => {
    (async () => {
      const out: Record<string, string> = {};
      for (const [set, frac] of [[[...DESIGNS, ...THANKSGIVING, ...CHRISTMAS], fontFraction(FIT.w) * 1.25], [[...HALLOWEEN_OLDER, ...THANKSGIVING_OLDER, ...CHRISTMAS_OLDER], fontFraction(FIT.w)]] as const) {
        for (const d of set) {
          const hp = await makeHalloweenPage(d, frac);
          out[d.id] = `${hp.page.shapes}/${hp.page.key.length}/${hp.unnumbered}`;
        }
      }
      (window as unknown as { __hc: unknown }).__hc = out;
    })();
  }, []);
  if (process.env.NODE_ENV === "production") return null;
  return <p>checking…</p>;
}

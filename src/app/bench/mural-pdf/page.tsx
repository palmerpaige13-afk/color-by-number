"use client";

// Test bench only: a gallery mural's PDF, made the way the site makes it, saved on the bench.

import { useEffect } from "react";
import { loadPhoto, makePage } from "@/lib/make-page";
import { muralPdf } from "@/lib/page-pdf";
import { levelFor, type PrintSizeId } from "@/lib/print";

export default function MuralPdf() {
  useEffect(() => {
    (async () => {
      const q = new URLSearchParams(location.search);
      const pic = q.get("pic") ?? "sea-turtle";
      const size = (q.get("size") ?? "mural-4") as PrintSizeId;
      const blob = await (await fetch(q.get("src") ?? `/murals/${pic}.jpg`)).blob();
      const photo = await loadPhoto(new File([blob], `${pic}.jpg`, { type: "image/jpeg" }));
      const { page, fit } = await makePage(photo, { printSize: size, difficulty: levelFor(size, 0), faces: q.has("faces"), zoomOut: false, colorful: false, ownColors: false });
      const pdf = await muralPdf(page, fit);
      const data = await new Promise<string>((r) => {
        const f = new FileReader();
        f.onload = () => r(String(f.result));
        f.readAsDataURL(pdf);
      });
      await fetch("/api/bench", { method: "POST", body: JSON.stringify({ kind: "pdf", name: `mural-${pic}-${size}`, pdf: data }) });
      // The finished picture as it's laid on the sheets, beside the photo, to see what was trimmed.
      (window as unknown as { __mural: unknown }).__mural = { fit, page };
      document.body.dataset.done = "1";
    })();
  }, []);
  if (process.env.NODE_ENV === "production") return null;
  return <p>making the mural PDF…</p>;
}

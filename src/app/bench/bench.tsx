"use client";

// The test bench: makes a page from every test photo, at a small card and at Letter, exactly
// as the site does, and checks each against what it should be: the right number of faces, and
// the same picture as the one approved before (so a fix for one photo can't quietly break
// another). Approving a result makes it the new standard for that photo and size.

import { useEffect, useRef, useState } from "react";
import { loadPhoto, makePage } from "@/lib/make-page";
import { drawPage } from "@/lib/page";
import { levelFor, type PrintSizeId } from "@/lib/print";

const DIR = "/test-images/bench";
const SIZES: PrintSizeId[] = ["letter", "4x6"];
/** Width of the pictures compared, in pixels. */
const THUMB = 360;
/** A pixel counts as changed when its color moved this much (sum of the R, G, B differences). */
const PIXEL_CHANGE = 60;
/** A picture counts as changed when this share of its pixels did. */
const PICTURE_CHANGE = 0.03;

type Expected = Record<string, { faces: number; what: string; known?: string }>;
type Approved = Record<string, { faces: number; people: number; shapes: number; colors: number }>;
type Row = {
  key: string;
  id: string;
  size: PrintSizeId;
  state: "waiting" | "running" | "done" | "failed";
  faces?: number;
  people?: number;
  shapes?: number;
  colors?: number;
  ms?: number;
  image?: string;
  /** Share of the picture that differs from the approved one; null when none is approved. */
  changed?: number | null;
  diff?: string;
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

/** How much of `now` differs from `before` (same size), and a picture of where (red). */
function compare(now: HTMLCanvasElement, before: HTMLImageElement): { changed: number; diff: string } {
  if (Math.abs(before.width / before.height - now.width / now.height) > 0.01) return { changed: 1, diff: "" };
  const w = now.width;
  const h = now.height;
  const b = document.createElement("canvas");
  b.width = w;
  b.height = h;
  const bctx = b.getContext("2d")!;
  bctx.drawImage(before, 0, 0, w, h);
  const A = now.getContext("2d")!.getImageData(0, 0, w, h);
  const B = bctx.getImageData(0, 0, w, h);
  const out = bctx.createImageData(w, h);
  let changed = 0;
  for (let i = 0; i < A.data.length; i += 4) {
    const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]);
    const gray = (A.data[i] + A.data[i + 1] + A.data[i + 2]) / 3;
    if (d > PIXEL_CHANGE) {
      changed++;
      out.data.set([230, 30, 30, 255], i);
    } else out.data.set([gray, gray, gray, 90], i);
  }
  bctx.putImageData(out, 0, 0);
  return { changed: changed / (w * h), diff: b.toDataURL("image/png") };
}

export function Bench() {
  const [expected, setExpected] = useState<Expected>({});
  const [approved, setApproved] = useState<Approved>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const stamp = useRef(Date.now());

  useEffect(() => {
    (async () => {
      const exp: Expected = await fetch(`${DIR}/expected.json`).then((r) => r.json());
      const app: Approved = await fetch(`${DIR}/approved/approved.json?t=${Date.now()}`)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({}));
      setExpected(exp);
      setApproved(app);
      setRows(Object.keys(exp).flatMap((id) => SIZES.map((size) => ({ key: `${id}-${size}`, id, size, state: "waiting" as const }))));
    })();
  }, []);

  const update = (key: string, change: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...change } : r)));

  /** Makes the pages for one photo (all sizes) and checks them. */
  async function runPhoto(id: string): Promise<Row[]> {
    const done: Row[] = [];
    let photo;
    try {
      photo = await loadPhoto(await fetch(`${DIR}/${id}.jpg`).then((r) => r.blob()));
    } catch {
      for (const size of SIZES) update(`${id}-${size}`, { state: "failed" });
      return done;
    }
    for (const size of SIZES) {
      const key = `${id}-${size}`;
      update(key, { state: "running" });
      const t0 = performance.now();
      try {
        const made = await makePage(photo, { printSize: size, difficulty: levelFor(size, 0), faces: false, zoomOut: false });
        const canvas = document.createElement("canvas");
        drawPage(canvas, made.page, "colored", THUMB / made.page.width);
        const before = await loadImage(`${DIR}/approved/${key}.jpg?t=${stamp.current}`);
        const { changed, diff } = before ? compare(canvas, before) : { changed: null, diff: undefined };
        const row: Row = {
          key,
          id,
          size,
          state: "done",
          faces: made.faces,
          people: made.people,
          shapes: made.page.shapes,
          colors: made.page.key.length,
          ms: Math.round(performance.now() - t0),
          image: canvas.toDataURL("image/jpeg", 0.85),
          changed,
          diff,
        };
        update(key, row);
        done.push(row);
      } catch {
        update(key, { state: "failed" });
      }
    }
    photo.full.close();
    return done;
  }

  async function runAll() {
    setRunning(true);
    stamp.current = Date.now();
    setRows((all) => all.map((r) => ({ key: r.key, id: r.id, size: r.size, state: "waiting" })));
    const results: Row[] = [];
    for (const id of Object.keys(expected)) results.push(...(await runPhoto(id)));
    setRunning(false);
    // A report for checking from the terminal too.
    await fetch("/api/bench", {
      method: "POST",
      body: JSON.stringify({
        kind: "report",
        report: results.map(({ key, faces, people, shapes, colors, ms, changed }) => ({
          key,
          faces,
          expectedFaces: expected[key.split("-")[0]].faces,
          people,
          shapes,
          colors,
          ms,
          changed,
          verdict: verdict({ key, faces, changed } as Row),
        })),
      }),
    });
  }

  async function approve(row: Row) {
    if (!row.image) return;
    await fetch("/api/bench", {
      method: "POST",
      body: JSON.stringify({ id: row.id, size: row.size, image: row.image, faces: row.faces, people: row.people, shapes: row.shapes, colors: row.colors }),
    });
    setApproved((a) => ({ ...a, [row.key]: { faces: row.faces!, people: row.people!, shapes: row.shapes!, colors: row.colors! } }));
    update(row.key, { changed: 0, diff: undefined });
  }

  /** "ok", "faces" (wrong number of faces), "known" (a known weakness), "changed", or "new" (nothing approved yet). */
  function verdict(row: Pick<Row, "key" | "faces" | "changed">): string {
    const e = expected[row.key.split("-")[0]];
    if (e && row.faces !== undefined && row.faces !== e.faces) return e.known ? "known" : "faces";
    if (row.changed === null || row.changed === undefined) return "new";
    return row.changed > PICTURE_CHANGE ? "changed" : "ok";
  }

  const finished = rows.filter((r) => r.state === "done");
  const count = (v: string) => finished.filter((r) => verdict(r) === v).length;
  const badge: Record<string, string> = {
    ok: "bg-green-100 text-green-800",
    faces: "bg-red-100 text-red-800",
    known: "bg-amber-100 text-amber-800",
    changed: "bg-orange-100 text-orange-800",
    new: "bg-zinc-100 text-zinc-700",
  };
  const words: Record<string, string> = {
    ok: "Same as approved",
    faces: "Wrong number of faces",
    known: "Known weakness",
    changed: "Changed: please review",
    new: "Not approved yet",
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Test bench</h1>
        <button
          type="button"
          onClick={runAll}
          disabled={running || !rows.length}
          className="rounded-full bg-violet-600 px-5 py-2 font-semibold text-white disabled:opacity-40"
        >
          {running ? `Running… ${finished.length} of ${rows.length}` : "Run all"}
        </button>
        {finished.length > 0 && (
          <span className="text-sm">
            {count("ok")} same · {count("changed")} changed · {count("faces")} wrong faces · {count("known")} known · {count("new")} not approved
          </span>
        )}
      </header>
      <p className="text-sm text-zinc-500">
        Each photo is made at {SIZES.join(" and ")}, exactly as the site does. A result is checked against the
        number of faces really in the photo and against the approved picture (red shows what changed).
      </p>
      <div className="flex flex-col gap-3">
        {rows.map((row) => {
          const e = expected[row.id];
          const v = row.state === "done" ? verdict(row) : null;
          const a = approved[row.key];
          return (
            <div key={row.key} className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 p-3 sm:grid-cols-[220px_1fr_1fr_1fr] dark:border-zinc-800">
              <div className="flex flex-col gap-1 text-sm">
                <span className="font-semibold">
                  {row.id} · {row.size}
                </span>
                <span className="text-zinc-600 dark:text-zinc-400">{e?.what}</span>
                <span>
                  Faces: {row.faces ?? "–"} of {e?.faces}
                  {a ? ` (approved: ${a.faces})` : ""}
                </span>
                <span>
                  {row.shapes ?? "–"} shapes · {row.colors ?? "–"} colors{row.ms ? ` · ${(row.ms / 1000).toFixed(1)}s` : ""}
                </span>
                {a && row.shapes !== undefined && (
                  <span className="text-zinc-500">
                    Approved: {a.shapes} shapes · {a.colors} colors
                  </span>
                )}
                {e?.known && <span className="text-amber-700">Known: {e.known}</span>}
                {row.state === "running" && <span className="text-violet-700">Making…</span>}
                {row.state === "failed" && <span className="text-red-700">Couldn&apos;t make this page</span>}
                {v && <span className={`self-start rounded-full px-2 py-0.5 text-xs font-semibold ${badge[v]}`}>{words[v]}</span>}
                {row.state === "done" && v !== "ok" && (
                  <button
                    type="button"
                    onClick={() => approve(row)}
                    className="self-start rounded-full border border-violet-500 px-3 py-1 text-xs font-semibold text-violet-700"
                  >
                    Approve this result
                  </button>
                )}
              </div>
              <figure className="text-xs text-zinc-500">
                {/* eslint-disable-next-line @next/next/no-img-element -- bench pictures */}
                {row.image ? <img src={row.image} alt="Now" className="w-full rounded" /> : <div className="aspect-[4/3] rounded bg-zinc-100" />}
                <figcaption>Now</figcaption>
              </figure>
              <figure className="text-xs text-zinc-500">
                {a ? (
                  // eslint-disable-next-line @next/next/no-img-element -- bench pictures
                  <img src={`${DIR}/approved/${row.key}.jpg?t=${stamp.current}`} alt="Approved" className="w-full rounded" />
                ) : (
                  <div className="aspect-[4/3] rounded bg-zinc-100" />
                )}
                <figcaption>Approved</figcaption>
              </figure>
              <figure className="text-xs text-zinc-500">
                {/* eslint-disable-next-line @next/next/no-img-element -- bench pictures */}
                {row.diff ? <img src={row.diff} alt="What changed" className="w-full rounded" /> : <div className="aspect-[4/3] rounded bg-zinc-100" />}
                <figcaption>What changed{row.changed ? `: ${Math.round(row.changed * 100)}%` : ""}</figcaption>
              </figure>
            </div>
          );
        })}
      </div>
    </main>
  );
}

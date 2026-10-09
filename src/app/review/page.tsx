// The site owner's review page: the fix reports people sent, newest first, with their shared
// photos to look at or download. Behind a password; nothing here is linked from the site.

import type { Metadata } from "next";
import Link from "next/link";
import { loadReports, loadVisitStats, photoLink, reviewSetupMissing, signedIn, type Fix, type Report, type VisitStats } from "@/lib/review";
import { markAllReviewed, markReviewed, signIn, signOut } from "./actions";

export const metadata: Metadata = { title: "Reports · Color by Number", robots: { index: false, follow: false } };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Denver" });

/** A fix list in words: "3 lines (hair), 2 color changes (skin → clothes)…". */
function summary(fixes: Fix[]): string[] {
  const counts = new Map<string, number>();
  for (const f of fixes) {
    if (!f.tool || f.tool === "undo") continue;
    const what = f.parts?.join(" + ") ?? f.part ?? "";
    const key = `${f.tool}${what ? ` (${what})` : ""}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} × ${k}`);
}

function Swatches({ fixes }: { fixes: Fix[] }) {
  const changes = fixes.filter((f) => f.tool === "color" && f.from_rgb && f.to_rgb).slice(0, 12);
  if (!changes.length) return null;
  const dot = (rgb: number[]) => (
    <span className="inline-block h-4 w-4 rounded-full border border-zinc-300" style={{ background: `rgb(${rgb.join(",")})` }} />
  );
  return (
    <div className="flex flex-wrap gap-2 text-xs text-zinc-600">
      {changes.map((f, i) => (
        <span key={i} className="flex items-center gap-1">
          {dot(f.from_rgb!)}→{dot(f.to_rgb!)}
          <span>{f.part}</span>
        </span>
      ))}
    </div>
  );
}

const SOURCE_NAMES: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  pinterest: "Pinterest",
  tiktok: "TikTok",
  x: "X (Twitter)",
  youtube: "YouTube",
  reddit: "Reddit",
  google: "Google",
  search: "Other search",
  other: "Other websites",
  direct: "Typed in or bookmarked",
};

/** Visits lately: how many, and where people came from. */
function Visits({ stats }: { stats: VisitStats }) {
  const row = (label: string, n: number) => (
    <li key={label} className="flex justify-between gap-4">
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{n}</span>
    </li>
  );
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
      <h2 className="text-lg font-bold">
        Visits <span className="text-sm font-normal text-zinc-500">last {stats.days} days</span>
      </h2>
      <p>
        <span className="text-2xl font-bold">{stats.total}</span> visits · <span className="font-semibold">{stats.today}</span> today
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 font-semibold text-zinc-600 dark:text-zinc-400">Where they came from</h3>
          <ul className="flex flex-col gap-0.5">{stats.bySource.map(([s, n]) => row(SOURCE_NAMES[s] ?? (s === "not tracked yet" ? "Before tracking began" : `Link tagged “${s}”`), n))}</ul>
        </div>
        <div>
          <h3 className="mb-1 font-semibold text-zinc-600 dark:text-zinc-400">Page they arrived on</h3>
          <ul className="flex flex-col gap-0.5">{stats.byPage.slice(0, 6).map(([p, n]) => row(p === "/" ? "Home" : p, n))}</ul>
        </div>
      </div>
    </section>
  );
}

async function ReportCard({ report }: { report: Report }) {
  const [view, download] = report.photo_path
    ? await Promise.all([photoLink(report.photo_path), photoLink(report.photo_path, true)])
    : [null, null];
  const lines = summary(report.fixes ?? []);
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 sm:flex-row dark:border-zinc-800">
      <div className="w-full shrink-0 sm:w-56">
        {view ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived private link
          <img src={view} alt="Shared photo" className="w-full rounded-lg object-cover" />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-zinc-100 text-sm text-zinc-500 dark:bg-zinc-900">
            No photo shared
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
        <div className="flex flex-wrap items-center gap-2 text-zinc-500">
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">{when(report.created_at)}</span>
          <span>· {report.device ?? "?"}</span>
          <span>· {report.print_size ?? "?"}</span>
          <span>
            · {report.people ?? 0} people, {report.faces ?? 0} faces
          </span>
          <span>
            · {report.shapes_before ?? "?"} shapes, {report.colors_before ?? "?"} colors
          </span>
        </div>
        {report.note && <p className="rounded-lg bg-violet-50 p-2 text-violet-900 dark:bg-violet-950 dark:text-violet-200">“{report.note}”</p>}
        {lines.length > 0 ? (
          <ul className="list-inside list-disc text-zinc-700 dark:text-zinc-300">
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        ) : (
          <p className="text-zinc-500">No fixes, just a note.</p>
        )}
        <Swatches fixes={report.fixes ?? []} />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {download && (
            <a href={download} className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700">
              Download photo
            </a>
          )}
          <form action={markReviewed}>
            <input type="hidden" name="id" value={report.id} />
            <input type="hidden" name="reviewed" value={report.reviewed_at ? "0" : "1"} />
            <button
              type="submit"
              className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              {report.reviewed_at ? "Mark as new" : "Mark reviewed"}
            </button>
          </form>
          {report.reviewed_at && <span className="text-xs text-zinc-500">Reviewed {when(report.reviewed_at)}</span>}
          {report.photo_path && <span className="text-xs text-zinc-400">{report.photo_path.split("/").pop()}</span>}
        </div>
      </div>
    </li>
  );
}

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const shell = (body: React.ReactNode) => <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-8">{body}</main>;

  const missing = reviewSetupMissing();
  if (missing) {
    return shell(
      <>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p>This page isn&apos;t set up yet. Add these in the hosting&apos;s environment settings, then publish again:</p>
        <ul className="list-inside list-disc">
          {missing.map((m) => (
            <li key={m}>
              <code>{m}</code>
            </li>
          ))}
        </ul>
      </>,
    );
  }

  if (!(await signedIn())) {
    return shell(
      <>
        <h1 className="text-2xl font-bold">Reports</h1>
        <form action={signIn} className="flex max-w-sm flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm">
            Password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <button type="submit" className="self-start rounded-full bg-violet-600 px-4 py-1.5 font-semibold text-white hover:bg-violet-700">
            Sign in
          </button>
        </form>
      </>,
    );
  }

  const all = (await searchParams).all === "1";
  let reports: Report[] = [];
  let error: string | null = null;
  try {
    reports = await loadReports(all);
  } catch (e) {
    error = e instanceof Error ? e.message : "Couldn't load the reports.";
  }
  const visits = await loadVisitStats().catch(() => null);

  return shell(
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{all ? "All reports" : "New reports"}</h1>
        <span className="text-sm text-zinc-500">{reports.length} shown</span>
        <Link href={all ? "/review" : "/review?all=1"} className="text-sm font-semibold text-violet-700 hover:underline dark:text-violet-300">
          {all ? "Show only new" : "Show all"}
        </Link>
        {reports.some((r) => !r.reviewed_at) && (
          <form action={markAllReviewed}>
            <input type="hidden" name="ids" value={reports.filter((r) => !r.reviewed_at).map((r) => r.id).join(",")} />
            <button type="submit" className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700">
              Mark all reviewed
            </button>
          </form>
        )}
        <form action={signOut} className="ml-auto">
          <button type="submit" className="text-sm text-zinc-500 hover:underline">
            Sign out
          </button>
        </form>
      </div>
      {visits && <Visits stats={visits} />}
      {error && <p className="text-red-700">{error}</p>}
      {!error && reports.length === 0 && <p className="text-zinc-500">Nothing new. 🎉</p>}
      <ul className="flex flex-col gap-3">
        {reports.map((r) => (
          <ReportCard key={r.id} report={r} />
        ))}
      </ul>
    </>,
  );
}

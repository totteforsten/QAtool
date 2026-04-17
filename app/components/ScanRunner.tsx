"use client";

import { useCallback, useRef, useState } from "react";
import type { PageReport } from "@/lib/types";
import ReportCard from "./ReportCard";

type Status = "idle" | "discovering" | "scanning" | "done" | "error";

export default function ScanRunner() {
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(10);
  const [deep, setDeep] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [reports, setReports] = useState<PageReport[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const cancelRef = useRef(false);

  const start = useCallback(async () => {
    setError(null);
    setReports([]);
    setUrls([]);
    setProgress({ done: 0, total: 0 });
    cancelRef.current = false;

    if (!/^https?:\/\//i.test(url)) {
      setError("URL must start with http:// or https://");
      return;
    }

    try {
      setStatus("discovering");
      const d = await fetch(`/api/discover?url=${encodeURIComponent(url)}&max=${maxPages}`).then((r) => r.json());
      if (!d.ok) throw new Error(d.error || "Discovery failed");
      const list: string[] = (d.urls as string[]).slice(0, maxPages);
      setUrls(list);
      setProgress({ done: 0, total: list.length });

      setStatus("scanning");
      const acc: PageReport[] = [];
      for (const target of list) {
        if (cancelRef.current) break;
        try {
          const qs = new URLSearchParams({ url: target });
          if (deep) {
            qs.set("deep", "1");
            qs.set("viewports", "mobile,desktop");
          }
          const r = await fetch(`/api/scan?${qs.toString()}`).then((res) => res.json());
          if (r.ok) acc.push(r.report);
          else acc.push(errReport(target, r.error));
        } catch (e: any) {
          acc.push(errReport(target, e?.message ?? String(e)));
        }
        setReports([...acc]);
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
      setStatus("done");
    } catch (e: any) {
      setStatus("error");
      setError(e?.message ?? String(e));
    }
  }, [url, maxPages]);

  const cancel = () => {
    cancelRef.current = true;
    setStatus("done");
  };

  const summary = aggregate(reports);

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <label className="block text-sm text-white/70 mb-2">Site URL</label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-indigo-400"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && start()}
          />
          <select
            className="bg-black/40 border border-white/10 rounded-lg px-3 py-2"
            value={maxPages}
            onChange={(e) => setMaxPages(Number(e.target.value))}
          >
            {[1, 5, 10, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n} pages
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-sm bg-black/40 border border-white/10 rounded-lg px-3 py-2 cursor-pointer select-none">
            <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} className="accent-indigo-400" />
            <span>Deep scan</span>
            <span className="text-white/40 text-xs">(Puppeteer + links)</span>
          </label>
          {status === "scanning" ? (
            <button
              onClick={cancel}
              className="bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 rounded-lg px-4 py-2 font-medium"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={start}
              disabled={!url || status === "discovering"}
              className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 rounded-lg px-4 py-2 font-medium"
            >
              {status === "discovering" ? "Discovering…" : "Scan site"}
            </button>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        {status !== "idle" && (
          <p className="mt-3 text-sm text-white/50">
            {status === "discovering" && "Looking for sitemap…"}
            {status === "scanning" && `Scanning ${progress.done}/${progress.total}…`}
            {status === "done" && `Done — ${reports.length} page(s) scanned.`}
            {status === "error" && "Failed."}
          </p>
        )}
      </section>

      {reports.length > 0 && (
        <section className="card p-5">
          <h2 className="font-semibold mb-3">Summary</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Pages" value={reports.length} />
            <Stat label="Critical" value={summary.critical} tone="critical" />
            <Stat label="Warnings" value={summary.warning} tone="warning" />
            <Stat label="Avg SEO" value={`${summary.avgSeo}`} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/60">
            {summary.platforms.wordpress && <span className="badge badge-info">WordPress</span>}
            {summary.platforms.elementor && <span className="badge badge-info">Elementor</span>}
            {summary.platforms.breakdance && <span className="badge badge-info">Breakdance</span>}
            {summary.platforms.seoPlugin && <span className="badge badge-info">{summary.platforms.seoPlugin}</span>}
          </div>
        </section>
      )}

      {reports.map((r) => (
        <ReportCard key={r.url} report={r} />
      ))}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "critical" | "warning" }) {
  return (
    <div className="rounded-lg bg-black/30 border border-white/5 px-4 py-3">
      <div className="text-xs text-white/50">{label}</div>
      <div className={`text-2xl font-semibold ${tone === "critical" ? "text-red-300" : tone === "warning" ? "text-amber-200" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function errReport(url: string, message: string): PageReport {
  return {
    url,
    fetchedAt: new Date().toISOString(),
    status: 0,
    durationMs: 0,
    platform: { wordpress: false, elementor: false, breakdance: false, seoPlugin: null },
    meta: { h1s: [] },
    findings: [{ id: "fetch-0", category: "seo", severity: "critical", code: "fetch-failed", message }],
    score: { seo: 0, responsive: 0 }
  };
}

function aggregate(reports: PageReport[]) {
  let critical = 0,
    warning = 0,
    info = 0,
    seoTotal = 0;
  const platforms = { wordpress: false, elementor: false, breakdance: false, seoPlugin: null as string | null };
  for (const r of reports) {
    seoTotal += r.score.seo;
    platforms.wordpress ||= r.platform.wordpress;
    platforms.elementor ||= r.platform.elementor;
    platforms.breakdance ||= r.platform.breakdance;
    platforms.seoPlugin = platforms.seoPlugin ?? r.platform.seoPlugin ?? null;
    for (const f of r.findings) {
      if (f.severity === "critical") critical++;
      else if (f.severity === "warning") warning++;
      else info++;
    }
  }
  return {
    critical,
    warning,
    info,
    avgSeo: reports.length ? Math.round(seoTotal / reports.length) : 0,
    platforms
  };
}

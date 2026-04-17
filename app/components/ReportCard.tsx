"use client";

import { useState } from "react";
import type { Finding, PageReport } from "@/lib/types";

export default function ReportCard({ report }: { report: PageReport }) {
  const [open, setOpen] = useState(false);
  const grouped = groupBy(report.findings);
  const critical = report.findings.filter((f) => f.severity === "critical").length;
  const warning = report.findings.filter((f) => f.severity === "warning").length;
  const info = report.findings.filter((f) => f.severity === "info").length;

  return (
    <section className="card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-white/[.02]"
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{report.url}</div>
          <div className="text-xs text-white/50 flex gap-3 mt-1">
            <span>HTTP {report.status}</span>
            <span>SEO {report.score.seo}</span>
            <span>Responsive {report.score.responsive}</span>
            <span>{report.durationMs}ms</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {critical > 0 && <span className="badge badge-critical">{critical} critical</span>}
          {warning > 0 && <span className="badge badge-warning">{warning} warn</span>}
          {info > 0 && <span className="badge badge-info">{info} info</span>}
          <span className="text-white/40 text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-white/5 px-5 py-4 space-y-5">
          <MetaRow label="Title" value={report.meta.title} />
          <MetaRow label="Description" value={report.meta.description} />
          <MetaRow label="Canonical" value={report.meta.canonical} />
          <MetaRow label="Viewport" value={report.meta.viewport} />
          <MetaRow label="H1" value={report.meta.h1s.join(" | ")} />
          {Object.entries(grouped).map(([cat, list]) => (
            <div key={cat}>
              <div className="text-xs uppercase tracking-wide text-white/40 mb-2">{cat}</div>
              <ul className="space-y-2">
                {list.map((f) => (
                  <FindingRow key={f.id} f={f} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function FindingRow({ f }: { f: Finding }) {
  return (
    <li className="flex gap-3 items-start text-sm">
      <span className={`badge badge-${f.severity} shrink-0`}>{f.severity}</span>
      <div className="flex-1 min-w-0">
        <div className="text-white/90">{f.message}</div>
        {f.element?.snippet && (
          <pre className="mt-1 text-xs bg-black/40 border border-white/5 rounded px-2 py-1 overflow-x-auto text-white/60">
            {f.element.snippet}
          </pre>
        )}
        <div className="mt-1 text-xs text-white/40">
          {f.code}
          {f.patch ? ` · patch: ${f.patch.type}` : ""}
        </div>
      </div>
    </li>
  );
}

function MetaRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
      <div className="text-white/40">{label}</div>
      <div className="text-white/80 break-words">{value || <span className="text-white/30">—</span>}</div>
    </div>
  );
}

function groupBy(findings: Finding[]): Record<string, Finding[]> {
  const out: Record<string, Finding[]> = {};
  for (const f of findings) {
    (out[f.category] ??= []).push(f);
  }
  return out;
}

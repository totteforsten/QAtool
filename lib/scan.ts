import * as cheerio from "cheerio";
import { fetchPage, isProbablyHtml } from "./fetch-page";
import { detectPlatform } from "./wp-detect";
import { extractMeta, runSeoChecks } from "./seo-checks";
import { runResponsiveChecks } from "./responsive-checks";
import { deepScan, type DeepScanResult } from "./deep-scan";
import type { PageReport, Finding } from "./types";
import type { ViewportName } from "./browser";

export interface ScanOptions {
  url: string;
  deep?: boolean;
  viewports?: ViewportName[];
  checkLinks?: boolean;
}

export async function scanUrl(opts: string | ScanOptions): Promise<PageReport & { deep?: DeepScanResult }> {
  const options: ScanOptions = typeof opts === "string" ? { url: opts } : opts;
  const fetched = await fetchPage(options.url);
  const now = new Date().toISOString();

  if (!isProbablyHtml(fetched.headers)) {
    return {
      url: options.url,
      fetchedAt: now,
      status: fetched.status,
      durationMs: fetched.durationMs,
      platform: { wordpress: false, elementor: false, breakdance: false, seoPlugin: null },
      meta: { h1s: [] },
      findings: [
        {
          id: "fetch-1",
          category: "seo",
          severity: "warning",
          code: "not-html",
          message: `Response is not HTML (content-type: ${fetched.headers["content-type"] ?? "unknown"}).`
        }
      ],
      score: { seo: 0, responsive: 0 }
    };
  }

  const $ = cheerio.load(fetched.html);
  const meta = extractMeta($);
  const platform = detectPlatform($, fetched.html);
  const seoFindings = runSeoChecks($, meta, fetched.finalUrl);
  const respFindings = runResponsiveChecks($, meta, fetched.finalUrl);
  let findings: Finding[] = [...seoFindings, ...respFindings];

  let deep: DeepScanResult | undefined;
  let links: PageReport["links"];
  let viewports: PageReport["viewports"];
  if (options.deep) {
    deep = await deepScan({
      url: fetched.finalUrl,
      viewports: options.viewports ?? ["mobile", "desktop"],
      checkLinksMax: options.checkLinks === false ? 0 : 80
    });
    findings = [...findings, ...deep.findings];
    links = deep.links.map((l) => ({ url: l.url, status: l.status, ok: l.ok, label: l.label, error: l.error }));
    viewports = deep.viewports.map((v) => ({
      viewport: v.viewport,
      width: v.width,
      height: v.height,
      findingCount: v.findings.length
    }));
  }

  return {
    url: fetched.finalUrl,
    fetchedAt: now,
    status: fetched.status,
    durationMs: fetched.durationMs,
    platform,
    meta,
    findings,
    score: {
      seo: computeScore(findings.filter((f) => f.category === "seo" || f.category === "accessibility")),
      responsive: computeScore(findings.filter((f) => f.category === "responsive"))
    },
    links,
    viewports,
    deep
  };
}

function computeScore(findings: { severity: string }[]): number {
  let penalty = 0;
  for (const f of findings) {
    if (f.severity === "critical") penalty += 20;
    else if (f.severity === "warning") penalty += 8;
    else penalty += 2;
  }
  return Math.max(0, 100 - penalty);
}

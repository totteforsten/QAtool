import * as cheerio from "cheerio";
import { fetchPage, isProbablyHtml } from "./fetch-page";
import { detectPlatform } from "./wp-detect";
import { extractMeta, runSeoChecks } from "./seo-checks";
import { runResponsiveChecks } from "./responsive-checks";
import type { PageReport } from "./types";

export async function scanUrl(url: string): Promise<PageReport> {
  const fetched = await fetchPage(url);
  const now = new Date().toISOString();

  if (!isProbablyHtml(fetched.headers)) {
    return {
      url,
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
  const findings = [...seoFindings, ...respFindings];

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
    }
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

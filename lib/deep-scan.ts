import { getBrowser, VIEWPORTS, type ViewportName } from "./browser";
import { IN_PAGE_CHECKS_SCRIPT, type InPageFinding } from "./in-page-checks";
import { checkLinks, extractHrefs, type LinkCheckResult } from "./link-checker";
import type { Finding } from "./types";

export interface ViewportAudit {
  viewport: ViewportName;
  width: number;
  height: number;
  findings: InPageFinding[];
  screenshotBase64?: string;
}

export interface DeepScanResult {
  url: string;
  finalUrl: string;
  viewports: ViewportAudit[];
  links: LinkCheckResult[];
  findings: Finding[];
  durationMs: number;
}

export interface DeepScanOptions {
  url: string;
  viewports?: ViewportName[];
  checkLinksMax?: number;
  includeScreenshots?: boolean;
}

export async function deepScan(opts: DeepScanOptions): Promise<DeepScanResult> {
  const t0 = Date.now();
  const viewports = opts.viewports ?? ["mobile", "desktop"];
  const browser = await getBrowser();
  const page = await browser.newPage();
  let finalUrl = opts.url;
  let html = "";
  const audits: ViewportAudit[] = [];

  try {
    // Use the widest viewport first to let the page fully render.
    const ordered = [...viewports].sort((a, b) => VIEWPORTS[b].width - VIEWPORTS[a].width);
    for (const vp of ordered) {
      const v = VIEWPORTS[vp];
      await page.setViewport({
        width: v.width,
        height: v.height,
        isMobile: v.isMobile,
        deviceScaleFactor: 1,
        hasTouch: v.hasTouch
      });
      if (v.userAgent) await page.setUserAgent(v.userAgent);
      if (!audits.length) {
        await page.goto(opts.url, { waitUntil: "networkidle2", timeout: 25000 });
        finalUrl = page.url();
        html = await page.content();
      } else {
        // Re-render for smaller viewport (some sites respond to resize via MQs only)
        await page.goto(finalUrl, { waitUntil: "networkidle2", timeout: 25000 });
      }

      const inPage = (await page.evaluate(IN_PAGE_CHECKS_SCRIPT)) as InPageFinding[];
      let screenshotBase64: string | undefined;
      if (opts.includeScreenshots) {
        const buf = (await page.screenshot({ type: "png", fullPage: false })) as Buffer;
        screenshotBase64 = buf.toString("base64");
      }
      audits.push({
        viewport: vp,
        width: v.width,
        height: v.height,
        findings: inPage,
        screenshotBase64
      });
    }
  } finally {
    try { await page.close(); } catch {}
  }

  // Link crawl (from final HTML of largest viewport)
  const hrefs = extractHrefs(html, finalUrl);
  const linkResults = await checkLinks(hrefs, { max: opts.checkLinksMax ?? 80 });

  const findings: Finding[] = [];
  let n = 0;
  for (const v of audits) {
    for (const f of v.findings) {
      findings.push({
        id: `deep-${++n}`,
        category: f.category === "accessibility" ? "accessibility" : f.category === "responsive" ? "responsive" : "seo",
        severity: f.severity,
        code: `${v.viewport}/${f.code}`,
        message: `[${v.viewport} ${v.width}px] ${f.message}`,
        element: f.offenders ? { snippet: JSON.stringify(f.offenders.slice(0, 3)) } : undefined
      });
    }
  }
  const broken = linkResults.filter((r) => !r.ok);
  if (broken.length) {
    findings.push({
      id: `deep-${++n}`,
      category: "seo",
      severity: broken.some((b) => b.status >= 500 || b.status === 0) ? "critical" : "warning",
      code: "broken-links",
      message: `${broken.length} of ${linkResults.length} link(s) returned non-OK responses.`,
      element: {
        snippet: broken
          .slice(0, 8)
          .map((b) => `${b.status || "ERR"} ${b.url}${b.error ? " (" + b.error + ")" : ""}`)
          .join("\n")
      }
    });
  }

  return {
    url: opts.url,
    finalUrl,
    viewports: audits,
    links: linkResults,
    findings,
    durationMs: Date.now() - t0
  };
}

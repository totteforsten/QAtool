import type { CheerioAPI } from "cheerio";
import type { Finding, PageMeta } from "./types";

const FIXED_PX_RE = /\b(width|min-width)\s*:\s*(\d{3,})px/gi;

export function runResponsiveChecks($: CheerioAPI, meta: PageMeta, pageUrl: string): Finding[] {
  const findings: Finding[] = [];
  let seq = 0;
  const add = (f: Omit<Finding, "id">) =>
    findings.push({ id: `resp-${++seq}`, ...f });

  // Viewport
  if (!meta.viewport) {
    add({
      category: "responsive",
      severity: "critical",
      code: "missing-viewport",
      message: "Missing <meta name=\"viewport\"> — page will render at desktop width on mobile.",
      patch: { type: "add-viewport", target: pageUrl, suggestion: "width=device-width, initial-scale=1" }
    });
  } else {
    if (!/width\s*=\s*device-width/i.test(meta.viewport)) {
      add({
        category: "responsive",
        severity: "warning",
        code: "viewport-not-device-width",
        message: `Viewport does not include width=device-width ("${meta.viewport}").`,
        patch: { type: "add-viewport", target: pageUrl, suggestion: "width=device-width, initial-scale=1" }
      });
    }
    if (/user-scalable\s*=\s*(no|0)/i.test(meta.viewport) || /maximum-scale\s*=\s*1(\.0)?\b/i.test(meta.viewport)) {
      add({
        category: "accessibility",
        severity: "warning",
        code: "viewport-blocks-zoom",
        message: "Viewport disables user zoom — accessibility issue.",
        patch: { type: "add-viewport", target: pageUrl, suggestion: "width=device-width, initial-scale=1" }
      });
    }
  }

  // Inline fixed widths on large elements
  const fixedWidthOffenders: string[] = [];
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") ?? "";
    FIXED_PX_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = FIXED_PX_RE.exec(style))) {
      const px = Number(m[2]);
      if (px >= 600) {
        const tag = (el as any).tagName ?? "el";
        fixedWidthOffenders.push(`${tag}[${m[1]}:${px}px]`);
        break;
      }
    }
  });
  if (fixedWidthOffenders.length) {
    add({
      category: "responsive",
      severity: "warning",
      code: "fixed-px-width",
      message: `${fixedWidthOffenders.length} element(s) use fixed pixel widths ≥600px that may overflow small viewports.`,
      element: { snippet: fixedWidthOffenders.slice(0, 5).join(", ") }
    });
  }

  // Tables without responsive wrapper
  const tables = $("table").filter((_, el) => {
    const $el = $(el);
    return !$el.parents(".table-responsive, .wp-block-table, .elementor-widget-table, .bde-table").length;
  });
  if (tables.length) {
    add({
      category: "responsive",
      severity: "info",
      code: "unwrapped-table",
      message: `${tables.length} <table> without a responsive wrapper (may overflow on mobile).`
    });
  }

  // iframes without responsive wrapper and fixed width
  const iframesFixed = $("iframe[width]").filter((_, el) => {
    const w = Number($(el).attr("width"));
    return Number.isFinite(w) && w >= 600;
  });
  if (iframesFixed.length) {
    add({
      category: "responsive",
      severity: "info",
      code: "iframe-fixed-width",
      message: `${iframesFixed.length} iframe(s) have fixed width ≥600 — consider responsive embed.`
    });
  }

  // Horizontal overflow heuristic: inline style containing overflow-x: visible + fixed width
  // (skipped — needs rendering)

  // Tiny touch targets — skipped without rendering
  return findings;
}

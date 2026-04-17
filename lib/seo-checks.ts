import type { CheerioAPI } from "cheerio";
import type { Finding, PageMeta } from "./types";

function trunc(s: string, n = 120) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function snippet($: CheerioAPI, el: any): string {
  try {
    return trunc($.html(el) ?? "");
  } catch {
    return "";
  }
}

export function extractMeta($: CheerioAPI): PageMeta {
  const h1s: string[] = [];
  $("h1").each((_, el) => {
    h1s.push($(el).text().trim());
  });
  return {
    title: $("head > title").first().text().trim() || undefined,
    description: $('meta[name="description"]').attr("content")?.trim() || undefined,
    h1s,
    canonical: $('link[rel="canonical"]').attr("href")?.trim() || undefined,
    viewport: $('meta[name="viewport"]').attr("content")?.trim() || undefined,
    lang: $("html").attr("lang")?.trim() || undefined,
    robots: $('meta[name="robots"]').attr("content")?.trim() || undefined
  };
}

export function runSeoChecks($: CheerioAPI, meta: PageMeta, pageUrl: string): Finding[] {
  const findings: Finding[] = [];
  let seq = 0;
  const add = (f: Omit<Finding, "id">) =>
    findings.push({ id: `seo-${++seq}`, ...f });

  // Title
  if (!meta.title) {
    add({
      category: "seo",
      severity: "critical",
      code: "missing-title",
      message: "Page is missing a <title> element.",
      patch: { type: "meta-title", target: pageUrl, suggestion: "Add a descriptive 50–60 char title." }
    });
  } else if (meta.title.length < 30) {
    add({
      category: "seo",
      severity: "warning",
      code: "short-title",
      message: `Title is short (${meta.title.length} chars). Aim for 50–60.`,
      patch: { type: "meta-title", target: pageUrl, value: meta.title }
    });
  } else if (meta.title.length > 65) {
    add({
      category: "seo",
      severity: "warning",
      code: "long-title",
      message: `Title is ${meta.title.length} chars; may truncate in SERPs.`,
      patch: { type: "meta-title", target: pageUrl, value: meta.title }
    });
  }

  // Description
  if (!meta.description) {
    add({
      category: "seo",
      severity: "critical",
      code: "missing-description",
      message: "Missing meta description.",
      patch: { type: "meta-description", target: pageUrl, suggestion: "Write a 120–160 char summary." }
    });
  } else if (meta.description.length < 70) {
    add({
      category: "seo",
      severity: "warning",
      code: "short-description",
      message: `Meta description is only ${meta.description.length} chars.`,
      patch: { type: "meta-description", target: pageUrl, value: meta.description }
    });
  } else if (meta.description.length > 165) {
    add({
      category: "seo",
      severity: "warning",
      code: "long-description",
      message: `Meta description is ${meta.description.length} chars; likely to truncate.`,
      patch: { type: "meta-description", target: pageUrl, value: meta.description }
    });
  }

  // H1
  if (meta.h1s.length === 0) {
    add({ category: "seo", severity: "critical", code: "missing-h1", message: "No <h1> found on page." });
  } else if (meta.h1s.length > 1) {
    add({
      category: "seo",
      severity: "warning",
      code: "multiple-h1",
      message: `Found ${meta.h1s.length} <h1> elements; prefer a single H1.`
    });
  }

  // Heading order
  const levels: number[] = [];
  $("h1,h2,h3,h4,h5,h6").each((_, el) => {
    const tag = (el as any).tagName?.toLowerCase?.() ?? "";
    const m = /^h([1-6])$/.exec(tag);
    if (m) levels.push(Number(m[1]));
  });
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) {
      add({
        category: "seo",
        severity: "info",
        code: "heading-skip",
        message: `Heading level skips from H${levels[i - 1]} to H${levels[i]}.`
      });
      break;
    }
  }

  // Lang
  if (!meta.lang) {
    add({ category: "seo", severity: "warning", code: "missing-html-lang", message: "<html> is missing a lang attribute." });
  }

  // Canonical
  if (!meta.canonical) {
    add({ category: "seo", severity: "info", code: "missing-canonical", message: "No canonical link tag found." });
  }

  // Robots noindex
  if (meta.robots && /noindex/i.test(meta.robots)) {
    add({
      category: "seo",
      severity: "critical",
      code: "noindex",
      message: `Page is set to noindex ("${meta.robots}").`
    });
  }

  // Open Graph
  if (!$('meta[property="og:title"]').attr("content")) {
    add({ category: "seo", severity: "info", code: "missing-og-title", message: "Missing og:title." });
  }
  if (!$('meta[property="og:description"]').attr("content")) {
    add({ category: "seo", severity: "info", code: "missing-og-description", message: "Missing og:description." });
  }
  if (!$('meta[property="og:image"]').attr("content")) {
    add({ category: "seo", severity: "info", code: "missing-og-image", message: "Missing og:image." });
  }

  // Twitter
  if (!$('meta[name="twitter:card"]').attr("content")) {
    add({ category: "seo", severity: "info", code: "missing-twitter-card", message: "Missing twitter:card meta." });
  }

  // Favicon
  if ($('link[rel~="icon"]').length === 0) {
    add({ category: "seo", severity: "info", code: "missing-favicon", message: "No favicon <link> detected." });
  }

  // Images: alt text
  $("img").each((_, el) => {
    const $el = $(el);
    const alt = $el.attr("alt");
    const src = $el.attr("src") ?? $el.attr("data-src") ?? "";
    const decorative = $el.attr("role") === "presentation" || $el.attr("aria-hidden") === "true";
    if (alt === undefined && !decorative) {
      add({
        category: "accessibility",
        severity: "warning",
        code: "img-missing-alt",
        message: `Image missing alt attribute: ${trunc(src, 80)}`,
        element: { tag: "img", snippet: snippet($, el), attributes: { src, alt } },
        patch: { type: "alt-text", target: src }
      });
    } else if (alt !== undefined && alt.trim() === "" && !decorative) {
      add({
        category: "accessibility",
        severity: "info",
        code: "img-empty-alt",
        message: `Image has empty alt: ${trunc(src, 80)}`,
        element: { tag: "img", snippet: snippet($, el), attributes: { src, alt } },
        patch: { type: "alt-text", target: src }
      });
    }

    const w = $el.attr("width");
    const h = $el.attr("height");
    if ((!w || !h) && src) {
      add({
        category: "seo",
        severity: "info",
        code: "img-missing-dimensions",
        message: `Image missing width/height (CLS risk): ${trunc(src, 80)}`,
        element: { tag: "img", snippet: snippet($, el), attributes: { src, width: w, height: h } },
        patch: { type: "image-dimensions", target: src }
      });
    }
  });

  // Mixed content (only flag if page is https)
  if (pageUrl.startsWith("https://")) {
    const mixed = new Set<string>();
    $("img[src^='http://'], script[src^='http://'], link[href^='http://']").each((_, el) => {
      const src = $(el).attr("src") ?? $(el).attr("href");
      if (src) mixed.add(src);
    });
    if (mixed.size) {
      add({
        category: "seo",
        severity: "warning",
        code: "mixed-content",
        message: `${mixed.size} asset(s) loaded over http on an https page.`,
        element: { snippet: Array.from(mixed).slice(0, 3).join(", ") }
      });
    }
  }

  return findings;
}

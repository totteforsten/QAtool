import type { CheerioAPI } from "cheerio";
import type { PlatformInfo } from "./types";

export function detectPlatform($: CheerioAPI, html: string): PlatformInfo {
  const generator = $('meta[name="generator"]').attr("content") ?? "";
  const wordpress =
    /wordpress/i.test(generator) ||
    html.includes("/wp-content/") ||
    html.includes("/wp-includes/") ||
    $('link[href*="/wp-content/"]').length > 0;

  const elementor =
    $("[data-elementor-type], .elementor, .elementor-section, [data-elementor-id]").length > 0 ||
    /elementor-frontend(\.min)?\.js/.test(html) ||
    /name="generator"\s+content="Elementor/i.test(html);

  const breakdance =
    $(".breakdance, .bde-section, [class^='bde-'], [class*=' bde-']").length > 0 ||
    /breakdance\/plugin/i.test(html) ||
    /breakdance-frontend/i.test(html);

  let seoPlugin: PlatformInfo["seoPlugin"] = null;
  if (/yoast/i.test(html) || $('meta[name="generator"][content*="Yoast"]').length) seoPlugin = "yoast";
  else if (/rank[- ]?math/i.test(html)) seoPlugin = "rankmath";
  else if (/seopress/i.test(html)) seoPlugin = "seopress";
  else if (/aioseo|all[- ]in[- ]one[- ]seo/i.test(html)) seoPlugin = "aioseo";

  return { wordpress, elementor, breakdance, seoPlugin };
}

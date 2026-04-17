import { fetchPage } from "./fetch-page";

const URL_RE = /<loc>([^<]+)<\/loc>/gi;
const SITEMAP_INDEX_RE = /<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>/gi;

export async function discoverUrls(siteUrl: string, max = 50): Promise<{ urls: string[]; source: string; note?: string }> {
  const base = new URL(siteUrl);
  const candidates = [
    new URL("/sitemap.xml", base).toString(),
    new URL("/sitemap_index.xml", base).toString(),
    new URL("/wp-sitemap.xml", base).toString()
  ];

  for (const candidate of candidates) {
    try {
      const res = await fetchPage(candidate, 6000);
      if (res.status >= 200 && res.status < 300 && res.html.includes("<urlset") ) {
        const urls = extractLocs(res.html, URL_RE).slice(0, max);
        if (urls.length) return { urls, source: `sitemap:${candidate}` };
      } else if (res.status >= 200 && res.status < 300 && res.html.includes("<sitemapindex")) {
        const children = extractLocs(res.html, SITEMAP_INDEX_RE).slice(0, 5);
        const collected: string[] = [];
        for (const child of children) {
          if (collected.length >= max) break;
          try {
            const r2 = await fetchPage(child, 6000);
            if (r2.status >= 200 && r2.status < 300) {
              for (const u of extractLocs(r2.html, URL_RE)) {
                if (collected.length >= max) break;
                collected.push(u);
              }
            }
          } catch {}
        }
        if (collected.length) return { urls: collected, source: `sitemap-index:${candidate}` };
      }
    } catch {}
  }

  // Fallback: crawl homepage links (same origin only, one level)
  try {
    const res = await fetchPage(base.toString(), 6000);
    if (res.status >= 200 && res.status < 300) {
      const found = new Set<string>([base.toString()]);
      const re = /<a[^>]+href=["']([^"'#]+)["']/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(res.html)) && found.size < max) {
        try {
          const abs = new URL(m[1], base).toString();
          const a = new URL(abs);
          if (a.origin === base.origin && !/\.(png|jpg|jpeg|gif|svg|webp|pdf|zip|css|js)(\?|$)/i.test(a.pathname)) {
            found.add(abs.split("#")[0]);
          }
        } catch {}
      }
      return { urls: Array.from(found).slice(0, max), source: "homepage", note: "Sitemap not found; crawled homepage links." };
    }
  } catch {}

  return { urls: [base.toString()], source: "manual", note: "Could not fetch sitemap or homepage; scanning root only." };
}

function extractLocs(xml: string, re: RegExp): string[] {
  const out: string[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const loc = m[1].trim().replace(/&amp;/g, "&");
    if (/^https?:\/\//i.test(loc)) out.push(loc);
  }
  return out;
}

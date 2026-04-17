export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  html: string;
  headers: Record<string, string>;
  durationMs: number;
}

const DEFAULT_UA =
  "Mozilla/5.0 (compatible; QAtoolBot/0.1; +https://github.com/totteforsten/qatool)";

export async function fetchPage(url: string, timeoutMs = 8000): Promise<FetchedPage> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": process.env.QATOOL_USER_AGENT ?? DEFAULT_UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9"
      }
    });
    const html = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    return {
      url,
      finalUrl: res.url || url,
      status: res.status,
      html,
      headers,
      durationMs: Date.now() - started
    };
  } finally {
    clearTimeout(timer);
  }
}

export function isProbablyHtml(headers: Record<string, string>): boolean {
  const ct = headers["content-type"] ?? "";
  return ct.includes("text/html") || ct.includes("application/xhtml");
}

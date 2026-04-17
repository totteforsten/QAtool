export interface LinkCheckResult {
  url: string;
  status: number;
  ok: boolean;
  finalUrl?: string;
  redirected?: boolean;
  error?: string;
  label?: string;
}

export interface LinkCheckOptions {
  concurrency?: number;
  timeoutMs?: number;
  max?: number;
  userAgent?: string;
}

const DEFAULT_UA =
  "Mozilla/5.0 (compatible; QAtoolBot/0.1 LinkChecker; +https://github.com/totteforsten/qatool)";

export async function checkLinks(
  links: { href: string; label?: string }[],
  opts: LinkCheckOptions = {}
): Promise<LinkCheckResult[]> {
  const { concurrency = 8, timeoutMs = 6000, max = 100 } = opts;
  const ua = opts.userAgent ?? process.env.QATOOL_USER_AGENT ?? DEFAULT_UA;

  // Dedupe by URL, keep label of first occurrence.
  const seen = new Map<string, string | undefined>();
  for (const l of links) {
    if (!seen.has(l.href) && seen.size < max) seen.set(l.href, l.label);
  }
  const queue = Array.from(seen, ([href, label]) => ({ href, label }));
  const out: LinkCheckResult[] = [];

  let idx = 0;
  async function worker() {
    while (idx < queue.length) {
      const { href, label } = queue[idx++];
      out.push(await checkOne(href, label, ua, timeoutMs));
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, worker);
  await Promise.all(workers);
  return out;
}

async function checkOne(href: string, label: string | undefined, ua: string, timeoutMs: number): Promise<LinkCheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await fetch(href, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": ua }
    }).catch((e) => ({ __err: e as Error } as const));

    if ("__err" in res || res.status === 405 || res.status === 501 || res.status === 400) {
      res = await fetch(href, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": ua }
      });
    }
    clearTimeout(timer);
    return {
      url: href,
      status: (res as Response).status,
      ok: (res as Response).ok,
      finalUrl: (res as Response).url,
      redirected: (res as Response).redirected,
      label
    };
  } catch (e: any) {
    clearTimeout(timer);
    return { url: href, status: 0, ok: false, error: e?.name === "AbortError" ? "timeout" : e?.message ?? String(e), label };
  }
}

export function extractHrefs(html: string, baseUrl: string): { href: string; label?: string }[] {
  const out: { href: string; label?: string }[] = [];
  const re = /<a[^>]+href=(["'])([^"'#][^"'#]*)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  let base: URL;
  try { base = new URL(baseUrl); } catch { return out; }
  while ((m = re.exec(html))) {
    const raw = m[2].trim();
    if (!raw) continue;
    if (/^(javascript:|mailto:|tel:|data:)/i.test(raw)) continue;
    try {
      const abs = new URL(raw, base).toString();
      if (!/^https?:/i.test(abs)) continue;
      const label = m[3].replace(/<[^>]*>/g, "").trim().slice(0, 80);
      out.push({ href: abs, label });
    } catch {}
  }
  return out;
}

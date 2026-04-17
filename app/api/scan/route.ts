import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { scanUrl } from "@/lib/scan";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";
import type { ViewportName } from "@/lib/browser";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  url: z.string().url(),
  deep: z.boolean().optional(),
  viewports: z.array(z.enum(["mobile", "tablet", "desktop"])).optional(),
  checkLinks: z.boolean().optional()
});

function parseViewports(raw: string | null): ViewportName[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(",").map((p) => p.trim().toLowerCase());
  const allowed: ViewportName[] = ["mobile", "tablet", "desktop"];
  const out = parts.filter((p): p is ViewportName => (allowed as string[]).includes(p));
  return out.length ? out : undefined;
}

async function handle(url: string, deep: boolean, viewports?: ViewportName[], checkLinks = true) {
  try {
    const report = await scanUrl({ url, deep, viewports, checkLinks });
    return NextResponse.json({ ok: true, report });
  } catch (err: any) {
    const message = err?.name === "AbortError" ? "Timed out fetching page" : err?.message ?? String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorizedResponse();
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Body must include { url: string }" }, { status: 400 });
  }
  return handle(parsed.data.url, !!parsed.data.deep, parsed.data.viewports as ViewportName[] | undefined, parsed.data.checkLinks ?? true);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorizedResponse();
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ ok: false, error: "Missing ?url=" }, { status: 400 });
  const parsed = z.string().url().safeParse(url);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid URL" }, { status: 400 });
  const deep = req.nextUrl.searchParams.get("deep") === "1";
  const viewports = parseViewports(req.nextUrl.searchParams.get("viewports"));
  const checkLinks = req.nextUrl.searchParams.get("checkLinks") !== "0";
  return handle(parsed.data, deep, viewports, checkLinks);
}

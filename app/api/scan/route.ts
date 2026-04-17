import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { scanUrl } from "@/lib/scan";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({ url: z.string().url() });

async function handle(url: string) {
  try {
    const report = await scanUrl(url);
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
    return NextResponse.json({ ok: false, error: "Body must be { url: string }" }, { status: 400 });
  }
  return handle(parsed.data.url);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorizedResponse();
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ ok: false, error: "Missing ?url=" }, { status: 400 });
  }
  const parsed = z.string().url().safeParse(url);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid URL" }, { status: 400 });
  }
  return handle(parsed.data);
}

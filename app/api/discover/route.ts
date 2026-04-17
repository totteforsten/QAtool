import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { discoverUrls } from "@/lib/sitemap";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const Query = z.object({
  url: z.string().url(),
  max: z.coerce.number().int().positive().max(200).optional()
});

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorizedResponse();
  const parsed = Query.safeParse({
    url: req.nextUrl.searchParams.get("url"),
    max: req.nextUrl.searchParams.get("max") ?? undefined
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Missing or invalid ?url=" }, { status: 400 });
  }
  try {
    const result = await discoverUrls(parsed.data.url, parsed.data.max ?? 50);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 502 });
  }
}

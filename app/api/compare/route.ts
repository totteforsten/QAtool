import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";
import { takeSnapshot } from "@/lib/screenshot";
import { diffPngs } from "@/lib/diff";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  url: z.string().url(),
  beforePng: z.string().min(100),
  viewport: z.enum(["mobile", "tablet", "desktop"]).optional(),
  fullPage: z.boolean().optional(),
  cacheBust: z.boolean().optional()
});

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorizedResponse();
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  const { url, beforePng, viewport = "desktop", fullPage = false, cacheBust = true } = parsed.data;
  const target = cacheBust
    ? (() => {
        try {
          const u = new URL(url);
          u.searchParams.set("qatool_bust", String(Date.now()));
          return u.toString();
        } catch {
          return url;
        }
      })()
    : url;

  try {
    const after = await takeSnapshot({ url: target, viewport, fullPage });
    const beforeBuf = Buffer.from(beforePng, "base64");
    const diff = diffPngs(beforeBuf, after.png);

    return NextResponse.json({
      ok: true,
      diffPercent: diff.diffPercent,
      diffPixels: diff.diffPixels,
      width: diff.width,
      height: diff.height,
      viewport,
      beforePng: beforePng,
      afterPng: after.png.toString("base64"),
      diffPng: diff.diffPng.toString("base64")
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 502 });
  }
}

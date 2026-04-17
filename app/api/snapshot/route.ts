import { NextRequest } from "next/server";
import { z } from "zod";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";
import { takeSnapshot } from "@/lib/screenshot";
import type { ViewportName } from "@/lib/browser";

export const runtime = "nodejs";
export const maxDuration = 60;

const Query = z.object({
  url: z.string().url(),
  viewport: z.enum(["mobile", "tablet", "desktop"]).optional(),
  fullPage: z.enum(["0", "1"]).optional()
});

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorizedResponse();
  const parsed = Query.safeParse({
    url: req.nextUrl.searchParams.get("url"),
    viewport: req.nextUrl.searchParams.get("viewport") ?? undefined,
    fullPage: req.nextUrl.searchParams.get("fullPage") ?? undefined
  });
  if (!parsed.success) {
    return new Response(JSON.stringify({ ok: false, error: "Missing or invalid ?url=" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }
  try {
    const { png, width, height, viewport, finalUrl } = await takeSnapshot({
      url: parsed.data.url,
      viewport: (parsed.data.viewport as ViewportName) ?? "desktop",
      fullPage: parsed.data.fullPage === "1"
    });

    const accept = req.headers.get("accept") ?? "";
    if (accept.includes("application/json")) {
      return Response.json({
        ok: true,
        finalUrl,
        viewport,
        width,
        height,
        png: png.toString("base64")
      });
    }

    return new Response(png as any, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "no-store",
        "x-qatool-viewport": viewport,
        "x-qatool-final-url": finalUrl
      }
    });
  } catch (err: any) {
    const raw = err?.message ?? String(err);
    const short = raw.split("\n")[0] ?? raw;
    const browserUnavailable = /Could not launch a browser|libnss3|shared libraries/i.test(raw);
    return new Response(JSON.stringify({
      ok: false,
      error: short,
      code: browserUnavailable ? "browser-unavailable" : "snapshot-failed",
      hint: browserUnavailable
        ? "Set QATOOL_BROWSER_WS to a remote headless browser (e.g. browserless.io) or install system libs. See README troubleshooting."
        : undefined,
      detail: raw
    }), {
      status: browserUnavailable ? 503 : 502,
      headers: { "content-type": "application/json" }
    });
  }
}

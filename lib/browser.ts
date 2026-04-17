import type { Browser } from "puppeteer-core";

export type ViewportName = "mobile" | "tablet" | "desktop";

export const VIEWPORTS: Record<ViewportName, { width: number; height: number; isMobile: boolean; deviceScaleFactor: number; hasTouch: boolean; userAgent?: string }> = {
  mobile:  { width: 375, height: 812, isMobile: true,  deviceScaleFactor: 2, hasTouch: true,  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" },
  tablet:  { width: 768, height: 1024, isMobile: true, deviceScaleFactor: 2, hasTouch: true },
  desktop: { width: 1280, height: 800, isMobile: false, deviceScaleFactor: 1, hasTouch: false }
};

let cached: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (cached && cached.connected) return cached;

  const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.VERCEL;
  const puppeteer = (await import("puppeteer-core")).default;

  if (isLambda) {
    const mod: any = await import("@sparticuz/chromium");
    const chromium = mod.default ?? mod;
    cached = await puppeteer.launch({
      args: [...chromium.args, "--hide-scrollbars", "--disable-web-security"],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: true
    });
    return cached;
  }

  const executablePath = process.env.QATOOL_CHROME_EXECUTABLE;
  if (executablePath) {
    cached = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    return cached;
  }

  try {
    // Optional dev-only dependency; resolved dynamically so bundlers / TS
    // don't require it at build time.
    const dynImport = new Function("m", "return import(m)") as (m: string) => Promise<any>;
    const full: any = await dynImport("puppeteer");
    cached = (await full.default.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] })) as Browser;
    return cached!;
  } catch {
    throw new Error(
      "Puppeteer is not available locally. Set QATOOL_CHROME_EXECUTABLE to a Chrome/Chromium binary, or `npm i -D puppeteer`."
    );
  }
}

export async function closeBrowser() {
  if (cached) {
    try { await cached.close(); } catch {}
    cached = null;
  }
}

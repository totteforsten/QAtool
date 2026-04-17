import type { Browser } from "puppeteer-core";

export type ViewportName = "mobile" | "tablet" | "desktop";

export const VIEWPORTS: Record<ViewportName, { width: number; height: number; isMobile: boolean; deviceScaleFactor: number; hasTouch: boolean; userAgent?: string }> = {
  mobile:  { width: 375, height: 812, isMobile: true,  deviceScaleFactor: 2, hasTouch: true,  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" },
  tablet:  { width: 768, height: 1024, isMobile: true, deviceScaleFactor: 2, hasTouch: true },
  desktop: { width: 1280, height: 800, isMobile: false, deviceScaleFactor: 1, hasTouch: false }
};

type LaunchStrategy = "remote" | "lambda" | "local-chrome" | "local-puppeteer";

let cached: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (cached && cached.connected) return cached;

  const puppeteer = (await import("puppeteer-core")).default;
  const mode = (process.env.QATOOL_BROWSER_MODE || "auto").toLowerCase();
  // Authoritative Lambda signal. `VERCEL=1` alone is NOT — `vercel dev` sets it
  // locally, where the Lambda-packaged Chromium won't have its system libs.
  const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const hasRemote = !!process.env.QATOOL_BROWSER_WS;
  const hasLocalExe = !!process.env.QATOOL_CHROME_EXECUTABLE;

  const strategies: LaunchStrategy[] =
    mode === "auto"
      ? orderAuto(isLambda, hasRemote, hasLocalExe)
      : [mode as LaunchStrategy];

  const errors: Array<{ strategy: LaunchStrategy; error: string }> = [];
  for (const s of strategies) {
    try {
      cached = await launch(s, puppeteer);
      return cached!;
    } catch (e: any) {
      errors.push({ strategy: s, error: e?.message ?? String(e) });
    }
  }

  throw new Error(formatLaunchFailure(errors, { isLambda, hasRemote, hasLocalExe }));
}

function orderAuto(isLambda: boolean, hasRemote: boolean, hasLocalExe: boolean): LaunchStrategy[] {
  const out: LaunchStrategy[] = [];
  if (hasRemote) out.push("remote");
  if (isLambda) out.push("lambda");
  else {
    if (hasLocalExe) out.push("local-chrome");
    out.push("local-puppeteer");
    out.push("lambda"); // last-resort: some Linux boxes do have the libs
  }
  return out;
}

async function launch(strategy: LaunchStrategy, puppeteer: any): Promise<Browser> {
  switch (strategy) {
    case "remote": {
      const ws = process.env.QATOOL_BROWSER_WS;
      if (!ws) throw new Error("QATOOL_BROWSER_WS is not set");
      return (await puppeteer.connect({ browserWSEndpoint: ws })) as Browser;
    }
    case "lambda": {
      const mod: any = await import("@sparticuz/chromium");
      const chromium = mod.default ?? mod;
      return (await puppeteer.launch({
        args: [...chromium.args, "--hide-scrollbars", "--disable-web-security"],
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: true
      })) as Browser;
    }
    case "local-chrome": {
      const executablePath = process.env.QATOOL_CHROME_EXECUTABLE;
      if (!executablePath) throw new Error("QATOOL_CHROME_EXECUTABLE is not set");
      return (await puppeteer.launch({
        executablePath,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      })) as Browser;
    }
    case "local-puppeteer": {
      const dynImport = new Function("m", "return import(m)") as (m: string) => Promise<any>;
      const full: any = await dynImport("puppeteer");
      return (await full.default.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      })) as Browser;
    }
  }
}

function formatLaunchFailure(
  errors: Array<{ strategy: LaunchStrategy; error: string }>,
  env: { isLambda: boolean; hasRemote: boolean; hasLocalExe: boolean }
): string {
  const lines: string[] = ["Could not launch a browser. Tried:"];
  for (const e of errors) lines.push(`  - [${e.strategy}] ${e.error}`);
  lines.push("");
  if (errors.some((e) => /libnss3|libatk|shared libraries/i.test(e.error))) {
    lines.push("Shared-library error detected (libnss3 / libatk / similar).");
    lines.push("Your host is missing packages needed by the bundled Chromium binary.");
    lines.push("");
    lines.push("On Debian/Ubuntu:");
    lines.push("  sudo apt-get update && sudo apt-get install -y \\");
    lines.push("    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 \\");
    lines.push("    libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 \\");
    lines.push("    libcairo2 libasound2");
    lines.push("");
  }
  lines.push("Options:");
  if (!env.hasLocalExe) lines.push("  • QATOOL_CHROME_EXECUTABLE=/path/to/chrome  (local binary)");
  if (!env.hasRemote) lines.push("  • QATOOL_BROWSER_WS=wss://...  (remote headless service, e.g. browserless)");
  lines.push("  • npm i -D puppeteer  (download a full Chromium for dev)");
  lines.push("  • QATOOL_BROWSER_MODE=lambda|local-chrome|local-puppeteer|remote  (force a strategy)");
  return lines.join("\n");
}

export async function closeBrowser() {
  if (cached) {
    try { await cached.close(); } catch {}
    cached = null;
  }
}

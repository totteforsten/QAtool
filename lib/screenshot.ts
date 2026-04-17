import { getBrowser, VIEWPORTS, type ViewportName } from "./browser";

export interface SnapshotOptions {
  url: string;
  viewport?: ViewportName;
  fullPage?: boolean;
  timeoutMs?: number;
}

export interface Snapshot {
  url: string;
  finalUrl: string;
  viewport: ViewportName;
  width: number;
  height: number;
  png: Buffer;
}

export async function takeSnapshot({ url, viewport = "desktop", fullPage = false, timeoutMs = 25000 }: SnapshotOptions): Promise<Snapshot> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  const vp = VIEWPORTS[viewport];
  try {
    await page.setViewport({
      width: vp.width,
      height: vp.height,
      isMobile: vp.isMobile,
      deviceScaleFactor: vp.deviceScaleFactor,
      hasTouch: vp.hasTouch
    });
    if (vp.userAgent) await page.setUserAgent(vp.userAgent);
    await page.goto(url, { waitUntil: "networkidle2", timeout: timeoutMs });
    const png = (await page.screenshot({ fullPage, type: "png" })) as Buffer;
    const finalUrl = page.url();
    return { url, finalUrl, viewport, width: vp.width, height: vp.height, png };
  } finally {
    try { await page.close(); } catch {}
  }
}

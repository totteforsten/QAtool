import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

export interface DiffResult {
  width: number;
  height: number;
  diffPixels: number;
  totalPixels: number;
  diffPercent: number;
  diffPng: Buffer;
}

/**
 * Compare two PNG buffers. If sizes differ, both are cropped to the overlap
 * (top-left aligned) so pixelmatch can run.
 */
export function diffPngs(a: Buffer, b: Buffer, threshold = 0.1): DiffResult {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  const width = Math.min(pa.width, pb.width);
  const height = Math.min(pa.height, pb.height);
  const cropA = cropTopLeft(pa, width, height);
  const cropB = cropTopLeft(pb, width, height);
  const out = new PNG({ width, height });
  const diffPixels = pixelmatch(cropA.data, cropB.data, out.data, width, height, {
    threshold,
    alpha: 0.3,
    includeAA: true
  });
  const diffPng = PNG.sync.write(out);
  const totalPixels = width * height;
  return {
    width,
    height,
    diffPixels,
    totalPixels,
    diffPercent: totalPixels ? Math.round((diffPixels / totalPixels) * 10000) / 100 : 0,
    diffPng
  };
}

function cropTopLeft(src: PNG, w: number, h: number): PNG {
  if (src.width === w && src.height === h) return src;
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(src, out, 0, 0, w, h, 0, 0);
  return out;
}

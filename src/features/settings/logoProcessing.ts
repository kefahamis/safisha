/*
 * Browser-only. Turns whatever logo a company uploads into one that fits the
 * app: background removed, empty margins trimmed, sized to a crisp PNG, and
 * measured so the UI can decide how to seat it.
 */

import { hexToRgb, luminance, rgbToHex } from "@/lib/branding";

export interface ProcessedLogo {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  aspect: number;
  /** Mean relative luminance of visible pixels. */
  luma: number;
  /** Up to five distinctive colours, most prominent first. */
  palette: string[];
  /** The solid background that was found (and removed, if asked). */
  background: string | null;
  lowRes: boolean;
}

export const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";
const MAX_INPUT = 8 * 1024 * 1024;
/** Long edge of the stored logo: sharp at 2–3× the largest place it's shown. */
const OUTPUT_EDGE = 512;
/** Work at this size so flood fill and trim stay quick on huge files. */
const WORK_EDGE = 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file couldn't be read as an image."));
    };
    img.src = url;
  });
}

const dist = (d: Uint8ClampedArray, i: number, [r, g, b]: [number, number, number]) =>
  Math.max(Math.abs(d[i] - r), Math.abs(d[i + 1] - g), Math.abs(d[i + 2] - b));

/** The colour of a solid, opaque border, or null if the edge is transparent or busy. */
function detectBackground(data: Uint8ClampedArray, w: number, h: number): [number, number, number] | null {
  const samples: number[] = [];
  const step = Math.max(1, Math.floor(Math.min(w, h) / 64));
  for (let x = 0; x < w; x += step) samples.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y += step) samples.push(y * w, y * w + w - 1);

  let transparent = 0;
  const opaque: number[] = [];
  for (const p of samples) {
    if (data[p * 4 + 3] < 200) transparent++;
    else opaque.push(p * 4);
  }
  if (transparent > samples.length * 0.5) return null;

  // Most common border colour, then check the border is mostly that colour.
  const buckets = new Map<string, number>();
  for (const i of opaque) {
    const key = `${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const [top] = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
  if (!top) return null;
  const [r, g, b] = top[0].split(",").map((v) => (Number(v) << 3) + 4) as [number, number, number];
  const matching = opaque.filter((i) => dist(data, i, [r, g, b]) < 24).length;
  return matching > samples.length * 0.7 ? [r, g, b] : null;
}

/** Clears the background by flooding in from the edges; enclosed shapes survive. */
function removeBackground(img: ImageData, bg: [number, number, number]) {
  const { data, width: w, height: h } = img;
  const HARD = 26;
  const SOFT = 64;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (p: number) => {
    if (!seen[p]) {
      seen[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) push(x), push((h - 1) * w + x);
  for (let y = 0; y < h; y++) push(y * w), push(y * w + w - 1);

  while (stack.length) {
    const p = stack.pop()!;
    const i = p * 4;
    const d = dist(data, i, bg);
    if (d > SOFT) continue;
    // Anti-aliased edge pixels fade out rather than leaving a halo.
    data[i + 3] = d <= HARD ? 0 : Math.round((data[i + 3] * (d - HARD)) / (SOFT - HARD));
    if (d > HARD) continue;
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < w * (h - 1)) push(p + w);
  }
}

function bounds(img: ImageData) {
  const { data, width: w, height: h } = img;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Mean luminance and the stand-out colours of the visible pixels. */
function analyse(img: ImageData) {
  const { data } = img;
  let weight = 0;
  let luma = 0;
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 16) {
    const a = data[i + 3] / 255;
    if (a < 0.5) continue;
    const rgb: [number, number, number] = [data[i], data[i + 1], data[i + 2]];
    luma += luminance(rgb) * a;
    weight += a;
    const max = Math.max(...rgb);
    const min = Math.min(...rgb);
    // Near-greys make poor brand colours; skip them for the palette.
    if (max - min < 28 || max < 40) continue;
    const key = rgb.map((v) => v >> 5).join(",");
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++;
    bucket.r += rgb[0];
    bucket.g += rgb[1];
    bucket.b += rgb[2];
    buckets.set(key, bucket);
  }
  const palette: string[] = [];
  for (const b of [...buckets.values()].sort((x, y) => y.n - x.n)) {
    const hex = rgbToHex([b.r / b.n, b.g / b.n, b.b / b.n]);
    const [r, g, bb] = hexToRgb(hex);
    const distinct = palette.every((p) => {
      const [pr, pg, pb] = hexToRgb(p);
      return Math.abs(pr - r) + Math.abs(pg - g) + Math.abs(pb - bb) > 90;
    });
    if (distinct) palette.push(hex);
    if (palette.length === 5) break;
  }
  return { luma: weight ? luma / weight : 0.5, palette };
}

export async function processLogo(file: File, opts: { removeBackground: boolean }): Promise<ProcessedLogo> {
  if (!ACCEPT.split(",").includes(file.type)) throw new Error("Use a PNG, JPEG, WebP or SVG file.");
  if (file.size > MAX_INPUT) throw new Error("Logos must be under 8 MB.");

  const img = await loadImage(file);
  try {
    // SVGs without intrinsic size report 0; give them a sensible canvas.
    const nw = img.naturalWidth || 512;
    const nh = img.naturalHeight || 512;
    // Rasters only ever shrink; vectors are drawn at full working size, so they stay sharp.
    const k = WORK_EDGE / Math.max(nw, nh);
    const scale = file.type === "image/svg+xml" ? k : Math.min(1, k);
    const w = Math.max(1, Math.round(nw * scale));
    const h = Math.max(1, Math.round(nh * scale));

    const work = document.createElement("canvas");
    work.width = w;
    work.height = h;
    const ctx = work.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    const pixels = ctx.getImageData(0, 0, w, h);

    const bg = detectBackground(pixels.data, w, h);
    if (bg && opts.removeBackground) removeBackground(pixels, bg);

    const box = bounds(pixels);
    if (!box) throw new Error("The logo looks empty after removing the background. Try turning that off.");
    ctx.putImageData(pixels, 0, 0);

    const fit = Math.min(1, OUTPUT_EDGE / Math.max(box.w, box.h));
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(box.w * fit));
    out.height = Math.max(1, Math.round(box.h * fit));
    const octx = out.getContext("2d", { willReadFrequently: true })!;
    octx.imageSmoothingQuality = "high";
    octx.drawImage(work, box.x, box.y, box.w, box.h, 0, 0, out.width, out.height);

    const { luma, palette } = analyse(octx.getImageData(0, 0, out.width, out.height));
    const blob = await new Promise<Blob>((resolve, reject) =>
      out.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode the logo."))), "image/png"),
    );
    if (blob.size > 1024 * 1024) throw new Error("The processed logo is over 1 MB; try a simpler file.");

    return {
      blob,
      url: URL.createObjectURL(blob),
      width: out.width,
      height: out.height,
      aspect: out.width / out.height,
      luma,
      palette,
      background: bg ? rgbToHex(bg) : null,
      // Shown at up to ~46px tall on 2× screens, a source under ~96px will blur.
      lowRes: Math.max(box.w, box.h) < 96 && file.type !== "image/svg+xml",
    };
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

import sharp from "sharp";

/**
 * Rasterize an SVG data-URI (from the icon engine) into a raw RGBA pixel buffer
 * sized for a Stream Deck key. The device driver's fillKeyBuffer takes these
 * bytes directly. Results are cached by (size + uri) since most tiles are
 * identical frame-to-frame — only running spinners and pulses actually change.
 */
const cache = new Map<string, Buffer>();
const MAX_CACHE = 512;

export async function rasterize(dataUri: string, size: number): Promise<Buffer> {
  const key = `${size}:${dataUri}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const comma = dataUri.indexOf(",");
  const svg = Buffer.from(dataUri.slice(comma + 1), "base64");
  const buf = await sharp(svg, { density: 144 })
    .resize(size, size, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer();

  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, buf);
  return buf;
}

export const RASTER_FORMAT = "rgba" as const;

import "server-only";

import sharp from "sharp";
import { AppError } from "@/lib/server/errors";
import type { StudioBounds, StudioLayer } from "@/lib/studio";

const IMAGE_OPTIONS = { failOn: "error" as const, limitInputPixels: 10_000_000 };

export async function readStudioRgba(input: Buffer) {
  return sharp(input, IMAGE_OPTIONS).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

export async function encodeStudioRgba(data: Buffer, width: number, height: number) {
  return sharp(data, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

export async function encodeStudioMask(data: Buffer, width: number, height: number) {
  return sharp(data, { raw: { width, height, channels: 1 } }).png({ compressionLevel: 9 }).toBuffer();
}

export async function readStudioMask(input: Buffer, width: number, height: number) {
  const result = await sharp(input, IMAGE_OPTIONS).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
  if (result.info.width !== width || result.info.height !== height) {
    throw new AppError("STUDIO_FAILED", "The layer selection dimensions do not match the source artwork.", 409, true);
  }
  return Buffer.from(result.data.map((value) => value >= 128 ? 255 : 0));
}

export function rectangularStudioMask(bounds: StudioBounds, width: number, height: number) {
  const mask = Buffer.alloc(width * height);
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    mask.fill(255, y * width + bounds.x, y * width + bounds.x + bounds.width);
  }
  return mask;
}

export async function normalizeStudioSelection(input: Buffer, region: StudioBounds, width: number, height: number) {
  const { data, info } = await readStudioRgba(input);
  if (info.width !== region.width || info.height !== region.height) {
    throw new AppError("STUDIO_FAILED", "Studio returned an unaligned selection mask.", 502, true);
  }
  let colored = 0;
  let selected = 0;
  let touchesCropEdge = false;
  const mask = Buffer.alloc(width * height);
  for (let y = 0; y < region.height; y += 1) {
    for (let x = 0; x < region.width; x += 1) {
      const index = (y * region.width + x) * 4;
      const r = data[index], g = data[index + 1], b = data[index + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) > 40) colored += 1;
      if (data[index + 3] < 128 || (r + g + b) / 3 < 128) continue;
      selected += 1;
      mask[(region.y + y) * width + region.x + x] = 255;
      if ((x === 0 && region.x > 0) || (y === 0 && region.y > 0)
        || (x === region.width - 1 && region.x + region.width < width)
        || (y === region.height - 1 && region.y + region.height < height)) touchesCropEdge = true;
    }
  }
  if (colored > region.width * region.height * 0.03 || selected < 3 || selected > region.width * region.height * 0.96) {
    throw new AppError("STUDIO_FAILED", "Studio could not produce a reliable element selection. Retry preparation.", 502, true);
  }
  // Include source antialiasing around the selected outline. Binary ownership
  // preserves the original blended edge pixels without recompositing them twice.
  const expanded = Buffer.from(mask);
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      if (!mask[y * width + x]) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) expanded[(y + dy) * width + x + dx] = 255;
        }
      }
    }
  }
  return { mask: expanded, touchesCropEdge };
}

export async function sourcePixelsForMask(source: Buffer, mask: Buffer, decoded?: Awaited<ReturnType<typeof readStudioRgba>>) {
  const { data, info } = decoded ?? await readStudioRgba(source);
  const width = info.width, height = info.height;
  if (mask.length !== width * height) throw new AppError("STUDIO_FAILED", "The selection size is invalid.", 409);
  let left = width, top = height, right = -1, bottom = -1;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const x = index % width, y = Math.floor(index / width);
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new AppError("STUDIO_FAILED", "An element has no visible selected pixels.", 502, true);
  const bounds = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  const pixels = Buffer.alloc(bounds.width * bounds.height * 4);
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      data.copy(pixels, ((y - top) * bounds.width + x - left) * 4, index * 4, index * 4 + 4);
    }
  }
  return { buffer: await encodeStudioRgba(pixels, bounds.width, bounds.height), bounds };
}

export async function studioSelectionPreview(source: Buffer, mask: Buffer) {
  const { data, info } = await readStudioRgba(source);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const offset = index * 4;
    data[offset] = Math.round(data[offset] * 0.45 + 255 * 0.55);
    data[offset + 1] = Math.round(data[offset + 1] * 0.45);
    data[offset + 2] = Math.round(data[offset + 2] * 0.45 + 210 * 0.55);
  }
  return encodeStudioRgba(data, info.width, info.height);
}

export function partitionStudioMasks(layers: StudioLayer[], masks: Buffer[]) {
  if (!masks.length || masks.length !== layers.length || masks.some((mask) => mask.length !== masks[0].length)) {
    throw new AppError("STUDIO_FAILED", "Studio needs all layer selections before assembly.", 409, true);
  }
  const union = Buffer.alloc(masks[0].length);
  // Consume the temporary mask buffers rather than doubling memory for large
  // canvases. Duplicate Buffer references are copied before ownership changes.
  const owned = masks.map((mask, index) => masks.indexOf(mask) < index ? Buffer.from(mask) : mask);
  const order = layers.map((_, index) => index).sort((a, b) => layers[b].zIndex - layers[a].zIndex);
  for (const index of order) {
    let claimed = 0, selected = 0;
    for (let pixel = 0; pixel < union.length; pixel += 1) {
      if (!owned[index][pixel]) continue;
      selected += 1;
      if (union[pixel]) { owned[index][pixel] = 0; continue; }
      union[pixel] = 255; owned[index][pixel] = 255; claimed += 1;
    }
    if (claimed < 3 || claimed < selected * 0.4) {
      throw new AppError("STUDIO_SELECTION_INVALID", `The selection for ${layers[index].name} duplicates another element. Retry preparation to repair that selection.`, 502, true,
        { stage: "extracting", recovery: "retry-preparation", layerIds: [layers[index].id] });
    }
  }
  return { union, owned };
}

export async function createStudioInpaintMask(union: Buffer, width: number, height: number) {
  const pixels = Buffer.alloc(width * height * 4, 255);
  for (let index = 0; index < union.length; index += 1) pixels[index * 4 + 3] = union[index] ? 0 : 255;
  return encodeStudioRgba(pixels, width, height);
}

export async function restoreStudioBackground(source: Buffer, generated: Buffer, union: Buffer) {
  const [original, edited] = await Promise.all([readStudioRgba(source), readStudioRgba(generated)]);
  if (original.info.width !== edited.info.width || original.info.height !== edited.info.height) {
    throw new AppError("STUDIO_FAILED", "The background plate is not aligned to the source.", 502, true);
  }
  for (let index = 0; index < union.length; index += 1) {
    if (!union[index]) continue;
    edited.data.copy(original.data, index * 4, index * 4, index * 4 + 3);
    original.data[index * 4 + 3] = 255;
  }
  return encodeStudioRgba(original.data, original.info.width, original.info.height);
}

export async function verifyStudioReconstruction(source: Buffer, background: Buffer, layers: Array<{ buffer: Buffer; bounds: StudioBounds }>) {
  const original = await readStudioRgba(source);
  let rendered = await readStudioRgba(background);
  // Composite one cutout at a time to avoid decoding 32 full-size sparse PNGs
  // at once on a serverless instance.
  for (const layer of layers) {
    rendered = await sharp(rendered.data, { raw: { width: rendered.info.width, height: rendered.info.height, channels: 4 } })
      .composite([{ input: layer.buffer, left: layer.bounds.x, top: layer.bounds.y }])
      .raw().toBuffer({ resolveWithObject: true });
  }
  if (original.info.width !== rendered.info.width || original.info.height !== rendered.info.height || original.data.length !== rendered.data.length) {
    throw new AppError("STUDIO_FAILED", "Studio could not reconstruct the source dimensions.", 502, true);
  }
  let maxError = 0;
  for (let index = 0; index < original.data.length; index += 1) maxError = Math.max(maxError, Math.abs(original.data[index] - rendered.data[index]));
  if (maxError > 0) throw new AppError("STUDIO_FAILED", "Studio reconstruction changed source pixels. Retry preparation.", 502, true);
  return maxError;
}

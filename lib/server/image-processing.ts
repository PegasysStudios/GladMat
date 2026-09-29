import "server-only";

import sharp from "sharp";
import { AppError } from "@/lib/server/errors";

const MAX_SOURCE_PIXELS = 100_000_000;
const MAX_GENERATED_PIXELS = 10_000_000;

export async function normalizeSourceImage(input: Buffer) {
  if (input.byteLength > 20 * 1024 * 1024) {
    throw new AppError("FILE_TOO_LARGE", "Artwork must be 20 MB or smaller.", 413);
  }

  try {
    const pipeline = sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_SOURCE_PIXELS,
      animated: false,
    });
    const metadata = await pipeline.metadata();
    if (!metadata.width || !metadata.height || !["png", "jpeg", "webp"].includes(metadata.format ?? "")) {
      throw new Error("unsupported source image");
    }
    if ((metadata.pages ?? 1) > 1) throw new Error("animated images are unsupported");

    const normalized = await pipeline
      .rotate()
      .toColourspace("srgb")
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: normalized.data,
      width: normalized.info.width,
      height: normalized.info.height,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "INVALID_FILE",
      "This file could not be read as a valid PNG, JPG, or WEBP image.",
      400,
    );
  }
}

export async function finalizeGeneratedImage(input: Buffer, width: number, height: number) {
  try {
    const result = await sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_GENERATED_PIXELS,
    })
      .rotate()
      .toColourspace("srgb")
      .resize(width, height, {
        fit: "cover",
        position: "centre",
        kernel: sharp.kernel.lanczos3,
      })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer({ resolveWithObject: true });

    if (result.info.width !== width || result.info.height !== height || result.info.format !== "png") {
      throw new Error("unexpected final dimensions");
    }
    return result.data;
  } catch {
    throw new AppError(
      "PROCESSING_FAILED",
      "The generated image could not be prepared at the exact requested dimensions.",
      502,
      true,
    );
  }
}

export async function assertPngDimensions(input: Buffer, width: number, height: number) {
  const metadata = await sharp(input, { failOn: "error", limitInputPixels: MAX_GENERATED_PIXELS }).metadata();
  return metadata.format === "png" && metadata.width === width && metadata.height === height;
}

export async function getImageDimensions(input: Buffer, source = false) {
  const metadata = await sharp(input, {
    failOn: "error",
    limitInputPixels: source ? MAX_SOURCE_PIXELS : MAX_GENERATED_PIXELS,
  }).metadata();
  if (!metadata.width || !metadata.height) {
    throw new AppError("PROCESSING_FAILED", "The image dimensions could not be read.", 502, true);
  }
  return { width: metadata.width, height: metadata.height };
}

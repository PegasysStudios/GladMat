import "server-only";

import sharp from "sharp";
import { z } from "zod";
import {
  BLEED_EDGE_FRACTION,
  DEFAULT_FINE_TUNE_TRANSFORM,
  fineTuneImageRect,
  initialGenerationTransform,
  type FineTuneTransform,
} from "@/lib/fine-tune";
import { FineTuneTransformSchema } from "@/lib/schemas";
import { AppError } from "@/lib/server/errors";
import { assetExists, downloadBuffer } from "@/lib/server/storage";
import { generatedAssetPath, generatedFineTunePath, generatedFineTunedOutputPath } from "@/lib/storage-paths";

const StoredFineTuneSchema = z.object({
  transform: FineTuneTransformSchema,
  versionId: z.string().uuid(),
}).strict();

export async function expandGeneratedBleed(input: Buffer) {
  try {
    const image = sharp(input, { failOn: "error", limitInputPixels: 10_000_000 });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) throw new Error("Missing image dimensions");
    const horizontal = Math.round(metadata.width * BLEED_EDGE_FRACTION);
    const vertical = Math.round(metadata.height * BLEED_EDGE_FRACTION);
    return await image
      .rotate()
      .toColourspace("srgb")
      .extend({ left: horizontal, right: horizontal, top: vertical, bottom: vertical, extendWith: "mirror" })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
  } catch {
    throw new AppError("PROCESSING_FAILED", "The generated background could not be extended for fine-tuning.", 502, true);
  }
}

export async function renderFineTunedImage(
  input: Buffer,
  width: number,
  height: number,
  transform: FineTuneTransform = DEFAULT_FINE_TUNE_TRANSFORM,
) {
  try {
    const source = sharp(input, { failOn: "error", limitInputPixels: 10_000_000 });
    const metadata = await source.metadata();
    if (!metadata.width || !metadata.height) throw new Error("Missing image dimensions");
    const rect = fineTuneImageRect(metadata.width, metadata.height, width, height, transform);
    const left = Math.max(0, Math.min(rect.width - width, Math.round(-rect.left)));
    const top = Math.max(0, Math.min(rect.height - height, Math.round(-rect.top)));
    return await source
      .rotate()
      .toColourspace("srgb")
      .resize(rect.width, rect.height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .extract({ left, top, width, height })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
  } catch {
    throw new AppError("PROCESSING_FAILED", "The adjusted image could not be prepared at the requested size.", 502, true);
  }
}

export async function loadFineTuneState(sessionId: string, width: number, height: number, requestId: string) {
  const path = generatedFineTunePath(sessionId, width, height, requestId);
  if (!(await assetExists(path))) {
    return { transform: initialGenerationTransform(width, height), versionId: null };
  }
  const value = await downloadBuffer(path, "ASSET_NOT_FOUND");
  try {
    const parsed = StoredFineTuneSchema.safeParse(JSON.parse(value.toString("utf8")));
    if (parsed.success) return parsed.data;
  } catch {
    // Report malformed stored state with the same recoverable error.
  }
  throw new AppError("PROCESSING_FAILED", "The saved adjustment is invalid.", 409);
}

export async function resolveGeneratedAssetPath(sessionId: string, width: number, height: number, requestId: string) {
  const state = await loadFineTuneState(sessionId, width, height, requestId);
  return state.versionId
    ? generatedFineTunedOutputPath(sessionId, width, height, requestId, state.versionId)
    : generatedAssetPath(sessionId, width, height, requestId);
}

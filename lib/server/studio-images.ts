import "server-only";

import sharp from "sharp";
import { toFile } from "openai";
import { chooseGenerationCanvas } from "@/lib/dimensions";
import { imageModelSupportsInputFidelity, MAX_IMAGE_PROMPT_CHARS } from "@/lib/image-models";
import { getOpenAIConfig } from "@/lib/server/config";
import { AppError } from "@/lib/server/errors";
import { editAiImage } from "@/lib/server/jobs/ai";

export type StudioImageSource = { buffer: Buffer; filename: string };

export function studioModelFrame(width: number, height: number) {
  const paddedWidth = Math.max(width, Math.ceil(height / 3));
  const paddedHeight = Math.max(height, Math.ceil(width / 3));
  return {
    width: paddedWidth, height: paddedHeight,
    left: Math.floor((paddedWidth - width) / 2),
    top: Math.floor((paddedHeight - height) / 2),
  };
}

// Studio cannot use generation's center-cover crop: it changes registration on
// banners. Letterbox the input/mask together, then undo that exact frame.
export async function frameStudioImage(input: Buffer, width: number, height: number, mask = false) {
  const frame = studioModelFrame(width, height);
  return sharp(input, { failOn: "error", limitInputPixels: 10_000_000 }).ensureAlpha().extend({
    left: frame.left, right: frame.width - width - frame.left,
    top: frame.top, bottom: frame.height - height - frame.top,
    background: mask ? { r: 255, g: 255, b: 255, alpha: 1 } : { r: 128, g: 128, b: 128, alpha: 1 },
  }).png().toBuffer();
}

export async function unframeStudioImage(input: Buffer, width: number, height: number) {
  const frame = studioModelFrame(width, height);
  return sharp(input, { failOn: "error", limitInputPixels: 10_000_000 })
    .toColourspace("srgb")
    .resize(frame.width, frame.height, { fit: "fill" })
    .extract({ left: frame.left, top: frame.top, width, height })
    .png({ compressionLevel: 9 }).toBuffer();
}

export async function editStudioImage(
  sources: StudioImageSource[], prompt: string, background: "opaque" | "transparent",
  width: number, height: number, sessionId: string, signal?: AbortSignal,
  mask?: Buffer,
) {
  if (prompt.length > MAX_IMAGE_PROMPT_CHARS || !sources.length) {
    throw new AppError("STUDIO_FAILED", "The Studio image request is invalid.", 400);
  }
  const config = getOpenAIConfig();
  const frame = studioModelFrame(width, height);
  const canvas = chooseGenerationCanvas(frame.width, frame.height);
  const files = await Promise.all(sources.map(async (source) => toFile(
    await frameStudioImage(source.buffer, width, height), source.filename, { type: "image/png" },
  )));
  const response = await editAiImage({
    model: config.imageModel, image: files.length > 1 ? files : files[0],
    prompt, size: canvas.size, quality: config.imageQuality,
    output_format: "png", background, n: 1, user: sessionId,
    ...(mask ? { mask: await toFile(await frameStudioImage(mask, width, height, true), "edit-mask.png", { type: "image/png" }) } : {}),
    ...(imageModelSupportsInputFidelity(config.imageModel) ? { input_fidelity: "high" as const } : {}),
  }, { signal });
  const encoded = response.data?.[0]?.b64_json;
  if (!encoded) throw new AppError("STUDIO_FAILED", "The AI service did not return a Studio image.", 502, true);
  return unframeStudioImage(Buffer.from(encoded, "base64"), width, height);
}

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { finalizeGeneratedImage, normalizeSourceImage } from "@/lib/server/image-processing";
import { expandGeneratedBleed, renderFineTunedImage } from "@/lib/server/fine-tune";
import { fineTuneImageRect, initialGenerationTransform } from "@/lib/fine-tune";
import { AD_SIZE_PRESETS } from "@/lib/presets";

describe("Sharp image processing", () => {
  it.each([
    ...AD_SIZE_PRESETS.map<[number, number]>(({ width, height }) => [width, height]),
    [777, 333], [64, 4000], [4000, 50],
  ])("renders the initial %sx%s output exactly like a manual 100%% adjustment", async (width, height) => {
    const input = await sharp({
      create: { width: 320, height: 240, channels: 3, background: "#facc15" },
    }).composite([{
      input: await sharp({
        create: { width: 160, height: 120, channels: 3, background: "#1d4ed8" },
      }).png().toBuffer(),
      left: 80,
      top: 60,
    }]).png().toBuffer();
    const bleed = await expandGeneratedBleed(input);
    const expected = await renderFineTunedImage(bleed, width, height, { scale: 1, offsetX: 0, offsetY: 0 });
    const generated = await renderFineTunedImage(bleed, width, height, initialGenerationTransform(width, height));
    const reset = await renderFineTunedImage(bleed, width, height);
    expect(generated.equals(expected)).toBe(true);
    expect(reset.equals(expected)).toBe(true);
    expect(await sharp(generated).metadata()).toMatchObject({ format: "png", width, height });
  });

  it.each([[970, 90], [120, 600], [1080, 1080]])("keeps the %sx%s canvas covered at 80% scale", (width, height) => {
    const rect = fineTuneImageRect(375, 125, width, height, { scale: 0.8, offsetX: 0, offsetY: 0 });
    expect(rect.width).toBeGreaterThanOrEqual(width);
    expect(rect.height).toBeGreaterThanOrEqual(height);
    expect(rect.left).toBeLessThanOrEqual(0);
    expect(rect.top).toBeLessThanOrEqual(0);
    expect(rect.left + rect.width).toBeGreaterThanOrEqual(width);
    expect(rect.top + rect.height).toBeGreaterThanOrEqual(height);
  });
  it("renders saved fine-tune scale and position at the exact target size", async () => {
    const input = await sharp({
      create: { width: 200, height: 200, channels: 3, background: "#ff0000" },
    }).composite([{
      input: await sharp({
        create: { width: 100, height: 200, channels: 3, background: "#0000ff" },
      }).png().toBuffer(),
      left: 100,
      top: 0,
    }]).png().toBuffer();
    const bleed = await expandGeneratedBleed(input);
    const centered = await renderFineTunedImage(bleed, 100, 100, { scale: 1.4, offsetX: 0, offsetY: 0 });
    const shifted = await renderFineTunedImage(bleed, 100, 100, { scale: 1.4, offsetX: 0.15, offsetY: 0 });
    const centeredPixel = await sharp(centered).extract({ left: 55, top: 50, width: 1, height: 1 }).raw().toBuffer();
    const shiftedPixel = await sharp(shifted).extract({ left: 55, top: 50, width: 1, height: 1 }).raw().toBuffer();
    expect((await sharp(shifted).metadata()).width).toBe(100);
    expect((await sharp(shifted).metadata()).height).toBe(100);
    expect(centeredPixel[0]).toBeLessThan(shiftedPixel[0]);
  });

  it("keeps background over the full canvas while zooming below 100%", async () => {
    const input = await sharp({
      create: { width: 200, height: 200, channels: 3, background: "#facc15" },
    }).composite([{
      input: await sharp({ create: { width: 100, height: 100, channels: 3, background: "#1d4ed8" } }).png().toBuffer(),
      left: 50,
      top: 50,
    }]).png().toBuffer();
    const bleed = await expandGeneratedBleed(input);
    expect((await sharp(bleed).metadata()).width).toBe(250);
    expect((await sharp(bleed).metadata()).height).toBe(250);
    const smaller = await renderFineTunedImage(bleed, 100, 100, { scale: 0.8, offsetX: 0, offsetY: 0 });
    const initial = await renderFineTunedImage(bleed, 100, 100);
    const bluePixels = async (buffer: Buffer) => {
      const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
      let count = 0;
      for (let index = 0; index < data.length; index += info.channels) {
        if (data[index] < 60 && data[index + 1] < 120 && data[index + 2] > 150) count += 1;
      }
      return count;
    };
    expect(await bluePixels(smaller)).toBeLessThan(await bluePixels(initial));
    const corner = await sharp(smaller).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    expect([...corner.subarray(0, 3)]).toEqual([250, 204, 21]);
  });
  it.each([
    [970, 90],
    [728, 90],
    [320, 50],
    [120, 600],
    [300, 250],
  ])("guarantees an exact %sx%s PNG without fill stretching", async (width, height) => {
    const input = await sharp({
      create: { width: 960, height: 640, channels: 3, background: "#3157d5" },
    }).png().toBuffer();
    const output = await finalizeGeneratedImage(input, width, height);
    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(width);
    expect(metadata.height).toBe(height);
  });

  it("normalizes a supported source to sRGB PNG", async () => {
    const jpeg = await sharp({
      create: { width: 640, height: 960, channels: 3, background: "#f1cc38" },
    }).jpeg().toBuffer();
    const normalized = await normalizeSourceImage(jpeg);
    const metadata = await sharp(normalized.buffer).metadata();
    expect(metadata.format).toBe("png");
    expect(normalized.width).toBe(640);
    expect(normalized.height).toBe(960);
  });

});

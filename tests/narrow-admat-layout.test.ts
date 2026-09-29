import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  DEFAULT_FINE_TUNE_TRANSFORM,
  initialGenerationTransform,
  NARROW_ADMAT_INITIAL_TRANSFORM,
} from "@/lib/fine-tune";
import { getNarrowAdmatPlan, isNarrowAdmatTarget } from "@/lib/narrow-admat";
import { AD_SIZE_PRESETS } from "@/lib/presets";
import { buildValidationPrompt } from "@/lib/prompts/validate-output";
import { expandGeneratedBleed, renderFineTunedImage } from "@/lib/server/fine-tune";
import {
  createNarrowAdmatMask,
  restoreProtectedNarrowBackground,
} from "@/lib/server/narrow-admat-generation";

const targets = [[120, 600], [970, 90]] as const;

describe("extreme format safe frame", () => {
  it("is limited to the two reported dimensions", () => {
    for (const [width, height] of targets) {
      expect(isNarrowAdmatTarget(width, height)).toBe(true);
      expect(getNarrowAdmatPlan(width, height)).not.toBeNull();
    }
    for (const [width, height] of [
      [160, 600], [970, 250], [120, 240], [300, 1050], [234, 60],
      [600, 120], [90, 970], [121, 600], [970, 91],
    ]) {
      expect(isNarrowAdmatTarget(width, height)).toBe(false);
      expect(getNarrowAdmatPlan(width, height)).toBeNull();
    }
  });

  it("maps the 10% final buffer to a simple centered model-canvas band", () => {
    expect(getNarrowAdmatPlan(120, 600)).toMatchObject({
      orientation: "vertical", cropAxis: "width", finalCropPercent: 60, safeBandPercent: 54,
      canvas: { width: 720, height: 2160 },
      finalSafeSize: { width: 108, height: 540 },
      cropRect: { left: 144, top: 0, width: 432, height: 2160 },
      safeRect: { left: 166, top: 108, width: 388, height: 1944 },
    });
    expect(getNarrowAdmatPlan(970, 90)).toMatchObject({
      orientation: "horizontal", cropAxis: "height", finalCropPercent: 28, safeBandPercent: 25,
      canvas: { width: 2160, height: 720 },
      finalSafeSize: { width: 873, height: 81 },
      cropRect: { left: 0, top: 260, width: 2160, height: 200 },
      safeRect: { left: 108, top: 270, width: 1944, height: 180 },
    });
  });

  it("defaults every preset and custom size to 100% without shifting the artwork", () => {
    expect(DEFAULT_FINE_TUNE_TRANSFORM).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
    for (const { width, height } of [
      ...AD_SIZE_PRESETS,
      { width: 121, height: 601 },
      { width: 971, height: 91 },
      { width: 64, height: 4000 },
      { width: 4000, height: 50 },
      { width: 777, height: 333 },
    ]) {
      expect(initialGenerationTransform(width, height)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
    }
    for (const [width, height] of targets) {
      expect(initialGenerationTransform(width, height)).toEqual(NARROW_ADMAT_INITIAL_TRANSFORM);
    }
  });

  it.each(targets)("keeps the prompted safe area inside the real %sx%s export", async (width, height) => {
    const plan = getNarrowAdmatPlan(width, height)!;
    const modelImage = await sharp({
      create: { width: plan.canvas.width, height: plan.canvas.height, channels: 3, background: "#0000ff" },
    }).composite([{
      input: await sharp({
        create: { width: plan.safeRect.width, height: plan.safeRect.height, channels: 3, background: "#ff0000" },
      }).png().toBuffer(),
      left: plan.safeRect.left,
      top: plan.safeRect.top,
    }]).png().toBuffer();

    const output = await renderFineTunedImage(
      await expandGeneratedBleed(modelImage),
      width,
      height,
      initialGenerationTransform(width, height),
    );
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
    let redMinX: number = width;
    let redMinY: number = height;
    let redMaxX: number = -1;
    let redMaxY: number = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * info.channels;
        if (data[index] > 127) {
          redMinX = Math.min(redMinX, x);
          redMinY = Math.min(redMinY, y);
          redMaxX = Math.max(redMaxX, x);
          redMaxY = Math.max(redMaxY, y);
        }
      }
    }
    expect(redMinX).toBeGreaterThanOrEqual(Math.floor(width * 0.05) - 1);
    expect(redMinY).toBeGreaterThanOrEqual(Math.floor(height * 0.05) - 1);
    expect(width - redMaxX - 1).toBeGreaterThanOrEqual(Math.floor(width * 0.05) - 1);
    expect(height - redMaxY - 1).toBeGreaterThanOrEqual(Math.floor(height * 0.05) - 1);
  });

  it.each(targets)("makes only the exact safe rectangle editable for %sx%s", async (width, height) => {
    const plan = getNarrowAdmatPlan(width, height)!;
    const { data, info } = await sharp(await createNarrowAdmatMask(width, height))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
    expect(alphaAt(plan.safeRect.left, plan.safeRect.top)).toBe(0);
    expect(alphaAt(plan.safeRect.left + plan.safeRect.width - 1, plan.safeRect.top + plan.safeRect.height - 1)).toBe(0);
    expect(alphaAt(Math.max(0, plan.safeRect.left - 1), plan.safeRect.top)).toBe(255);
    expect(alphaAt(plan.safeRect.left, Math.max(0, plan.safeRect.top - 1))).toBe(255);
  });

  it.each(targets)("restores every protected background pixel for %sx%s", async (width, height) => {
    const plan = getNarrowAdmatPlan(width, height)!;
    const background = await sharp({
      create: { width: plan.canvas.width, height: plan.canvas.height, channels: 3, background: "#0000ff" },
    }).png().toBuffer();
    const generated = await sharp({
      create: { width: plan.canvas.width, height: plan.canvas.height, channels: 3, background: "#ff0000" },
    }).png().toBuffer();
    const { data, info } = await sharp(
      await restoreProtectedNarrowBackground(background, generated, width, height),
    ).raw().toBuffer({ resolveWithObject: true });
    const pixelAt = (x: number, y: number) => {
      const index = (y * info.width + x) * info.channels;
      return Array.from(data.subarray(index, index + 3));
    };
    expect(pixelAt(0, 0)).toEqual([0, 0, 255]);
    expect(pixelAt(plan.safeRect.left, plan.safeRect.top)).toEqual([255, 0, 0]);
    expect(pixelAt(plan.safeRect.left + plan.safeRect.width, plan.safeRect.top)).toEqual([0, 0, 255]);
  });

  it.each(targets)("reviews the same 5%% final margins for %sx%s", (width, height) => {
    const result = buildValidationPrompt(["Headline"], width, height, true);
    expect(result).toContain("EXTREME FORMAT SAFE FRAME");
    expect(result).toContain(`${width / 20}px of campaign background on left/right`);
    expect(result).toContain(`${height / 20}px on top/bottom`);
    expect(result).toContain("Do not request enlargement beyond the safe area");
  });
});

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { finalizeGeneratedImage, normalizeSourceImage } from "@/lib/server/image-processing";

describe("Sharp image processing", () => {
  it.each([
    [728, 90],
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

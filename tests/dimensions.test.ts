import { describe, expect, it } from "vitest";
import { chooseGenerationCanvas, classifyAspectRatio, classifyUltraShortBanner, isUltraShortBanner } from "@/lib/dimensions";

describe("aspect ratio classification", () => {
  it.each([
    [728, 90, "ULTRA_WIDE"],
    [970, 250, "LANDSCAPE"],
    [300, 250, "SQUARE"],
    [250, 250, "SQUARE"],
    [300, 600, "PORTRAIT"],
    [120, 600, "SKYSCRAPER"],
  ] as const)("classifies %sx%s as %s", (width, height, expected) => {
    expect(classifyAspectRatio(width, height)).toBe(expected);
  });
});

describe("ultra-short banner routing", () => {
  it.each([
    [970, 90, true],
    [728, 90, true],
    [468, 60, true],
    [320, 50, true],
    [234, 60, true],
    [320, 100, false],
    [970, 250, false],
    [300, 250, false],
    [250, 250, false],
    [300, 600, false],
    [120, 600, false],
    [90, 90, false],
  ] as const)("treats %sx%s as ultra-short=%s", (width, height, expected) => {
    expect(isUltraShortBanner(width, height)).toBe(expected);
  });

  it.each([
    [970, 90, "ULTRA_WIDE"],
    [728, 90, "ULTRA_WIDE"],
    [468, 60, "ULTRA_WIDE"],
    [320, 50, "COMPACT"],
    [234, 60, "COMPACT"],
    [320, 100, null],
    [90, 90, null],
  ] as const)("classifies %sx%s as %s", (width, height, expected) => {
    expect(classifyUltraShortBanner(width, height)).toBe(expected);
  });
});

describe("generation canvas planning", () => {
  it.each([
    [300, 250],
    [728, 90],
    [120, 600],
    [970, 250],
  ])("returns a supported, useful canvas for %sx%s", (width, height) => {
    const canvas = chooseGenerationCanvas(width, height);
    expect(canvas.width % 16).toBe(0);
    expect(canvas.height % 16).toBe(0);
    expect(canvas.width * canvas.height).toBeGreaterThanOrEqual(655_360);
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(8_294_400);
    expect(canvas.width / canvas.height).toBeGreaterThanOrEqual(1 / 3);
    expect(canvas.width / canvas.height).toBeLessThanOrEqual(3);
    expect(canvas.size).toBe(`${canvas.width}x${canvas.height}`);
  });

  it("marks unsupported extreme ratios for safe cropping", () => {
    expect(chooseGenerationCanvas(728, 90).requiresSafeCrop).toBe(true);
    expect(chooseGenerationCanvas(120, 600).requiresSafeCrop).toBe(true);
    expect(chooseGenerationCanvas(300, 250).requiresSafeCrop).toBe(false);
  });
});

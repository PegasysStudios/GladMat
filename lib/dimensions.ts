export type AspectCategory =
  | "ULTRA_WIDE"
  | "LANDSCAPE"
  | "SQUARE"
  | "PORTRAIT"
  | "SKYSCRAPER";

export type GenerationCanvas = {
  width: number;
  height: number;
  size: `${number}x${number}`;
  targetRatio: number;
  canvasRatio: number;
  requiresSafeCrop: boolean;
};

export const ULTRA_SHORT_BANNER_MAX_HEIGHT = 100;
export const ULTRA_SHORT_BANNER_MIN_ASPECT_RATIO = 3;
export const ULTRA_WIDE_SHORT_BANNER_MIN_ASPECT_RATIO = 7;

export type UltraShortBannerClass = "ULTRA_WIDE" | "COMPACT";

export function isUltraShortBanner(width: number, height: number) {
  return height < ULTRA_SHORT_BANNER_MAX_HEIGHT && width / height >= ULTRA_SHORT_BANNER_MIN_ASPECT_RATIO;
}

export function classifyUltraShortBanner(width: number, height: number): UltraShortBannerClass | null {
  if (!isUltraShortBanner(width, height)) return null;
  return width / height >= ULTRA_WIDE_SHORT_BANNER_MIN_ASPECT_RATIO ? "ULTRA_WIDE" : "COMPACT";
}

export function classifyAspectRatio(width: number, height: number): AspectCategory {
  const ratio = width / height;
  if (ratio >= 4) return "ULTRA_WIDE";
  if (ratio > 1.2) return "LANDSCAPE";
  if (ratio >= 0.85) return "SQUARE";
  if (height / width >= 2.5) return "SKYSCRAPER";
  return "PORTRAIT";
}

function nearestMultipleOf16(value: number) {
  return Math.max(512, Math.round(value / 16) * 16);
}

/**
 * GPT Image 2.5 accepts arbitrary 16px-aligned canvases between 1:3 and 3:1.
 * Preserve the requested ratio whenever practical, otherwise use the nearest legal
 * canvas and tell the prompt builder to reserve a target-ratio safe crop.
 */
export function chooseGenerationCanvas(width: number, height: number): GenerationCanvas {
  const targetRatio = width / height;
  const canvasRatio = Math.min(3, Math.max(1 / 3, targetRatio));
  const targetPixels = 1_572_864;

  let canvasWidth = nearestMultipleOf16(Math.sqrt(targetPixels * canvasRatio));
  let canvasHeight = nearestMultipleOf16(canvasWidth / canvasRatio);

  if (canvasWidth > 2560) {
    canvasWidth = 2560;
    canvasHeight = nearestMultipleOf16(canvasWidth / canvasRatio);
  }
  if (canvasHeight > 2560) {
    canvasHeight = 2560;
    canvasWidth = nearestMultipleOf16(canvasHeight * canvasRatio);
  }

  // Keep the model ratio inside its documented range after rounding.
  if (canvasWidth / canvasHeight > 3) canvasWidth = canvasHeight * 3;
  if (canvasHeight / canvasWidth > 3) canvasHeight = canvasWidth * 3;

  canvasWidth = Math.round(canvasWidth / 16) * 16;
  canvasHeight = Math.round(canvasHeight / 16) * 16;

  const actualRatio = canvasWidth / canvasHeight;
  return {
    width: canvasWidth,
    height: canvasHeight,
    size: `${canvasWidth}x${canvasHeight}`,
    targetRatio,
    canvasRatio: actualRatio,
    requiresSafeCrop: Math.abs(actualRatio - targetRatio) / targetRatio > 0.015,
  };
}

export function formatSpecificInstructions(category: AspectCategory) {
  switch (category) {
    case "ULTRA_WIDE":
      return "This is an extremely wide and short banner. Use a deliberate left-to-right composition. Avoid vertically stacking every element. Keep primary copy large and integrate the subject in a compact horizontal composition.";
    case "LANDSCAPE":
      return "Use a purposeful horizontal composition. Balance the main artwork or subject with the headline and essential event details, and preserve comfortable safe margins.";
    case "SQUARE":
      return "Favor a strong centered composition with a clear top, middle, and bottom hierarchy. Use the square confidently rather than leaving an unused poster-shaped strip.";
    case "PORTRAIT":
      return "Use an intentional vertical composition with clear visual zones and readable copy. Reflow supporting details rather than shrinking the entire original poster.";
    case "SKYSCRAPER":
      return "This is an extremely narrow vertical skyscraper. Build the composition vertically using deliberate top, middle, and bottom regions. Stack information intentionally. Do not shrink the original poster into the center of the canvas.";
  }
}

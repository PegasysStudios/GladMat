import { chooseGenerationCanvas } from "@/lib/dimensions";

const NARROW_ADMAT_TARGETS = new Set(["120x600", "970x90"]);

export type NarrowAdmatRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function isNarrowAdmatTarget(width: number, height: number) {
  return NARROW_ADMAT_TARGETS.has(`${width}x${height}`);
}

export function getNarrowAdmatPlan(width: number, height: number) {
  if (!isNarrowAdmatTarget(width, height)) return null;

  const canvas = chooseGenerationCanvas(width, height);
  const horizontal = width > height;
  const cropWidth = horizontal
    ? canvas.width
    : Math.floor(canvas.height * canvas.targetRatio);
  const cropHeight = horizontal
    ? Math.floor(canvas.width / canvas.targetRatio)
    : canvas.height;
  const cropRect: NarrowAdmatRect = {
    left: Math.ceil((canvas.width - cropWidth) / 2),
    top: Math.ceil((canvas.height - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight,
  };
  const safeWidth = Math.floor(cropRect.width * 0.9);
  const safeHeight = Math.floor(cropRect.height * 0.9);
  const safeRect: NarrowAdmatRect = {
    left: cropRect.left + Math.ceil((cropRect.width - safeWidth) / 2),
    top: cropRect.top + Math.ceil((cropRect.height - safeHeight) / 2),
    width: safeWidth,
    height: safeHeight,
  };
  const cropFraction = horizontal
    ? cropRect.height / canvas.height
    : cropRect.width / canvas.width;

  return {
    canvas,
    orientation: horizontal ? "horizontal" as const : "vertical" as const,
    cropAxis: horizontal ? "height" as const : "width" as const,
    finalCropPercent: Math.round(cropFraction * 100),
    safeBandPercent: Math.round(cropFraction * 90 * 100) / 100,
    finalSafeSize: {
      width: Math.floor(width * 0.9),
      height: Math.floor(height * 0.9),
    },
    cropRect,
    safeRect,
  };
}

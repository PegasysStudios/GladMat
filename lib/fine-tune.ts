import { isNarrowAdmatTarget } from "@/lib/narrow-admat";

export type FineTuneTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

export const MIN_FINE_TUNE_SCALE = 0.8;
export const MAX_FINE_TUNE_SCALE = 1.5;
// The editor source has an eighth of its original size extended on each edge.
// At 80% scale that expanded source still covers the export canvas.
export const BLEED_SOURCE_EXPANSION = 1 / MIN_FINE_TUNE_SCALE;
export const BLEED_EDGE_FRACTION = (BLEED_SOURCE_EXPANSION - 1) / 2;
export const DEFAULT_FINE_TUNE_TRANSFORM: FineTuneTransform = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

export const NARROW_ADMAT_INITIAL_TRANSFORM: FineTuneTransform = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

export function initialGenerationTransform(width: number, height: number) {
  return isNarrowAdmatTarget(width, height)
    ? NARROW_ADMAT_INITIAL_TRANSFORM
    : DEFAULT_FINE_TUNE_TRANSFORM;
}

export function fineTuneImageRect(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  transform: FineTuneTransform,
) {
  const cover = Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight) * BLEED_SOURCE_EXPANSION;
  const width = Math.ceil(sourceWidth * cover * transform.scale);
  const height = Math.ceil(sourceHeight * cover * transform.scale);
  const maxOffsetX = (width - canvasWidth) / (2 * canvasWidth);
  const maxOffsetY = (height - canvasHeight) / (2 * canvasHeight);
  const offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, transform.offsetX));
  const offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, transform.offsetY));
  return {
    width,
    height,
    left: (canvasWidth - width) / 2 + offsetX * canvasWidth,
    top: (canvasHeight - height) / 2 + offsetY * canvasHeight,
    offsetX,
    offsetY,
  };
}

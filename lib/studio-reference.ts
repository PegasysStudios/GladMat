export const STUDIO_REFERENCE_LAYER_ID = "reference";
export const STUDIO_REFERENCE_DEFAULT_OPACITY = 0.3;

export function isStudioReferenceLayerId(layerId: string) {
  return layerId === STUDIO_REFERENCE_LAYER_ID;
}

export function shouldIncludeLayerInExport(layer: { id?: string; type?: string; exportable?: boolean }) {
  if (layer.exportable === false) return false;
  if (layer.type === "reference") return false;
  if (layer.id && isStudioReferenceLayerId(layer.id)) return false;
  return true;
}

export function clampReferenceOpacity(value: number) {
  if (!Number.isFinite(value)) return STUDIO_REFERENCE_DEFAULT_OPACITY;
  return Math.min(0.8, Math.max(0.05, value));
}

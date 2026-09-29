import type { z } from "zod";
import { StudioDecompositionSchema, type StudioAnalysis, type StudioBounds } from "@/lib/studio";

export type StudioDecomposition = z.infer<typeof StudioDecompositionSchema>;

export function clampStudioBounds(bounds: StudioBounds, width: number, height: number): StudioBounds | null {
  const x = Math.max(0, bounds.x);
  const y = Math.max(0, bounds.y);
  const right = Math.min(width, bounds.x + bounds.width);
  const bottom = Math.min(height, bounds.y + bounds.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

export function studioExtractionRegion(bounds: StudioBounds, width: number, height: number) {
  const pad = Math.max(8, Math.ceil(Math.max(bounds.width, bounds.height) * 0.15));
  return clampStudioBounds({
    x: bounds.x - pad, y: bounds.y - pad,
    width: bounds.width + 2 * pad, height: bounds.height + 2 * pad,
  }, width, height)!;
}

function overlap(a: StudioBounds, b: StudioBounds) {
  const area = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return area / Math.max(1, Math.min(a.width * a.height, b.width * b.height));
}

// A group portrait plus its individual portraits cannot own the same components.
export function normalizeStudioDecomposition(input: StudioDecomposition, width: number, height: number): StudioAnalysis {
  const candidates = input.layers.flatMap((layer) => {
    const bounds = clampStudioBounds(layer.bounds, width, height);
    return layer.type !== "background" && bounds ? [{ ...layer, bounds }] : [];
  });
  const leaves = candidates.filter((layer) => {
    if (layer.type !== "subject" || layer.componentIds.length < 2) return true;
    const children = candidates.filter((other) => other !== layer && other.type === "subject"
      && other.componentIds.every((id) => layer.componentIds.includes(id)));
    return !layer.componentIds.every((id) => children.some((child) => child.componentIds.includes(id)));
  });
  const accepted: typeof candidates = [];
  const prioritized = [...leaves].sort((a, b) => {
    const priority = (layer: typeof a) => layer.type === "subject"
      ? layer.componentIds.length : -layer.componentIds.length;
    return priority(a) - priority(b);
  });
  for (const candidate of prioritized) {
    const duplicate = accepted.some((other) => (
      candidate.componentIds.some((id) => other.componentIds.includes(id))
      || (candidate.type === other.type && overlap(candidate.bounds, other.bounds) > 0.94
        && Math.max(candidate.bounds.width * candidate.bounds.height, other.bounds.width * other.bounds.height)
          / Math.min(candidate.bounds.width * candidate.bounds.height, other.bounds.width * other.bounds.height) < 1.15)
    ));
    if (!duplicate) accepted.push(candidate);
  }
  const selected = new Set(accepted);
  return {
    backgroundDescription: input.backgroundDescription,
    layers: candidates.filter((layer) => selected.has(layer)).map((layer) => ({
      id: layer.id, name: layer.name, type: layer.type, description: layer.description,
      bounds: layer.bounds, extraction: layer.extraction,
    })),
  };
}

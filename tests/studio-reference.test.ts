import { describe, expect, it } from "vitest";
import {
  clampReferenceOpacity,
  isStudioReferenceLayerId,
  shouldIncludeLayerInExport,
  STUDIO_REFERENCE_LAYER_ID,
} from "@/lib/studio-reference";

describe("reference overlay", () => {
  it("excludes the reference layer from export", () => {
    expect(isStudioReferenceLayerId(STUDIO_REFERENCE_LAYER_ID)).toBe(true);
    expect(shouldIncludeLayerInExport({ id: STUDIO_REFERENCE_LAYER_ID })).toBe(false);
    expect(shouldIncludeLayerInExport({ type: "reference" })).toBe(false);
    expect(shouldIncludeLayerInExport({ id: "headline", type: "text" })).toBe(true);
    expect(shouldIncludeLayerInExport({ id: "background", type: "background" })).toBe(true);
  });

  it("clamps overlay opacity around the default comparison range", () => {
    expect(clampReferenceOpacity(0.3)).toBeCloseTo(0.3);
    expect(clampReferenceOpacity(2)).toBe(0.8);
    expect(clampReferenceOpacity(-1)).toBe(0.05);
  });
});

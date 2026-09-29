import { describe, expect, it } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";
import { StudioDecompositionSchema } from "@/lib/studio";
import { clampStudioBounds, normalizeStudioDecomposition, studioExtractionRegion, type StudioDecomposition } from "@/lib/studio-decomposition";

function portrait(id: string, x: number, componentIds = [id], width = 45) {
  return { id, name: id, type: "subject" as const, description: id, extraction: "mask" as const,
    componentIds, bounds: { x, y: 60, width, height: 90 } };
}
function plan(layers: StudioDecomposition["layers"]): StudioDecomposition { return { backgroundDescription: "Yellow grunge texture and sunburst", layers }; }

describe("Studio semantic inventory", () => {
  it("keeps three independently movable artists and discards their redundant composite", () => {
    const result = normalizeStudioDecomposition(plan([
      portrait("band-group", 15, ["left", "center", "right"], 165),
      portrait("left", 15), portrait("center", 70), portrait("right", 125),
    ]), 200, 200);
    expect(result.layers.map((layer) => layer.id)).toEqual(["left", "center", "right"]);
  });
  it("keeps a filled text treatment together and excludes its redundant bare text", () => {
    const text = { ...portrait("words", 20, ["headline"]), type: "text" as const };
    const panel = { ...text, id: "nameplate", extraction: "rectangle" as const, componentIds: ["headline", "headline-fill"] };
    expect(normalizeStudioDecomposition(plan([text, panel]), 200, 200).layers.map((layer) => layer.id)).toEqual(["nameplate"]);
  });
  it("preserves actual repeated appearances at different positions", () => {
    expect(normalizeStudioDecomposition(plan([portrait("artist-left", 15), portrait("artist-right", 125)]), 200, 200).layers).toHaveLength(2);
  });
  it("does not confuse background texture with a foreground element", () => {
    expect(normalizeStudioDecomposition(plan([{ ...portrait("texture", 0), type: "background" }, portrait("artist", 70)]), 200, 200).layers).toHaveLength(1);
  });
  it("clamps by the original right and bottom edges, and discards boxes fully outside the canvas", () => {
    expect(clampStudioBounds({ x: -10, y: -5, width: 50, height: 30 }, 200, 200)).toEqual({ x: 0, y: 0, width: 40, height: 25 });
    expect(clampStudioBounds({ x: 205, y: 0, width: 10, height: 10 }, 200, 200)).toBeNull();
    const region = studioExtractionRegion({ x: 40, y: 50, width: 40, height: 60 }, 200, 200);
    expect(region.x).toBeLessThan(40); expect(region.y).toBeLessThan(50);
    expect(region.x + region.width).toBeGreaterThan(80);
  });
  it("supports the configured SDK's required structured output contract", () => {
    expect(() => zodTextFormat(StudioDecompositionSchema, "studio_decomposition")).not.toThrow();
  });
});

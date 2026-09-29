import { describe, expect, it } from "vitest";
import { buildStudioAnalyzePrompt } from "@/lib/prompts/studio-analyze";
import { buildStudioBackgroundPrompt } from "@/lib/prompts/studio-background";
import { buildStudioLayerExtractionPrompt } from "@/lib/prompts/studio-extract-layer";
import type { StudioLayer } from "@/lib/studio";

const layer: StudioLayer = {
  id: "nameplate",
  name: "NELLY DEAN",
  type: "text",
  description: "NELLY DEAN nameplate",
  assetPath: "studio/session/asset/layers/nameplate.png",
  x: 400,
  y: 28,
  width: 150,
  height: 34,
  visible: true,
  locked: false,
  zIndex: 5,
  status: "queued",
};

describe("source-pixel Studio prompts", () => {
  it("asks Sol to identify logical layers without a quota from the selected generated ad", () => {
    const prompt = buildStudioAnalyzePrompt(728, 90);
    expect(prompt).toContain("728 × 90");
    expect(prompt).toContain("never invent items to reach a quota");
    expect(prompt).toContain("Do NOT create one large \"Artist Panel\"");
    expect(prompt).not.toContain("campaign assets");
    expect(prompt).not.toContain("master artwork");
  });

  it("asks Sunburst to rebuild only the background of the selected ad", () => {
    const prompt = buildStudioBackgroundPrompt(728, 90, [layer]);
    expect(prompt).toContain("NELLY DEAN nameplate");
    expect(prompt).toContain("locked bottom layer");
    expect(prompt).not.toContain("original master artwork");
  });

  it("asks Sunburst to select one visible element without redrawing it", () => {
    const prompt = buildStudioLayerExtractionPrompt(layer, 728, 90);
    expect(prompt).toContain("ELEMENT: NELLY DEAN");
    expect(prompt).toContain("x=400");
    expect(prompt).toContain("SEGMENTATION MASK");
    expect(prompt).toContain("Do not move, scale, center, duplicate");
    expect(prompt).toContain("728 × 90");
    expect(prompt).not.toContain("infer master");
    expect(prompt).not.toContain("SAM");
  });
});

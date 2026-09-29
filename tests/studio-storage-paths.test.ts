import { describe, expect, it } from "vitest";
import {
  isAllowedStudioLayerAssetPath,
  studioAnalysisPath,
  studioBackgroundPath,
  studioDocumentPath,
  studioLayerPath,
  studioOriginalPath,
} from "@/lib/studio-storage-paths";

describe("Studio storage paths", () => {
  it("constructs target-specific paths beneath the scoped Studio asset root", () => {
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const assetId = "22222222-2222-4222-8222-222222222222";
    expect(studioOriginalPath(sessionId, assetId)).toBe(`studio/${sessionId}/${assetId}/original.png`);
    expect(studioAnalysisPath(sessionId, assetId)).toBe(`studio/${sessionId}/${assetId}/analysis.json`);
    expect(studioBackgroundPath(sessionId, assetId)).toBe(`studio/${sessionId}/${assetId}/source-pixels-v2/background.png`);
    expect(studioLayerPath(sessionId, assetId, "headline")).toBe(`studio/${sessionId}/${assetId}/source-pixels-v2/layers/headline.png`);
    expect(studioDocumentPath(sessionId, assetId)).toBe(`studio/${sessionId}/${assetId}/document.json`);
  });

  it("only allows per-asset Studio layer paths", () => {
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const assetId = "22222222-2222-4222-8222-222222222222";
    expect(isAllowedStudioLayerAssetPath(sessionId, assetId, {
      id: "headline",
      type: "text",
      assetPath: studioLayerPath(sessionId, assetId, "headline"),
    })).toBe(true);
    expect(isAllowedStudioLayerAssetPath(sessionId, assetId, {
      id: "background",
      type: "background",
      assetPath: studioBackgroundPath(sessionId, assetId),
    })).toBe(true);
    expect(isAllowedStudioLayerAssetPath(sessionId, assetId, {
      id: "artist",
      type: "subject",
      assetPath: `campaign-assets/${sessionId}/v2/layers/artist.png`,
    })).toBe(false);
    expect(isAllowedStudioLayerAssetPath(sessionId, assetId, {
      id: "headline",
      type: "text",
      assetPath: studioLayerPath(sessionId, "33333333-3333-4333-8333-333333333333", "headline"),
    })).toBe(false);
  });
});

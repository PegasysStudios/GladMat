import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DimensionPairSchema,
  DownloadAssetRequestSchema,
  SaveFineTuneRequestSchema,
  GenerateRequestSchema,
  PrepareUploadSchema,
  SignAssetRequestSchema,
  SourceAnalysisSchema,
} from "@/lib/schemas";

const sessionId = randomUUID();
const requestId = randomUUID();
const sessionToken = `${Date.now() + 10_000}.${"a".repeat(64)}`;

describe("request validation", () => {
  it("accepts sensible custom dimensions and rejects unsafe ones", () => {
    expect(DimensionPairSchema.safeParse({ width: 320, height: 50 }).success).toBe(true);
    expect(DimensionPairSchema.safeParse({ width: 1080, height: 1350 }).success).toBe(true);
    expect(DimensionPairSchema.safeParse({ width: 1080, height: 1080 }).success).toBe(true);
    expect(DimensionPairSchema.safeParse({ width: 1920, height: 1005 }).success).toBe(true);
    expect(DimensionPairSchema.safeParse({ width: 63, height: 250 }).success).toBe(false);
    expect(DimensionPairSchema.safeParse({ width: 4000, height: 4000 }).success).toBe(false);
    expect(DimensionPairSchema.safeParse({ width: 4000, height: 50 }).success).toBe(false);
    expect(DimensionPairSchema.safeParse({ width: 300.5, height: 250 }).success).toBe(false);
  });

  it("accepts exactly one valid generation target", () => {
    const valid = {
      sessionId,
      sessionToken,
      sourcePath: `sources/${sessionId}/source.png`,
      requestId,
      width: 300,
      height: 250,
      formatName: "Medium rectangle",
      correctedText: ["EXACT COPY"],
      additionalInstructions: "",
    };
    expect(GenerateRequestSchema.safeParse(valid).success).toBe(true);
    expect(GenerateRequestSchema.safeParse({ ...valid, targets: [] }).success).toBe(false);
    expect(GenerateRequestSchema.safeParse([{ ...valid }]).success).toBe(false);
  });

  it("accepts bounded per-size regeneration instructions", () => {
    const valid = {
      sessionId,
      sessionToken,
      sourcePath: `sources/${sessionId}/source.png`,
      requestId,
      width: 300,
      height: 250,
      formatName: "Medium rectangle",
      correctedText: ["EXACT COPY"],
      additionalInstructions: "Keep the original palette.",
    };

    const parsed = GenerateRequestSchema.safeParse({
      ...valid,
      regenerationInstructions: "  Make the headline larger.  ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.regenerationInstructions).toBe("Make the headline larger.");
    }
    expect(GenerateRequestSchema.safeParse({
      ...valid,
      regenerationInstructions: "x".repeat(1501),
    }).success).toBe(false);
    expect(GenerateRequestSchema.safeParse({
      ...valid,
      regenerationInstructions: "   ",
    }).success).toBe(false);
  });

  it("bounds upload type and size", () => {
    expect(PrepareUploadSchema.safeParse({ action: "prepare", filename: "flyer.png", mimeType: "image/png", fileSize: 1 }).success).toBe(true);
    expect(PrepareUploadSchema.safeParse({ action: "prepare", filename: "flyer.gif", mimeType: "image/gif", fileSize: 1 }).success).toBe(false);
    expect(PrepareUploadSchema.safeParse({ action: "prepare", filename: "flyer.png", mimeType: "image/png", fileSize: 21 * 1024 * 1024 }).success).toBe(false);
  });

  it("accepts either a live session or exact saved-asset capability", () => {
    const asset = { requestId, width: 300, height: 250 };
    const assetToken = `${Date.now() + 10_000}.${"b".repeat(64)}`;

    expect(SignAssetRequestSchema.safeParse({ sessionId, sessionToken, asset }).success).toBe(true);
    expect(SignAssetRequestSchema.safeParse({ sessionId, assetToken, asset }).success).toBe(true);
    expect(SignAssetRequestSchema.safeParse({ sessionId, asset }).success).toBe(false);
    expect(SignAssetRequestSchema.safeParse({ sessionId, sessionToken, assetToken, asset }).success).toBe(false);
    expect(DownloadAssetRequestSchema.safeParse({
      sessionId,
      assetToken,
      sourceName: "fall-campaign",
      asset,
    }).success).toBe(true);
    expect(SaveFineTuneRequestSchema.safeParse({
      sessionId,
      assetToken,
      asset,
      transform: { scale: 1.12, offsetX: 0.1, offsetY: -0.2 },
    }).success).toBe(true);
    expect(SaveFineTuneRequestSchema.safeParse({
      sessionId,
      assetToken,
      asset,
      transform: { scale: 0.8, offsetX: 0, offsetY: 0 },
    }).success).toBe(true);
    expect(SaveFineTuneRequestSchema.safeParse({
      sessionId,
      assetToken,
      asset,
      transform: { scale: 0.7, offsetX: 0, offsetY: 0 },
    }).success).toBe(false);
  });

  it("accepts stored source analysis objects that omit optional semantic copy fields", () => {
    const parsed = SourceAnalysisSchema.safeParse({
      summary: "A poster.",
      exactText: ["LIVE MUSIC"],
      visualStyle: "Bold cyan campaign.",
      colorPalette: [{ hex: "#00E5FF", role: "Background" }],
      typography: { headlineStyle: "Display", bodyStyle: "Sans", other: "None" },
      visualHierarchy: ["Headline"],
      importantSubjects: [],
      logosAndMarks: [],
      decorativeElements: [],
      layoutDescription: "Horizontal banner",
      preservationInstructions: [],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.primaryHeadline).toBe("");
      expect(parsed.data.dateText).toBe("");
      expect(parsed.data.ctaText).toBe("");
      expect(parsed.data.otherRequiredText).toEqual([]);
    }
  });
});

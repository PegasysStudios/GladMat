import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DimensionPairSchema,
  GenerateRequestSchema,
  PrepareUploadSchema,
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

  it("bounds upload type and size", () => {
    expect(PrepareUploadSchema.safeParse({ action: "prepare", filename: "flyer.png", mimeType: "image/png", fileSize: 1 }).success).toBe(true);
    expect(PrepareUploadSchema.safeParse({ action: "prepare", filename: "flyer.gif", mimeType: "image/gif", fileSize: 1 }).success).toBe(false);
    expect(PrepareUploadSchema.safeParse({ action: "prepare", filename: "flyer.png", mimeType: "image/png", fileSize: 21 * 1024 * 1024 }).success).toBe(false);
  });
});

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createSavedAdMat,
  parseSavedAdMats,
  savedAdMatId,
  serializeSavedAdMats,
} from "@/lib/saved-admats";
import type { GenerationJob, SourceAsset } from "@/lib/types";

const sessionId = randomUUID();
const requestId = randomUUID();
const assetToken = `${Date.now() + 10_000}.${"a".repeat(64)}`;

const source: SourceAsset = {
  sessionId,
  sessionToken: `${Date.now() + 10_000}.${"b".repeat(64)}`,
  sourcePath: `sources/${sessionId}/source.png`,
  originalName: "Fall Campaign.png",
  sourceName: "fall-campaign",
  width: 1080,
  height: 1350,
  previewUrl: "https://example.supabase.co/source.png?token=source",
};

describe("saved AdMat local records", () => {
  it("creates a record with only the metadata needed to find the private asset", () => {
    const job: GenerationJob = {
      size: { id: "leaderboard", name: "Leaderboard", width: 728, height: 90 },
      status: "complete",
      requestId,
      assetToken,
      previewUrl: "https://example.supabase.co/generated.png?token=preview",
      needsReview: false,
    };

    const saved = createSavedAdMat(job, source);
    expect(saved.id).toBe(savedAdMatId(sessionId, 728, 90, requestId));
    expect(saved.assetToken).toBe(assetToken);
    expect(saved.sourceName).toBe("fall-campaign");
    expect(saved).not.toHaveProperty("sessionToken");
    expect(saved).not.toHaveProperty("sourcePath");
  });

  it("round-trips valid records and rejects corrupt or mismatched identities", () => {
    const job: GenerationJob = {
      size: { id: "square", name: "Square", width: 250, height: 250 },
      status: "complete",
      requestId,
      assetToken,
      needsReview: true,
      validationIssues: ["Review the date."],
    };
    const saved = createSavedAdMat(job, source);
    expect(parseSavedAdMats(serializeSavedAdMats([saved]))).toEqual([saved]);

    const mismatched = JSON.stringify({
      version: 1,
      items: [{ ...saved, id: "another-object" }],
    });
    expect(parseSavedAdMats(mismatched)).toEqual([]);
    expect(parseSavedAdMats("not json")).toEqual([]);
  });

  it("does not save an incomplete job", () => {
    expect(() => createSavedAdMat({
      size: { id: "square", name: "Square", width: 250, height: 250 },
      status: "processing",
      requestId,
    }, source)).toThrow("Only completed assets can be saved.");
  });
});

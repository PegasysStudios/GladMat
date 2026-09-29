import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { LayoutReference } from "@/lib/layout-references";
import type { SourceAnalysis } from "@/lib/schemas";

const mocks = vi.hoisted(() => ({
  edit: vi.fn(),
  validate: vi.fn(),
  cache: new Map<string, Buffer>(),
  upload: vi.fn(),
}));

vi.mock("@/lib/server/config", () => ({
  getOpenAIConfig: () => ({
    apiKey: "test",
    analysisModel: "analysis-test",
    imageModel: "gpt-image-2.5-sunburst",
    imageQuality: "high",
    validationEnabled: false,
  }),
}));

vi.mock("@/lib/server/openai", () => ({
  getOpenAIClient: () => ({ images: { edit: mocks.edit } }),
}));

vi.mock("@/lib/server/validate-generated", () => ({
  validateGeneratedAsset: mocks.validate,
}));

vi.mock("@/lib/server/storage", () => ({
  assetExists: async (path: string) => mocks.cache.has(path),
  downloadBuffer: async (path: string) => mocks.cache.get(path)!,
  uploadBuffer: mocks.upload.mockImplementation(async (path: string, body: Buffer) => {
    mocks.cache.set(path, body);
  }),
}));

import { generateNarrowAdmat } from "@/lib/server/narrow-admat-generation";

const analysis: SourceAnalysis = {
  summary: "Yellow and black concert poster",
  exactText: ["ROCKING BANGING", "SUNDAY AUG 28", "NEW CITY", "TICKETS $35"],
  primaryHeadline: "ROCKING BANGING",
  artistOrEventName: "ROCKING BANGING",
  dateText: "SUNDAY AUG 28",
  timeText: "",
  venueText: "",
  locationText: "NEW CITY",
  ctaText: "TICKETS $35",
  websiteText: "",
  otherRequiredText: [],
  visualStyle: "High-energy yellow and black music poster",
  colorPalette: [{ hex: "#facc15", role: "background" }],
  typography: { headlineStyle: "Heavy italic", bodyStyle: "Condensed", other: "" },
  visualHierarchy: ["Headline", "Performers", "Date", "CTA"],
  importantSubjects: [
    { description: "lead performer in sunglasses", importance: "primary" },
    { description: "supporting performers", importance: "secondary" },
  ],
  logosAndMarks: [],
  decorativeElements: ["radiating black lines"],
  layoutDescription: "Stacked portrait poster",
  preservationInstructions: [],
};

const input = {
  sessionId: "session-test",
  width: 970,
  height: 90,
  formatName: "Large leaderboard",
  correctedText: analysis.exactText,
  additionalInstructions: "",
};

const layoutReference: { reference: LayoutReference; buffer: Buffer } = {
  reference: {
    width: 970,
    height: 90,
    family: "ultra-wide-horizontal",
    path: "/test/layout.png",
    filename: "layout.png",
    match: "exact",
  },
  buffer: Buffer.alloc(0),
};

let modelImage: Buffer;
let sourceImage: Buffer;

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.cache.clear();
  modelImage = await sharp({
    create: { width: 32, height: 32, channels: 3, background: "#facc15" },
  }).png().toBuffer();
  sourceImage = await sharp({
    create: { width: 32, height: 32, channels: 3, background: "#111111" },
  }).png().toBuffer();
  layoutReference.buffer = sourceImage;
  mocks.edit.mockResolvedValue({ data: [{ b64_json: modelImage.toString("base64") }] });
  mocks.validate.mockResolvedValue({ passed: true, issues: [] });
  mocks.upload.mockImplementation(async (path: string, body: Buffer) => {
    mocks.cache.set(path, body);
  });
});

describe("narrow admat generation pipeline", () => {
  it("generates a background before a masked composition and always validates", async () => {
    const phases: Array<[string, number]> = [];
    const result = await generateNarrowAdmat(
      input,
      analysis,
      sourceImage,
      layoutReference,
      (phase, attempt) => phases.push([phase, attempt]),
    );

    expect(result).toMatchObject({ needsReview: false, attempts: 1, validationIssues: [] });
    expect(mocks.edit).toHaveBeenCalledTimes(2);
    expect(mocks.validate).toHaveBeenCalledTimes(1);
    expect(phases).toEqual([["generating", 1], ["processing", 1]]);

    const backgroundRequest = mocks.edit.mock.calls[0][0];
    const compositionRequest = mocks.edit.mock.calls[1][0];
    expect(backgroundRequest.mask).toBeUndefined();
    expect(compositionRequest.mask?.name).toBe("foreground-safe-area-mask.png");
    expect(compositionRequest.image.map((file: File) => file.name)).toEqual([
      "protected-background.png",
      "master-campaign.png",
      "layout.png",
    ]);
    expect(compositionRequest.prompt).toContain("MANDATORY MASK RULE");
    expect(compositionRequest.prompt).toContain("lead performer in sunglasses");
  });

  it("runs only one focused repair and keeps the candidate with fewer issues", async () => {
    mocks.validate
      .mockResolvedValueOnce({ passed: false, issues: ["Headline crosses the safe area."] })
      .mockResolvedValueOnce({
        passed: false,
        issues: ["Headline crosses the safe area.", "CTA crosses the safe area."],
      });

    const result = await generateNarrowAdmat(
      input,
      analysis,
      sourceImage,
      layoutReference,
      () => undefined,
    );

    expect(mocks.edit).toHaveBeenCalledTimes(3);
    expect(mocks.validate).toHaveBeenCalledTimes(2);
    expect(mocks.edit.mock.calls[2][0].prompt).toContain("REPAIR ONLY THESE QA ISSUES");
    expect(mocks.edit.mock.calls[2][0].prompt).toContain("Headline crosses the safe area.");
    expect(result).toMatchObject({
      needsReview: true,
      attempts: 2,
      validationIssues: ["Headline crosses the safe area."],
    });
  });

  it("marks the first candidate for review when mandatory QA is unavailable", async () => {
    mocks.validate.mockRejectedValueOnce(new Error("review unavailable"));
    const result = await generateNarrowAdmat(
      input,
      analysis,
      sourceImage,
      layoutReference,
      () => undefined,
    );

    expect(mocks.edit).toHaveBeenCalledTimes(2);
    expect(result.needsReview).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.validationIssues[0]).toContain("review was unavailable");
  });

  it("reuses the cached background plate on regeneration", async () => {
    await generateNarrowAdmat(input, analysis, sourceImage, layoutReference, () => undefined);
    await generateNarrowAdmat(
      { ...input, regenerationInstructions: "Make the headline heavier." },
      analysis,
      sourceImage,
      layoutReference,
      () => undefined,
    );

    expect(mocks.edit).toHaveBeenCalledTimes(3);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.edit.mock.calls[2][0].prompt).toContain("Make the headline heavier.");
  });
});

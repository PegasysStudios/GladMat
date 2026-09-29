import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MAX_SAVED_ARTWORK, parseSavedArtwork, serializeSavedArtwork, type SavedArtwork } from "@/lib/saved-artwork";
import { SourceAnalysisSchema } from "@/lib/schemas";

export const analysisFixture = SourceAnalysisSchema.parse({
  summary: "A concert poster.", exactText: ["LIVE MUSIC", "FRIDAY"],
  visualStyle: "Bold blue campaign.", colorPalette: [{ hex: "#2563eb", role: "Background" }],
  typography: { headlineStyle: "Display", bodyStyle: "Sans", other: "None" },
  visualHierarchy: ["Headline"], importantSubjects: [], logosAndMarks: [], decorativeElements: [],
  layoutDescription: "Portrait poster", preservationInstructions: ["Keep the headline"],
});

function record(): SavedArtwork {
  const sessionId = randomUUID();
  return {
    source: {
      sessionId, sessionToken: `${Date.now() - 86400000}.${"a".repeat(64)}`,
      sourceToken: `${Date.now() + 86400000}.${"b".repeat(64)}`,
      sourcePath: `sources/${sessionId}/source.png`, originalName: "concert.png", sourceName: "concert",
      width: 1080, height: 1350, previewUrl: "https://example.supabase.co/source.png?token=preview",
    },
    analysis: analysisFixture, correctedText: ["LIVE MUSIC", "SATURDAY"], fileSize: 1024,
    savedAt: new Date().toISOString(),
  };
}

describe("saved source artwork metadata", () => {
  it("retains the bucket reference, full analysis, and reviewed copy after the session expires", () => {
    const item = record();
    expect(parseSavedArtwork(serializeSavedArtwork([item]))).toEqual([item]);
    expect(item.correctedText).not.toEqual(item.analysis?.exactText);
  });
  it("can save an uploaded source before analysis finishes", () => {
    const item = { ...record(), analysis: null, correctedText: [] };
    expect(parseSavedArtwork(serializeSavedArtwork([item]))).toEqual([item]);
  });
  it("ignores a corrupt record without losing valid artwork", () => {
    const item = record();
    const corrupt = { ...record(), analysis: { summary: "missing fields" } };
    expect(parseSavedArtwork(JSON.stringify({ version: 1, items: [corrupt, item] }))).toEqual([item]);
    expect(parseSavedArtwork("not JSON")).toEqual([]);
  });
  it("rejects unrelated storage paths and removes duplicate source identities", () => {
    const item = record();
    const unsafe = { ...record(), source: { ...item.source, sourcePath: "generated/another.png" } };
    expect(parseSavedArtwork(JSON.stringify({ version: 1, items: [unsafe, item, item] }))).toEqual([item]);
  });
  it("keeps a bounded library and sorts recent artwork first", () => {
    const items = Array.from({ length: MAX_SAVED_ARTWORK + 1 }, record);
    expect(parseSavedArtwork(serializeSavedArtwork(items))).toHaveLength(MAX_SAVED_ARTWORK);
    const older = { ...record(), savedAt: "2025-01-01T00:00:00.000Z" };
    expect(parseSavedArtwork(serializeSavedArtwork([older, items[0]]))[0]).toEqual(items[0]);
  });
});

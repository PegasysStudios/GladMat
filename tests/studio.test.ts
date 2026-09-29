import { describe, expect, it } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";
import { STUDIO_API_VERSION } from "@/lib/studio-protocol";
import {
  STUDIO_PIPELINE_VERSION,
  STUDIO_DEFAULT_ZOOM,
  StudioDecompositionSchema,
  StudioAnalysisSchema,
  StudioAnalyzeRequestSchema,
  StudioDocumentSchema,
  StudioExtractRequestSchema,
  calculateFitZoom,
  createStudioDocument,
  normalizeStudioTransform,
  parseStoredStudioDocument,
  removeStudioLayer,
  reorderStudioLayers,
  screenToCanvasPoint,
  studioExportFilename,
  toggleStudioLayerVisibility,
  type StudioAnalysis,
  type StudioDocument,
  type StudioLayer,
} from "@/lib/studio";

const sessionId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const assetToken = `${Date.now() + 10_000}.${"a".repeat(64)}`;

export const LEADERBOARD_STUDIO_ANALYSIS_FIXTURE: StudioAnalysis = {
  layers: [
    {
      id: "headline",
      name: "LIVE MUSIC",
      type: "text",
      description: "Large yellow LIVE MUSIC headline with dark shadow",
      bounds: { x: 22, y: 12, width: 185, height: 67 },
    },
    {
      id: "artist",
      name: "Artist",
      type: "subject",
      description: "Grayscale woman wearing sunglasses",
      bounds: { x: 220, y: 0, width: 93, height: 90 },
    },
    {
      id: "date",
      name: "FEB 02",
      type: "text",
      description: "Stacked date block reading FEB 02",
      bounds: { x: 318, y: 8, width: 72, height: 36 },
    },
    {
      id: "time",
      name: "09 PM",
      type: "text",
      description: "Stacked time block reading 09 PM",
      bounds: { x: 318, y: 46, width: 72, height: 36 },
    },
    {
      id: "nameplate",
      name: "NELLY DEAN",
      type: "text",
      description: "NELLY DEAN nameplate",
      bounds: { x: 400, y: 28, width: 150, height: 34 },
    },
    {
      id: "venue",
      name: "Venue",
      type: "text",
      description: "Venue and address block",
      bounds: { x: 560, y: 18, width: 110, height: 54 },
    },
    {
      id: "free",
      name: "FREE",
      type: "badge",
      description: "FREE badge",
      bounds: { x: 678, y: 24, width: 42, height: 42 },
    },
  ],
};

function layer(id: string, zIndex: number, overrides: Partial<StudioLayer> = {}): StudioLayer {
  return {
    id,
    name: id,
    type: "graphic",
    description: `${id} layer`,
    assetPath: `studio/${sessionId}/${assetId}/source-pixels-v2/layers/${id}.png`,
    x: 10,
    y: 10,
    width: 100,
    height: 40,
    visible: true,
    locked: false,
    zIndex,
    status: "complete",
    ...overrides,
  };
}

function document(): StudioDocument {
  return {
    version: 1,
    pipelineVersion: STUDIO_PIPELINE_VERSION,
    sessionId,
    assetId,
    canvas: { width: 728, height: 90 },
    sourceAsset: {
      storagePath: `generated/${sessionId}/728x90/${assetId}.png`,
      formatName: "Leaderboard",
      sourceName: "live-music",
    },
    layers: [
      layer("background", 0, {
        type: "background",
        name: "Background",
        assetPath: `studio/${sessionId}/${assetId}/source-pixels-v2/background.png`,
        x: 0,
        y: 0,
        width: 728,
        height: 90,
        locked: true,
      }),
      layer("date", 1),
      layer("artist", 2, { type: "subject" }),
      layer("headline", 3, { type: "text" }),
    ],
    createdAt: "2026-09-14T12:00:00.000Z",
    updatedAt: "2026-09-14T12:00:00.000Z",
  };
}

describe("Studio document model", () => {
  it("accepts a valid raster-layer document", () => {
    expect(StudioDocumentSchema.safeParse(document()).success).toBe(true);
  });

  it("requires pipelineVersion source-pixels-v2", () => {
    const invalid = { ...document(), pipelineVersion: "extraction-v2" };
    expect(StudioDocumentSchema.safeParse(invalid).success).toBe(false);
  });

  it("requires one locked bottom background", () => {
    const invalid = document();
    invalid.layers[0] = { ...invalid.layers[0], locked: false, zIndex: 2 };
    expect(StudioDocumentSchema.safeParse(invalid).success).toBe(false);
  });

  it("keeps the background locked at the bottom while reordering", () => {
    const reordered = reorderStudioLayers(document().layers, "date", "headline");
    expect(reordered[0]).toMatchObject({ id: "background", locked: true, zIndex: 0 });
    expect(reordered.find((item) => item.id === "date")?.zIndex).toBe(3);
    expect(reordered.find((item) => item.id === "artist")?.zIndex).toBe(1);
  });

  it("toggles visibility without removing a layer", () => {
    const changed = toggleStudioLayerVisibility(document().layers, "artist");
    expect(changed.find((item) => item.id === "artist")?.visible).toBe(false);
    expect(changed).toHaveLength(4);
  });

  it("removes editable layers but never the background", () => {
    expect(removeStudioLayer(document().layers, "artist").map((item) => item.id)).not.toContain("artist");
    expect(removeStudioLayer(document().layers, "background").map((item) => item.id)).toContain("background");
  });

  it("keeps a document valid when one optional layer failed extraction", () => {
    const current = document();
    current.layers[2] = {
      ...current.layers[2],
      status: "error",
      error: "This layer could not be extracted.",
    };
    expect(StudioDocumentSchema.safeParse(current).success).toBe(true);
    expect(current.layers[0]).toMatchObject({ id: "background", locked: true });
    expect(current.layers.filter((item) => item.status === "complete")).toHaveLength(3);
  });

  it("normalizes proportional Konva scale into dimensions", () => {
    const transformed = normalizeStudioTransform(layer("artist", 1), {
      x: 24,
      y: -3,
      scaleX: 1.5,
      scaleY: 1.5,
    });
    expect(transformed).toMatchObject({ x: 24, y: -3, width: 150, height: 60 });
  });
});

describe("Studio pipeline version", () => {
  it("loads source-pixels-v2 documents and ignores stale experimental caches", () => {
    expect(parseStoredStudioDocument(document())?.pipelineVersion).toBe("source-pixels-v2");
    expect(parseStoredStudioDocument({
      ...document(),
      pipelineVersion: undefined,
    })).toBeNull();
    expect(parseStoredStudioDocument({
      version: 1,
      sessionId,
      assetId,
      layers: [{
        id: "artist",
        sourceOrigin: "master",
        sourceAssetId: "artist",
      }],
    })).toBeNull();
    expect(parseStoredStudioDocument({ ...document(), pipelineVersion: "simple-v1" })).toBeNull();
    expect(parseStoredStudioDocument({
      ...document(),
      pipelineVersion: "campaign-v2",
    })).toBeNull();
  });
});

describe("Studio analysis schema", () => {
  it("accepts 5–12 logical layers with canvas-pixel bounds", () => {
    expect(StudioAnalysisSchema.safeParse(LEADERBOARD_STUDIO_ANALYSIS_FIXTURE).success).toBe(true);
    expect(LEADERBOARD_STUDIO_ANALYSIS_FIXTURE.layers.length).toBeGreaterThanOrEqual(5);
    expect(LEADERBOARD_STUDIO_ANALYSIS_FIXTURE.layers.length).toBeLessThanOrEqual(12);
  });

  it("allows simple artwork without inventing a layer quota and caps excessive sets", () => {
    expect(StudioAnalysisSchema.safeParse({ layers: LEADERBOARD_STUDIO_ANALYSIS_FIXTURE.layers.slice(0, 1) }).success).toBe(true);
    expect(StudioAnalysisSchema.safeParse({
      layers: Array.from({ length: 33 }, (_, index) => ({
        ...LEADERBOARD_STUDIO_ANALYSIS_FIXTURE.layers[0],
        id: `layer-${index + 1}`,
        name: `Layer ${index + 1}`,
      })),
    }).success).toBe(false);
  });

  it("rejects invalid bounding boxes", () => {
    const [first, ...rest] = LEADERBOARD_STUDIO_ANALYSIS_FIXTURE.layers;
    expect(StudioAnalysisSchema.safeParse({
      layers: [{ ...first, bounds: { ...first.bounds, width: 0 } }, ...rest],
    }).success).toBe(false);
  });

  it("converts to an OpenAI structured-output format", () => {
    expect(() => zodTextFormat(StudioDecompositionSchema, "studio_decomposition")).not.toThrow();
  });
});

describe("728x90 leaderboard reconstruction", () => {
  it("creates one representation of each logical element from mock analysis", () => {
    const reconstructed = createStudioDocument({
      sessionId,
      assetId,
      canvas: { width: 728, height: 90 },
      sourceAsset: {
        storagePath: `generated/${sessionId}/728x90/${assetId}.png`,
        formatName: "Leaderboard",
        sourceName: "nelly-dean",
      },
      analysis: LEADERBOARD_STUDIO_ANALYSIS_FIXTURE,
      now: "2026-09-14T18:00:00.000Z",
    });

    const names = reconstructed.layers.map((item) => item.name);
    expect(reconstructed.pipelineVersion).toBe("source-pixels-v2");
    expect(reconstructed.canvas).toEqual({ width: 728, height: 90 });
    expect(names).toEqual([
      "Background",
      "LIVE MUSIC",
      "Artist",
      "FEB 02",
      "09 PM",
      "NELLY DEAN",
      "Venue",
      "FREE",
    ]);
    expect(names.filter((name) => /artist panel/i.test(name))).toHaveLength(0);
    expect(new Set(names).size).toBe(names.length);
    expect(reconstructed.layers[0]).toMatchObject({
      id: "background",
      locked: true,
      zIndex: 0,
      assetPath: `studio/${sessionId}/${assetId}/source-pixels-v2/background.png`,
    });
    expect(reconstructed.layers.find((item) => item.id === "headline")).toMatchObject({
      x: 22,
      y: 12,
      width: 185,
      height: 67,
      assetPath: `studio/${sessionId}/${assetId}/source-pixels-v2/layers/headline.png`,
    });
  });
});

describe("Studio canvas math", () => {
  it("opens every ad at native 100% zoom", () => {
    expect(STUDIO_DEFAULT_ZOOM).toBe(1);
  });
  it("calculates fit zoom and can scale small ads up", () => {
    expect(calculateFitZoom(800, 500, 728, 90)).toBeCloseTo(800 / 728);
    expect(calculateFitZoom(1000, 500, 320, 50)).toBeCloseTo(3.125);
  });

  it("maps screen coordinates back into native canvas coordinates", () => {
    expect(screenToCanvasPoint({ x: 300, y: 75 }, 1.5)).toEqual({ x: 200, y: 50 });
  });

  it("creates a native-dimension edited PNG filename", () => {
    expect(studioExportFilename("nelly dean.png", 728, 90)).toBe("nelly-dean_728x90_edited.png");
  });
});

describe("Studio API validation", () => {
  const access = {
    apiVersion: STUDIO_API_VERSION,
    sessionId,
    assetToken,
    asset: { requestId: assetId, width: 728, height: 90 },
  };

  it("accepts a scoped analysis request", () => {
    expect(StudioAnalyzeRequestSchema.safeParse({
      ...access,
      formatName: "Leaderboard",
      sourceName: "live-music",
    }).success).toBe(true);
  });

  it("rejects arbitrary layer paths and malformed access values", () => {
    expect(StudioExtractRequestSchema.safeParse({
      ...access,
      assetToken: "not-a-token",
      layerId: "../../other-file",
    }).success).toBe(false);
    expect(StudioExtractRequestSchema.safeParse({
      ...access,
      layerId: "headline",
      preparationId: "33333333-3333-4333-8333-333333333333",
    }).success).toBe(true);
  });
});

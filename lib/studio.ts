import { z } from "zod";
import { AssetIdentitySchema, AssetTokenSchema, SessionIdSchema } from "@/lib/schemas";
import { studioBackgroundPath, studioLayerPath } from "@/lib/studio-storage-paths";
import { STUDIO_API_VERSION } from "@/lib/studio-protocol";

export const STUDIO_PIPELINE_VERSION = "source-pixels-v2" as const;
export const STUDIO_DEFAULT_ZOOM = 1;
export const STUDIO_ANALYSIS_LAYER_MIN = 1;
export const STUDIO_ANALYSIS_LAYER_MAX = 32;

export const STUDIO_LAYER_TYPES = [
  "background",
  "subject",
  "text",
  "graphic",
  "logo",
  "badge",
  "other",
] as const;

export const StudioLayerTypeSchema = z.enum(STUDIO_LAYER_TYPES);
export const StudioLayerStatusSchema = z.enum(["queued", "extracting", "complete", "error"]);
export const StudioLayerIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
export const StudioPipelineVersionSchema = z.literal(STUDIO_PIPELINE_VERSION);

export const StudioBoundsSchema = z
  .object({
    x: z.number().int(),
    y: z.number().int(),
    width: z.number().int().positive().max(4000),
    height: z.number().int().positive().max(4000),
  })
  .strict();

export const StudioLayerSchema = z
  .object({
    id: StudioLayerIdSchema,
    name: z.string().trim().min(1).max(120),
    type: StudioLayerTypeSchema,
    description: z.string().trim().min(1).max(600),
    assetPath: z.string().trim().min(1).max(500),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
    visible: z.boolean(),
    locked: z.boolean(),
    zIndex: z.number().int().nonnegative(),
    extractionConfidence: z.number().min(0).max(1).optional(),
    sourceBounds: StudioBoundsSchema.optional(),
    extraction: z.enum(["mask", "rectangle"]).optional(),
    status: StudioLayerStatusSchema,
    error: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

export const StudioDocumentSchema = z
  .object({
    version: z.literal(1),
    pipelineVersion: StudioPipelineVersionSchema,
    preparationId: z.string().uuid().optional(),
    sessionId: SessionIdSchema,
    assetId: z.string().uuid(),
    canvas: z
      .object({
        width: z.number().int().min(64).max(4000),
        height: z.number().int().min(50).max(4000),
      })
      .strict(),
    sourceAsset: z
      .object({
        storagePath: z.string().trim().min(1).max(500),
        formatName: z.string().trim().min(1).max(80),
        sourceName: z.string().trim().min(1).max(120),
      })
      .strict(),
    layers: z.array(StudioLayerSchema).min(1).max(STUDIO_ANALYSIS_LAYER_MAX + 1),
    backgroundDescription: z.string().max(1500).optional(),
    preparationComplete: z.boolean().optional(),
    reconstructionError: z.number().nonnegative().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((document, context) => {
    const backgrounds = document.layers.filter((layer) => layer.type === "background");
    if (backgrounds.length !== 1) {
      context.addIssue({ code: "custom", message: "Studio documents require one background layer" });
    }
    if (backgrounds[0] && (!backgrounds[0].locked || backgrounds[0].zIndex !== 0)) {
      context.addIssue({ code: "custom", message: "The Studio background must be locked at the bottom" });
    }
    const ids = new Set(document.layers.map((layer) => layer.id));
    if (ids.size !== document.layers.length) {
      context.addIssue({ code: "custom", message: "Studio layer IDs must be unique" });
    }
    if (document.preparationComplete && (
      document.reconstructionError !== 0 || document.layers.some((layer) => layer.status !== "complete")
    )) {
      context.addIssue({ code: "custom", message: "A prepared Studio document must contain every completed layer and a verified reconstruction" });
    }
  });

export const StudioAnalysisLayerSchema = z
  .object({
    id: StudioLayerIdSchema,
    name: z.string().trim().min(1).max(120),
    type: StudioLayerTypeSchema,
    description: z.string().trim().min(1).max(600),
    bounds: StudioBoundsSchema,
    extraction: z.enum(["mask", "rectangle"]).optional(),
  })
  .strict();

export const StudioAnalysisSchema = z
  .object({
    layers: z.array(StudioAnalysisLayerSchema).min(STUDIO_ANALYSIS_LAYER_MIN).max(STUDIO_ANALYSIS_LAYER_MAX),
    backgroundDescription: z.string().max(1500).optional(),
  })
  .strict();

// Keep the model contract explicit: rectangles are complete photographic panels
// or filled text treatments; everything else needs a silhouette mask.
export const StudioDecompositionSchema = z.object({
  backgroundDescription: z.string().trim().min(1).max(1500),
  layers: z.array(StudioAnalysisLayerSchema.extend({
    extraction: z.enum(["mask", "rectangle"]),
    componentIds: z.array(StudioLayerIdSchema).min(1).max(32),
  })).min(1).max(STUDIO_ANALYSIS_LAYER_MAX),
}).strict();

export const StudioAccessSchema = z
  .object({
    sessionId: SessionIdSchema,
    assetToken: AssetTokenSchema,
    asset: AssetIdentitySchema,
  })
  .strict();

const StudioAccessFields = {
  apiVersion: z.literal(STUDIO_API_VERSION),
  sessionId: SessionIdSchema,
  assetToken: AssetTokenSchema,
  asset: AssetIdentitySchema,
};

export const StudioAnalyzeRequestSchema = z
  .object({
    ...StudioAccessFields,
    formatName: z.string().trim().min(1).max(80),
    sourceName: z.string().trim().min(1).max(120),
    rebuild: z.boolean().optional(),
  })
  .strict();

export const StudioAssetRequestSchema = z.object(StudioAccessFields).strict();

const StudioPreparationFields = { ...StudioAccessFields, preparationId: z.string().uuid() };
export const StudioPreparationRequestSchema = z.object(StudioPreparationFields).strict();

export const StudioExtractRequestSchema = z
  .object({ ...StudioPreparationFields, layerId: StudioLayerIdSchema, repair: z.boolean().optional() })
  .strict();

export const StudioImageRequestSchema = StudioExtractRequestSchema;

export const StudioSaveRequestSchema = z
  .object({ ...StudioPreparationFields, document: StudioDocumentSchema })
  .strict();

export type StudioLayer = z.infer<typeof StudioLayerSchema>;
export type StudioLayerType = z.infer<typeof StudioLayerTypeSchema>;
export type StudioDocument = z.infer<typeof StudioDocumentSchema>;
export type StudioAnalysis = z.infer<typeof StudioAnalysisSchema>;
export type StudioAnalysisLayer = z.infer<typeof StudioAnalysisLayerSchema>;
export type StudioBounds = z.infer<typeof StudioBoundsSchema>;

export function uniqueLayerId(value: string, fallbackIndex: number, used: Set<string>) {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 68) || `element-${fallbackIndex + 1}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate) || candidate === "background" || candidate === "reference") {
    candidate = `${base.slice(0, 72)}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

export function isCurrentStudioPipeline(value: unknown) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && "pipelineVersion" in value
    && value.pipelineVersion === STUDIO_PIPELINE_VERSION,
  );
}

export function parseStoredStudioDocument(value: unknown) {
  if (!isCurrentStudioPipeline(value)) return null;
  const parsed = StudioDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function createStudioDocument(input: {
  sessionId: string;
  assetId: string;
  canvas: { width: number; height: number };
  sourceAsset: { storagePath: string; formatName: string; sourceName: string };
  analysis: StudioAnalysis;
  preparationId?: string;
  now?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  const used = new Set<string>();
  const background: StudioLayer = {
    id: "background",
    name: "Background",
    type: "background",
    description: "Locked clean background plate",
    assetPath: studioBackgroundPath(input.sessionId, input.assetId, input.preparationId),
    x: 0,
    y: 0,
    width: input.canvas.width,
    height: input.canvas.height,
    visible: true,
    locked: true,
    zIndex: 0,
    status: "queued",
  };
  const foreground = input.analysis.layers
    .filter((layer) => layer.type !== "background")
    .map((layer, index) => {
      const id = uniqueLayerId(layer.id || layer.name, index, used);
      return {
        id,
        name: layer.name,
        type: layer.type,
        description: layer.description,
        sourceBounds: layer.bounds,
        extraction: layer.extraction ?? "mask",
        assetPath: studioLayerPath(input.sessionId, input.assetId, id, input.preparationId),
        x: layer.bounds.x,
        y: layer.bounds.y,
        width: layer.bounds.width,
        height: layer.bounds.height,
        visible: true,
        locked: false,
        zIndex: index + 1,
        status: "queued" as const,
      };
    });

  return StudioDocumentSchema.parse({
    version: 1,
    pipelineVersion: STUDIO_PIPELINE_VERSION,
    preparationId: input.preparationId,
    sessionId: input.sessionId,
    assetId: input.assetId,
    canvas: input.canvas,
    sourceAsset: input.sourceAsset,
    backgroundDescription: input.analysis.backgroundDescription,
    preparationComplete: false,
    layers: normalizeLayerOrder([background, ...foreground]),
    createdAt: now,
    updatedAt: now,
  });
}

export function normalizeLayerOrder(layers: StudioLayer[]) {
  const background = layers.find((layer) => layer.type === "background");
  const editable = layers
    .filter((layer) => layer.type !== "background")
    .sort((a, b) => a.zIndex - b.zIndex);
  return [
    ...(background ? [{ ...background, locked: true, zIndex: 0 }] : []),
    ...editable.map((layer, index) => ({ ...layer, zIndex: index + 1 })),
  ];
}

export function reorderStudioLayers(layers: StudioLayer[], activeId: string, overId: string) {
  if (activeId === overId) return normalizeLayerOrder(layers);
  const panelOrder = layers
    .filter((layer) => !layer.locked && layer.type !== "background")
    .sort((a, b) => b.zIndex - a.zIndex);
  const from = panelOrder.findIndex((layer) => layer.id === activeId);
  const to = panelOrder.findIndex((layer) => layer.id === overId);
  if (from < 0 || to < 0) return normalizeLayerOrder(layers);
  const [moved] = panelOrder.splice(from, 1);
  panelOrder.splice(to, 0, moved);
  const background = layers.filter((layer) => layer.type === "background");
  const bottomToTop = [...panelOrder]
    .reverse()
    .map((layer, index) => ({ ...layer, zIndex: index + 1 }));
  return normalizeLayerOrder([...background, ...bottomToTop]);
}

export function moveStudioLayerToEdge(
  layers: StudioLayer[],
  layerId: string,
  edge: "front" | "back",
) {
  const editable = layers
    .filter((layer) => !layer.locked && layer.type !== "background")
    .sort((a, b) => a.zIndex - b.zIndex);
  const index = editable.findIndex((layer) => layer.id === layerId);
  if (index < 0) return normalizeLayerOrder(layers);
  const [moved] = editable.splice(index, 1);
  if (edge === "front") editable.push(moved);
  else editable.unshift(moved);
  return normalizeLayerOrder([
    ...layers.filter((layer) => layer.type === "background"),
    ...editable.map((layer, editableIndex) => ({ ...layer, zIndex: editableIndex + 1 })),
  ]);
}

export function toggleStudioLayerVisibility(layers: StudioLayer[], layerId: string) {
  return layers.map((layer) => (
    layer.id === layerId ? { ...layer, visible: !layer.visible } : layer
  ));
}

export function removeStudioLayer(layers: StudioLayer[], layerId: string) {
  const target = layers.find((layer) => layer.id === layerId);
  if (!target || target.locked || target.type === "background") return normalizeLayerOrder(layers);
  return normalizeLayerOrder(layers.filter((layer) => layer.id !== layerId));
}

export function normalizeStudioTransform(
  layer: StudioLayer,
  transform: { x: number; y: number; scaleX: number; scaleY: number },
) {
  const proportionalScale = Math.max(0.01, Math.abs(transform.scaleX));
  return {
    ...layer,
    x: transform.x,
    y: transform.y,
    width: Math.max(1, layer.width * proportionalScale),
    height: Math.max(1, layer.height * proportionalScale),
  };
}

export function calculateFitZoom(
  viewportWidth: number,
  viewportHeight: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  if (viewportWidth <= 0 || viewportHeight <= 0 || canvasWidth <= 0 || canvasHeight <= 0) return 1;
  return Math.min(4, Math.max(0.1, Math.min(viewportWidth / canvasWidth, viewportHeight / canvasHeight)));
}

export function screenToCanvasPoint(point: { x: number; y: number }, zoom: number) {
  const safeZoom = zoom > 0 ? zoom : 1;
  return { x: point.x / safeZoom, y: point.y / safeZoom };
}

export function studioExportFilename(sourceName: string, width: number, height: number) {
  const base = sourceName
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "admat";
  return `${base}_${width}x${height}_edited.png`;
}

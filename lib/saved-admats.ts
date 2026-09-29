import { z } from "zod";
import type { GenerationJob, SavedAdMat, SourceAsset } from "@/lib/types";

export const SAVED_ADMATS_STORAGE_KEY = "gladmat.saved-admats.v1";

const SavedAdMatSchema = z
  .object({
    id: z.string().min(1).max(180),
    sessionId: z.string().uuid(),
    assetToken: z.string().regex(/^\d{10,13}\.[a-f0-9]{64}$/i),
    requestId: z.string().uuid(),
    width: z.number().int().min(64).max(4000),
    height: z.number().int().min(50).max(4000),
    formatName: z.string().trim().min(1).max(80),
    sourceName: z.string().trim().min(1).max(120),
    sourceOriginalName: z.string().trim().min(1).max(255),
    previewUrl: z.string().url().max(5000).optional(),
    needsReview: z.boolean(),
    validationIssues: z.array(z.string().trim().min(1).max(300)).max(20),
    savedAt: z.string().datetime(),
    fineTuneAvailable: z.boolean().optional(),
  })
  .strict();

const SavedAdMatEnvelopeSchema = z
  .object({
    version: z.literal(1),
    items: z.array(SavedAdMatSchema).max(200),
  })
  .strict();

export function savedAdMatId(
  sessionId: string,
  width: number,
  height: number,
  requestId: string,
) {
  return `${sessionId}:${width}x${height}:${requestId}`;
}

export function createSavedAdMat(job: GenerationJob, source: SourceAsset): SavedAdMat {
  if (job.status !== "complete" || !job.assetToken) {
    throw new Error("Only completed assets can be saved.");
  }
  return {
    id: savedAdMatId(source.sessionId, job.size.width, job.size.height, job.requestId),
    sessionId: source.sessionId,
    assetToken: job.assetToken,
    requestId: job.requestId,
    width: job.size.width,
    height: job.size.height,
    formatName: job.size.name,
    sourceName: source.sourceName,
    sourceOriginalName: source.originalName,
    previewUrl: job.previewUrl,
    needsReview: Boolean(job.needsReview),
    validationIssues: job.validationIssues ?? [],
    savedAt: new Date().toISOString(),
    fineTuneAvailable: job.fineTuneAvailable,
  };
}

export function parseSavedAdMats(value: string | null): SavedAdMat[] {
  if (!value) return [];
  try {
    const parsed = SavedAdMatEnvelopeSchema.safeParse(JSON.parse(value));
    if (!parsed.success) return [];

    const seen = new Set<string>();
    return [...parsed.data.items]
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      .filter((item) => {
        const expectedId = savedAdMatId(
          item.sessionId,
          item.width,
          item.height,
          item.requestId,
        );
        if (item.id !== expectedId || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
  } catch {
    return [];
  }
}

export function serializeSavedAdMats(items: SavedAdMat[]) {
  return JSON.stringify(SavedAdMatEnvelopeSchema.parse({ version: 1, items }));
}

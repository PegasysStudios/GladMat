import { z } from "zod";
import { SessionIdSchema, SessionTokenSchema, SourceAnalysisSchema } from "@/lib/schemas";
import { normalizedSourcePath } from "@/lib/storage-paths";

export const SAVED_ARTWORK_STORAGE_KEY = "gladmat.saved-artwork.v1";
export const MAX_SAVED_ARTWORK = 50;

const SavedArtworkSchema = z.object({
  source: z.object({
    sessionId: SessionIdSchema,
    sessionToken: SessionTokenSchema,
    sourceToken: SessionTokenSchema,
    sourcePath: z.string().max(300),
    originalName: z.string().min(1).max(255),
    sourceName: z.string().min(1).max(120),
    width: z.number().int().positive().max(100000),
    height: z.number().int().positive().max(100000),
    previewUrl: z.string().url().max(5000),
  }).strict().refine((source) => source.sourcePath === normalizedSourcePath(source.sessionId)),
  analysis: SourceAnalysisSchema.nullable(),
  correctedText: z.array(z.string().max(300)).max(80),
  fileSize: z.number().int().positive().max(20 * 1024 * 1024).nullable(),
  savedAt: z.string().datetime(),
}).strict();

export type SavedArtwork = z.infer<typeof SavedArtworkSchema>;

export function parseSavedArtwork(value: string | null): SavedArtwork[] {
  if (!value) return [];
  try {
    const envelope = z.object({ version: z.literal(1), items: z.array(z.unknown()).max(MAX_SAVED_ARTWORK) }).strict().parse(JSON.parse(value));
    const seen = new Set<string>();
    return envelope.items.flatMap((item) => {
      const parsed = SavedArtworkSchema.safeParse(item);
      if (!parsed.success || seen.has(parsed.data.source.sessionId)) return [];
      seen.add(parsed.data.source.sessionId);
      return [parsed.data];
    }).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } catch {
    return [];
  }
}

export function serializeSavedArtwork(items: SavedArtwork[]) {
  return JSON.stringify({ version: 1, items: items.slice(0, MAX_SAVED_ARTWORK).map((item) => SavedArtworkSchema.parse(item)) });
}

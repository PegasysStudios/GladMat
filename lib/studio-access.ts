import { z } from "zod";

const StudioLaunchContextSchema = z
  .object({
    assetToken: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    formatName: z.string().trim().min(1).max(80),
    sourceName: z.string().trim().min(1).max(120),
  })
  .strict();

export type StudioLaunchContext = z.infer<typeof StudioLaunchContextSchema>;

export function studioLaunchStorageKey(sessionId: string, assetId: string) {
  return `gladmat.studio-access.v1:${sessionId}:${assetId}`;
}

export function storeStudioLaunchContext(
  sessionId: string,
  assetId: string,
  context: StudioLaunchContext,
) {
  sessionStorage.setItem(
    studioLaunchStorageKey(sessionId, assetId),
    JSON.stringify(StudioLaunchContextSchema.parse(context)),
  );
}

export function readStudioLaunchContext(sessionId: string, assetId: string) {
  try {
    const value = sessionStorage.getItem(studioLaunchStorageKey(sessionId, assetId));
    if (!value) return null;
    const parsed = StudioLaunchContextSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

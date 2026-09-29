import "server-only";

import type { NextRequest } from "next/server";
import { z, type ZodType } from "zod";
import { STUDIO_API_VERSION, type StudioStage } from "@/lib/studio-protocol";
import { AppError, errorResponse, normalizeError } from "@/lib/server/errors";
import { parseJson } from "@/lib/server/request";

export async function parseStudioRequest<T>(request: NextRequest, schema: ZodType<T>) {
  const value = await parseJson(request, z.unknown());
  if (!value || typeof value !== "object" || !("apiVersion" in value) || value.apiVersion !== STUDIO_API_VERSION) {
    throw new AppError("STUDIO_CLIENT_OUTDATED",
      "Studio has been updated. Refresh this page and reopen Studio. Your ad is still available.",
      409, false, { stage: "analyzing", recovery: "reload" });
  }
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError("INVALID_REQUEST", "Studio received invalid values. Return to GladMat and reopen this ad.", 400, false, { recovery: "reopen" });
  return result.data;
}

export function studioFailure(error: unknown, stage: StudioStage, layerIds?: string[]) {
  const normalized = normalizeError(error, new AppError("STUDIO_FAILED", "Studio could not finish this step. Retry preparation.", 502, true));
  const recovery = normalized.details.recovery ?? (normalized.code === "AI_SUBMISSION_UNKNOWN" ? "new-attempt"
    : normalized.code === "ASSET_NOT_FOUND" ? "regenerate"
    : normalized.code === "UNAUTHORIZED_SESSION" || normalized.code === "INVALID_REQUEST"
      || (normalized.code === "GENERATION_FAILED" && !normalized.retryable) ? "reopen"
      : normalized.code === "CONFIGURATION_REQUIRED" || (!normalized.retryable && normalized.code === "OPENAI_FAILED") ? "check-configuration"
        : "retry-preparation");
  return new AppError(normalized.code, normalized.message
    .replace(/Retry this size/gi, "Retry Studio preparation")
    .replace(/this image/g, "this Studio step"), normalized.status, normalized.retryable,
  { stage, recovery, ...(layerIds ? { layerIds } : {}), ...normalized.details });
}

export function studioErrorResponse(error: unknown, requestId: string, stage: StudioStage, layerIds?: string[]) {
  return errorResponse(studioFailure(error, stage, layerIds), requestId);
}

import type { StudioDocument } from "@/lib/studio";

// Independent of the stored decomposition version: API changes must not erase
// paid selections or an existing editable document.
export const STUDIO_API_VERSION = 1;
export type StudioStage = "analyzing" | "extracting" | "background" | "composition";
export type StudioRecovery = "retry-preparation" | "retry-loading" | "reload" | "reopen" | "regenerate" | "check-configuration";
export type StudioErrorDetails = { stage?: StudioStage; recovery?: StudioRecovery; layerIds?: string[] };
export type StudioFailure = StudioErrorDetails & {
  code: string;
  message: string;
  retryable: boolean;
  requestId?: string;
};
export type StudioBackgroundEvent =
  | { type: "stage"; preparationId: string; stage: "background" | "composition"; status: "working" | "complete" }
  | { type: "complete"; preparationId: string; document: StudioDocument }
  | { type: "error"; preparationId: string; error: StudioFailure };

export type StudioStep = "pending" | "working" | "complete" | "error";
export type StudioPreparationState = Record<StudioStage, StudioStep> & {
  completedLayers: number;
  totalLayers: number;
  currentLayers: string[];
};
export const INITIAL_STUDIO_PREPARATION: StudioPreparationState = {
  analyzing: "pending", extracting: "pending", background: "pending", composition: "pending",
  completedLayers: 0, totalLayers: 0, currentLayers: [],
};

export function failStudioPreparation(current: StudioPreparationState, failure: StudioFailure) {
  const stage = failure.stage ?? (["analyzing", "extracting", "background", "composition"] as const)
    .find((candidate) => current[candidate] === "working") ?? "analyzing";
  return { ...current, ...Object.fromEntries(
    (["analyzing", "extracting", "background", "composition"] as const).map((candidate) => [
      candidate, candidate === stage ? "error" : current[candidate] === "working" ? "pending" : current[candidate],
    ]),
  ), completedLayers: failure.code === "STUDIO_SELECTIONS_MISSING"
    ? Math.max(0, current.completedLayers - (failure.layerIds?.length ?? 0)) : current.completedLayers,
  currentLayers: [] } as StudioPreparationState;
}

export function studioRecoveryLabel(recovery?: StudioRecovery) {
  if (recovery === "reload") return "Reload Studio";
  if (recovery === "reopen" || recovery === "regenerate" || recovery === "check-configuration") return "Back to GladMat";
  if (recovery === "retry-loading") return "Retry loading canvas";
  return "Retry preparation";
}

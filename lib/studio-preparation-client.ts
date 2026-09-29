"use client";
import { followAiJob, jobRequest, rememberAiJob } from "@/lib/ai-job-client";
import { isAiJobTicket } from "@/lib/ai-jobs";

import { ApiClientError, postJson, streamStudioBackground } from "@/lib/api-client";
import { mapWithConcurrency } from "@/lib/concurrency";
import { StudioDocumentSchema, StudioLayerSchema, type StudioDocument, type StudioLayer } from "@/lib/studio";
import { INITIAL_STUDIO_PREPARATION, STUDIO_API_VERSION, type StudioFailure, type StudioPreparationState, type StudioStage } from "@/lib/studio-protocol";

export type StudioClientAccess = {
  apiVersion: typeof STUDIO_API_VERSION;
  sessionId: string;
  assetToken: string;
  asset: { requestId: string; width: number; height: number };
};

export function clientStudioFailure(error: unknown, stage: StudioStage): StudioFailure {
  if (error instanceof ApiClientError) return { code: error.code, message: error.message, retryable: error.retryable, stage,
    recovery: "retry-preparation", ...error.details };
  if (error instanceof TypeError || (error instanceof Error && /fetch failed|network|timed out|failed to fetch/i.test(error.message))) {
    return { code: "STUDIO_CONNECTION_FAILED", message: "Could not connect to Studio. Check your connection and retry this step; saved preparation will be reused.",
      retryable: true, stage, recovery: stage === "composition" ? "retry-loading" : "retry-preparation" };
  }
  return { code: "STUDIO_FAILED", message: error instanceof Error && error.message
    ? error.message : "Studio could not finish this step. Retry preparation.", retryable: true, stage,
    recovery: stage === "composition" ? "retry-loading" : "retry-preparation" };
}

export async function prepareStudioCanvas(
  access: StudioClientAccess,
  labels: { formatName: string; sourceName: string },
  callbacks: {
    document: (document: StudioDocument) => void;
    layer: (id: string, update: Partial<StudioLayer>) => void;
    progress: (update: Partial<StudioPreparationState>) => void;
    image: (layerId: string, preparationId: string, signal: AbortSignal) => Promise<void>;
  },
  options: { signal: AbortSignal; newAttempt?: boolean; job?: (ticket: import("@/lib/ai-jobs").AiJobTicket) => void; repairLayerIds?: string[]; repairOutputs?: boolean },
) {
  const { signal } = options;
  let stage: StudioStage = "analyzing";
  const active = () => signal.throwIfAborted();
  const progress = (update: Partial<StudioPreparationState>) => { active(); callbacks.progress(update); };
  function checkedDocument(value: unknown) {
    const parsed = StudioDocumentSchema.safeParse(value);
    if (!parsed.success || !parsed.data.preparationId || parsed.data.sessionId !== access.sessionId
      || parsed.data.assetId !== access.asset.requestId || parsed.data.canvas.width !== access.asset.width
      || parsed.data.canvas.height !== access.asset.height) throw new ApiClientError(
      "Studio has been updated. Refresh this page and reopen Studio. Your ad is still available.",
      "STUDIO_CLIENT_OUTDATED", false, { stage, recovery: "reload" },
    );
    return parsed.data;
  }
  try {
    progress({ ...INITIAL_STUDIO_PREPARATION, analyzing: "working" });
    const loaded = await postJson<{ document: StudioDocument | null; durable?: boolean }>("/api/studio/document", access, signal);
    active();
    let next = loaded.document ? checkedDocument(loaded.document) : null;
    let durablePrepared = false;
    if (loaded.durable && (!next?.preparationComplete || options.repairOutputs || options.repairLayerIds?.length)) {
      const ticket = await jobRequest<unknown>("/api/studio/prepare", {
        ...access, formatName: labels.formatName, sourceName: labels.sourceName,
        ...(options.repairLayerIds?.length ? { repairLayerIds: options.repairLayerIds } : {}),
        ...(options.repairOutputs ? { repairOutputs: true } : {}),
        ...(options.newAttempt ? { newAttempt: true } : {}),
      }, signal);
      if (isAiJobTicket(ticket)) {
        options.job?.(ticket);
        rememberAiJob(`studio:${access.sessionId}:${access.asset.requestId}`, ticket);
        const result = await followAiJob<{ document: StudioDocument }>(ticket, (snapshot) => {
          if (snapshot.preparation) progress(snapshot.preparation);
          if (["analyzing", "extracting", "background", "composition"].includes(snapshot.phase)) stage = snapshot.phase as StudioStage;
        }, signal);
        next = checkedDocument(result.document);
        durablePrepared = true;
      }
    }
    if (!next) {
      // Callers can pass a full launch context despite the narrower TypeScript
      // type. Select the API fields explicitly so strict server validation
      // never receives its top-level canvas dimensions or other launch data.
      const result = await postJson<{ document: StudioDocument }>("/api/studio/analyze", {
        ...access, formatName: labels.formatName, sourceName: labels.sourceName,
      }, signal);
      active(); next = checkedDocument(result.document);
    }
    callbacks.document(next);
    const preparationId = next.preparationId!;
    const payload = { ...access, preparationId };
    const editable = next.layers.filter((layer) => layer.type !== "background");
    progress({ analyzing: "complete", totalLayers: editable.length,
      extracting: next.preparationComplete ? "complete" : "working", completedLayers: next.preparationComplete ? editable.length : 0 });
    if (!next.preparationComplete) {
      stage = "extracting";
      let completed = 0;
      const current = new Set<string>();
      // Keep all results so a provider/storage failure isn't swallowed and the
      // successful selections remain reusable after the failed attempt.
      const failures = await mapWithConcurrency(editable, 3, async (layer): Promise<StudioFailure | null> => {
        active(); current.add(layer.name);
        callbacks.layer(layer.id, { status: "extracting", error: undefined });
        progress({ currentLayers: [...current] });
        try {
          const result = await postJson<{ preparationId: string; layerId: string; layer: StudioLayer }>("/api/studio/extract",
            { ...payload, layerId: layer.id, repair: options.repairLayerIds?.includes(layer.id) ?? false }, signal);
          active();
          if (result.preparationId !== preparationId || result.layerId !== layer.id) throw new ApiClientError(
            "Studio preparation has changed. Reload the latest preparation to continue.", "STUDIO_PREPARATION_CHANGED", true,
            { stage, recovery: "retry-preparation" },
          );
          const prepared = StudioLayerSchema.parse(result.layer);
          callbacks.layer(layer.id, { ...prepared, status: "complete", error: undefined });
          progress({ completedLayers: ++completed });
          return null;
        } catch (error) {
          active();
          const failure = clientStudioFailure(error, "extracting");
          failure.layerIds ??= [layer.id];
          callbacks.layer(layer.id, { status: "error", error: failure.message.slice(0, 300) });
          return failure;
        } finally {
          current.delete(layer.name);
          if (!signal.aborted) progress({ currentLayers: [...current] });
        }
      });
      const failed = failures.filter((failure): failure is StudioFailure => failure !== null);
      if (failed.length) {
        const first = failed.find((failure) => failure.recovery === "reload" || failure.code === "STUDIO_PREPARATION_CHANGED") ?? failed[0];
        throw new ApiClientError(first.message, first.code, first.retryable, { ...first, layerIds: failed.flatMap((failure) => failure.layerIds ?? []) });
      }
      progress({ extracting: "complete" });
    }
    if (!durablePrepared && (!next.preparationComplete || options.repairOutputs)) {
      stage = "background";
      progress({ background: "working" });
      next = checkedDocument(await streamStudioBackground(payload, (event) => {
        active();
        if (event.type === "stage") { stage = event.stage; progress({ [event.stage]: event.status }); }
      }, signal));
      active(); callbacks.document(next);
    }
    stage = "composition";
    if (!next.preparationComplete || next.layers.some((layer) => layer.status !== "complete")) {
      throw new ApiClientError("Studio has not verified every editable element yet. Retry preparation.", "STUDIO_FAILED", true,
        { stage, recovery: "retry-preparation" });
    }
    progress({ background: "complete", composition: "working" });
    const imageFailures = await mapWithConcurrency(next.layers, 3, async (layer) => {
      try { await callbacks.image(layer.id, preparationId, signal); active(); return null; }
      catch (error) {
        active();
        const failure = clientStudioFailure(error, "composition");
        failure.layerIds ??= [layer.id];
        if (failure.code !== "STUDIO_ARTIFACT_MISSING" && failure.recovery === "retry-preparation") failure.recovery = "retry-loading";
        return failure;
      }
    });
    const failure = imageFailures.find((candidate) => candidate !== null);
    if (failure) throw new ApiClientError(failure.message, failure.code, failure.retryable, failure);
    active();
    progress({ composition: "complete", completedLayers: editable.length });
    return next;
  } catch (error) {
    if (signal.aborted) throw error;
    const failure = clientStudioFailure(error, stage);
    throw new ApiClientError(failure.message, failure.code, failure.retryable, failure);
  }
}

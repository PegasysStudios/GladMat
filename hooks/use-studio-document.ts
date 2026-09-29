"use client";
import { cancelAiJob } from "@/lib/ai-job-client";
import type { AiJobTicket } from "@/lib/ai-jobs";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError, postImageBlob, putJson } from "@/lib/api-client";
import { STUDIO_REFERENCE_DEFAULT_OPACITY, STUDIO_REFERENCE_LAYER_ID } from "@/lib/studio-reference";
import { readStudioLaunchContext, type StudioLaunchContext } from "@/lib/studio-access";
import { prepareStudioCanvas, clientStudioFailure } from "@/lib/studio-preparation-client";
import { STUDIO_API_VERSION, INITIAL_STUDIO_PREPARATION, failStudioPreparation, type StudioFailure } from "@/lib/studio-protocol";
import {
  moveStudioLayerToEdge,
  normalizeStudioTransform,
  removeStudioLayer,
  reorderStudioLayers,
  toggleStudioLayerVisibility,
  type StudioDocument,
  type StudioLayer,
} from "@/lib/studio";

type StudioPhase = "loading" | "preparing" | "ready" | "error";

export function useStudioDocument(sessionId: string, assetId: string) {
  const jobRef = useRef<AiJobTicket | null>(null);
  const [durableJob, setDurableJob] = useState(false);
  const [launch, setLaunch] = useState<StudioLaunchContext | null>(null);
  const [document, setDocument] = useState<StudioDocument | null>(null);
  const [phase, setPhase] = useState<StudioPhase>("loading");
  const [preparation, setPreparation] = useState(INITIAL_STUDIO_PREPARATION);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [layerImages, setLayerImages] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<StudioFailure | null>(null);
  const failureRef = useRef<StudioFailure | null>(null);
  const error = failure?.message ?? null;
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [revision, setRevision] = useState(0);
  const [referenceVisible, setReferenceVisible] = useState(false);
  const [referenceOpacity, setReferenceOpacity] = useState(STUDIO_REFERENCE_DEFAULT_OPACITY);

  const documentRef = useRef<StudioDocument | null>(null);
  const launchRef = useRef<StudioLaunchContext | null>(null);
  const imageUrlsRef = useRef<Record<string, string>>({});
  const controllerRef = useRef<AbortController | null>(null);
  const disposedRef = useRef(false);
  const preparingRef = useRef(false);
  const revisionRef = useRef(0);
  const lastSavedRevisionRef = useRef(0);
  const saveChainRef = useRef(Promise.resolve());

  const asset = useMemo(() => (
    launch ? { requestId: assetId, width: launch.width, height: launch.height } : null
  ), [assetId, launch]);

  const accessPayload = useCallback((context = launchRef.current) => {
    if (!context) throw new Error("Studio access is unavailable.");
    return {
      apiVersion: STUDIO_API_VERSION as typeof STUDIO_API_VERSION,
      sessionId,
      assetToken: context.assetToken,
      asset: { requestId: assetId, width: context.width, height: context.height },
    };
  }, [assetId, sessionId]);

  const acceptDocument = useCallback((next: StudioDocument, dirty = false) => {
    if (documentRef.current?.preparationId !== next.preparationId) {
      for (const url of Object.values(imageUrlsRef.current)) URL.revokeObjectURL(url);
      imageUrlsRef.current = {};
      if (!disposedRef.current) { setLayerImages({}); setSelectedLayerId(null); }
    }
    documentRef.current = next;
    if (!disposedRef.current) setDocument(next);
    if (dirty) {
      revisionRef.current += 1;
      if (!disposedRef.current) setRevision(revisionRef.current);
    }
  }, []);

  const changeDocument = useCallback((updater: (current: StudioDocument) => StudioDocument) => {
    const current = documentRef.current;
    if (!current) return;
    acceptDocument({ ...updater(current), updatedAt: new Date().toISOString() }, true);
  }, [acceptDocument]);

  const loadLayerImage = useCallback(async (layerId: string, preparationId: string, signal: AbortSignal) => {
    signal.throwIfAborted();
    if (imageUrlsRef.current[layerId]) return;
    const blob = await postImageBlob("/api/studio/image", { ...accessPayload(), preparationId, layerId }, signal);
    signal.throwIfAborted();
    if (!blob.type.startsWith("image/")) throw new Error("Studio returned an invalid layer image. Retry loading the canvas.");
    const bitmap = await createImageBitmap(blob);
    bitmap.close();
    signal.throwIfAborted();
    if (documentRef.current?.preparationId !== preparationId) throw new ApiClientError(
      "Studio preparation has changed. Reload the latest preparation to continue.", "STUDIO_PREPARATION_CHANGED", true,
      { stage: "composition", recovery: "retry-preparation" },
    );
    const nextUrl = URL.createObjectURL(blob);
    imageUrlsRef.current = { ...imageUrlsRef.current, [layerId]: nextUrl };
    if (!disposedRef.current) setLayerImages(imageUrlsRef.current);
  }, [accessPayload]);

  const markLayer = useCallback((layerId: string, update: Partial<StudioLayer>) => {
    changeDocument((current) => ({
      ...current,
      layers: current.layers.map((layer) => (
        layer.id === layerId ? { ...layer, ...update } : layer
      )),
    }));
  }, [changeDocument]);

  const persistRevision = useCallback((requestedRevision: number) => {
    saveChainRef.current = saveChainRef.current.then(async () => {
      if (requestedRevision <= lastSavedRevisionRef.current) return;
      const context = launchRef.current;
      const current = documentRef.current;
      if (!context || !current) return;
      if (!disposedRef.current) setSaveStatus("saving");
      try {
        const targetRevision = revisionRef.current;
        const targetDocument = documentRef.current;
        if (!targetDocument) return;
        await putJson<{ document: StudioDocument }>("/api/studio/document", {
          ...accessPayload(context),
          preparationId: targetDocument.preparationId,
          document: targetDocument,
        });
        lastSavedRevisionRef.current = targetRevision;
        if (!disposedRef.current) {
          setSaveStatus(targetRevision === revisionRef.current ? "saved" : "saving");
        }
      } catch {
        if (!disposedRef.current) setSaveStatus("error");
      }
    });
    return saveChainRef.current;
  }, [accessPayload]);

  const prepare = useCallback(async (context: StudioLaunchContext) => {
    if (preparingRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    preparingRef.current = true;
    const previousFailure = failureRef.current;
    setFailure(null);
    setPhase("preparing");
    try {
      const next = await prepareStudioCanvas(accessPayload(context), {
        formatName: context.formatName, sourceName: context.sourceName,
      }, {
        document: (next) => acceptDocument(next),
        layer: markLayer,
        progress: (update) => setPreparation((current) => ({ ...current, ...update })),
        image: loadLayerImage,
      }, { signal: controller.signal,
        newAttempt: previousFailure?.code === "AI_SUBMISSION_UNKNOWN",
        job: (ticket) => { jobRef.current = ticket; setDurableJob(true); },
        repairLayerIds: previousFailure?.code === "STUDIO_SELECTION_INVALID" ? previousFailure.layerIds : undefined,
        repairOutputs: previousFailure?.code === "STUDIO_ARTIFACT_MISSING",
      });
      controller.signal.throwIfAborted();
      // Comparison overlay is optional and cannot hold up a verified canvas.
      try { await loadLayerImage(STUDIO_REFERENCE_LAYER_ID, next.preparationId!, controller.signal); } catch { /* Optional reference. */ }
      controller.signal.throwIfAborted();
      failureRef.current = null;
      lastSavedRevisionRef.current = revisionRef.current;
      if (!disposedRef.current) setPhase("ready");
    } catch (caught) {
      if (!disposedRef.current && !controller.signal.aborted) {
        const failure = clientStudioFailure(caught, "analyzing");
        failureRef.current = failure;
        setFailure(failure);
        setPreparation((current) => failStudioPreparation(current, failure));
        setPhase("error");
      }
    } finally {
      if (controllerRef.current === controller) preparingRef.current = false;
    }
  }, [acceptDocument, accessPayload, markLayer, loadLayerImage]);

  useEffect(() => {
    disposedRef.current = false;
    const context = readStudioLaunchContext(sessionId, assetId);
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!context) {
        const failure: StudioFailure = { code: "UNAUTHORIZED_SESSION", message: "Studio access is missing. Return to GladMat and open this asset again.",
          retryable: false, stage: "analyzing", recovery: "reopen" };
        failureRef.current = failure;
        setFailure(failure);
        setPreparation((current) => failStudioPreparation(current, failure));
        setPhase("error");
        return;
      }
      launchRef.current = context;
      setLaunch(context);
      void prepare(context);
    });
    return () => {
      cancelled = true;
      disposedRef.current = true;
      controllerRef.current?.abort();
      controllerRef.current = null;
      preparingRef.current = false;
    };
  }, [assetId, prepare, sessionId]);

  useEffect(() => () => {
    for (const url of Object.values(imageUrlsRef.current)) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    if (!revision || phase !== "ready") return;
    const timer = window.setTimeout(() => void persistRevision(revision), 750);
    return () => window.clearTimeout(timer);
  }, [persistRevision, phase, revision]);

  const selectedLayer = document?.layers.find((layer) => layer.id === selectedLayerId) ?? null;

  const moveLayer = useCallback((layerId: string, x: number, y: number) => {
    markLayer(layerId, { x, y });
  }, [markLayer]);

  const transformLayer = useCallback((
    layerId: string,
    transform: { x: number; y: number; scaleX: number; scaleY: number },
  ) => {
    changeDocument((current) => ({
      ...current,
      layers: current.layers.map((layer) => (
        layer.id === layerId ? normalizeStudioTransform(layer, transform) : layer
      )),
    }));
  }, [changeDocument]);

  const updateLayerPosition = useCallback((layerId: string, axis: "x" | "y", value: number) => {
    if (!Number.isFinite(value)) return;
    markLayer(layerId, { [axis]: value });
  }, [markLayer]);

  const toggleVisibility = useCallback((layerId: string) => {
    changeDocument((current) => ({
      ...current,
      layers: toggleStudioLayerVisibility(current.layers, layerId),
    }));
  }, [changeDocument]);

  const removeLayer = useCallback((layerId: string) => {
    const target = documentRef.current?.layers.find((layer) => layer.id === layerId);
    if (!target || target.locked) return;
    changeDocument((current) => ({
      ...current,
      layers: removeStudioLayer(current.layers, layerId),
    }));
    if (selectedLayerId === layerId) setSelectedLayerId(null);
  }, [changeDocument, selectedLayerId]);

  const reorderLayers = useCallback((activeId: string, overId: string) => {
    changeDocument((current) => ({
      ...current,
      layers: reorderStudioLayers(current.layers, activeId, overId),
    }));
  }, [changeDocument]);

  const moveLayerToEdge = useCallback((layerId: string, edge: "front" | "back") => {
    changeDocument((current) => ({
      ...current,
      layers: moveStudioLayerToEdge(current.layers, layerId, edge),
    }));
  }, [changeDocument]);

  const retryLayer = useCallback(async (layerId: string) => {
    const layer = documentRef.current?.layers.find((candidate) => candidate.id === layerId);
    if (!layer || layer.locked) return;
    const context = launchRef.current;
    if (context) await prepare(context);
  }, [prepare]);

  const retryPreparation = useCallback(() => {
    const context = launchRef.current;
    if (context) void prepare(context);
  }, [prepare]);

  const saveNow = useCallback(() => persistRevision(revisionRef.current), [persistRevision]);

  const cancelPreparation = useCallback(async () => {
    const ticket = jobRef.current;
    if (!ticket) return;
    await cancelAiJob(ticket);
    controllerRef.current?.abort();
    const cancelled: StudioFailure = { code: "JOB_CANCELLED", message: "Studio preparation was cancelled. Return to GladMat to start again.", retryable: false, stage: "analyzing", recovery: "reopen" };
    failureRef.current = cancelled; setFailure(cancelled); setPhase("error");
    setPreparation((current) => failStudioPreparation(current, cancelled));
  }, []);
  return {
    durableJob,
    cancelPreparation,
    asset,
    document,
    error,
    failure,
    layerImages,
    launch,
    phase,
    preparation,
    referenceOpacity,
    referenceVisible,
    saveStatus,
    selectedLayer,
    selectedLayerId,
    moveLayer,
    moveLayerToEdge,
    removeLayer,
    reorderLayers,
    retryLayer,
    retryPreparation,
    saveNow,
    selectLayer: setSelectedLayerId,
    setReferenceOpacity,
    setReferenceVisible,
    toggleVisibility,
    transformLayer,
    updateLayerPosition,
  };
}

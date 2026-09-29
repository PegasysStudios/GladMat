"use client";
import { cancelAiJob, savedAiJobs } from "@/lib/ai-job-client";

import { useCallback, useEffect, useRef, useState } from "react";
import { streamGeneration } from "@/lib/api-client";
import type { AdSize, GenerationJob, SourceAsset } from "@/lib/types";

const GENERATION_CONCURRENCY = 2;
const PENDING_GENERATIONS_KEY = "gladmat.pending-generation-contexts.v1";

type GenerationContext = {
  source: SourceAsset;
  correctedText: string[];
  additionalInstructions: string;
  regenerationInstructions?: string;
};

type QueueItem = {
  job: GenerationJob;
  context: GenerationContext;
  runVersion: number;
};

export function useGenerationQueue() {
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  const activeRef = useRef(0);
  const runVersionRef = useRef(0);
  const controllersRef = useRef(new Map<string, AbortController>());
  const contextsRef = useRef(new Map<string, GenerationContext>());
  const pumpRef = useRef<() => void>(() => undefined);

  const updateJob = useCallback((requestId: string, update: Partial<GenerationJob>) => {
    setJobs((current) => current.map((job) => (
      job.requestId === requestId ? { ...job, ...update } : job
    )));
  }, []);

  const runItem = useCallback(async (item: QueueItem) => {
    const { job, context, runVersion } = item;
    if (runVersion !== runVersionRef.current) return;
    const controller = new AbortController();
    controllersRef.current.set(job.requestId, controller);

    try {
      await streamGeneration(
        {
          sessionId: context.source.sessionId,
          sessionToken: context.source.sessionToken,
          sourcePath: context.source.sourcePath,
          requestId: job.requestId,
          width: job.size.width,
          height: job.size.height,
          formatName: job.size.name,
          correctedText: context.correctedText,
          additionalInstructions: context.additionalInstructions,
          ...(context.regenerationInstructions
            ? { regenerationInstructions: context.regenerationInstructions }
            : {}),
        },
        (event) => {
          if (runVersion !== runVersionRef.current) return;
          if (event.type === "status") {
            updateJob(job.requestId, { status: event.status, attempts: event.attempt });
          } else if (event.type === "complete") {
            updateJob(job.requestId, {
              status: "complete",
              assetToken: event.asset.assetToken,
              previewUrl: event.asset.previewUrl,
              needsReview: event.asset.needsReview,
              validationIssues: event.asset.validationIssues,
              attempts: event.asset.attempts,
              fineTuneAvailable: event.asset.fineTuneAvailable,
              error: undefined,
            });
          }
        },
        controller.signal,
      );
    } catch (caught) {
      if (runVersion !== runVersionRef.current || controller.signal.aborted) return;
      updateJob(job.requestId, {
        status: "error",
        error: caught instanceof Error ? caught.message : "Generation failed. Please retry this size.",
      });
    } finally {
      controllersRef.current.delete(job.requestId);
    }
  }, [updateJob]);

  const pump = useCallback(() => {
    while (activeRef.current < GENERATION_CONCURRENCY && queueRef.current.length) {
      const item = queueRef.current.shift();
      if (!item) return;
      activeRef.current += 1;
      void runItem(item).finally(() => {
        activeRef.current -= 1;
        pumpRef.current();
      });
    }
  }, [runItem]);

  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  const reset = useCallback(() => {
    runVersionRef.current += 1;
    queueRef.current = [];
    for (const controller of controllersRef.current.values()) controller.abort();
    controllersRef.current.clear();
    contextsRef.current.clear();
    setJobs([]);
    try { localStorage.removeItem(PENDING_GENERATIONS_KEY); } catch { /* Optional persistence. */ }
  }, []);

  const generateAll = useCallback((sizes: AdSize[], context: GenerationContext) => {
    reset();
    const runVersion = runVersionRef.current;
    const nextJobs = sizes.map<GenerationJob>((size) => ({
      size,
      status: "queued",
      requestId: crypto.randomUUID(),
    }));
    setJobs(nextJobs);
    contextsRef.current = new Map(nextJobs.map((job) => [job.requestId, {
      ...context,
      correctedText: [...context.correctedText],
    }]));
    try { localStorage.setItem(PENDING_GENERATIONS_KEY, JSON.stringify(nextJobs.map((job) => ({ job, context })))); } catch { /* Optional persistence. */ }
    queueRef.current = nextJobs.map((job) => ({ job, context, runVersion }));
    queueMicrotask(() => pumpRef.current());
  }, [reset]);

  const regenerate = useCallback((
    existing: GenerationJob,
    regenerationInstructions: string,
  ) => {
    const originalContext = contextsRef.current.get(existing.requestId);
    if (!originalContext) return;
    const job: GenerationJob = {
      size: existing.size,
      status: "queued",
      requestId: crypto.randomUUID(),
      previewUrl: existing.previewUrl,
    };
    setJobs((current) => current.map((candidate) => (
      candidate.size.id === existing.size.id ? job : candidate
    )));
    const context = {
      ...originalContext,
      regenerationInstructions: regenerationInstructions.trim(),
    };
    contextsRef.current.set(job.requestId, context);
    try {
      const pending = JSON.parse(localStorage.getItem(PENDING_GENERATIONS_KEY) ?? "[]") as Array<{ job: GenerationJob; context: GenerationContext }>;
      localStorage.setItem(PENDING_GENERATIONS_KEY, JSON.stringify([...pending.filter((item) => item.job.size.id !== job.size.id), { job, context }]));
    } catch { /* Optional persistence. */ }
    queueRef.current.push({
      job,
      context,
      runVersion: runVersionRef.current,
    });
    queueMicrotask(() => pumpRef.current());
  }, []);

  const setPreviewUrl = useCallback((requestId: string, previewUrl: string) => {
    updateJob(requestId, { previewUrl });
  }, [updateJob]);

  const restorePending = useCallback(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PENDING_GENERATIONS_KEY) ?? "[]") as Array<{ job: GenerationJob; context: GenerationContext }>;
      if (!Array.isArray(saved) || !saved.length || !saved.every((item) => item.job?.requestId && item.context?.source?.sessionId)) return;
      const runVersion = runVersionRef.current;
      setJobs(saved.map((item) => item.job));
      contextsRef.current = new Map(saved.map((item) => [item.job.requestId, item.context]));
      queueRef.current = saved.map((item) => ({ ...item, runVersion }));
      queueMicrotask(() => pumpRef.current());
    } catch { /* Ignore invalid browser state. */ }
  }, []);
  const cancelPending = useCallback(async () => {
    const ids = new Set(jobs.filter((job) => ["queued", "generating", "processing"].includes(job.status)).map((job) => `generation:${job.requestId}`));
    await Promise.all(savedAiJobs().filter((saved) => ids.has(saved.scope)).map((saved) => cancelAiJob(saved.ticket)));
    queueRef.current = [];
    for (const controller of controllersRef.current.values()) controller.abort();
    setJobs((current) => current.map((job) => ids.has(`generation:${job.requestId}`) ? { ...job, status: "error", error: "Generation was cancelled. Start a new attempt when ready." } : job));
  }, [jobs]);
  return { jobs, generateAll, regenerate, reset, setPreviewUrl, restorePending, cancelPending };
}

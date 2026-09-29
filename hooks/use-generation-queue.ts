"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { streamGeneration } from "@/lib/api-client";
import type { AdSize, GenerationJob, SourceAsset } from "@/lib/types";

const GENERATION_CONCURRENCY = 2;

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

  return { jobs, generateAll, regenerate, reset, setPreviewUrl };
}

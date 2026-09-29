"use client";
import { followAiJob, jobRequest, rememberAiJob } from "@/lib/ai-job-client";
import { isAiJobTicket } from "@/lib/ai-jobs";

import type { GenerationStatus } from "@/lib/types";
import type { StudioDocument } from "@/lib/studio";
import type { StudioBackgroundEvent, StudioErrorDetails, StudioStage } from "@/lib/studio-protocol";

type ErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
    requestId?: string;
    stage?: StudioErrorDetails["stage"];
    recovery?: StudioErrorDetails["recovery"];
    layerIds?: string[];
  };
};

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code = "REQUEST_FAILED",
    public readonly retryable = false,
    public readonly details: StudioErrorDetails & { requestId?: string } = {},
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function readError(response: Response) {
  let body: ErrorEnvelope | undefined;
  try {
    body = (await response.json()) as ErrorEnvelope;
  } catch {
    // The stable fallback below is safer than returning an upstream HTML error page.
  }
  return new ApiClientError(
    body?.error?.message || "The request could not be completed. Please try again.",
    body?.error?.code,
    body?.error?.retryable,
    body?.error,
  );
}

export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  if (url === "/api/analyze") {
    const ticket = await jobRequest<unknown>("/api/jobs/start", { apiVersion: 1, kind: "analysis", input: body }, signal);
    if (isAiJobTicket(ticket)) {
      const source = body as { sessionId: string };
      rememberAiJob(`analysis:${source.sessionId}`, ticket);
      return followAiJob<T>(ticket, undefined, signal);
    }
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw await readError(response);
  return (await response.json()) as T;
}

export async function putJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await readError(response);
  return (await response.json()) as T;
}

export async function postImageBlob(url: string, body: unknown, signal?: AbortSignal) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw await readError(response);
  return response.blob();
}

export async function streamStudioBackground(
  payload: { preparationId: string },
  onEvent: (event: StudioBackgroundEvent) => void,
  signal?: AbortSignal,
): Promise<StudioDocument> {
  let stage: StudioStage = "background";
  const interrupted = () => new ApiClientError(
    "The Studio connection ended before preparation finished. Retry preparation to resume saved work.",
    "STUDIO_STREAM_INTERRUPTED", true, { stage, recovery: "retry-preparation" },
  );
  const response = await fetch("/api/studio/background", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal,
  });
  if (!response.ok) throw await readError(response);
  if (!response.body) throw interrupted();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  function consume(line: string) {
    if (!line.trim()) return;
    const event = JSON.parse(line) as StudioBackgroundEvent;
    if (event.preparationId !== payload.preparationId) throw new ApiClientError(
      "Studio preparation has changed. Reload the latest preparation to continue.", "STUDIO_PREPARATION_CHANGED", true,
      { stage, recovery: "retry-preparation" },
    );
    if (event.type === "error") throw new ApiClientError(event.error.message, event.error.code, event.error.retryable, event.error);
    if (event.type === "stage") {
      if (!["background", "composition"].includes(event.stage) || !["working", "complete"].includes(event.status)) throw interrupted();
      stage = event.stage;
    } else if (event.type !== "complete" || event.document.preparationId !== payload.preparationId) throw interrupted();
    onEvent(event);
    return event.type === "complete" ? event.document : undefined;
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const document = consume(line);
        if (document) return document;
      }
      if (done) break;
    }
    if (pending) {
      const document = consume(pending);
      if (document) return document;
    }
    throw interrupted();
  } catch (error) {
    if (error instanceof ApiClientError || signal?.aborted) throw error;
    throw interrupted();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

type GenerationEvent =
  | { type: "status"; status: Extract<GenerationStatus, "generating" | "processing">; attempt: number }
  | {
      type: "complete";
      asset: {
        requestId: string;
        assetToken: string;
        previewUrl: string;
        width: number;
        height: number;
        needsReview: boolean;
        validationIssues: string[];
        attempts: number;
        fineTuneAvailable: boolean;
      };
    }
  | { type: "error"; error: { code: string; message: string; retryable: boolean } };

export async function streamGeneration(
  payload: unknown,
  onEvent: (event: GenerationEvent) => void,
  signal?: AbortSignal,
) {
  const ticket = await jobRequest<unknown>("/api/jobs/start", { apiVersion: 1, kind: "generation", input: payload }, signal);
  if (isAiJobTicket(ticket)) {
    const input = payload as { requestId: string };
    rememberAiJob(`generation:${input.requestId}`, ticket);
    const result = await followAiJob<{ asset: Extract<GenerationEvent, { type: "complete" }>["asset"] }>(ticket, (snapshot) => {
      onEvent({ type: "status", status: snapshot.phase === "processing" ? "processing" : "generating", attempt: snapshot.attempt });
    }, signal);
    onEvent({ type: "complete", asset: result.asset });
    return;
  }
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) throw await readError(response);
  if (!response.body) throw new ApiClientError("The generation stream did not start.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let completed = false;

  function consume(line: string) {
    if (!line.trim()) return;
    const event = JSON.parse(line) as GenerationEvent;
    if (event.type === "error") {
      throw new ApiClientError(event.error.message, event.error.code, event.error.retryable);
    }
    if (event.type === "complete") completed = true;
    onEvent(event);
  }

  while (true) {
    const { value, done } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) consume(line);
    if (done) break;
  }
  if (pending) consume(pending);
  if (!completed) throw new ApiClientError("Generation ended before an image was returned.");
}

export function triggerBrowserDownload(url: string, filename?: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  if (filename) anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

"use client";

import type { GenerationStatus } from "@/lib/types";

type ErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
    requestId?: string;
  };
};

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code = "REQUEST_FAILED",
    public readonly retryable = false,
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
  );
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await readError(response);
  return (await response.json()) as T;
}

type GenerationEvent =
  | { type: "status"; status: Extract<GenerationStatus, "generating" | "processing">; attempt: number }
  | {
      type: "complete";
      asset: {
        requestId: string;
        previewUrl: string;
        width: number;
        height: number;
        needsReview: boolean;
        validationIssues: string[];
        attempts: number;
      };
    }
  | { type: "error"; error: { code: string; message: string; retryable: boolean } };

export async function streamGeneration(
  payload: unknown,
  onEvent: (event: GenerationEvent) => void,
  signal?: AbortSignal,
) {
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

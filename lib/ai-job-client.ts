"use client";
import { ApiClientError } from "@/lib/api-client";
import { isAiJobTicket, type AiJobTicket, type AiJobSnapshot } from "@/lib/ai-jobs";

const STORAGE_KEY = "gladmat.ai-jobs.v1";
type SavedJob = { scope: string; ticket: AiJobTicket; savedAt: number };
export function savedAiJobs(): SavedJob[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item) => item && typeof item.scope === "string" && isAiJobTicket(item.ticket) && item.savedAt > Date.now() - 7 * 86400_000) : [];
  } catch { return []; }
}
export function rememberAiJob(scope: string, ticket: AiJobTicket) {
  try {
    const jobs = savedAiJobs().filter((item) => item.scope !== scope);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...jobs, { scope, ticket, savedAt: Date.now() }].slice(-100)));
    window.dispatchEvent(new Event("gladmat-ai-jobs"));
  } catch { /* Storage restrictions cannot cancel accepted work. */ }
}
export async function jobRequest<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const data = await response.json();
  if (!response.ok) throw new ApiClientError(data.error?.message ?? "Could not reach the background job. Retry to reconnect.", data.error?.code, data.error?.retryable ?? true, data.error);
  return data as T;
}
export function waitForJobPoll(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
export async function followAiJob<T>(ticket: AiJobTicket, onProgress: (snapshot: AiJobSnapshot) => void = () => {}, signal?: AbortSignal): Promise<T> {
  while (true) {
    signal?.throwIfAborted();
    const snapshot = await jobRequest<AiJobSnapshot>("/api/jobs/status", { jobId: ticket.jobId, jobToken: ticket.jobToken }, signal);
    if (snapshot.jobToken) ticket = snapshot;
    onProgress(snapshot);
    if (snapshot.status === "complete") return snapshot.result as T;
    if (snapshot.status === "error") throw new ApiClientError(snapshot.error?.message ?? "The background job failed. Retry to resume saved work.", snapshot.error?.code, snapshot.error?.retryable ?? true, snapshot.error);
    if (snapshot.status === "cancelled") throw new ApiClientError("This background job was cancelled. Start another request when ready.", "JOB_CANCELLED", false, { stage: snapshot.error?.stage });
    await waitForJobPoll(typeof document !== "undefined" && document.hidden ? 10_000 : 3_000, signal);
  }
}
export async function cancelAiJob(ticket: AiJobTicket) { return jobRequest<AiJobSnapshot>("/api/jobs/cancel", { jobId: ticket.jobId, jobToken: ticket.jobToken }); }
export async function retryAiJob(ticket: AiJobTicket, newAttempt = false) { return jobRequest<AiJobSnapshot>("/api/jobs/retry", { jobId: ticket.jobId, jobToken: ticket.jobToken, ...(newAttempt ? { newAttempt: true } : {}) }); }

import type { StudioFailure, StudioPreparationState } from "@/lib/studio-protocol";

export type AiJobKind = "analysis" | "generation" | "studio";
export type AiJobStatus = "queued" | "running" | "complete" | "error" | "cancelled";
export type AiJobTicket = { jobId: string; jobToken: string; status: AiJobStatus };
export type AiJobSnapshot = AiJobTicket & {
  kind: AiJobKind;
  phase: string;
  attempt: number;
  preparation?: StudioPreparationState;
  preparationId?: string;
  result?: unknown;
  error?: StudioFailure;
};
export function providerPollDelay(elapsedMs: number) {
  return elapsedMs < 120_000 ? 15_000 : elapsedMs < 600_000 ? 30_000 : 60_000;
}
export function isAiJobTicket(value: unknown): value is AiJobTicket {
  return !!value && typeof value === "object" && "jobId" in value && typeof value.jobId === "string"
    && "jobToken" in value && typeof value.jobToken === "string";
}

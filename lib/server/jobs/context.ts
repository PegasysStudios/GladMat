import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

export type JobExecution = { jobId: string; revision: number; scope: string; callIndex: number; pending: boolean;
  guard: () => Promise<void>; phase: (phase: string, attempt?: number) => Promise<void> };
export const jobExecution = new AsyncLocalStorage<JobExecution>();
// These are control flow, never a failed AI review or a correction opportunity.
export class AiBoundary extends Error {
  constructor(public readonly stepKey: string) { super("Durable AI boundary"); }
}
export class JobStopped extends Error {}
export function rethrowJobControl(error: unknown) {
  if (error instanceof AiBoundary || error instanceof JobStopped
    || (error && typeof error === "object" && "code" in error && error.code === "AI_SUBMISSION_UNKNOWN")) throw error;
}
export async function guardJobWrite() {
  const context = jobExecution.getStore();
  if (context) {
    if (context.pending) throw new JobStopped("This processing step is waiting for AI.");
    await context.guard();
  }
}

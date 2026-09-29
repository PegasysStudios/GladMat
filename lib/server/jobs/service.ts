import "server-only";
import { start } from "workflow/api";
import { aiJobWorkflow } from "@/lib/workflows/ai-job";
import type { AiJobKind, AiJobSnapshot } from "@/lib/ai-jobs";
import { AppError } from "@/lib/server/errors";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { mintJobToken, assertJobToken } from "./token";
import { ensureJob, readJob, updateJob, checkDb, type JobRow } from "./store";
import { backgroundClient } from "./provider";

async function dispatch(job: JobRow) {
  if (job.status !== "queued" || job.run_id) return;
  // claim_ai_job elects one owner if a connection retry dispatched twice.
  await start(aiJobWorkflow, [job.id, job.revision]);
}
export function jobSnapshot(job: JobRow): AiJobSnapshot {
  return { jobId: job.id, jobToken: mintJobToken(job.id), status: job.status, kind: job.kind, phase: job.phase,
    attempt: job.attempt, ...(job.progress ? { preparation: job.progress } : {}),
    ...(job.preparation_id ? { preparationId: job.preparation_id } : {}),
    ...(job.status === "complete" ? { result: job.result } : {}), ...(job.error ? { error: job.error } : {}) };
}
async function restartTerminal(job: JobRow, allowUnknown: boolean) {
  const { data, error } = await getSupabaseAdmin().rpc("restart_ai_job", { p_job_id: job.id, p_allow_unknown: allowUnknown });
  checkDb(error);
  return readJob(data as string);
}
export async function startJob(kind: AiJobKind, sessionId: string, key: string, input: Record<string, unknown>, newAttempt = false) {
  let job = await ensureJob(kind, sessionId, key, input);
  if (job.status === "cancelled" || (newAttempt && job.status === "error" && job.error?.code === "AI_SUBMISSION_UNKNOWN")) {
    job = await restartTerminal(job, newAttempt);
  }
  // Reopening/retrying a failed job resumes it. Completed and active jobs attach.
  if (job.status === "error" && job.error?.retryable) {
    await resume(job);
    job = await readJob(job.id);
  }
  await dispatch(job);
  return jobSnapshot(job);
}
async function resume(job: JobRow) {
  // Completed checkpoints are immutable. Retry only confirmed failed calls;
  // submitting rows are protected by the migration's atomic resume guard.
  const { error: resetError } = await getSupabaseAdmin().from("ai_job_steps").update({ status: "requested", response_id: null, result_path: null, error: null })
    .eq("job_id", job.id).eq("status", "error");
  checkDb(resetError);
  const { error } = await getSupabaseAdmin().rpc("resume_ai_job", { p_job_id: job.id });
  if (error?.code === "P0001") throw new AppError("AI_SUBMISSION_UNKNOWN", "AI submission may have been accepted. It was not repeated. Start a new request only if you want another attempt.", 409, false);
  checkDb(error);
}
export async function statusJob(jobId: string, jobToken: string) {
  assertJobToken(jobId, jobToken);
  const job = await readJob(jobId);
  // Recover a lost dispatch acknowledgement without relying on the browser
  // to execute AI. Atomic ownership makes duplicate dispatch harmless.
  await dispatch(job);
  return jobSnapshot(job);
}
export async function retryJob(jobId: string, jobToken: string, newAttempt = false) {
  assertJobToken(jobId, jobToken);
  const job = await readJob(jobId);
  if (job.status === "cancelled" || (newAttempt && job.status === "error" && job.error?.code === "AI_SUBMISSION_UNKNOWN")) {
    const restarted = await restartTerminal(job, newAttempt);
    await dispatch(restarted);
    return jobSnapshot(restarted);
  }
  if (job.error?.code === "AI_SUBMISSION_UNKNOWN") throw new AppError("AI_SUBMISSION_UNKNOWN", "The AI submission outcome is unknown. Choose Start new attempt if you want to issue another paid request.", 409, false);
  if (job.status === "error") await resume(job);
  const resumed = await readJob(jobId); await dispatch(resumed); return jobSnapshot(resumed);
}
export async function cancelJob(jobId: string, jobToken: string) {
  assertJobToken(jobId, jobToken);
  const job = await readJob(jobId);
  if (job.status === "complete" || job.status === "cancelled") return jobSnapshot(job);
  await updateJob(job, { status: "cancelled", revision: job.revision + 1, error: null });
  const { data, error } = await getSupabaseAdmin().from("ai_job_steps").select("response_id")
    .eq("job_id", jobId).in("status", ["polling", "submitting"]).not("response_id", "is", null);
  checkDb(error);
  const provider = backgroundClient();
  await Promise.all((data ?? []).map((step) => provider.responses.cancel(step.response_id as string).catch(() => {})));
  return jobSnapshot(await readJob(jobId));
}

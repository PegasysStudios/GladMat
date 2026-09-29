import { getWorkflowMetadata } from "workflow";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { AppError, publicError } from "@/lib/server/errors";
import { executePipeline } from "@/lib/server/jobs/pipeline";
import { submitProvider, pollProvider, finishProvider } from "@/lib/server/jobs/provider";
import { checkDb, readJob, updateJob } from "@/lib/server/jobs/store";

export async function claimJobStep(jobId: string, revision: number) {
  "use step";
  const { data, error } = await getSupabaseAdmin().rpc("claim_ai_job", { p_job_id: jobId, p_revision: revision, p_run_id: getWorkflowMetadata().workflowRunId });
  checkDb(error); return data as "claimed" | "waiting" | "stopped";
}
export async function processJobStep(jobId: string, revision: number) {
  "use step";
  return executePipeline(jobId, revision);
}
export async function submitAiStep(jobId: string, revision: number, key: string) {
  "use step";
  return submitProvider(jobId, revision, key);
}
submitAiStep.maxRetries = 0;
export async function pollAiStep(jobId: string, revision: number, key: string) {
  "use step";
  return pollProvider(jobId, revision, key);
}
export async function finishAiStep(jobId: string, revision: number, key: string) {
  "use step";
  return finishProvider(jobId, revision, key);
}
export async function failJobStep(jobId: string, revision: number, message: string) {
  "use step";
  const job = await readJob(jobId);
  if (job.revision !== revision || job.status === "cancelled" || job.status === "complete" || job.status === "error") return;
  const uncertain = /submission|submitting|outcome|confirmed response/i.test(message);
  const expired = /expired/i.test(message);
  const error = new AppError(uncertain ? "AI_SUBMISSION_UNKNOWN" : expired ? "AI_RESPONSE_EXPIRED" : "PROCESSING_FAILED",
    uncertain ? "The AI submission outcome is unknown. It was not automatically repeated. Start a new request only if you want another attempt."
      : "The background worker was interrupted. Retry to resume saved results.", 502, !uncertain,
    job.kind === "studio" ? { stage: job.phase === "queued" ? "analyzing" : job.phase as "analyzing", recovery: "retry-preparation" } : {});
  await updateJob(job, { status: "error", error: publicError(error, jobId) });
}

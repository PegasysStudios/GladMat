import "server-only";
import { createHash } from "node:crypto";
import type { AiJobKind, AiJobStatus } from "@/lib/ai-jobs";
import type { StudioFailure, StudioPreparationState } from "@/lib/studio-protocol";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { AppError } from "@/lib/server/errors";
import { JobStopped } from "./context";

export type JobRow = { id: string; kind: AiJobKind; session_id: string; operation_key: string;
  input_digest: string; input: Record<string, unknown>; status: AiJobStatus; run_id: string | null;
  revision: number; retry_scope: number; retry_scopes: Record<string, number>; phase: string; attempt: number; preparation_id: string | null;
  progress: StudioPreparationState | null; result: unknown; error: StudioFailure | null };
export type StepRow = { job_id: string; step_key: string; status: "requested" | "submitting" | "polling" | "provider_complete" | "complete" | "error";
  request_path: string; response_id: string | null; result_path: string | null; submitted_at: string | null; error: StudioFailure | null };
export function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function durableJobsEnabled() { return /^(1|true|yes)$/i.test(process.env.ENABLE_DURABLE_AI_JOBS ?? "false"); }
export function checkDb(error: { code?: string } | null) {
  if (error) {
    if (["42P01", "PGRST205", "PGRST202", "42501", "PGRST301"].includes(error.code ?? "")) {
      throw new AppError("CONFIGURATION_REQUIRED", "Durable job storage is unavailable. Apply the AI jobs migration and check the server's Supabase configuration.", 503, false, { recovery: "check-configuration" });
    }
    throw new AppError("STORAGE_FAILED", "The job checkpoint could not be reached. Retry to resume saved work.", 502, true);
  }
}
export async function readJob(id: string): Promise<JobRow> {
  const { data, error } = await getSupabaseAdmin().from("ai_jobs").select("*").eq("id", id).single();
  checkDb(error); if (!data) throw new AppError("INVALID_REQUEST", "This job could not be found. Reopen the ad.", 404);
  return data as JobRow;
}
export async function updateJob(job: Pick<JobRow, "id" | "revision">, values: Partial<JobRow>) {
  const { data, error } = await getSupabaseAdmin().from("ai_jobs").update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", job.id).eq("revision", job.revision).neq("status", "cancelled").select("id");
  checkDb(error); if (!data?.length) throw new JobStopped("Job changed or cancelled");
}
export async function guardJob(id: string, revision: number) {
  const job = await readJob(id);
  if (job.revision !== revision || job.status !== "running") throw new JobStopped("Job changed or cancelled");
  return job;
}
export async function ensureJob(kind: AiJobKind, sessionId: string, key: string, input: Record<string, unknown>) {
  const inputDigest = digest(input);
  const { error } = await getSupabaseAdmin().from("ai_jobs").upsert({ kind, session_id: sessionId, operation_key: key, input_digest: inputDigest, input },
    { onConflict: "session_id,kind,operation_key", ignoreDuplicates: true });
  checkDb(error);
  const selected = await getSupabaseAdmin().from("ai_jobs").select("*").eq("session_id", sessionId).eq("kind", kind).eq("operation_key", key).single();
  checkDb(selected.error); const job = selected.data as JobRow;
  if (job.input_digest !== inputDigest) throw new AppError("INVALID_REQUEST", "This request reference is already associated with different inputs. Start a new request.", 409);
  return job;
}
export async function readStep(jobId: string, key: string): Promise<StepRow | null> {
  const { data, error } = await getSupabaseAdmin().from("ai_job_steps").select("*").eq("job_id", jobId).eq("step_key", key).maybeSingle();
  checkDb(error); return data as StepRow | null;
}
export async function updateStep(jobId: string, key: string, values: Partial<StepRow>) {
  const { error } = await getSupabaseAdmin().from("ai_job_steps").update({ ...values, updated_at: new Date().toISOString() }).eq("job_id", jobId).eq("step_key", key);
  checkDb(error);
}
export function jobArtifact(jobId: string, key: string, name: string) { return `ai-jobs/${jobId}/${key}/${name}`; }

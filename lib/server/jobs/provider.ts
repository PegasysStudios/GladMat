import "server-only";
import OpenAI from "openai";
import type { Response, ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { getOpenAIConfig } from "@/lib/server/config";
import { AppError, normalizeError, publicError, logServerError } from "@/lib/server/errors";
import { downloadBuffer, uploadBuffer } from "@/lib/server/storage";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { checkDb, guardJob, readStep, updateStep, jobArtifact } from "./store";
import { JobStopped } from "./context";

export function backgroundClient() {
  return new OpenAI({ apiKey: getOpenAIConfig().apiKey, timeout: 60_000, maxRetries: 0 });
}
export async function submitProvider(jobId: string, revision: number, key: string) {
  await guardJob(jobId, revision);
  const step = await readStep(jobId, key);
  if (!step) throw new AppError("PROCESSING_FAILED", "The AI request checkpoint is missing. Retry preparation.", 502, true);
  if (step.status === "submitting") throw new AppError("AI_SUBMISSION_UNKNOWN", "The connection ended while submitting to AI. The request may have been accepted; it was not automatically resubmitted. Start a new request only if you want another attempt.", 502, false);
  if (step.status !== "requested") return;
  const request = JSON.parse((await downloadBuffer(step.request_path, "ASSET_NOT_FOUND")).toString()) as { body: ResponseCreateParamsNonStreaming };
  // Claim before the external side effect. A crash after acceptance leaves an
  // uncertain submission, never an automatic second charge.
  const { data, error } = await getSupabaseAdmin().from("ai_job_steps").update({ status: "submitting", submitted_at: new Date().toISOString() })
    .eq("job_id", jobId).eq("step_key", key).eq("status", "requested").select("step_key");
  checkDb(error);
  if (!data?.length) return;
  const client = backgroundClient();
  let response: Response;
  try {
    response = await client.responses.create({ ...request.body, background: true, store: false, stream: false });
  } catch (caught) {
    const status = (caught as { status?: number }).status;
    if (!status || status >= 500 || status === 408) {
      logServerError(caught, { operation: "submit-provider", jobId, requestId: jobId, stepKey: key });
      throw new AppError("AI_SUBMISSION_UNKNOWN", "AI submission was interrupted and its outcome is unknown. It was not automatically repeated. Start a new request only if you want another attempt.", 502, false);
    }
    const failure = normalizeError(caught, new AppError("OPENAI_FAILED", "The AI service rejected this request. Check the configuration and retry.", 502, true));
    await updateStep(jobId, key, { status: "error", error: publicError(failure, jobId) });
    return;
  }
  // Persist identity even if cancellation happened during submission, so cancel
  // can find the accepted response. Never record response bytes in Workflow events.
  await updateStep(jobId, key, { response_id: response.id, status: "polling" });
  try { await guardJob(jobId, revision); }
  catch (caught) { await client.responses.cancel(response.id).catch(() => {}); throw caught; }
}
export async function pollProvider(jobId: string, revision: number, key: string): Promise<{ done: boolean; startedAt: string }> {
  await guardJob(jobId, revision);
  const step = await readStep(jobId, key);
  if (!step) throw new AppError("PROCESSING_FAILED", "The AI checkpoint is missing.", 502, true);
  const startedAt = step.submitted_at ?? new Date().toISOString();
  if (step.status === "complete" || step.status === "provider_complete" || step.status === "error") return { done: true, startedAt };
  if (!step.response_id) throw new AppError("AI_SUBMISSION_UNKNOWN", "AI submission has no confirmed response reference. It was not automatically repeated.", 502, false);
  let response: Response;
  try { response = await backgroundClient().responses.retrieve(step.response_id); }
  catch (caught) {
    if ((caught as { status?: number }).status !== 404) throw caught;
    await updateStep(jobId, key, { status: "error", error: { code: "AI_RESPONSE_EXPIRED", message: "The AI result expired before it could be saved. Retry this interrupted AI step; your other saved results will be reused.", retryable: true, requestId: jobId } });
    return { done: true, startedAt };
  }
  if (response.status === "queued" || response.status === "in_progress") return { done: false, startedAt };
  await guardJob(jobId, revision);
  if (response.status !== "completed") {
    await updateStep(jobId, key, { status: "error", error: { code: "OPENAI_FAILED", message: response.status === "cancelled"
      ? "The AI request was cancelled. Retry to resume saved work." : "The AI provider could not complete this step. Retry the interrupted work.", retryable: true, requestId: jobId } });
    return { done: true, startedAt };
  }
  const path = jobArtifact(jobId, key, "response.json");
  await uploadBuffer(path, JSON.stringify(response), "application/json", true, "0");
  await updateStep(jobId, key, { status: "provider_complete", result_path: path });
  return { done: true, startedAt };
}
export async function finishProvider(jobId: string, revision: number, key: string) {
  await guardJob(jobId, revision);
  const step = await readStep(jobId, key);
  if (step?.status !== "provider_complete") return;
  if (!step.result_path) throw new JobStopped("Provider result checkpoint is missing");
  // The provider result is durably saved before processing can consume it.
  await downloadBuffer(step.result_path, { code: "PROCESSING_FAILED", message: "The saved AI result could not be loaded. Retry saving this step." });
  await updateStep(jobId, key, { status: "complete" });
}

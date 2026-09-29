import "server-only";
import type OpenAI from "openai";
import type { Uploadable } from "openai/uploads";
import type { ImageEditParamsNonStreaming } from "openai/resources/images";
import type { ResponseCreateParamsNonStreaming, Response } from "openai/resources/responses/responses";
import { getOpenAIClient } from "@/lib/server/openai";
import { getOpenAIConfig } from "@/lib/server/config";
import { AppError, type ErrorCode } from "@/lib/server/errors";
import { uploadBuffer, downloadBuffer } from "@/lib/server/storage";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { AiBoundary, jobExecution } from "./context";
import { checkDb, digest, jobArtifact, readStep, updateStep } from "./store";

async function checkpoint<T>(body: ResponseCreateParamsNonStreaming, mode: "image" | "json"): Promise<T> {
  const context = jobExecution.getStore()!;
  await context.guard();
  const request = JSON.parse(JSON.stringify({ body, mode })) as { body: ResponseCreateParamsNonStreaming; mode: string };
  // Include the position within this deterministic pipeline scope. Some
  // correction loops intentionally issue the same prompt more than once.
  const key = digest({ scope: context.scope, callIndex: context.callIndex++, request });
  const step = await readStep(context.jobId, key);
  if (step?.status === "complete" && step.result_path) {
    const response = JSON.parse((await downloadBuffer(step.result_path, { code: "PROCESSING_FAILED", message: "A saved AI result is missing. Retry the interrupted work." })).toString()) as Response;
    if (mode === "image") {
      const image = response.output.find((item) => item.type === "image_generation_call");
      if (!image || !image.result) {
        await updateStep(context.jobId, key, { status: "error", error: { code: "OPENAI_FAILED", message: "The AI service did not return an image.", retryable: true } });
        throw new AppError("OPENAI_FAILED", "The AI service did not return an image.", 502, true);
      }
      return { data: [{ b64_json: image.result }] } as T;
    }
    const text = response.output.filter((item) => item.type === "message").flatMap((item) => item.content)
      .filter((item) => item.type === "output_text").map((item) => item.text).join("");
    try { return { output_parsed: JSON.parse(text) } as T; }
    catch {
      await updateStep(context.jobId, key, { status: "error", error: { code: "ANALYSIS_FAILED", message: "The AI service returned an invalid structured result. Retry this step.", retryable: true } });
      throw new AppError("ANALYSIS_FAILED", "The AI service returned an invalid structured result. Retry this step.", 502, true);
    }
  }
  if (step?.status === "error" && step.error) throw new AppError(step.error.code as ErrorCode, step.error.message, 502, step.error.retryable, step.error);
  if (!step) {
    const path = jobArtifact(context.jobId, key, "request.json");
    await jobExecution.exit(() => uploadBuffer(path, JSON.stringify(request), "application/json", true, "0"));
    const { error } = await getSupabaseAdmin().from("ai_job_steps").upsert({ job_id: context.jobId, step_key: key, request_path: path },
      { onConflict: "job_id,step_key", ignoreDuplicates: true });
    checkDb(error);
  }
  context.pending = true;
  throw new AiBoundary(key);
}

// Preserve the synchronous adapter while the rollout flag is disabled. Only a
// Workflow execution context opts into background requests/checkpoint re-entry.
export async function parseAiResponse<T>(body: ResponseCreateParamsNonStreaming, options?: { signal?: AbortSignal }): Promise<{ output_parsed: T | null }> {
  if (!jobExecution.getStore()) return getOpenAIClient().responses.parse(body, options) as Promise<{ output_parsed: T | null }>;
  return checkpoint(body, "json");
}
async function imageData(file: Uploadable) {
  if (!(file instanceof Blob)) throw new AppError("INVALID_REQUEST", "Image inputs must be prepared files.", 400);
  return `data:${file.type || "image/png"};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
}
export async function editAiImage(body: ImageEditParamsNonStreaming, options?: { signal?: AbortSignal }) {
  if (!jobExecution.getStore()) return getOpenAIClient().images.edit(body, options);
  const files = Array.isArray(body.image) ? body.image : [body.image];
  const request: ResponseCreateParamsNonStreaming = {
    model: getOpenAIConfig().analysisModel,
    input: [{ role: "user", content: [
      { type: "input_text", text: body.prompt },
      ...await Promise.all(files.map(async (file) => ({ type: "input_image" as const, image_url: await imageData(file), detail: "original" as const }))),
    ] }],
    tool_choice: { type: "image_generation" },
    tools: [{ type: "image_generation", model: body.model ?? getOpenAIConfig().imageModel, action: "edit",
      quality: body.quality === "standard" ? "high" : body.quality ?? "high", size: body.size ?? "auto", output_format: "png", background: body.background ?? "opaque",
      ...(body.input_fidelity ? { input_fidelity: body.input_fidelity } : {}),
      ...(body.mask ? { input_image_mask: { image_url: await imageData(body.mask) } } : {}),
    }],
  };
  return checkpoint<OpenAI.Images.ImagesResponse>(request, "image");
}

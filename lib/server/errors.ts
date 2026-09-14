import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_FILE"
  | "FILE_TOO_LARGE"
  | "CONFIGURATION_REQUIRED"
  | "UNAUTHORIZED_SESSION"
  | "SOURCE_NOT_FOUND"
  | "RATE_LIMITED"
  | "OPENAI_FAILED"
  | "ANALYSIS_FAILED"
  | "GENERATION_FAILED"
  | "PROCESSING_FAILED"
  | "STORAGE_FAILED"
  | "ASSET_NOT_FOUND"
  | "ZIP_FAILED"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status = 500,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "AppError";
  }
}

type ErrorRecord = Record<string, unknown>;

function asRecord(value: unknown): ErrorRecord | undefined {
  return typeof value === "object" && value ? (value as ErrorRecord) : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function inspectUnknownError(error: unknown) {
  const record = asRecord(error);
  const nested = asRecord(record?.error);
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : readString(error),
    status: readNumber(record?.status),
    code: readString(record?.code) ?? readString(nested?.code),
    param: readString(record?.param) ?? readString(nested?.param),
    type: readString(record?.type) ?? readString(nested?.type),
    requestId: readString(record?.requestID) ?? readString(record?.request_id) ?? readString(nested?.request_id),
  };
}

function publicUpstreamDetail(message: string | undefined) {
  if (!message) return undefined;
  const cleaned = message
    .replace(/sk-[A-Za-z0-9_\-]+/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return undefined;
  return cleaned.length <= 220 ? cleaned : `${cleaned.slice(0, 217)}...`;
}

export function normalizeError(error: unknown, fallback: AppError) {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) {
    return new AppError("INVALID_REQUEST", "Some submitted values are invalid. Please check them and try again.", 400);
  }

  const info = inspectUnknownError(error);
  const status = info.status;
  const code = (info.code ?? "").toLowerCase();
  const param = (info.param ?? "").toLowerCase();
  const detail = publicUpstreamDetail(info.message);
  const name = info.name;

  if (name === "APIUserAbortError") {
    return new AppError("GENERATION_FAILED", "Generation was cancelled.", 499, true);
  }

  if (name === "APIConnectionTimeoutError" || /timed out/i.test(info.message ?? "")) {
    return new AppError(
      "OPENAI_FAILED",
      "The AI service timed out before returning this image. Retry this size.",
      504,
      true,
    );
  }

  if (name === "APIConnectionError" || (!status && /fetch failed|network|ECONNRESET|ENOTFOUND/i.test(info.message ?? ""))) {
    return new AppError(
      "OPENAI_FAILED",
      "Could not reach the AI service. Check the server connection and try again.",
      503,
      true,
    );
  }

  if (status === 429 || code === "rate_limit_exceeded" || code === "insufficient_quota") {
    if (code === "insufficient_quota") {
      return new AppError(
        "OPENAI_FAILED",
        "The OpenAI project has no remaining credit. Add billing credit and retry.",
        429,
        true,
      );
    }
    return new AppError("RATE_LIMITED", "The AI service is busy right now. Please retry this size shortly.", 429, true);
  }

  if (status === 401 || status === 403) {
    return new AppError("OPENAI_FAILED", "The AI service rejected the configured credentials. Check the server setup.", 503);
  }

  if (status === 404 || code === "model_not_found") {
    return new AppError(
      "OPENAI_FAILED",
      "The configured image model is not available to this OpenAI project. Check OPENAI_IMAGE_MODEL.",
      502,
    );
  }

  if (code === "moderation_blocked") {
    return new AppError(
      "GENERATION_FAILED",
      "The source artwork was blocked by the AI safety filter. Try a different image.",
      400,
    );
  }

  if (param === "input_fidelity" || /input_fidelity/i.test(info.message ?? "")) {
    return new AppError(
      "OPENAI_FAILED",
      "The configured image model rejected input_fidelity. Retry after the server omits that setting.",
      502,
    );
  }

  if (param === "size" || /invalid.*size|size.*invalid/i.test(info.message ?? "")) {
    return new AppError(
      "GENERATION_FAILED",
      "The AI service rejected the canvas size for this format. Try a different dimension.",
      502,
      true,
    );
  }

  if (status === 400 || status === 422) {
    return new AppError(
      "GENERATION_FAILED",
      detail
        ? `The AI service rejected this request: ${detail}`
        : "The AI service rejected this generation request. Check the source artwork and model setup.",
      502,
    );
  }

  if (status && status >= 500) {
    return new AppError("OPENAI_FAILED", "The AI service had an internal error. Retry this size shortly.", 502, true);
  }

  if (detail && fallback.code === "GENERATION_FAILED") {
    return new AppError(fallback.code, `This asset could not be generated (${detail}). Retry this size without affecting the others.`, fallback.status, fallback.retryable);
  }

  return fallback;
}

export function errorResponse(error: unknown, requestId: string, fallback?: AppError) {
  const normalized = normalizeError(
    error,
    fallback ?? new AppError("INTERNAL_ERROR", "Something went wrong. Please try again.", 500, true),
  );
  return NextResponse.json(
    {
      error: {
        code: normalized.code,
        message: normalized.message,
        retryable: normalized.retryable,
        requestId,
      },
    },
    {
      status: normalized.status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export function logServerError(
  error: unknown,
  context: Record<string, string | number | boolean | undefined>,
) {
  const info = inspectUnknownError(error);
  console.error(`[AdMat] request failed ${JSON.stringify({ ...context, ...info })}`);
}

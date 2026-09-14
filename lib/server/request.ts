import "server-only";

import type { NextRequest } from "next/server";
import type { ZodType } from "zod";
import { AppError } from "@/lib/server/errors";

export async function parseJson<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 250_000) {
    throw new AppError("INVALID_REQUEST", "The request is too large.", 413);
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    throw new AppError("INVALID_REQUEST", "The request body must be valid JSON.", 400);
  }
  if (Buffer.byteLength(text, "utf8") > 250_000) {
    throw new AppError("INVALID_REQUEST", "The request is too large.", 413);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AppError("INVALID_REQUEST", "The request body must be valid JSON.", 400);
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError("INVALID_REQUEST", result.error.issues[0]?.message ?? "Invalid request.", 400);
  }
  return result.data;
}

export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return;
  try {
    if (new URL(origin).host !== host) {
      throw new AppError("INVALID_REQUEST", "Cross-origin requests are not allowed.", 403);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("INVALID_REQUEST", "The request origin is invalid.", 403);
  }
}

const attempts = new Map<string, { count: number; resetsAt: number }>();

export function enforceRateLimit(request: NextRequest, limit: number) {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetsAt < now) {
    attempts.set(key, { count: 1, resetsAt: now + 60_000 });
    return;
  }
  if (current.count >= limit) {
    throw new AppError("RATE_LIMITED", "Too many requests are running. Wait a moment and try again.", 429, true);
  }
  current.count += 1;
}

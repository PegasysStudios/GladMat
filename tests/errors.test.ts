import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError, logServerError, normalizeError } from "@/lib/server/errors";

function openaiError(status: number, message: string, extra: Record<string, unknown> = {}) {
  const error = Object.assign(new Error(message), {
    name: extra.name ?? "APIError",
    status,
    ...extra,
  });
  return error;
}

const fallback = new AppError(
  "GENERATION_FAILED",
  "This asset could not be generated. Retry this size without affecting the others.",
  502,
  true,
);

describe("generation error mapping", () => {
  it("passes through AppError instances", () => {
    const original = new AppError("SOURCE_NOT_FOUND", "The source artwork could not be found. Upload it again.", 404);
    expect(normalizeError(original, fallback)).toBe(original);
  });

  it("maps credential, quota, timeout, and model-not-found failures", () => {
    const unauthorized = normalizeError(openaiError(401, "401 Invalid API key"), fallback);
    const quota = normalizeError(
      openaiError(429, "429 You exceeded your current quota", { code: "insufficient_quota" }),
      fallback,
    );
    const missingModel = normalizeError(
      openaiError(404, "404 The model does not exist", { code: "model_not_found" }),
      fallback,
    );
    const timeout = normalizeError(
      Object.assign(new Error("Request timed out."), { name: "APIConnectionTimeoutError" }),
      fallback,
    );
    expect(unauthorized.message).toContain("credentials");
    expect(quota.message).toContain("credit");
    expect(missingModel.message).toContain("OPENAI_IMAGE_MODEL");
    expect(timeout.message).toContain("timed out");
  });

  it("surfaces rejected image-edit settings instead of a generic generation failure", () => {
    const unknownParam = openaiError(400, "400 Unknown parameter: 'input_fidelity'.", {
      code: "unknown_parameter",
      param: "input_fidelity",
    });
    expect(normalizeError(unknownParam, fallback).message).toContain("input_fidelity");

    const moderation = openaiError(400, "400 Your request was blocked.", { code: "moderation_blocked" });
    expect(normalizeError(moderation, fallback).message).toContain("safety filter");

    const other = openaiError(400, "400 Invalid prompt: too many tokens.");
    expect(normalizeError(other, fallback).message).toContain("Invalid prompt");
    expect(normalizeError(other, fallback).message).not.toBe(fallback.message);
  });
});

describe("server error logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes a single JSON line that includes the upstream message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logServerError(openaiError(400, "400 Unknown parameter: 'input_fidelity'.", { param: "input_fidelity" }), {
      route: "/api/generate",
      target: "300x250",
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0]?.[0]);
    expect(line.startsWith("[AdMat] request failed ")).toBe(true);
    const payload = JSON.parse(line.slice("[AdMat] request failed ".length)) as Record<string, unknown>;
    expect(payload.route).toBe("/api/generate");
    expect(payload.target).toBe("300x250");
    expect(payload.message).toContain("input_fidelity");
    expect(payload.status).toBe(400);
    expect(payload.param).toBe("input_fidelity");
  });
});

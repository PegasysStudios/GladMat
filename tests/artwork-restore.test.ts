import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/artwork/restore/route";
import { mintSourceToken } from "@/lib/server/source-token";
import { assertSessionToken } from "@/lib/server/session-token";
import { AppError } from "@/lib/server/errors";
import { loadStoredAnalysis } from "@/lib/server/analyze-source";
import { assetExists, createSignedPreview } from "@/lib/server/storage";

vi.mock("@/lib/server/analyze-source", () => ({ loadStoredAnalysis: vi.fn() }));
vi.mock("@/lib/server/storage", () => ({ assetExists: vi.fn(), createSignedPreview: vi.fn() }));

beforeEach(() => {
  vi.stubEnv("ADMAT_SESSION_SECRET", "test-secret-that-is-at-least-thirty-two-characters");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(assetExists).mockResolvedValue(true);
  vi.mocked(createSignedPreview).mockResolvedValue("https://example.supabase.co/source.png?token=new");
  vi.mocked(loadStoredAnalysis).mockResolvedValue({ summary: "Existing analysis" } as Awaited<ReturnType<typeof loadStoredAnalysis>>);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks(); });

function request(body: unknown) {
  return new NextRequest("http://localhost:3000/api/artwork/restore", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("restore saved artwork", () => {
  it("returns stored analysis, fresh session access, and a new preview without upload or AI", async () => {
    const sessionId = randomUUID();
    const response = await POST(request({ sessionId, sourceToken: mintSourceToken(sessionId) }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const result = await response.json();
    expect(result.analysis).toEqual({ summary: "Existing analysis" });
    expect(() => assertSessionToken(sessionId, result.sessionToken)).not.toThrow();
    expect(createSignedPreview).toHaveBeenCalledWith(`sources/${sessionId}/source.png`);
    expect(loadStoredAnalysis).toHaveBeenCalledWith(sessionId);
  });
  it("rejects unauthorized access before reading any private object", async () => {
    const response = await POST(request({ sessionId: randomUUID(), sourceToken: mintSourceToken(randomUUID()) }));
    expect(response.status).toBe(401);
    expect(assetExists).not.toHaveBeenCalled();
    expect(loadStoredAnalysis).not.toHaveBeenCalled();
  });
  it("does not accept arbitrary storage paths or client-supplied analysis", async () => {
    const sessionId = randomUUID();
    const response = await POST(request({ sessionId, sourceToken: mintSourceToken(sessionId), sourcePath: "other/private.png" }));
    expect(response.status).toBe(400);
    expect(assetExists).not.toHaveBeenCalled();
  });
  it("reports missing artwork without losing or re-uploading it silently", async () => {
    vi.mocked(assetExists).mockResolvedValue(false);
    const sessionId = randomUUID();
    const response = await POST(request({ sessionId, sourceToken: mintSourceToken(sessionId) }));
    expect(response.status).toBe(404);
    expect(loadStoredAnalysis).not.toHaveBeenCalled();
  });
  it("allows an interrupted analysis to be retried using the existing source", async () => {
    vi.mocked(loadStoredAnalysis).mockRejectedValue(new AppError("SOURCE_NOT_FOUND", "No analysis", 404));
    const sessionId = randomUUID();
    const response = await POST(request({ sessionId, sourceToken: mintSourceToken(sessionId) }));
    expect(response.status).toBe(200);
    expect((await response.json()).analysis).toBeNull();
  });
  it("does not mask storage outages as missing analysis", async () => {
    vi.mocked(loadStoredAnalysis).mockRejectedValue(new AppError("STORAGE_FAILED", "Storage unavailable", 502));
    const sessionId = randomUUID();
    const response = await POST(request({ sessionId, sourceToken: mintSourceToken(sessionId) }));
    expect(response.status).toBe(502);
    expect(createSignedPreview).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
});

describe("Supabase storage transport", () => {
  it("uses the platform fetch implementation for source and generated uploads", async () => {
    vi.stubEnv("SUPABASE_URL", "https://storage.example.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
    vi.stubEnv("SUPABASE_STORAGE_BUCKET", "ad-mats");
    const globalFetch = vi.fn(async (...request: Parameters<typeof fetch>) => {
      void request;
      return Response.json({ Key: "saved", Id: "asset" });
    });
    vi.stubGlobal("fetch", globalFetch);
    const { uploadBuffer } = await import("@/lib/server/storage");
    const body = Buffer.from([137, 80, 78, 71]);
    await uploadBuffer("sources/session/source.png", body, "image/png");
    await uploadBuffer("generated/session/970x90/result.png", body, "image/png", false);

    expect(globalFetch).toHaveBeenCalledTimes(2);
    const generatedRequest = globalFetch.mock.calls[1]?.[1];
    expect(generatedRequest).toBeDefined();
    if (!generatedRequest) throw new Error("Expected generated upload request options");
    expect(generatedRequest.body).toBe(body);
    expect(generatedRequest.method).toBe("POST");
    const headers = new Headers(generatedRequest.headers);
    expect(headers.get("content-type")).toBe("image/png");
    expect(headers.get("x-upsert")).toBe("false");
    expect(headers.get("authorization")).toBe("Bearer test-service-role");
  });
});

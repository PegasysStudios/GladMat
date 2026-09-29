import { afterEach, describe, expect, it, vi } from "vitest";

const { Agent, fetchMock } = vi.hoisted(() => ({
  Agent: vi.fn(class Agent {}),
  fetchMock: vi.fn(),
}));
vi.mock("undici", () => ({ Agent, fetch: fetchMock }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
});

describe("Supabase storage transport", () => {
  it("uses one dedicated HTTP/1.1 dispatcher for source and generated uploads", async () => {
    vi.stubEnv("SUPABASE_URL", "https://storage.example.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
    vi.stubEnv("SUPABASE_STORAGE_BUCKET", "ad-mats");
    fetchMock.mockImplementation(async () => Response.json({ Key: "saved", Id: "asset" }));
    const globalFetch = vi.fn();
    vi.stubGlobal("fetch", globalFetch);
    const { uploadBuffer } = await import("@/lib/server/storage");
    const body = Buffer.from([137, 80, 78, 71]);
    await uploadBuffer("sources/session/source.png", body, "image/png");
    await uploadBuffer("generated/session/970x90/result.png", body, "image/png", false);

    expect(Agent).toHaveBeenCalledExactlyOnceWith({ allowH2: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(globalFetch).not.toHaveBeenCalled();
    const sourceRequest = fetchMock.mock.calls[0][1];
    const generatedRequest = fetchMock.mock.calls[1][1];
    expect(sourceRequest.dispatcher).toBe(Agent.mock.instances[0]);
    expect(generatedRequest.dispatcher).toBe(sourceRequest.dispatcher);
    expect(generatedRequest.body).toBe(body);
    expect(generatedRequest.method).toBe("POST");
    const headers = new Headers(generatedRequest.headers);
    expect(headers.get("content-type")).toBe("image/png");
    expect(headers.get("x-upsert")).toBe("false");
    expect(headers.get("authorization")).toBe("Bearer test-service-role");
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  step: { status: "requested", request_path: "request.json", result_path: null as string | null,
    response_id: null as string | null, submitted_at: null as string | null, error: null as unknown },
  storage: new Map<string, Buffer>(),
  create: vi.fn(), retrieve: vi.fn(), cancel: vi.fn(),
}));
vi.mock("openai", () => ({ default: class { responses = { create: mocks.create, retrieve: mocks.retrieve, cancel: mocks.cancel }; } }));
vi.mock("@/lib/server/config", () => ({ getOpenAIConfig: () => ({ apiKey: "test-key" }) }));
vi.mock("@/lib/server/jobs/store", () => ({
  guardJob: async () => {}, readStep: async () => mocks.step,
  updateStep: async (_jobId: string, _key: string, values: object) => Object.assign(mocks.step, values),
  jobArtifact: (_jobId: string, _key: string, name: string) => name, checkDb: () => {},
}));
vi.mock("@/lib/server/supabase", () => ({ getSupabaseAdmin: () => ({ from: () => ({ update: (values: object) => ({
  eq: () => ({ eq: () => ({ eq: () => ({ select: () => { Object.assign(mocks.step, values); return { data: [{ step_key: "key" }], error: null }; } }) }) }),
}) }) }) }));
vi.mock("@/lib/server/storage", () => ({
  downloadBuffer: async (path: string) => mocks.storage.get(path),
  uploadBuffer: async (path: string, body: string) => { mocks.storage.set(path, Buffer.from(body)); },
}));
import { submitProvider, pollProvider, finishProvider } from "@/lib/server/jobs/provider";

beforeEach(() => {
  Object.assign(mocks.step, { status: "requested", request_path: "request.json", result_path: null, response_id: null, submitted_at: null, error: null });
  mocks.storage.clear(); mocks.create.mockReset(); mocks.retrieve.mockReset(); mocks.cancel.mockReset();
});

describe("durable provider calls", () => {
  it("submits once, polls after six minutes, and persists the result before marking it consumable", async () => {
    mocks.storage.set("request.json", Buffer.from(JSON.stringify({ body: { model: "mainline", input: "edit" } })));
    mocks.create.mockResolvedValue({ id: "provider-1", status: "in_progress" });
    mocks.retrieve.mockResolvedValueOnce({ id: "provider-1", status: "in_progress" })
      .mockResolvedValueOnce({ id: "provider-1", status: "completed", output: [{ type: "image_generation_call", result: "png" }] });
    await submitProvider("job", 0, "key");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ background: true, store: false, stream: false });
    expect((await pollProvider("job", 0, "key")).done).toBe(false);
    const startedAt = mocks.step.submitted_at!;
    mocks.step.submitted_at = new Date(new Date(startedAt).getTime() - 360_000).toISOString();
    expect((await pollProvider("job", 0, "key")).done).toBe(true);
    expect(mocks.step.status).toBe("provider_complete");
    expect(JSON.parse(mocks.storage.get("response.json")!.toString()).id).toBe("provider-1");
    await finishProvider("job", 0, "key");
    expect(mocks.step.status).toBe("complete");
    await submitProvider("job", 0, "key");
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it("never resubmits an ambiguous accepted request", async () => {
    mocks.storage.set("request.json", Buffer.from(JSON.stringify({ body: { model: "mainline", input: "edit" } })));
    mocks.create.mockRejectedValue(new Error("network disappeared after acceptance"));
    await expect(submitProvider("job", 0, "key")).rejects.toMatchObject({ code: "AI_SUBMISSION_UNKNOWN" });
    await expect(submitProvider("job", 0, "key")).rejects.toMatchObject({ code: "AI_SUBMISSION_UNKNOWN" });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it("reports provider expiry without reissuing the paid request", async () => {
    Object.assign(mocks.step, { status: "polling", response_id: "expired", submitted_at: new Date().toISOString() });
    mocks.retrieve.mockRejectedValue({ status: 404 });
    expect((await pollProvider("job", 0, "key")).done).toBe(true);
    expect(mocks.step.error).toMatchObject({ code: "AI_RESPONSE_EXPIRED" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

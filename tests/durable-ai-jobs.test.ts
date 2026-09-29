import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { providerPollDelay } from "@/lib/ai-jobs";
import { mintJobToken, assertJobToken } from "@/lib/server/jobs/token";
import { AiBoundary, jobExecution } from "@/lib/server/jobs/context";

const mocks = vi.hoisted(() => ({
  steps: new Map<string, { status: string; result_path?: string }>(),
  objects: new Map<string, Buffer>(), upserts: 0,
}));
vi.mock("@/lib/server/config", () => ({ getSessionSecret: () => "test-secret-of-at-least-thirty-two-bytes", getOpenAIConfig: () => ({ analysisModel: "analysis-model", imageModel: "image-model" }) }));
vi.mock("@/lib/server/jobs/store", () => ({
  digest: (value: unknown) => [...JSON.stringify(value)].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0).toString(16),
  jobArtifact: (jobId: string, key: string, name: string) => `${jobId}/${key}/${name}`,
  readStep: async (_jobId: string, key: string) => mocks.steps.get(key) ?? null,
  checkDb: () => {},
}));
vi.mock("@/lib/server/storage", () => ({
  uploadBuffer: async (path: string, body: string) => { mocks.objects.set(path, Buffer.from(body)); },
  downloadBuffer: async (path: string) => mocks.objects.get(path),
}));
vi.mock("@/lib/server/supabase", () => ({
  getSupabaseAdmin: () => ({ from: () => ({ upsert: (item: { step_key: string }) => {
    mocks.upserts++;
    mocks.steps.set(item.step_key, { status: "requested" });
    return { error: null };
  } }) }),
}));
import { parseAiResponse } from "@/lib/server/jobs/ai";

beforeEach(() => { mocks.steps.clear(); mocks.objects.clear(); mocks.upserts = 0; });
afterEach(() => vi.useRealTimers());

describe("durable AI boundaries", () => {
  it("uses short, increasing durable poll intervals", () => {
    expect([0, 119_999, 120_000, 600_000, 600_000_000].map(providerPollDelay))
      .toEqual([15_000, 15_000, 30_000, 60_000, 60_000]);
  });
  it("scopes signed job access to its identifier", () => {
    const token = mintJobToken("11111111-1111-4111-8111-111111111111");
    expect(() => assertJobToken("11111111-1111-4111-8111-111111111111", token)).not.toThrow();
    expect(() => assertJobToken("22222222-2222-4222-8222-222222222222", token)).toThrow();
  });
  it("checkpoints an AI request and replays the completed response after more than five minutes", async () => {
    vi.useFakeTimers();
    const execution = { jobId: "job", revision: 0, scope: "analysis", callIndex: 0, pending: false,
      guard: async () => {}, phase: async () => {} };
    const body = { model: "analysis-model", input: "Analyze", text: { format: { type: "json_schema" as const, name: "analysis", schema: { type: "object" }, strict: true } } };
    const first = await jobExecution.run(execution, () => parseAiResponse<{ passed: boolean }>(body).catch((error) => error));
    expect(first).toBeInstanceOf(AiBoundary);
    const key = (first as AiBoundary).stepKey;
    expect(mocks.upserts).toBe(1);
    vi.setSystemTime(Date.now() + 360_000);
    const resultPath = `job/${key}/response.json`;
    mocks.objects.set(resultPath, Buffer.from(JSON.stringify({ output: [
      { type: "message", content: [{ type: "output_text", text: '{"passed":true}' }] },
    ] })));
    mocks.steps.set(key, { status: "complete", result_path: resultPath });
    execution.pending = false;
    execution.callIndex = 0;
    const resumed = await jobExecution.run(execution, () => parseAiResponse<{ passed: boolean }>(body));
    expect(resumed.output_parsed).toEqual({ passed: true });
    expect(mocks.upserts).toBe(1);
  });
  it("keeps deliberately repeated calls distinct while replaying each checkpoint", async () => {
    const execution = { jobId: "job", revision: 0, scope: "correction", callIndex: 0, pending: false,
      guard: async () => {}, phase: async () => {} };
    const body = { model: "analysis-model", input: "Review again" };
    const first = await jobExecution.run(execution, () => parseAiResponse(body).catch((error) => error)) as AiBoundary;
    execution.pending = false;
    const second = await jobExecution.run(execution, () => parseAiResponse(body).catch((error) => error)) as AiBoundary;
    expect(second.stepKey).not.toBe(first.stepKey);
    expect(mocks.upserts).toBe(2);
  });
});

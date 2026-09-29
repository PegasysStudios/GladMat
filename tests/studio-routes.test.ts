import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AppError } from "@/lib/server/errors";
import { STUDIO_API_VERSION } from "@/lib/studio-protocol";

const work = vi.hoisted(() => ({ analyze: vi.fn(), extract: vi.fn(), background: vi.fn(), load: vi.fn(), save: vi.fn(), image: vi.fn() }));
vi.mock("@/lib/server/studio", () => ({ analyzeStudioAsset: work.analyze, extractStudioLayer: work.extract,
  prepareStudioBackground: work.background, loadStudioDocument: work.load, saveStudioDocument: work.save, loadStudioLayerImage: work.image }));
vi.mock("@/lib/server/request", async (original) => ({ ...await original<typeof import("@/lib/server/request")>(), enforceRateLimit: vi.fn() }));
import { POST as analyze } from "@/app/api/studio/analyze/route";
import { POST as extract } from "@/app/api/studio/extract/route";
import { POST as background } from "@/app/api/studio/background/route";
import { POST as load, PUT as save } from "@/app/api/studio/document/route";
import { POST as image } from "@/app/api/studio/image/route";

const payload = { apiVersion: STUDIO_API_VERSION, sessionId: "11111111-1111-4111-8111-111111111111",
  assetToken: `${Date.now() + 10000}.${"a".repeat(64)}`,
  asset: { requestId: "22222222-2222-4222-8222-222222222222", width: 200, height: 200 },
  preparationId: "33333333-3333-4333-8333-333333333333" };
function request(body: unknown, method = "POST") {
  return new NextRequest("http://localhost:3000/api/studio/test", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe("Studio route compatibility", () => {
  it.each([analyze, extract, background, load, save, image])("rejects an older client before any Studio work", async (route) => {
    const response = await route(request({ sessionId: payload.sessionId, asset: payload.asset, assetToken: payload.assetToken }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatchObject({ code: "STUDIO_CLIENT_OUTDATED", stage: "analyzing", recovery: "reload",
      message: "Studio has been updated. Refresh this page and reopen Studio. Your ad is still available." });
    for (const mock of Object.values(work)) expect(mock).not.toHaveBeenCalled();
  });

  it("rejects an incompatible version and missing preparation identity", async () => {
    expect((await background(request({ ...payload, apiVersion: 99 }))).status).toBe(409);
    const withoutPreparation: Partial<typeof payload> = { ...payload };
    delete withoutPreparation.preparationId;
    expect((await background(request(withoutPreparation))).status).toBe(400);
    expect(work.background).not.toHaveBeenCalled();
  });

  it("streams actual background and composition phases and keeps a stage-specific failure", async () => {
    work.background.mockImplementation(async (_access, _signal, report) => {
      report({ type: "stage", preparationId: payload.preparationId, stage: "background", status: "complete" });
      report({ type: "stage", preparationId: payload.preparationId, stage: "composition", status: "working" });
      throw new AppError("STUDIO_FAILED", "Canvas verification failed. Retry preparation.", 502, true, { stage: "composition", recovery: "retry-preparation" });
    });
    const response = await background(request(payload));
    expect(response.headers.get("Content-Type")).toContain("application/x-ndjson");
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(events.map((event) => event.type)).toEqual(["stage", "stage", "error"]);
    expect(events[2].error).toMatchObject({ stage: "composition", recovery: "retry-preparation", requestId: expect.any(String) });
  });

  it("preserves the element and request reference on an extraction failure", async () => {
    work.extract.mockRejectedValue(new AppError("STORAGE_FAILED", "Could not read private storage. Please retry.", 502, true));
    const response = await extract(request({ ...payload, layerId: "artist" }));
    expect((await response.json()).error).toMatchObject({ code: "STORAGE_FAILED", stage: "extracting", layerIds: ["artist"], requestId: expect.any(String) });
  });
});

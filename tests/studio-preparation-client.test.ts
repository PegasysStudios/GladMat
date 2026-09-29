import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, streamStudioBackground } from "@/lib/api-client";
import { prepareStudioCanvas } from "@/lib/studio-preparation-client";
import { createStudioDocument, StudioAnalyzeRequestSchema, type StudioDocument } from "@/lib/studio";
import { STUDIO_API_VERSION, type StudioBackgroundEvent } from "@/lib/studio-protocol";

const access = { apiVersion: STUDIO_API_VERSION, sessionId: "11111111-1111-4111-8111-111111111111",
  assetToken: `${Date.now() + 10000}.${"a".repeat(64)}`, asset: { requestId: "22222222-2222-4222-8222-222222222222", width: 200, height: 200 } } as const;
const preparationId = "33333333-3333-4333-8333-333333333333";
const labels = { sourceName: "test", formatName: "Square" };
const queued = createStudioDocument({ sessionId: access.sessionId, assetId: access.asset.requestId, preparationId,
  canvas: { width: 200, height: 200 }, sourceAsset: { storagePath: "generated/test.png", ...labels }, analysis: { layers: [
    { id: "artist", name: "Artist", type: "subject", description: "Portrait", extraction: "rectangle", bounds: { x: 10, y: 30, width: 80, height: 150 } },
    { id: "headline", name: "Café concert", type: "text", description: "Filled text", extraction: "rectangle", bounds: { x: 5, y: 5, width: 180, height: 20 } },
  ] } });
const ready: StudioDocument = { ...queued, preparationComplete: true, reconstructionError: 0, layers: queued.layers.map((layer) => ({ ...layer, status: "complete" })) };
const fetchMock = vi.fn();
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
function ndjson(events: unknown[]) { return new Response(events.map((event) => JSON.stringify(event)).join("\n") + "\n", { headers: { "Content-Type": "application/x-ndjson" } }); }
const completedEvents: StudioBackgroundEvent[] = [
  { type: "stage", preparationId, stage: "background", status: "working" },
  { type: "stage", preparationId, stage: "background", status: "complete" },
  { type: "stage", preparationId, stage: "composition", status: "working" },
  { type: "complete", preparationId, document: ready },
];
function callbacks() { return { document: vi.fn(), layer: vi.fn(), progress: vi.fn(), image: vi.fn().mockResolvedValue(undefined) }; }
function normalResponse(url: string, init: RequestInit) {
  const body = JSON.parse(init.body as string);
  expect(body.apiVersion).toBe(STUDIO_API_VERSION);
  if (url === "/api/studio/document") return json({ document: null });
  if (url === "/api/studio/analyze") {
    if (!StudioAnalyzeRequestSchema.safeParse(body).success) return json({ error: {
      code: "INVALID_REQUEST", message: "Studio received invalid values. Return to GladMat and reopen this ad.",
      retryable: false, stage: "analyzing", recovery: "reopen",
    } }, 400);
    return json({ document: queued });
  }
  expect(body.preparationId).toBe(preparationId);
  if (url === "/api/studio/extract") return json({ preparationId, layerId: body.layerId, reused: true, layer: ready.layers.find((layer) => layer.id === body.layerId) });
  if (url === "/api/studio/background") return ndjson(completedEvents);
  throw new Error(`Unexpected URL ${url}`);
}
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockImplementation(normalResponse); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Studio client preparation", () => {
  it("prepares a new or uncached saved ad from the full launch context accepted by the hook", async () => {
    const launchContext = { ...labels, assetToken: access.assetToken, width: access.asset.width, height: access.asset.height };
    expect(await prepareStudioCanvas(access, launchContext, callbacks(), { signal: new AbortController().signal })).toEqual(ready);
    const analysisCall = fetchMock.mock.calls.find(([url]) => url === "/api/studio/analyze");
    const request = JSON.parse(analysisCall![1].body);
    expect(request).toEqual({ ...access, formatName: labels.formatName, sourceName: labels.sourceName });
    expect(StudioAnalyzeRequestSchema.safeParse(request).success).toBe(true);
  });

  it("selects before background and holds composition open until images decode", async () => {
    const cb = callbacks();
    let release!: () => void;
    const pendingImage = new Promise<void>((resolve) => { release = resolve; });
    cb.image.mockReturnValue(pendingImage);
    const run = prepareStudioCanvas(access, labels, cb, { signal: new AbortController().signal });
    await vi.waitFor(() => expect(cb.image).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/studio/document", "/api/studio/analyze", "/api/studio/extract", "/api/studio/extract", "/api/studio/background"]);
    expect(cb.progress).not.toHaveBeenCalledWith(expect.objectContaining({ composition: "complete" }));
    release();
    expect(await run).toEqual(ready);
    expect(cb.progress).toHaveBeenLastCalledWith({ composition: "complete", completedLayers: 2 });
  });

  it("resumes saved analysis and failed background status without reanalysis", async () => {
    fetchMock.mockImplementation((url, init) => url === "/api/studio/document"
      ? json({ document: { ...queued, layers: queued.layers.map((layer) => layer.id === "background" ? { ...layer, status: "error", error: "Old failure" } : layer) } }) : normalResponse(url, init));
    expect(await prepareStudioCanvas(access, labels, callbacks(), { signal: new AbortController().signal })).toEqual(ready);
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain("/api/studio/analyze");
  });

  it("keeps an extraction's descriptive error and never starts background after failure", async () => {
    fetchMock.mockImplementation((url, init) => url === "/api/studio/extract" && JSON.parse(init.body).layerId === "artist"
      ? json({ error: { code: "STORAGE_FAILED", message: "Private storage is temporarily unavailable. Retry selection.", retryable: true, stage: "extracting", recovery: "retry-preparation", requestId: "issue-123" } }, 502) : normalResponse(url, init));
    await expect(prepareStudioCanvas(access, labels, callbacks(), { signal: new AbortController().signal })).rejects.toMatchObject({
      code: "STORAGE_FAILED", message: "Private storage is temporarily unavailable. Retry selection.", details: { stage: "extracting", requestId: "issue-123", layerIds: ["artist"] },
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain("/api/studio/background");
  });

  it("rejects an extraction response from another preparation", async () => {
    fetchMock.mockImplementation((url, init) => url === "/api/studio/extract" ? json({ preparationId: "different", layerId: JSON.parse(init.body).layerId }) : normalResponse(url, init));
    await expect(prepareStudioCanvas(access, labels, callbacks(), { signal: new AbortController().signal })).rejects.toMatchObject({ code: "STUDIO_PREPARATION_CHANGED" });
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain("/api/studio/background");
  });

  it("retries image loading without rerunning analysis, selections or background", async () => {
    fetchMock.mockImplementation(() => json({ document: ready }));
    const cb = callbacks();
    cb.image.mockRejectedValueOnce(new ApiClientError("Could not reach private storage. Please retry.", "STORAGE_FAILED", true, { stage: "composition" }));
    await expect(prepareStudioCanvas(access, labels, cb, { signal: new AbortController().signal })).rejects.toMatchObject({ details: { stage: "composition", recovery: "retry-loading" } });
    expect(await prepareStudioCanvas(access, labels, cb, { signal: new AbortController().signal })).toEqual(ready);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/studio/document", "/api/studio/document"]);
  });

  it("discards a late document response after cancellation", async () => {
    let release!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => { release = resolve; }));
    const cb = callbacks(); const controller = new AbortController();
    const run = prepareStudioCanvas(access, labels, cb, { signal: controller.signal });
    controller.abort(); release(json({ document: queued }));
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(cb.document).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Studio progress streams", () => {
  it("attributes a truncated stream to assembly and preserves saved-work recovery", async () => {
    fetchMock.mockResolvedValue(ndjson(completedEvents.slice(0, 3)));
    await expect(streamStudioBackground({ preparationId }, vi.fn())).rejects.toMatchObject({ code: "STUDIO_STREAM_INTERRUPTED", details: { stage: "composition", recovery: "retry-preparation" } });
  });

  it("handles JSON and unicode split across network chunks", async () => {
    const encoded = new TextEncoder().encode(completedEvents.map((event) => JSON.stringify(event)).join("\n"));
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ start(controller) {
      for (let offset = 0; offset < encoded.length; offset += 7) controller.enqueue(encoded.slice(offset, offset + 7));
      controller.close();
    } })));
    expect(await streamStudioBackground({ preparationId }, vi.fn())).toEqual(ready);
  });

  it("preserves a streamed failure's stage, layer names and request reference", async () => {
    fetchMock.mockResolvedValue(ndjson([{ type: "error", preparationId, error: { code: "STUDIO_SELECTIONS_MISSING", message: "Select Artist before creating background.", retryable: true,
      stage: "extracting", recovery: "retry-preparation", layerIds: ["artist"], requestId: "issue-456" } }]));
    await expect(streamStudioBackground({ preparationId }, vi.fn())).rejects.toMatchObject({ details: { stage: "extracting", layerIds: ["artist"], requestId: "issue-456" } });
  });
});

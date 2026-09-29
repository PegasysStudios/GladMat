import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { type StudioLayer } from "@/lib/studio";
import { generatedAssetPath } from "@/lib/storage-paths";
import { studioDocumentPath, studioMaskPath, studioOriginalPath } from "@/lib/studio-storage-paths";
import { readStudioRgba, verifyStudioReconstruction } from "@/lib/server/studio-segmentation";
import { AppError } from "@/lib/server/errors";
import type { StudioBackgroundEvent } from "@/lib/studio-protocol";

const mocks = vi.hoisted(() => ({
  objects: new Map<string, Buffer>(), parse: vi.fn(), edit: vi.fn(), review: vi.fn(), activePath: "", failedUpload: "",
}));
vi.mock("@/lib/studio-debug", () => ({ logStudio: vi.fn() }));
vi.mock("@/lib/server/asset-token", () => ({ assertAssetToken: vi.fn() }));
vi.mock("@/lib/server/config", () => ({ getOpenAIConfig: () => ({ analysisModel: "analysis-test" }) }));
vi.mock("@/lib/server/openai", () => ({ getOpenAIClient: () => ({ responses: { parse: mocks.parse } }) }));
vi.mock("@/lib/server/fine-tune", () => ({ resolveGeneratedAssetPath: async () => mocks.activePath }));
vi.mock("@/lib/server/studio-images", () => ({ editStudioImage: mocks.edit }));
vi.mock("@/lib/server/studio-review", () => ({
  reviewStudioImages: mocks.review, studioSelectionReviewPrompt: (layer: StudioLayer) => `Select ${layer.name}`,
  studioBackgroundReviewPrompt: () => "Check background",
}));
vi.mock("@/lib/server/storage", () => ({
  setStorageStage: vi.fn(),
  withStorageContext: (_: unknown, work: () => Promise<unknown>) => work(),
  assetExists: async (path: string) => mocks.objects.has(path),
  downloadBuffer: async (path: string, missing: string | { code: "STUDIO_ARTIFACT_MISSING"; message: string }) => {
    const value = mocks.objects.get(path);
    if (!value) throw new AppError(typeof missing === "string" ? missing as "ASSET_NOT_FOUND" : missing.code,
      typeof missing === "string" ? "The generated artwork is missing" : missing.message, 404);
    return value;
  },
  uploadBuffer: async (path: string, body: Buffer | string) => {
    if (mocks.failedUpload === path) throw new AppError("STORAGE_FAILED", "Could not save a layer. Try again.", 502, true);
    mocks.objects.set(path, Buffer.from(body));
  },
}));

import { analyzeStudioAsset as analyze, extractStudioLayer, loadStudioDocument, loadStudioLayerImage, prepareStudioBackground, saveStudioDocument } from "@/lib/server/studio";

const access = {
  sessionId: "11111111-1111-4111-8111-111111111111", assetToken: `${Date.now() + 10000}.${"a".repeat(64)}`,
  asset: { requestId: "22222222-2222-4222-8222-222222222222", width: 200, height: 200 },
  preparationId: "",
};
async function analyzeStudioAsset(...args: Parameters<typeof analyze>) {
  const document = await analyze(...args);
  access.preparationId = document.preparationId!;
  return document;
}
const plan = {
  backgroundDescription: "Solid yellow campaign background",
  layers: [
    { id: "artist-left", name: "Left artist", type: "subject", description: "Left portrait", extraction: "rectangle", componentIds: ["artist-left"], bounds: { x: 15, y: 65, width: 45, height: 80 } },
    { id: "artist-right", name: "Right artist", type: "subject", description: "Right portrait", extraction: "rectangle", componentIds: ["artist-right"], bounds: { x: 135, y: 65, width: 45, height: 80 } },
    { id: "headline", name: "Headline and panel", type: "text", description: "White words and black rectangle", extraction: "rectangle", componentIds: ["headline", "headline-fill"], bounds: { x: 10, y: 15, width: 180, height: 30 } },
  ],
};

async function image(width: number, height: number, color: string) {
  return sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
}

beforeEach(async () => {
  vi.clearAllMocks(); mocks.objects.clear(); mocks.failedUpload = ""; access.preparationId = "";
  mocks.activePath = generatedAssetPath(access.sessionId, 200, 200, access.asset.requestId);
  const background = await image(200, 200, "#facc15");
  const source = await sharp(background).composite([
    { input: await image(45, 80, "#333333"), left: 15, top: 65 },
    { input: await image(45, 80, "#666666"), left: 135, top: 65 },
    { input: await image(180, 30, "#111111"), left: 10, top: 15 },
    { input: await image(20, 10, "#ffffff"), left: 40, top: 20 },
  ]).png().toBuffer();
  mocks.objects.set(mocks.activePath, source);
  mocks.parse.mockResolvedValue({ output_parsed: plan });
  mocks.review.mockResolvedValue({ passed: true, issues: [], correctedBounds: null });
  mocks.edit.mockResolvedValue(background);
});

describe("Studio preparation, storage and resume", () => {
  it("reviews the inventory, extracts in parallel, verifies exact reconstruction and reuses the completed document", async () => {
    const document = await analyzeStudioAsset(access, "Small square", "test");
    expect(mocks.parse).toHaveBeenCalledTimes(2);
    expect(document.preparationComplete).toBe(false);
    expect(document.preparationId).toBeTruthy();
    const layers = document.layers.slice(1);
    await Promise.all(layers.map((layer) => extractStudioLayer(access, layer.id)));
    // Worker responses cannot race to overwrite the shared document.
    expect((await loadStudioDocument(access))?.layers.every((layer) => layer.status === "queued")).toBe(true);
    const ready = await prepareStudioBackground(access);
    expect(ready.preparationComplete).toBe(true);
    expect(ready.reconstructionError).toBe(0);
    expect(ready.layers.every((layer) => layer.status === "complete")).toBe(true);
    const source = mocks.objects.get(mocks.activePath)!;
    const cutouts = await Promise.all(ready.layers.slice(1).map(async (layer) => ({
      buffer: await loadStudioLayerImage(access, layer.id), bounds: { x: layer.x, y: layer.y, width: layer.width, height: layer.height },
    })));
    expect(await verifyStudioReconstruction(source, await loadStudioLayerImage(access, "background"), cutouts)).toBe(0);
    expect((await readStudioRgba(await loadStudioLayerImage(access, "reference"))).data).toEqual((await readStudioRgba(source)).data);
    expect(await analyzeStudioAsset(access, "Small square", "test")).toEqual(ready);
    expect(await prepareStudioBackground(access)).toEqual(ready);
    expect(mocks.parse).toHaveBeenCalledTimes(2); expect(mocks.edit).toHaveBeenCalledTimes(1);
    const edited = await saveStudioDocument(access, { ...ready, layers: ready.layers.map((layer) => layer.id === "artist-left" ? { ...layer, x: 30, width: layer.width * 0.8, height: layer.height * 0.8 } : layer) });
    expect((await loadStudioDocument(access))?.layers.find((layer) => layer.id === "artist-left")).toEqual(edited.layers[1]);
  });

  it("resumes paid selections without publishing missing layers or repeating completed calls", async () => {
    const document = await analyzeStudioAsset(access, "Small square", "test");
    const first = await extractStudioLayer(access, "artist-left");
    expect((await extractStudioLayer(access, "artist-left")).reused).toBe(true);
    expect(mocks.review).toHaveBeenCalledTimes(1);
    await expect(prepareStudioBackground(access)).rejects.toMatchObject({ code: "STUDIO_SELECTIONS_MISSING", details: { stage: "extracting", layerIds: ["artist-right", "headline"] } });
    expect((await loadStudioDocument(access))?.preparationComplete).toBe(false);
    await Promise.all(document.layers.slice(2).map((layer) => extractStudioLayer(access, layer.id)));
    expect((await prepareStudioBackground(access)).layers[1]).toEqual(first.layer);
  });

  it("repairs rejected panel bounds and stores the complete selection with its original offset", async () => {
    await analyzeStudioAsset(access, "Small square", "test");
    mocks.review.mockResolvedValueOnce({ passed: false, issues: ["Include the shadow below the panel"], correctedBounds: { x: 10, y: 15, width: 180, height: 33 } });
    const result = await extractStudioLayer(access, "headline");
    expect(result.layer).toMatchObject({ x: 10, y: 15, width: 180, height: 33 });
    expect(mocks.review).toHaveBeenCalledTimes(2);
  });

  it("generates selection masks with bounded correction attempts and always copies the original portrait pixels", async () => {
    mocks.parse.mockResolvedValue({ output_parsed: { ...plan, layers: plan.layers.map((layer) => layer.type === "subject" ? { ...layer, extraction: "mask" } : layer) } });
    await analyzeStudioAsset(access, "Small square", "test");
    mocks.edit.mockImplementation(async (sources: Array<{ buffer: Buffer }>) => {
      const crop = await readStudioRgba(sources[0].buffer);
      for (let offset = 0; offset < crop.data.length; offset += 4) {
        const selected = crop.data[offset] < 150;
        crop.data[offset] = crop.data[offset + 1] = crop.data[offset + 2] = selected ? 255 : 0;
      }
      return sharp(crop.data, { raw: { width: crop.info.width, height: crop.info.height, channels: 4 } }).png().toBuffer();
    });
    mocks.review.mockResolvedValueOnce({ passed: false, issues: ["Keep the complete silhouette aligned"], correctedBounds: null });
    const selected = await extractStudioLayer(access, "artist-left");
    expect(mocks.edit).toHaveBeenCalledTimes(2);
    expect(selected.layer).toMatchObject({ x: 14, y: 64, width: 47, height: 82 });
    expect((await extractStudioLayer(access, "artist-left")).reused).toBe(true);
    expect(mocks.edit).toHaveBeenCalledTimes(2);
  });

  it("does not mark preparation ready when the clean background retains foreground ghosts", async () => {
    const document = await analyzeStudioAsset(access, "Small square", "test");
    await Promise.all(document.layers.slice(1).map((layer) => extractStudioLayer(access, layer.id)));
    mocks.review.mockResolvedValue({ passed: false, issues: ["A ghost face is still visible"], correctedBounds: null });
    await expect(prepareStudioBackground(access)).rejects.toThrow(/remove every foreground/);
    expect((await loadStudioDocument(access))?.preparationComplete).toBe(false);
    expect(mocks.edit).toHaveBeenCalledTimes(2);
  });

  it("archives the prior document and preserves its images when rebuilding after fine-tuning", async () => {
    const document = await analyzeStudioAsset(access, "Small square", "test");
    const originalPath = studioOriginalPath(access.sessionId, access.asset.requestId, document.preparationId);
    const original = mocks.objects.get(originalPath)!;
    const updatedPath = mocks.activePath.replace(/\.png$/, ".33333333-3333-4333-8333-333333333333.png");
    mocks.objects.set(updatedPath, original); mocks.activePath = updatedPath;
    expect(await loadStudioDocument(access)).toBeNull();
    const refreshed = await analyzeStudioAsset(access, "Small square", "test");
    expect(refreshed.sourceAsset.storagePath).toBe(updatedPath);
    expect(refreshed.preparationId).not.toBe(document.preparationId);
    expect(mocks.objects.get(originalPath)).toEqual(original);
    expect([...mocks.objects.keys()].some((path) => path.includes("/history/"))).toBe(true);
  });

  it("rejects unauthorized artifact paths even within the same asset", async () => {
    const document = await analyzeStudioAsset(access, "Small square", "test");
    await Promise.all(document.layers.slice(1).map((layer) => extractStudioLayer(access, layer.id)));
    const ready = await prepareStudioBackground(access);
    await expect(saveStudioDocument(access, { ...ready, layers: ready.layers.map((layer) => layer.type === "background" ? { ...layer, assetPath: "sources/another-session/source.png" } : layer) })).rejects.toThrow(/prepared layer information/);
    expect(studioMaskPath(access.sessionId, access.asset.requestId, "headline", document.preparationId)).toContain(`/${document.preparationId}/masks/`);
    expect(studioDocumentPath(access.sessionId, access.asset.requestId)).toContain("/document.json");
  });
  it("reports background-before-selection at extraction without making a background call", async () => {
    await analyzeStudioAsset(access, "Small square", "test");
    await expect(prepareStudioBackground(access)).rejects.toMatchObject({ code: "STUDIO_SELECTIONS_MISSING", status: 409,
      details: { stage: "extracting", recovery: "retry-preparation", layerIds: ["artist-left", "artist-right", "headline"] } });
    expect(mocks.edit).not.toHaveBeenCalled();
  });

  it("rejects incomplete browser saves and a changed preparation", async () => {
    const document = await analyzeStudioAsset(access, "Small square", "test");
    await expect(saveStudioDocument(access, document)).rejects.toThrow(/still preparing/);
    const stale = { ...access, preparationId: "33333333-3333-4333-8333-333333333333" };
    await expect(extractStudioLayer(stale, "headline")).rejects.toMatchObject({ code: "STUDIO_PREPARATION_CHANGED" });
    await expect(prepareStudioBackground(stale)).rejects.toMatchObject({ code: "STUDIO_PREPARATION_CHANGED" });
    await expect(loadStudioLayerImage(stale, "reference")).rejects.toMatchObject({ code: "STUDIO_PREPARATION_CHANGED" });
    expect(mocks.edit).not.toHaveBeenCalled();
  });

  it("resumes a failed assembly using the reviewed background and reports its actual stage", async () => {
    const document = await analyzeStudioAsset(access, "Small square", "test");
    await Promise.all(document.layers.slice(1).map((layer) => extractStudioLayer(access, layer.id)));
    const events: StudioBackgroundEvent[] = [];
    mocks.failedUpload = document.layers[1].assetPath;
    await expect(prepareStudioBackground(access, undefined, (event) => events.push(event))).rejects.toMatchObject({ code: "STORAGE_FAILED", details: { stage: "composition" } });
    expect(events.map((event) => event.type === "stage" ? `${event.stage}:${event.status}` : event.type)).toEqual([
      "background:working", "background:complete", "composition:working",
    ]);
    expect((await loadStudioDocument(access))?.preparationComplete).toBe(false);
    mocks.failedUpload = "";
    expect((await prepareStudioBackground(access)).preparationComplete).toBe(true);
    expect(mocks.edit).toHaveBeenCalledTimes(1);
    expect(mocks.parse).toHaveBeenCalledTimes(2);
  });

  it("repairs invalid selection metadata before treating a selection as complete", async () => {
    const document = await analyzeStudioAsset(access, "Small square", "test");
    await extractStudioLayer(access, "headline");
    const metadata = document.layers[3].assetPath.replace(/\.png$/, ".json");
    mocks.objects.set(metadata, Buffer.from('{"sourcePath":"wrong","layer":{}}'));
    await expect(prepareStudioBackground(access)).rejects.toMatchObject({ code: "STUDIO_SELECTIONS_MISSING" });
    await extractStudioLayer(access, "headline");
    expect(mocks.review).toHaveBeenCalledTimes(2);
  });

  it("repairs a missing final PNG without losing saved transforms, hidden layers or deletions", async () => {
    const document = await analyzeStudioAsset(access, "Small square", "test");
    await Promise.all(document.layers.slice(1).map((layer) => extractStudioLayer(access, layer.id)));
    const ready = await prepareStudioBackground(access);
    const edited = await saveStudioDocument(access, { ...ready, layers: ready.layers.filter((layer) => layer.id !== "artist-right").map((layer) => layer.id === "artist-left" ? { ...layer, x: 30, visible: false } : layer) });
    mocks.objects.delete(ready.layers[1].assetPath);
    await expect(loadStudioLayerImage(access, "artist-left")).rejects.toMatchObject({ code: "STUDIO_ARTIFACT_MISSING" });
    expect(await prepareStudioBackground(access)).toEqual(edited);
    expect(await loadStudioLayerImage(access, "artist-left")).toBeInstanceOf(Buffer);
    expect(mocks.edit).toHaveBeenCalledTimes(1);
    expect(await loadStudioDocument(access)).toEqual(edited);
  });

  it("restores a missing Studio copy from its selected PNG without reanalysis", async () => {
    const document = await analyzeStudioAsset(access, "Small square", "test");
    mocks.objects.delete(studioOriginalPath(access.sessionId, access.asset.requestId, document.preparationId));
    await extractStudioLayer(access, "headline");
    expect(mocks.parse).toHaveBeenCalledTimes(2);
    expect(mocks.objects.has(studioOriginalPath(access.sessionId, access.asset.requestId, document.preparationId))).toBe(true);
  });

  it("does not publish a completed canvas over a preparation started during background creation", async () => {
    const document = await analyzeStudioAsset(access, "Small square", "test");
    const snapshot = { ...access };
    await Promise.all(document.layers.slice(1).map((layer) => extractStudioLayer(snapshot, layer.id)));
    mocks.edit.mockImplementation(async () => {
      await analyze(access, "Small square", "test", undefined, true);
      return image(200, 200, "#facc15");
    });
    await expect(prepareStudioBackground(snapshot)).rejects.toMatchObject({ code: "STUDIO_PREPARATION_CHANGED", details: { stage: "composition" } });
    const latest = await loadStudioDocument(access);
    expect(latest?.preparationId).not.toBe(snapshot.preparationId);
    expect(latest?.preparationComplete).toBe(false);
  });

});

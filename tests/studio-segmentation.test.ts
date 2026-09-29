import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  createStudioInpaintMask, encodeStudioMask, normalizeStudioSelection, partitionStudioMasks,
  readStudioMask, readStudioRgba, rectangularStudioMask, restoreStudioBackground,
  sourcePixelsForMask, verifyStudioReconstruction,
} from "@/lib/server/studio-segmentation";
import { frameStudioImage, studioModelFrame, unframeStudioImage } from "@/lib/server/studio-images";
import { createStudioDocument } from "@/lib/studio";

function layers() {
  return createStudioDocument({
    sessionId: "11111111-1111-4111-8111-111111111111", assetId: "22222222-2222-4222-8222-222222222222",
    canvas: { width: 200, height: 200 }, sourceAsset: { storagePath: "generated/test.png", formatName: "Small square", sourceName: "test" },
    analysis: { layers: [
      { id: "artist", name: "Artist", type: "subject", description: "A portrait", bounds: { x: 40, y: 50, width: 40, height: 60 } },
      { id: "nameplate", name: "Nameplate", type: "text", description: "White text and black fill together", bounds: { x: 30, y: 95, width: 80, height: 25 } },
    ] },
  }).layers.slice(1);
}

async function coloredImage(width: number, height: number, color: string) {
  return sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
}

describe("source-pixel Studio decomposition", () => {
  it("preserves every original pixel even where masks overlap and an AI background changes the entire image", async () => {
    const pixels = Buffer.alloc(200 * 200 * 3);
    for (let index = 0; index < pixels.length; index += 1) pixels[index] = (index * 17) % 256;
    const source = await sharp(pixels, { raw: { width: 200, height: 200, channels: 3 } }).png().toBuffer();
    const masks = [
      rectangularStudioMask({ x: 40, y: 50, width: 40, height: 60 }, 200, 200),
      rectangularStudioMask({ x: 30, y: 95, width: 80, height: 25 }, 200, 200),
    ];
    const { union, owned } = partitionStudioMasks(layers(), masks);
    expect(owned[0][100 * 200 + 50]).toBe(0);
    expect(owned[1][100 * 200 + 50]).toBe(255);
    expect(owned.every((mask, index) => mask.every((value, pixel) => !value || !owned[1 - index][pixel]))).toBe(true);
    const plate = await restoreStudioBackground(source, await coloredImage(200, 200, "#ff0000"), union);
    const extracted = await Promise.all(owned.map((mask) => sourcePixelsForMask(source, mask)));
    expect(extracted[0].bounds).toEqual({ x: 40, y: 50, width: 40, height: 45 });
    expect(await verifyStudioReconstruction(source, plate, extracted)).toBe(0);
    const bg = await readStudioRgba(plate);
    const original = await readStudioRgba(source);
    expect(bg.data.subarray(0, 4)).toEqual(original.data.subarray(0, 4));
    expect([...bg.data.subarray((60 * 200 + 50) * 4, (60 * 200 + 50) * 4 + 3)]).toEqual([255, 0, 0]);
  });

  it("uses the full selected outline beyond approximate analysis bounds and retains source offsets", async () => {
    const mask = rectangularStudioMask({ x: 20, y: 18, width: 70, height: 80 }, 200, 200);
    const extracted = await sourcePixelsForMask(await coloredImage(200, 200, "#facc15"), mask);
    expect(extracted.bounds).toEqual({ x: 20, y: 18, width: 70, height: 80 });
    expect(await sharp(extracted.buffer).metadata()).toMatchObject({ width: 70, height: 80, hasAlpha: true });
  });

  it("rejects duplicate group and individual masks rather than opening a broken canvas", () => {
    const mask = rectangularStudioMask({ x: 40, y: 50, width: 40, height: 60 }, 200, 200);
    expect(() => partitionStudioMasks(layers(), [mask, mask])).toThrow(/duplicates another element/);
  });

  it("rejects empty, opaque and colored redraws instead of accepting them as selections", async () => {
    const region = { x: 20, y: 20, width: 40, height: 40 };
    for (const color of ["#000000", "#ffffff", "#facc15"]) {
      await expect(normalizeStudioSelection(await coloredImage(40, 40, color), region, 200, 200)).rejects.toThrow(/reliable element selection/);
    }
  });

  it("flags a clipped detail selection but allows elements that meet the true canvas edge", async () => {
    const mask = await sharp(await coloredImage(40, 40, "#000000")).composite([{ input: await coloredImage(20, 20, "#ffffff"), left: 0, top: 5 }]).png().toBuffer();
    expect((await normalizeStudioSelection(mask, { x: 20, y: 20, width: 40, height: 40 }, 200, 200)).touchesCropEdge).toBe(true);
    expect((await normalizeStudioSelection(mask, { x: 0, y: 20, width: 40, height: 40 }, 200, 200)).touchesCropEdge).toBe(false);
  });

  it("roundtrips masks and limits background edits to the union of selections", async () => {
    const mask = rectangularStudioMask({ x: 20, y: 30, width: 80, height: 60 }, 200, 200);
    expect(await readStudioMask(await encodeStudioMask(mask, 200, 200), 200, 200)).toEqual(mask);
    const editMask = await readStudioRgba(await createStudioInpaintMask(mask, 200, 200));
    expect(editMask.data[(40 * 200 + 40) * 4 + 3]).toBe(0);
    expect(editMask.data[3]).toBe(255);
    await expect(readStudioMask(await encodeStudioMask(mask, 200, 200), 300, 250)).rejects.toThrow(/dimensions/);
  });

  it.each([[728, 90], [320, 50], [120, 600], [300, 250]])("keeps %sx%s registration without a generation center-crop", async (width, height) => {
    const source = await coloredImage(width, height, "#facc15");
    const frame = studioModelFrame(width, height);
    expect(Math.max(frame.width / frame.height, frame.height / frame.width)).toBeLessThanOrEqual(3);
    const framed = await frameStudioImage(source, width, height);
    const restored = await unframeStudioImage(framed, width, height);
    expect((await readStudioRgba(restored)).data).toEqual((await readStudioRgba(source)).data);
  });
});

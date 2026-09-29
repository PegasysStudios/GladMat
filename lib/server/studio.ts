import { rethrowJobControl } from "@/lib/server/jobs/context";
import "server-only";

import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { getOpenAIConfig } from "@/lib/server/config";
import { AppError } from "@/lib/server/errors";
import { assertPngDimensions } from "@/lib/server/image-processing";
import { parseAiResponse } from "@/lib/server/jobs/ai";
import { assertAssetToken } from "@/lib/server/asset-token";
import { assetExists, downloadBuffer, setStorageStage, uploadBuffer } from "@/lib/server/storage";
import { studioFailure } from "@/lib/server/studio-request";
import type { StudioBackgroundEvent, StudioStage } from "@/lib/studio-protocol";
import { editStudioImage } from "@/lib/server/studio-images";
import { buildStudioAnalyzePrompt } from "@/lib/prompts/studio-analyze";
import { buildStudioBackgroundPrompt } from "@/lib/prompts/studio-background";
import { buildStudioLayerExtractionPrompt } from "@/lib/prompts/studio-extract-layer";
import { generatedAssetPath } from "@/lib/storage-paths";
import { resolveGeneratedAssetPath } from "@/lib/server/fine-tune";
import { mapWithConcurrency } from "@/lib/concurrency";
import { logStudio } from "@/lib/studio-debug";
import { clampStudioBounds, normalizeStudioDecomposition, studioExtractionRegion } from "@/lib/studio-decomposition";
import { reviewStudioImages, studioSelectionReviewPrompt, studioBackgroundReviewPrompt } from "@/lib/server/studio-review";
import { createStudioInpaintMask, encodeStudioMask, readStudioRgba, normalizeStudioSelection, partitionStudioMasks, readStudioMask, rectangularStudioMask, restoreStudioBackground, sourcePixelsForMask, studioSelectionPreview, verifyStudioReconstruction } from "@/lib/server/studio-segmentation";
import { STUDIO_REFERENCE_LAYER_ID } from "@/lib/studio-reference";
import {
  createStudioDocument,
  normalizeLayerOrder,
  parseStoredStudioDocument,
  StudioAccessSchema,
  StudioDecompositionSchema,
  StudioLayerSchema,
  StudioDocumentSchema,
  StudioAnalysisSchema,
  type StudioDocument,
  type StudioLayer,
} from "@/lib/studio";
import {
  isAllowedStudioLayerAssetPath,
  studioAnalysisPath,
  studioDocumentPath,
  studioOriginalPath,
  studioMaskPath,
  studioPreparedLayerPath,
  studioRootPath,
  studioBackgroundCheckpointPath,
} from "@/lib/studio-storage-paths";

type StudioAccess = z.infer<typeof StudioAccessSchema> & { preparationId?: string };

function assertPreparation(access: StudioAccess, document: StudioDocument | null): asserts document is StudioDocument {
  if (!document || !access.preparationId || document.preparationId !== access.preparationId) {
    throw new AppError("STUDIO_PREPARATION_CHANGED", "Studio preparation has changed. Reload the latest preparation to continue.",
      409, true, { recovery: "retry-preparation" });
  }
}

const studioArtifactMissing = (name: string) => ({ code: "STUDIO_ARTIFACT_MISSING" as const,
  message: `${name} is missing from Studio preparation. Retry preparation; your generated ad is still available.` });

async function studioOriginal(access: StudioAccess, document: StudioDocument) {
  const path = studioOriginalPath(access.sessionId, access.asset.requestId, document.preparationId);
  try { return await downloadBuffer(path, studioArtifactMissing("The saved artwork copy")); }
  catch (error) {
    rethrowJobControl(error);
    if (!(error instanceof AppError) || error.code !== "STUDIO_ARTIFACT_MISSING") throw error;
    // Recover an internal copy only from this document's validated source.
    const source = await downloadBuffer(document.sourceAsset.storagePath, "ASSET_NOT_FOUND");
    if (!await assertPngDimensions(source, document.canvas.width, document.canvas.height)) throw error;
    await uploadBuffer(path, source, "image/png");
    return source;
  }
}

async function preparedSelection(access: StudioAccess, document: StudioDocument, layer: StudioLayer) {
  const metadataPath = studioPreparedLayerPath(access.sessionId, access.asset.requestId, layer.id, document.preparationId);
  const maskPath = studioMaskPath(access.sessionId, access.asset.requestId, layer.id, document.preparationId);
  if (!await assetExists(metadataPath) || !await assetExists(maskPath)) return null;
  const [metadata, image] = await Promise.all([
    downloadBuffer(metadataPath, studioArtifactMissing(`The selection record for ${layer.name}`)),
    downloadBuffer(maskPath, studioArtifactMissing(`The selection for ${layer.name}`)),
  ]).catch((error) => {
    if (error instanceof AppError && error.code === "STUDIO_ARTIFACT_MISSING") return [null, null];
    throw error;
  });
  if (!metadata || !image) return null;
  try {
    const stored = JSON.parse(metadata.toString("utf8"));
    const cached = StudioLayerSchema.safeParse(stored.layer);
    if (!cached.success || cached.data.id !== layer.id || cached.data.assetPath !== layer.assetPath
      || stored.sourcePath !== document.sourceAsset.storagePath || cached.data.description !== layer.description
      || JSON.stringify(cached.data.sourceBounds) !== JSON.stringify(layer.sourceBounds)
      || cached.data.extraction !== layer.extraction || cached.data.status !== "complete") return null;
    const mask = await readStudioMask(image, document.canvas.width, document.canvas.height);
    let selected = 0;
    for (const pixel of mask) { if (pixel) selected += 1; if (selected >= 3) break; }
    if (selected < 3) return null;
    return { mask, layer: cached.data };
  } catch { return null; } // A corrupt cache is repaired, never treated as verified.
}

function sourcePath(access: StudioAccess) {
  return generatedAssetPath(
    access.sessionId,
    access.asset.width,
    access.asset.height,
    access.asset.requestId,
  );
}

export function assertStudioAccess(access: StudioAccess) {
  assertAssetToken(access.sessionId, access.asset, access.assetToken);
}

function isSourcePathForAccess(access: StudioAccess, path: string) {
  const base = sourcePath(access);
  return path === base || (path.startsWith(base.slice(0, -4) + ".")
    && /^[a-f0-9-]{36}\.png$/.test(path.slice(base.length - 3)));
}

function assertStudioDocumentIdentity(access: StudioAccess, document: StudioDocument) {
  const assetId = access.asset.requestId;
  if (
    document.sessionId !== access.sessionId
    || document.assetId !== assetId
    || document.canvas.width !== access.asset.width
    || document.canvas.height !== access.asset.height
    || !isSourcePathForAccess(access, document.sourceAsset.storagePath)
  ) {
    throw new AppError("INVALID_REQUEST", "The Studio document does not match this asset.", 400);
  }

  for (const layer of document.layers) {
    if (!isAllowedStudioLayerAssetPath(access.sessionId, assetId, layer, document.preparationId)) {
      throw new AppError("INVALID_REQUEST", "The Studio document contains an invalid layer path.", 400);
    }
  }
}

export async function loadStudioDocument(access: StudioAccess) {
  assertStudioAccess(access);
  const path = studioDocumentPath(access.sessionId, access.asset.requestId);
  if (!(await assetExists(path))) return null;
  const data = await downloadBuffer(path, studioArtifactMissing("The Studio document"));
  try {
    const stored = JSON.parse(data.toString("utf8")) as unknown;
    const document = parseStoredStudioDocument(stored);
    if (!document) {
      logStudio("studio-document-stale", {
        sessionId: access.sessionId,
        assetId: access.asset.requestId,
        pipelineVersion: stored && typeof stored === "object" && "pipelineVersion" in stored
          ? stored.pipelineVersion
          : null,
      });
      return null;
    }
    assertStudioDocumentIdentity(access, document);
    const activePath = await resolveGeneratedAssetPath(access.sessionId, access.asset.width, access.asset.height, access.asset.requestId);
    return activePath === document.sourceAsset.storagePath ? document : null;
  } catch (error) {
    rethrowJobControl(error);
    if (error instanceof AppError) throw error;
    throw new AppError(
      "STUDIO_FAILED",
      "This Studio document could not be loaded. Please try again.",
      409,
      true,
    );
  }
}

async function publishStudioDocument(access: StudioAccess, input: StudioDocument) {
  assertStudioAccess(access);
  const document = StudioDocumentSchema.parse({
    ...input,
    layers: normalizeLayerOrder(input.layers),
    updatedAt: new Date().toISOString(),
  });
  assertStudioDocumentIdentity(access, document);
  await uploadBuffer(
    studioDocumentPath(access.sessionId, access.asset.requestId),
    JSON.stringify(document),
    "application/json; charset=utf-8", true, "0",
  );
  return document;
}

export async function saveStudioDocument(access: StudioAccess, input: StudioDocument) {
  const current = await loadStudioDocument(access);
  assertPreparation(access, current);
  if (!current.preparationComplete || !input.preparationComplete) {
    throw new AppError("STUDIO_FAILED", "Studio is still preparing its layers. Wait for the canvas before saving edits.", 409, true,
      { stage: "composition", recovery: "retry-preparation" });
  }
  if (input.preparationId !== current.preparationId || input.reconstructionError !== current.reconstructionError
    || input.createdAt !== current.createdAt || JSON.stringify(input.sourceAsset) !== JSON.stringify(current.sourceAsset)
    || input.backgroundDescription !== current.backgroundDescription) {
    throw new AppError("INVALID_REQUEST", "Studio preparation information cannot be changed by an editor save.", 400);
  }
  for (const layer of input.layers) {
    const original = current.layers.find((candidate) => candidate.id === layer.id);
    if (!original || layer.status !== "complete" || layer.error || ["type", "description", "assetPath", "locked", "sourceBounds", "extraction", "extractionConfidence"].some(
      (key) => JSON.stringify(layer[key as keyof StudioLayer]) !== JSON.stringify(original[key as keyof StudioLayer]),
    )) throw new AppError("INVALID_REQUEST", "An editor save cannot replace Studio's prepared layer information.", 400);
  }
  return publishStudioDocument(access, input);
}

export async function analyzeStudioAsset(
  access: StudioAccess,
  formatName: string,
  sourceName: string,
  signal?: AbortSignal,
  rebuild = false,
) {
  assertStudioAccess(access);
  const existing = await loadStudioDocument(access);
  if (existing && !rebuild) {
    logStudio("studio-document-reused", {
      sessionId: access.sessionId,
      assetId: access.asset.requestId,
      pipelineVersion: existing.pipelineVersion,
      layers: existing.layers.map((layer) => ({ id: layer.id, type: layer.type, status: layer.status })),
    });
    return existing;
  }

  const selectedPath = await resolveGeneratedAssetPath(access.sessionId, access.asset.width, access.asset.height, access.asset.requestId);
  const target = await downloadBuffer(selectedPath, "ASSET_NOT_FOUND");
  if (!await assertPngDimensions(target, access.asset.width, access.asset.height)) {
    throw new AppError("STUDIO_FAILED", "The selected artwork dimensions do not match this Studio canvas.", 409);
  }
  const analyze = async (previousPlan?: unknown) => {
    const response = await parseAiResponse({
      model: getOpenAIConfig().analysisModel, store: false,
      input: [{ role: "user", content: [
        { type: "input_text", text: buildStudioAnalyzePrompt(access.asset.width, access.asset.height, previousPlan) },
        { type: "input_image", image_url: `data:image/png;base64,${target.toString("base64")}`, detail: "original" },
      ] }],
      text: { format: zodTextFormat(StudioDecompositionSchema, "studio_decomposition") },
    }, { signal });
    const parsed = StudioDecompositionSchema.safeParse(response.output_parsed);
    if (!parsed.success) throw new AppError("STUDIO_FAILED", "Studio could not identify reliable editable layers. Please retry.", 502, true);
    return parsed.data;
  };
  const proposed = await analyze();
  const reviewed = await analyze(proposed);
  const analysis = normalizeStudioDecomposition(reviewed, access.asset.width, access.asset.height);
  const foreground = analysis.layers;
  if (!foreground.length) throw new AppError("STUDIO_FAILED", "Studio could not identify editable layers. Please retry.", 502, true);

  // Preserve the previous document, including edits, when upgrading a pipeline
  // or reopening an asset whose fine-tuned output has changed.
  const documentPath = studioDocumentPath(access.sessionId, access.asset.requestId);
  if (await assetExists(documentPath)) {
    const previous = await downloadBuffer(documentPath, studioArtifactMissing("The previous Studio document"));
    await uploadBuffer(`${studioRootPath(access.sessionId, access.asset.requestId)}/history/${randomUUID()}.json`, previous, "application/json", false);
  }
  logStudio("studio-layers-detected", {
    sessionId: access.sessionId,
    assetId: access.asset.requestId,
    canvas: `${access.asset.width}x${access.asset.height}`,
    layers: foreground.map((layer) => ({
      id: layer.id,
      name: layer.name,
      type: layer.type,
      bounds: layer.bounds,
    })),
  });

  const now = new Date().toISOString();
  const preparationId = randomUUID();
  const document = createStudioDocument({
    sessionId: access.sessionId,
    assetId: access.asset.requestId,
    canvas: { width: access.asset.width, height: access.asset.height },
    sourceAsset: { storagePath: selectedPath, formatName, sourceName },
    analysis,
    preparationId,
    now,
  });

  await Promise.all([
    uploadBuffer(studioOriginalPath(access.sessionId, access.asset.requestId, document.preparationId), target, "image/png"),
    uploadBuffer(
      studioAnalysisPath(access.sessionId, access.asset.requestId, preparationId),
      JSON.stringify(analysis),
      "application/json; charset=utf-8", true, "0",
    ),
  ]);
  await uploadBuffer(
    studioDocumentPath(access.sessionId, access.asset.requestId),
    JSON.stringify(document),
    "application/json; charset=utf-8", true, "0",
  );
  return document;
}

export async function prepareStudioBackground(
  access: StudioAccess,
  signal?: AbortSignal,
  onEvent?: (event: StudioBackgroundEvent) => void,
) {
  let stage: StudioStage = "extracting";
  const report = (next: "background" | "composition", status: "working" | "complete") => {
    stage = next;
    setStorageStage(next);
    onEvent?.({ type: "stage", preparationId: access.preparationId!, stage: next, status });
  };
  try {
    assertStudioAccess(access);
    setStorageStage(stage);
    const savedDocument = await loadStudioDocument(access);
    assertPreparation(access, savedDocument);
    let document = savedDocument;
    if (document.preparationComplete) {
      const present = await mapWithConcurrency(document.layers, 3, (layer) => assetExists(layer.assetPath));
      if (present.every(Boolean)) return document;
      // Repair published PNGs using the original inventory, preserving edits
      // and deletions in the editor's saved document.
      const analysis = StudioAnalysisSchema.parse(JSON.parse((await downloadBuffer(
        studioAnalysisPath(access.sessionId, access.asset.requestId, document.preparationId), studioArtifactMissing("The saved layer inventory"),
      )).toString("utf8")));
      document = createStudioDocument({ sessionId: document.sessionId, assetId: document.assetId, canvas: document.canvas,
        sourceAsset: document.sourceAsset, preparationId: document.preparationId, analysis, now: document.createdAt });
    }
    const background = document.layers.find((layer) => layer.type === "background");
    if (!background) throw new AppError("STUDIO_FAILED", "The Studio background definition is missing. Reopen this ad from GladMat.", 409);
    const source = await studioOriginal(access, document);
    const foreground = document.layers.filter((layer) => layer.type !== "background");
    const selections = await mapWithConcurrency(foreground, 3, (layer) => preparedSelection(access, document, layer));
    const missing = foreground.filter((_, index) => !selections[index]);
    if (missing.length) throw new AppError("STUDIO_SELECTIONS_MISSING",
      `Studio still needs verified selections for: ${missing.map((layer) => layer.name).join(", ")}. Retry preparation to finish these elements; your generated ad is available.`,
      409, true, { stage: "extracting", recovery: "retry-preparation", layerIds: missing.map((layer) => layer.id) });
    const masks = selections.map((selection) => selection!.mask);
    // Include source bytes, layer order and actual masks. Repaired selections
    // invalidate the plate, while a failed upload/assembly can reuse paid work.
    const digest = createHash("sha256").update(source);
    for (let index = 0; index < masks.length; index += 1) digest.update(foreground[index].id).update(masks[index]);
    const selectionDigest = digest.digest("hex");
    const { union, owned } = partitionStudioMasks(foreground, masks);
    const checkpointPath = studioBackgroundCheckpointPath(access.sessionId, access.asset.requestId, document.preparationId);
    let plate: Buffer | undefined;
    report("background", "working");
    if (await assetExists(checkpointPath) && await assetExists(background.assetPath)) {
      const metadata = await downloadBuffer(checkpointPath, studioArtifactMissing("The background checkpoint"));
      let checkpoint: { preparationId?: string; selectionDigest?: string } = {};
      try { checkpoint = JSON.parse(metadata.toString("utf8")); } catch { /* Repair an invalid checkpoint. */ }
      if (checkpoint.preparationId === document.preparationId && checkpoint.selectionDigest === selectionDigest) {
        const cached = await downloadBuffer(background.assetPath, studioArtifactMissing("The reviewed background"));
        if (await assertPngDimensions(cached, document.canvas.width, document.canvas.height)) plate = cached;
      }
    }
    if (!plate) {
      const mask = await createStudioInpaintMask(union, document.canvas.width, document.canvas.height);
      let corrections = "";
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const generated = await editStudioImage([{ buffer: source, filename: "target.png" }],
          buildStudioBackgroundPrompt(document.canvas.width, document.canvas.height, foreground, document.backgroundDescription, corrections),
          "opaque", document.canvas.width, document.canvas.height, access.sessionId, signal, mask);
        const candidate = await restoreStudioBackground(source, generated, union);
        const review = await reviewStudioImages(studioBackgroundReviewPrompt(foreground), [
          { label: "ORIGINAL advertisement", buffer: source }, { label: "CLEAN BACKGROUND with original unselected pixels restored", buffer: candidate },
        ], signal);
        if (review.passed) { plate = candidate; break; }
        corrections = review.issues.join("; ");
      }
      if (!plate) throw new AppError("STUDIO_FAILED", "Studio could not remove every foreground element from the background. Retry preparation.", 502, true);
      await uploadBuffer(background.assetPath, plate, "image/png", true, "0");
      await uploadBuffer(checkpointPath, JSON.stringify({ preparationId: document.preparationId, selectionDigest }), "application/json", true, "0");
    }
    report("background", "complete");
    report("composition", "working");
    const decoded = await readStudioRgba(source);
    const extracted = await mapWithConcurrency(foreground, 2, async (layer, index) => ({
      ...await sourcePixelsForMask(source, owned[index], decoded), layer,
    }));
    const reconstructionError = await verifyStudioReconstruction(source, plate, extracted);
    await mapWithConcurrency(extracted, 3, (item) => uploadBuffer(item.layer.assetPath, item.buffer, "image/png", true, "0"));
    // A different browser may have started a fresh preparation while this one
    // was working. Its document must not be overwritten by this response.
    assertPreparation(access, await loadStudioDocument(access));
    const finalized = savedDocument.preparationComplete ? savedDocument : await publishStudioDocument(access, {
      ...document, preparationComplete: true, reconstructionError,
      layers: [
        { ...background, status: "complete", error: undefined },
        ...extracted.map((item): StudioLayer => ({ ...item.layer, ...item.bounds, status: "complete", error: undefined })),
      ],
    });
    logStudio("studio-reconstruction-verified", { assetId: access.asset.requestId, preparationId: document.preparationId, reconstructionError, layers: foreground.length });
    // The client keeps composition working until every PNG has decoded.
    return finalized;
  } catch (error) {
    rethrowJobControl(error); throw studioFailure(error, stage); }
}

export async function extractStudioLayer(access: StudioAccess, layerId: string, signal?: AbortSignal, repair = false) {
  assertStudioAccess(access);
  const document = await loadStudioDocument(access);
  assertPreparation(access, document);
  const layer = document.layers.find((candidate) => candidate.id === layerId);
  if (!layer || layer.type === "background" || layer.locked) throw new AppError("INVALID_REQUEST", "This Studio layer cannot be extracted.", 400);
  if (document.preparationComplete && layer.status === "complete" && await assetExists(layer.assetPath)) return { preparationId: document.preparationId, layerId, reused: true, layer };
  const metadataPath = studioPreparedLayerPath(access.sessionId, access.asset.requestId, layerId, document.preparationId);
  const maskPath = studioMaskPath(access.sessionId, access.asset.requestId, layerId, document.preparationId);
  const cached = repair ? null : await preparedSelection(access, document, layer);
  if (cached) return { preparationId: document.preparationId, layerId, reused: true, layer: cached.layer };
  const source = await studioOriginal(access, document);
  const bounds = layer.sourceBounds;
  if (!bounds) throw new AppError("STUDIO_FAILED", "Studio is missing the source selection bounds.", 409);
  let selection: Buffer | undefined;
  let corrections = "";
  let selectionBounds = bounds;
  if (layer.extraction === "rectangle") {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const candidate = rectangularStudioMask(selectionBounds, document.canvas.width, document.canvas.height);
      const review = await reviewStudioImages(studioSelectionReviewPrompt(layer), [
        { label: "ORIGINAL advertisement", buffer: source },
        { label: "MAGENTA rectangular panel selection", buffer: await studioSelectionPreview(source, candidate) },
      ], signal);
      if (review.passed) { selection = candidate; break; }
      corrections = review.issues.join("; ");
      const corrected = review.correctedBounds && clampStudioBounds(review.correctedBounds, document.canvas.width, document.canvas.height);
      if (!corrected) break;
      selectionBounds = corrected;
    }
    // If the panel is irregular or has an integrated shadow, use a silhouette
    // rather than indefinitely repeating a rejected approximate rectangle.
  }
  let region = studioExtractionRegion(selectionBounds, document.canvas.width, document.canvas.height);
  for (let attempt = 0; attempt < 2 && !selection; attempt += 1) {
    const crop = await sharp(source).extract({ left: region.x, top: region.y, width: region.width, height: region.height }).png().toBuffer();
    try {
      const generated = await editStudioImage([{ buffer: crop, filename: "source-detail.png" }],
        buildStudioLayerExtractionPrompt({ ...layer, sourceBounds: selectionBounds }, document.canvas.width, document.canvas.height, region, corrections),
        "opaque", region.width, region.height, access.sessionId, signal);
      const normalized = await normalizeStudioSelection(generated, region, document.canvas.width, document.canvas.height);
      if (normalized.touchesCropEdge) {
        region = studioExtractionRegion({ x: region.x, y: region.y, width: region.width, height: region.height }, document.canvas.width, document.canvas.height);
        corrections = "The selection touches the detail crop boundary. Use this larger crop to select the complete visible element, preserving registration.";
        continue;
      }
      const preview = await studioSelectionPreview(source, normalized.mask);
      const review = await reviewStudioImages(studioSelectionReviewPrompt(layer), [
        { label: "ORIGINAL advertisement", buffer: source }, { label: "MAGENTA selection of this element", buffer: preview },
      ], signal);
      if (review.passed) selection = normalized.mask;
      else corrections = review.issues.join("; ");
    } catch (error) {
    rethrowJobControl(error);
      if (!(error instanceof AppError) || error.code !== "STUDIO_FAILED" || attempt === 1) throw error;
      corrections = error.message;
    }
  }
  if (!selection) throw new AppError("STUDIO_FAILED", `Studio could not verify the complete selection for ${layer.name}. Retry this layer.`, 502, true);
  const extracted = await sourcePixelsForMask(source, selection);
  const prepared: StudioLayer = { ...layer, ...extracted.bounds, status: "complete", error: undefined };
  assertPreparation(access, await loadStudioDocument(access));
  await Promise.all([
    uploadBuffer(maskPath, await encodeStudioMask(selection, document.canvas.width, document.canvas.height), "image/png", true, "0"),
    uploadBuffer(metadataPath, JSON.stringify({ sourcePath: document.sourceAsset.storagePath, layer: prepared }), "application/json", true, "0"),
  ]);
  return { preparationId: document.preparationId, layerId, reused: false, layer: prepared };
}

export async function loadStudioLayerImage(access: StudioAccess, layerId: string) {
  assertStudioAccess(access);
  const document = await loadStudioDocument(access);
  assertPreparation(access, document);
  if (layerId === STUDIO_REFERENCE_LAYER_ID) {
    return studioOriginal(access, document);
  }
  const layer = document.layers.find((candidate) => candidate.id === layerId);
  if (!layer) throw new AppError("INVALID_REQUEST", "This Studio layer does not exist.", 400);
  if (!isAllowedStudioLayerAssetPath(access.sessionId, access.asset.requestId, layer, document.preparationId)) {
    throw new AppError("INVALID_REQUEST", "This Studio layer path is not allowed.", 400);
  }
  return downloadBuffer(layer.assetPath, { code: "STUDIO_ARTIFACT_MISSING",
    message: `The editable image for ${layer.name} is missing. Reopen Studio to repair its layer files; your generated ad is still available.` });
}

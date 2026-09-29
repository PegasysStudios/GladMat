import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { SaveFineTuneRequestSchema, SignAssetRequestSchema } from "@/lib/schemas";
import { assertAssetToken } from "@/lib/server/asset-token";
import { AppError, errorResponse, logServerError } from "@/lib/server/errors";
import { expandGeneratedBleed, loadFineTuneState, renderFineTunedImage } from "@/lib/server/fine-tune";
import { assertSameOrigin, enforceRateLimit, parseJson } from "@/lib/server/request";
import { assertSessionToken } from "@/lib/server/session-token";
import { assetExists, createSignedPreview, downloadBuffer, uploadBuffer } from "@/lib/server/storage";
import { generatedBleedPath, generatedEditorBleedPath, generatedFineTunePath, generatedFineTunedOutputPath } from "@/lib/storage-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function assertAccess(input: { sessionId: string; asset: { requestId: string; width: number; height: number } } & (
  { sessionToken: string } | { assetToken: string }
)) {
  if ("sessionToken" in input) assertSessionToken(input.sessionId, input.sessionToken);
  else assertAssetToken(input.sessionId, input.asset, input.assetToken);
}

function paths(input: { sessionId: string; asset: { requestId: string; width: number; height: number } }) {
  const { sessionId, asset } = input;
  return {
    bleed: generatedEditorBleedPath(sessionId, asset.width, asset.height, asset.requestId),
    legacyBleed: generatedBleedPath(sessionId, asset.width, asset.height, asset.requestId),
    transform: generatedFineTunePath(sessionId, asset.width, asset.height, asset.requestId),
  };
}

async function ensureEditorBleed(path: { bleed: string; legacyBleed: string }) {
  if (await assetExists(path.bleed)) return path.bleed;
  if (!(await assetExists(path.legacyBleed))) {
    throw new AppError("ASSET_NOT_FOUND", "Fine-tuning is available for newly generated AdMats. Regenerate this size to enable it.", 404);
  }
  const legacy = await downloadBuffer(path.legacyBleed, "ASSET_NOT_FOUND");
  await uploadBuffer(path.bleed, await expandGeneratedBleed(legacy), "image/png");
  return path.bleed;
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    assertSameOrigin(request);
    enforceRateLimit(request, 80);
    const input = await parseJson(request, SignAssetRequestSchema);
    assertAccess(input);
    const path = paths(input);
    const bleedPath = await ensureEditorBleed(path);
    return NextResponse.json({
      bleedUrl: await createSignedPreview(bleedPath),
      transform: (await loadFineTuneState(input.sessionId, input.asset.width, input.asset.height, input.asset.requestId)).transform,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logServerError(error, { route: "/api/assets/fine-tune", requestId });
    return errorResponse(error, requestId);
  }
}

export async function PUT(request: NextRequest) {
  const requestId = randomUUID();
  try {
    assertSameOrigin(request);
    enforceRateLimit(request, 40);
    const input = await parseJson(request, SaveFineTuneRequestSchema);
    assertAccess(input);
    const path = paths(input);
    const bleedPath = await ensureEditorBleed(path);
    const bleed = await downloadBuffer(bleedPath, "ASSET_NOT_FOUND");
    const output = await renderFineTunedImage(bleed, input.asset.width, input.asset.height, input.transform);
    const versionId = randomUUID();
    const outputPath = generatedFineTunedOutputPath(input.sessionId, input.asset.width, input.asset.height, input.asset.requestId, versionId);
    // Publish a new object before switching the active version so signed downloads cannot serve a cached prior edit.
    await uploadBuffer(outputPath, output, "image/png", false);
    const previewUrl = await createSignedPreview(outputPath);
    await uploadBuffer(path.transform, JSON.stringify({ transform: input.transform, versionId }), "application/json", true, "0");
    return NextResponse.json({ previewUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logServerError(error, { route: "/api/assets/fine-tune", requestId });
    return errorResponse(error, requestId);
  }
}

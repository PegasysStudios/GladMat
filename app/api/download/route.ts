import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { outputFilename } from "@/lib/filenames";
import { DownloadAssetRequestSchema } from "@/lib/schemas";
import { AppError, errorResponse, logServerError } from "@/lib/server/errors";
import { assertPngDimensions } from "@/lib/server/image-processing";
import { assertSameOrigin, enforceRateLimit, parseJson } from "@/lib/server/request";
import { assertSessionToken } from "@/lib/server/session-token";
import { createSignedDownload, downloadBuffer } from "@/lib/server/storage";
import { generatedAssetPath } from "@/lib/storage-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    assertSameOrigin(request);
    enforceRateLimit(request, 80);
    const input = await parseJson(request, DownloadAssetRequestSchema);
    assertSessionToken(input.sessionId, input.sessionToken);
    const path = generatedAssetPath(
      input.sessionId,
      input.asset.width,
      input.asset.height,
      input.asset.requestId,
    );
    const asset = await downloadBuffer(path, "ASSET_NOT_FOUND");
    if (!(await assertPngDimensions(asset, input.asset.width, input.asset.height))) {
      throw new AppError("PROCESSING_FAILED", "The stored asset dimensions are invalid. Regenerate it.", 409);
    }
    const filename = outputFilename(input.sourceName, input.asset.width, input.asset.height);
    return NextResponse.json(
      { downloadUrl: await createSignedDownload(path, filename), filename },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logServerError(error, { route: "/api/download", requestId });
    return errorResponse(error, requestId);
  }
}

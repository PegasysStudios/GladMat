import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeBaseName } from "@/lib/filenames";
import { UploadRequestSchema } from "@/lib/schemas";
import { AppError, errorResponse, logServerError } from "@/lib/server/errors";
import { normalizeSourceImage } from "@/lib/server/image-processing";
import { assertSameOrigin, enforceRateLimit, parseJson } from "@/lib/server/request";
import { assertSessionToken, mintSessionToken } from "@/lib/server/session-token";
import {
  createSignedPreview,
  createSignedUpload,
  downloadBuffer,
  uploadBuffer,
} from "@/lib/server/storage";
import {
  isExpectedOriginalPath,
  normalizedSourcePath,
  originalSourcePath,
} from "@/lib/storage-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    assertSameOrigin(request);
    enforceRateLimit(request, 40);
    const input = await parseJson(request, UploadRequestSchema);

    if (input.action === "prepare") {
      const sessionId = randomUUID();
      const originalPath = originalSourcePath(sessionId, EXTENSIONS[input.mimeType]);
      const signed = await createSignedUpload(originalPath);
      return NextResponse.json(
        {
          sessionId,
          sessionToken: mintSessionToken(sessionId),
          originalPath,
          signedUrl: signed.signedUrl,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    assertSessionToken(input.sessionId, input.sessionToken);
    if (!isExpectedOriginalPath(input.originalPath, input.sessionId)) {
      throw new AppError("INVALID_REQUEST", "The source upload path is invalid.", 400);
    }

    const original = await downloadBuffer(input.originalPath, "SOURCE_NOT_FOUND");
    const normalized = await normalizeSourceImage(original);
    const sourcePath = normalizedSourcePath(input.sessionId);
    await uploadBuffer(sourcePath, normalized.buffer, "image/png");

    return NextResponse.json(
      {
        sessionId: input.sessionId,
        sessionToken: input.sessionToken,
        sourcePath,
        originalName: input.originalName,
        sourceName: sanitizeBaseName(input.originalName),
        width: normalized.width,
        height: normalized.height,
        previewUrl: await createSignedPreview(sourcePath),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logServerError(error, { route: "/api/upload", requestId });
    return errorResponse(error, requestId);
  }
}

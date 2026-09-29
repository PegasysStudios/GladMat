import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SessionIdSchema, SessionTokenSchema } from "@/lib/schemas";
import { loadStoredAnalysis } from "@/lib/server/analyze-source";
import { AppError, errorResponse, logServerError } from "@/lib/server/errors";
import { assertSameOrigin, enforceRateLimit, parseJson } from "@/lib/server/request";
import { mintSessionToken } from "@/lib/server/session-token";
import { assertSourceToken } from "@/lib/server/source-token";
import { assetExists, createSignedPreview } from "@/lib/server/storage";
import { normalizedSourcePath } from "@/lib/storage-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RestoreArtworkSchema = z.object({
  sessionId: SessionIdSchema,
  sourceToken: SessionTokenSchema,
}).strict();

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    assertSameOrigin(request);
    enforceRateLimit(request, 60);
    const input = await parseJson(request, RestoreArtworkSchema);
    assertSourceToken(input.sessionId, input.sourceToken);
    const sourcePath = normalizedSourcePath(input.sessionId);
    if (!await assetExists(sourcePath)) {
      throw new AppError("SOURCE_NOT_FOUND", "This saved artwork is no longer available in storage. Upload it again.", 404);
    }
    let analysis = null;
    try {
      analysis = await loadStoredAnalysis(input.sessionId);
    } catch (error) {
      // A successfully uploaded source can be saved before analysis finishes.
      if (!(error instanceof AppError)
        || (error.code !== "SOURCE_NOT_FOUND" && error.code !== "ANALYSIS_FAILED")) throw error;
    }
    return NextResponse.json({
      sessionToken: mintSessionToken(input.sessionId),
      previewUrl: await createSignedPreview(sourcePath),
      analysis,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logServerError(error, { route: "/api/artwork/restore", requestId });
    return errorResponse(error, requestId);
  }
}

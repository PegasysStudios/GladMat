import { durableJobsEnabled } from "@/lib/server/jobs/store";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AnalyzeRequestSchema } from "@/lib/schemas";
import { analyzeSourceArtwork } from "@/lib/server/analyze-source";
import { AppError, errorResponse, logServerError } from "@/lib/server/errors";
import { assertSameOrigin, enforceRateLimit, parseJson } from "@/lib/server/request";
import { assertSessionToken } from "@/lib/server/session-token";
import { isExpectedSourcePath } from "@/lib/storage-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    assertSameOrigin(request);
    enforceRateLimit(request, 20);
    const input = await parseJson(request, AnalyzeRequestSchema);
    assertSessionToken(input.sessionId, input.sessionToken);
    if (!isExpectedSourcePath(input.sourcePath, input.sessionId)) {
      throw new AppError("INVALID_REQUEST", "The source artwork path is invalid.", 400);
    }
    if (durableJobsEnabled()) throw new AppError("STUDIO_CLIENT_OUTDATED", "GladMat has been updated. Refresh this page to resume background analysis.", 409);
    const analysis = await analyzeSourceArtwork(input.sessionId, input.sourcePath, request.signal);
    return NextResponse.json(
      { analysis },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logServerError(error, { route: "/api/analyze", requestId });
    return errorResponse(
      error,
      requestId,
      new AppError(
        "ANALYSIS_FAILED",
        "The artwork could not be analyzed. Please try again.",
        502,
        true,
      ),
    );
  }
}

import { durableJobsEnabled } from "@/lib/server/jobs/store";
import { AppError as DurableRouteError } from "@/lib/server/errors";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { StudioAnalyzeRequestSchema } from "@/lib/studio";
import { logServerError } from "@/lib/server/errors";
import { assertSameOrigin, enforceRateLimit } from "@/lib/server/request";
import { parseStudioRequest, studioErrorResponse } from "@/lib/server/studio-request";
import { withStorageContext } from "@/lib/server/storage";
import { analyzeStudioAsset } from "@/lib/server/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    assertSameOrigin(request);
    enforceRateLimit(request, 20, "studio-analyze");
    if (durableJobsEnabled()) throw new DurableRouteError("STUDIO_CLIENT_OUTDATED", "Studio has been updated. Refresh this page to resume durable preparation.", 409, false, { stage: "analyzing", recovery: "reload" });
    const input = await parseStudioRequest(request, StudioAnalyzeRequestSchema);
    const document = await withStorageContext({ requestId, stage: "analyzing", sessionId: input.sessionId, assetId: input.asset.requestId }, () => analyzeStudioAsset(
      input,
      input.formatName,
      input.sourceName,
      request.signal,
      input.rebuild,
    ));
    return NextResponse.json({ document }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logServerError(error, { route: "/api/studio/analyze", requestId });
    return studioErrorResponse(error, requestId, "analyzing");
  }
}

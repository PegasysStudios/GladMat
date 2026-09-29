import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { StudioExtractRequestSchema } from "@/lib/studio";
import { logServerError } from "@/lib/server/errors";
import { assertSameOrigin, enforceRateLimit } from "@/lib/server/request";
import { parseStudioRequest, studioErrorResponse } from "@/lib/server/studio-request";
import { withStorageContext } from "@/lib/server/storage";
import { extractStudioLayer } from "@/lib/server/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  let layerId: string | undefined;
  try {
    assertSameOrigin(request);
    enforceRateLimit(request, 60, "studio-extract");
    const input = await parseStudioRequest(request, StudioExtractRequestSchema);
    layerId = input.layerId;
    const result = await withStorageContext({ requestId, stage: "extracting", sessionId: input.sessionId, assetId: input.asset.requestId, preparationId: input.preparationId, layerId: input.layerId }, () => extractStudioLayer(input, input.layerId, request.signal, input.repair));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logServerError(error, { route: "/api/studio/extract", requestId });
    return studioErrorResponse(error, requestId, "extracting", layerId ? [layerId] : undefined);
  }
}

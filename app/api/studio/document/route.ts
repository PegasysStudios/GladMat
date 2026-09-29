import { durableJobsEnabled } from "@/lib/server/jobs/store";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { StudioAssetRequestSchema, StudioSaveRequestSchema } from "@/lib/studio";
import { logServerError } from "@/lib/server/errors";
import { assertSameOrigin, enforceRateLimit } from "@/lib/server/request";
import { parseStudioRequest, studioErrorResponse } from "@/lib/server/studio-request";
import { withStorageContext } from "@/lib/server/storage";
import { loadStudioDocument, saveStudioDocument } from "@/lib/server/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    assertSameOrigin(request);
    enforceRateLimit(request, 100, "studio-load");
    const input = await parseStudioRequest(request, StudioAssetRequestSchema);
    const document = await withStorageContext({ requestId, stage: "analyzing", sessionId: input.sessionId, assetId: input.asset.requestId }, () => loadStudioDocument(input));
    return NextResponse.json({ document, durable: durableJobsEnabled() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logServerError(error, { route: "/api/studio/document", method: "POST", requestId });
    return studioErrorResponse(error, requestId, "analyzing");
  }
}

export async function PUT(request: NextRequest) {
  const requestId = randomUUID();
  try {
    assertSameOrigin(request);
    enforceRateLimit(request, 120, "studio-save");
    const input = await parseStudioRequest(request, StudioSaveRequestSchema);
    const document = await withStorageContext({ requestId, stage: "composition", sessionId: input.sessionId, assetId: input.asset.requestId, preparationId: input.preparationId }, () => saveStudioDocument(input, input.document));
    return NextResponse.json({ document, durable: durableJobsEnabled() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logServerError(error, { route: "/api/studio/document", method: "PUT", requestId });
    return studioErrorResponse(error, requestId, "composition");
  }
}

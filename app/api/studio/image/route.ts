import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { StudioImageRequestSchema } from "@/lib/studio";
import { logServerError } from "@/lib/server/errors";
import { assertSameOrigin, enforceRateLimit } from "@/lib/server/request";
import { parseStudioRequest, studioErrorResponse } from "@/lib/server/studio-request";
import { withStorageContext } from "@/lib/server/storage";
import { loadStudioLayerImage } from "@/lib/server/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    assertSameOrigin(request);
    enforceRateLimit(request, 180, "studio-image");
    const input = await parseStudioRequest(request, StudioImageRequestSchema);
    const image = await withStorageContext({ requestId, stage: "composition", sessionId: input.sessionId, assetId: input.asset.requestId, preparationId: input.preparationId, layerId: input.layerId }, () => loadStudioLayerImage(input, input.layerId));
    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logServerError(error, { route: "/api/studio/image", requestId });
    return studioErrorResponse(error, requestId, "composition");
  }
}

import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { StudioPreparationRequestSchema } from "@/lib/studio";
import type { StudioBackgroundEvent } from "@/lib/studio-protocol";
import { logServerError, publicError } from "@/lib/server/errors";
import { assertSameOrigin, enforceRateLimit } from "@/lib/server/request";
import { parseStudioRequest, studioErrorResponse, studioFailure } from "@/lib/server/studio-request";
import { withStorageContext } from "@/lib/server/storage";
import { prepareStudioBackground } from "@/lib/server/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  let input;
  try {
    assertSameOrigin(request);
    enforceRateLimit(request, 20, "studio-background");
    input = await parseStudioRequest(request, StudioPreparationRequestSchema);
  } catch (error) {
    logServerError(error, { route: "/api/studio/background", requestId });
    return studioErrorResponse(error, requestId, "background");
  }
  const encoder = new TextEncoder();
  let connected = true;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StudioBackgroundEvent) => {
        if (connected && !request.signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const document = await withStorageContext({ requestId, stage: "extracting", sessionId: input.sessionId,
          assetId: input.asset.requestId, preparationId: input.preparationId }, () => prepareStudioBackground(input, request.signal, send));
        send({ type: "complete", preparationId: input.preparationId, document });
      } catch (error) {
        const failure = studioFailure(error, "background");
        logServerError(error, { route: "/api/studio/background", requestId, sessionId: input.sessionId,
          assetId: input.asset.requestId, preparationId: input.preparationId, stage: failure.details.stage });
        send({ type: "error", preparationId: input.preparationId, error: publicError(failure, requestId) });
      } finally {
        if (connected) controller.close();
      }
    },
    cancel() { connected = false; },
  });
  return new Response(stream, { headers: {
    "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform",
    "X-Content-Type-Options": "nosniff",
  } });
}

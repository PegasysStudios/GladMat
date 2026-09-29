import { durableJobsEnabled } from "@/lib/server/jobs/store";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { GenerateRequestSchema } from "@/lib/schemas";
import { AppError, errorResponse, logServerError, normalizeError } from "@/lib/server/errors";
import { generateAsset } from "@/lib/server/generate-asset";
import { assertSameOrigin, enforceRateLimit, parseJson } from "@/lib/server/request";
import { assertSessionToken } from "@/lib/server/session-token";
import { isExpectedSourcePath } from "@/lib/storage-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const correlationId = randomUUID();
  let input;
  try {
    assertSameOrigin(request);
    enforceRateLimit(request, 40);
    input = await parseJson(request, GenerateRequestSchema);
    assertSessionToken(input.sessionId, input.sessionToken);
    if (!isExpectedSourcePath(input.sourcePath, input.sessionId)) {
      throw new AppError("INVALID_REQUEST", "The source artwork path is invalid.", 400);
    }
    if (durableJobsEnabled()) throw new AppError("STUDIO_CLIENT_OUTDATED", "GladMat has been updated. Refresh this page to use background generation.", 409);
  } catch (error) {
    logServerError(error, { route: "/api/generate", correlationId });
    return errorResponse(error, correlationId);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const asset = await generateAsset(
          input,
          (status, attempt) => {
            send({ type: "status", status, attempt });
          },
          request.signal,
        );
        send({ type: "complete", asset });
      } catch (error) {
        const normalized = normalizeError(
          error,
          new AppError(
            "GENERATION_FAILED",
            "This asset could not be generated. Retry this size without affecting the others.",
            502,
            true,
          ),
        );
        logServerError(error, {
          route: "/api/generate",
          correlationId,
          sessionId: input.sessionId,
          target: `${input.width}x${input.height}`,
          normalizedCode: normalized.code,
          normalizedMessage: normalized.message,
        });
        send({
          type: "error",
          error: {
            code: normalized.code,
            message: normalized.message,
            retryable: normalized.retryable,
            requestId: correlationId,
          },
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

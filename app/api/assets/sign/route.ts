import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { SignAssetRequestSchema } from "@/lib/schemas";
import { errorResponse, logServerError } from "@/lib/server/errors";
import { assertSameOrigin, enforceRateLimit, parseJson } from "@/lib/server/request";
import { assertSessionToken } from "@/lib/server/session-token";
import { createSignedPreview } from "@/lib/server/storage";
import { generatedAssetPath } from "@/lib/storage-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    assertSameOrigin(request);
    enforceRateLimit(request, 80);
    const input = await parseJson(request, SignAssetRequestSchema);
    assertSessionToken(input.sessionId, input.sessionToken);
    const path = generatedAssetPath(
      input.sessionId,
      input.asset.width,
      input.asset.height,
      input.asset.requestId,
    );
    return NextResponse.json(
      { previewUrl: await createSignedPreview(path) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logServerError(error, { route: "/api/assets/sign", requestId });
    return errorResponse(error, requestId);
  }
}

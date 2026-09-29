import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, parseJson, enforceRateLimit } from "@/lib/server/request";
import { errorResponse, logServerError } from "@/lib/server/errors";
import { statusJob } from "@/lib/server/jobs/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const schema = z.object({ jobId: z.string().uuid(), jobToken: z.string().regex(/^\d{13}\.[a-f0-9]{64}$/) }).strict();
export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    assertSameOrigin(request);
    enforceRateLimit(request, 240, "jobs-status");
    const input = await parseJson(request, schema);
    return NextResponse.json(await statusJob(input.jobId, input.jobToken), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logServerError(error, { route: "/api/jobs/status", requestId });
    return errorResponse(error, requestId);
  }
}

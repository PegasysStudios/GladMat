import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AnalyzeRequestSchema, GenerateRequestSchema } from "@/lib/schemas";
import { assertSameOrigin, enforceRateLimit, parseJson } from "@/lib/server/request";
import { assertSessionToken } from "@/lib/server/session-token";
import { isExpectedSourcePath } from "@/lib/storage-paths";
import { AppError, errorResponse, logServerError } from "@/lib/server/errors";
import { durableJobsEnabled } from "@/lib/server/jobs/store";
import { startJob } from "@/lib/server/jobs/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const schema = z.discriminatedUnion("kind", [
  z.object({ apiVersion: z.literal(1), kind: z.literal("analysis"), input: AnalyzeRequestSchema }).strict(),
  z.object({ apiVersion: z.literal(1), kind: z.literal("generation"), input: GenerateRequestSchema }).strict(),
]);
export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    assertSameOrigin(request); enforceRateLimit(request, 60, "jobs-start");
    const submitted = await parseJson(request, schema);
    const input = submitted.input;
    assertSessionToken(input.sessionId, input.sessionToken);
    if (!isExpectedSourcePath(input.sourcePath, input.sessionId)) throw new AppError("INVALID_REQUEST", "The source artwork path is invalid.", 400);
    if (!durableJobsEnabled()) return NextResponse.json({ durable: false });
    const stored = { ...input };
      delete (stored as Partial<typeof input>).sessionToken;
    return NextResponse.json(await startJob(submitted.kind, input.sessionId,
      submitted.kind === "generation" ? (input as z.infer<typeof GenerateRequestSchema>).requestId : input.sourcePath, stored),
    { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logServerError(error, { route: "/api/jobs/start", requestId }); return errorResponse(error, requestId);
  }
}

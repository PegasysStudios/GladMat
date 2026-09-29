import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { StudioAnalyzeRequestSchema } from "@/lib/studio";
import { assertSameOrigin, enforceRateLimit } from "@/lib/server/request";
import { parseStudioRequest, studioErrorResponse } from "@/lib/server/studio-request";
import { assertStudioAccess, loadStudioDocument } from "@/lib/server/studio";
import { resolveGeneratedAssetPath } from "@/lib/server/fine-tune";
import { AppError, logServerError } from "@/lib/server/errors";
import { durableJobsEnabled, digest } from "@/lib/server/jobs/store";
import { startJob } from "@/lib/server/jobs/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const schema = StudioAnalyzeRequestSchema.extend({ repairLayerIds: z.array(z.string().max(100)).max(32).optional(), repairOutputs: z.boolean().optional(), newAttempt: z.boolean().optional() }).strict();
export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    assertSameOrigin(request); enforceRateLimit(request, 30, "studio-prepare");
    const input = await parseStudioRequest(request, schema);
    assertStudioAccess(input);
    if (!durableJobsEnabled()) return NextResponse.json({ durable: false });
    const selectedPath = await resolveGeneratedAssetPath(input.sessionId, input.asset.width, input.asset.height, input.asset.requestId);
    const document = await loadStudioDocument(input);
    const stored = { ...input };
    delete (stored as Partial<typeof input>).assetToken;
    delete (stored as Partial<typeof input>).apiVersion;
    delete (stored as Partial<typeof input>).newAttempt;
    const key = `studio:${input.asset.requestId}:${digest(selectedPath)}:${digest({ repairLayerIds: input.repairLayerIds ?? [], repairOutputs: input.repairOutputs ?? false })}`;
    const ticket = await startJob("studio", input.sessionId, key, { ...stored, selectedPath }, input.newAttempt);
    if (document && ticket.preparationId && ticket.preparationId !== document.preparationId) throw new AppError("STUDIO_PREPARATION_CHANGED", "Studio preparation changed. Reopen the latest preparation.", 409, true, { stage: "analyzing", recovery: "reopen" });
    return NextResponse.json(ticket, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logServerError(error, { route: "/api/studio/prepare", requestId });
    return studioErrorResponse(error, requestId, "analyzing");
  }
}

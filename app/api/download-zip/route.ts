import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import { mapWithConcurrency } from "@/lib/concurrency";
import { zipFilename } from "@/lib/filenames";
import { DownloadZipRequestSchema } from "@/lib/schemas";
import { buildZipManifest } from "@/lib/zip-manifest";
import { AppError, errorResponse, logServerError } from "@/lib/server/errors";
import { assertPngDimensions } from "@/lib/server/image-processing";
import { resolveGeneratedAssetPath } from "@/lib/server/fine-tune";
import { assertSameOrigin, enforceRateLimit, parseJson } from "@/lib/server/request";
import { assertSessionToken } from "@/lib/server/session-token";
import {
  createSignedDownload,
  downloadBuffer,
  uploadBuffer,
} from "@/lib/server/storage";
import { archivePath } from "@/lib/storage-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_ZIP_INPUT_BYTES = 100 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    assertSameOrigin(request);
    enforceRateLimit(request, 20);
    const input = await parseJson(request, DownloadZipRequestSchema);
    assertSessionToken(input.sessionId, input.sessionToken);
    const manifest = buildZipManifest(input.sourceName, input.assets);

    const files = await mapWithConcurrency(manifest, 3, async (entry) => {
      try {
        const path = await resolveGeneratedAssetPath(
          input.sessionId,
          entry.width,
          entry.height,
          entry.requestId,
        );
        const data = await downloadBuffer(path, "ASSET_NOT_FOUND");
        const valid = await assertPngDimensions(data, entry.width, entry.height);
        return valid ? { ...entry, data } : null;
      } catch {
        return null;
      }
    });

    const available = files.filter((file): file is NonNullable<typeof file> => Boolean(file));
    if (!available.length) {
      throw new AppError("ZIP_FAILED", "No completed assets are available for the ZIP.", 409);
    }
    const totalBytes = available.reduce((sum, file) => sum + file.data.byteLength, 0);
    if (totalBytes > MAX_ZIP_INPUT_BYTES) {
      throw new AppError(
        "ZIP_FAILED",
        "These assets are too large to bundle at once. Download them individually.",
        413,
      );
    }

    const zip = new JSZip();
    for (const file of available) {
      zip.file(file.filename, file.data, { binary: true, compression: "STORE" });
    }
    const archive = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
    const archiveId = randomUUID();
    const path = archivePath(input.sessionId, archiveId);
    const filename = zipFilename(input.sourceName);
    await uploadBuffer(path, archive, "application/zip", false);

    return NextResponse.json(
      {
        downloadUrl: await createSignedDownload(path, filename),
        filename,
        count: available.length,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logServerError(error, { route: "/api/download-zip", requestId });
    return errorResponse(
      error,
      requestId,
      new AppError("ZIP_FAILED", "The ZIP could not be prepared. Please try again.", 502, true),
    );
  }
}

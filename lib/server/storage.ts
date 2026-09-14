import "server-only";

import { getSupabaseConfig } from "@/lib/server/config";
import { AppError } from "@/lib/server/errors";
import { getSupabaseAdmin } from "@/lib/server/supabase";

function bucket() {
  const { bucket } = getSupabaseConfig();
  return getSupabaseAdmin().storage.from(bucket);
}

export async function createSignedUpload(path: string) {
  const { data, error } = await bucket().createSignedUploadUrl(path, { upsert: false });
  if (error || !data) {
    throw new AppError("STORAGE_FAILED", "Could not prepare the private upload. Please try again.", 502, true);
  }
  return data;
}

export async function uploadBuffer(
  path: string,
  body: Buffer | string,
  contentType: string,
  upsert = true,
) {
  const { error } = await bucket().upload(path, body, {
    contentType,
    cacheControl: "3600",
    upsert,
  });
  if (error) {
    throw new AppError("STORAGE_FAILED", "Could not save the asset to private storage. Please try again.", 502, true);
  }
}

export async function downloadBuffer(path: string, missingCode: "SOURCE_NOT_FOUND" | "ASSET_NOT_FOUND") {
  const { data, error } = await bucket().download(path);
  if (error || !data) {
    const message = missingCode === "SOURCE_NOT_FOUND"
      ? "The source artwork could not be found. Upload it again."
      : "This generated asset is no longer available. Regenerate it and try again.";
    throw new AppError(missingCode, message, 404);
  }
  return Buffer.from(await data.arrayBuffer());
}

export async function createSignedPreview(path: string, expiresInSeconds = 3600) {
  const { data, error } = await bucket().createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new AppError("STORAGE_FAILED", "Could not create a private preview link. Please try again.", 502, true);
  }
  return data.signedUrl;
}

export async function createSignedDownload(
  path: string,
  filename: string,
  expiresInSeconds = 600,
) {
  const { data, error } = await bucket().createSignedUrl(path, expiresInSeconds, {
    download: filename,
  });
  if (error || !data?.signedUrl) {
    throw new AppError("STORAGE_FAILED", "Could not prepare the private download. Please try again.", 502, true);
  }
  return data.signedUrl;
}

export async function assetExists(path: string) {
  const { data, error } = await bucket().exists(path);
  if (error) return false;
  return data;
}

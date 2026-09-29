import "server-only";

import { getSupabaseConfig } from "@/lib/server/config";
import { AsyncLocalStorage } from "node:async_hooks";
import { AppError, logServerError, type ErrorCode } from "@/lib/server/errors";
import { getSupabaseAdmin } from "@/lib/server/supabase";

function bucket() {
  const { bucket } = getSupabaseConfig();
  return getSupabaseAdmin().storage.from(bucket);
}

type StorageContext = Record<string, string | number | boolean | undefined>;
const storageContext = new AsyncLocalStorage<StorageContext>();
export function withStorageContext<T>(context: StorageContext, work: () => Promise<T>) {
  return storageContext.run(context, work);
}
export function setStorageStage(stage: string) {
  const context = storageContext.getStore();
  if (context) context.stage = stage;
}

function missingObject(error: unknown, head = false) {
  const value = error as { code?: string; status?: number; statusCode?: string } | null;
  if (value?.code) return value.code === "NoSuchKey" || value.code === "ObjectNotFound";
  return value?.statusCode === "404" || value?.status === 404 || (head && value?.status === 400);
}

async function storageRequest<T>(
  operation: string,
  path: string,
  request: () => Promise<T>,
  message: string,
  context: Record<string, string | number | boolean | undefined> = {},
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof AppError) throw error;
    const storageError = error as {
      statusCode?: string;
      originalError?: { cause?: { code?: string } };
    } | null;
    logServerError(error, {
      stage: "storage",
      operation,
      path,
      ...storageContext.getStore(),
      ...context,
      storageStatusCode: storageError?.statusCode,
      networkCode: storageError?.originalError?.cause?.code,
    });
    const status = (error as { status?: number } | null)?.status;
    if (status === 401 || status === 403) {
      throw new AppError("STORAGE_FAILED", "Private storage rejected the server credentials. Check the storage configuration on the server.", 503, false,
        { recovery: "check-configuration" });
    }
    throw new AppError("STORAGE_FAILED", message, 502, true);
  }
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
  cacheControl = "3600",
) {
  return storageRequest("upload", path, async () => {
    const { error } = await bucket().upload(path, body, { contentType, cacheControl, upsert });
    if (error) throw error;
  }, "Could not save the asset to private storage. Please try again.", {
    contentType,
    bytes: Buffer.byteLength(body),
    upsert,
  });
}

export async function downloadBuffer(path: string, missing: "SOURCE_NOT_FOUND" | "ASSET_NOT_FOUND" | { code: ErrorCode; message: string }) {
  const data = await storageRequest(
    "download", path, async () => {
      const { data, error } = await bucket().download(path);
      if (error && !missingObject(error)) throw error;
      if (!error && !data) throw new Error("Private storage returned no object and no absence status");
      return data;
    },
    "Could not read the asset from private storage. Please try again.",
  );
  if (!data) {
    const code = typeof missing === "string" ? missing : missing.code;
    const message = typeof missing === "object" ? missing.message : missing === "SOURCE_NOT_FOUND"
      ? "The source artwork could not be found. Upload it again."
      : "This generated asset is no longer available. Regenerate it and try again.";
    logServerError(new Error("Storage object not found"), { operation: "download", path, ...storageContext.getStore(), code });
    throw new AppError(code, message, 404);
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
  return storageRequest(
    "exists", path, async () => {
      const { data, error } = await bucket().exists(path);
      if (error && !missingObject(error, true)) throw error;
      return error ? false : data;
    },
    "Could not reach private storage. Please try again.",
  );
}

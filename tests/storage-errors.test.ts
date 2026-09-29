import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorageApiError, StorageUnknownError } from "@supabase/storage-js";
import { assetExists, downloadBuffer, uploadBuffer } from "@/lib/server/storage";

const { upload, download, exists } = vi.hoisted(() => ({
  upload: vi.fn(), download: vi.fn(), exists: vi.fn(),
}));
vi.mock("@/lib/server/supabase", () => ({
  getSupabaseAdmin: () => ({ storage: { from: () => ({ upload, download, exists }) } }),
}));
vi.mock("@/lib/server/config", () => ({ getSupabaseConfig: () => ({ bucket: "ad-mats" }) }));

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

function brokenSession() {
  return new StorageUnknownError("fetch failed", new TypeError("fetch failed", {
    cause: Object.assign(new Error("The session has been destroyed"), { code: "ERR_HTTP2_INVALID_SESSION" }),
  }));
}

describe("storage failure diagnostics", () => {
  it("logs the underlying upload rejection without exposing it to the browser", async () => {
    upload.mockResolvedValue({ error: new StorageApiError("upstream rejection", 403, "403") });
    await expect(uploadBuffer("generated/session/result.png", Buffer.from("png"), "image/png"))
      .rejects.toMatchObject({ code: "STORAGE_FAILED", retryable: false, details: { recovery: "check-configuration" } });
    const log = vi.mocked(console.error).mock.calls[0][0];
    expect(log).toContain('"operation":"upload"');
    expect(log).toContain('"path":"generated/session/result.png"');
    expect(log).toContain('"storageStatusCode":"403"');
    expect(log).toContain('"message":"upstream rejection"');
  });

  it.each(["upload", "download", "exists"])("classifies thrown %s network errors as storage failures", async (operation) => {
    const error = brokenSession();
    upload.mockRejectedValue(error);
    download.mockRejectedValue(error);
    exists.mockRejectedValue(error);
    const run = operation === "upload"
      ? uploadBuffer("generated/session/result.png", Buffer.from("png"), "image/png")
      : operation === "download"
        ? downloadBuffer("sources/session/source.png", "SOURCE_NOT_FOUND")
        : assetExists("generated/session/result.png");
    await expect(run).rejects.toMatchObject({ code: "STORAGE_FAILED", retryable: true });
    expect(vi.mocked(console.error).mock.calls[0][0]).toContain('"networkCode":"ERR_HTTP2_INVALID_SESSION"');
  });

  it("still allows generation when the requested output does not exist", async () => {
    exists.mockResolvedValue({ data: false, error: new StorageApiError("Not found", 400, "400") });
    await expect(assetExists("generated/session/new.png")).resolves.toBe(false);
  });
  it.each(["download", "exists"])("classifies returned %s network failures as storage failures", async (operation) => {
    const mock = operation === "download" ? download : exists;
    mock.mockResolvedValue({ data: null, error: brokenSession() });
    const run = operation === "download" ? downloadBuffer("studio/session/original.png", "ASSET_NOT_FOUND") : assetExists("studio/session/document.json");
    await expect(run).rejects.toMatchObject({ code: "STORAGE_FAILED", retryable: true });
  });

  it.each([401, 403, 500])( "does not call a returned storage %s failure missing artwork", async (status) => {
    download.mockResolvedValue({ data: null, error: new StorageApiError("upstream rejection", status, String(status)) });
    await expect(downloadBuffer("generated/session/result.png", "ASSET_NOT_FOUND")).rejects.toMatchObject({ code: "STORAGE_FAILED" });
  });

  it("recognizes Supabase's HTTP 400 NoSuchKey response and uses the resource-specific message", async () => {
    download.mockResolvedValue({ data: null, error: new StorageApiError("Object not found", 400, "404", "storage", "NoSuchKey") });
    await expect(downloadBuffer("studio/session/masks/artist.png", { code: "STUDIO_SELECTIONS_MISSING", message: "Select Artist before creating the background." }))
      .rejects.toMatchObject({ code: "STUDIO_SELECTIONS_MISSING", status: 404, message: "Select Artist before creating the background." });
  });

});

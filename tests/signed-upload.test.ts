import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadFileToSignedUrl } from "@/lib/signed-upload";

describe("signed source upload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("PUTs the file to the server-issued signed URL without public env vars", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["artwork"], "flyer.png", { type: "image/png" });
    await uploadFileToSignedUrl("https://example.supabase.co/storage/v1/object/upload/sign/ad-mats/sources/x.png?token=abc", file);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("token=abc");
    expect(init.method).toBe("PUT");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("surfaces a friendly error when the signed upload fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    const file = new File(["artwork"], "flyer.png", { type: "image/png" });
    await expect(uploadFileToSignedUrl("https://example.supabase.co/upload", file)).rejects.toThrow(
      "The artwork could not be uploaded to private storage. Please try again.",
    );
  });
});

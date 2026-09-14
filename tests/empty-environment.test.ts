import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/upload/route";

const KEYS = [
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
  "ADMAT_SESSION_SECRET",
] as const;

describe("empty environment behavior", () => {
  const previous = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of KEYS) {
      previous.set(key, process.env[key]);
      delete process.env[key];
    }
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    previous.clear();
  });

  it("returns a useful setup error only when a server feature is called", async () => {
    const request = new NextRequest("http://localhost:3000/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "prepare",
        filename: "flyer.png",
        mimeType: "image/png",
        fileSize: 1024,
      }),
    });

    const response = await POST(request);
    const payload = await response.json();
    expect(response.status).toBe(503);
    expect(payload.error.code).toBe("CONFIGURATION_REQUIRED");
    expect(payload.error.message).toContain("SUPABASE_URL");
  });
});

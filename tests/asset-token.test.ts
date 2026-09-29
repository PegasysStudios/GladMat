import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertAssetToken, mintAssetToken } from "@/lib/server/asset-token";

describe("saved asset capability", () => {
  const previousSecret = process.env.ADMAT_SESSION_SECRET;

  beforeEach(() => {
    process.env.ADMAT_SESSION_SECRET = "test-secret-that-is-at-least-thirty-two-characters";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (previousSecret === undefined) delete process.env.ADMAT_SESSION_SECRET;
    else process.env.ADMAT_SESSION_SECRET = previousSecret;
  });

  it("authorizes only the exact generated object identity", () => {
    const sessionId = randomUUID();
    const asset = { requestId: randomUUID(), width: 728, height: 90 };
    const token = mintAssetToken(sessionId, asset);

    expect(() => assertAssetToken(sessionId, asset, token)).not.toThrow();
    expect(() => assertAssetToken(sessionId, { ...asset, width: 970 }, token)).toThrow(
      "This saved asset reference is not valid.",
    );
    expect(() => assertAssetToken(randomUUID(), asset, token)).toThrow(
      "This saved asset reference is not valid.",
    );
  });

  it("rejects an expired capability", () => {
    const now = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const sessionId = randomUUID();
    const asset = { requestId: randomUUID(), width: 300, height: 250 };
    const token = mintAssetToken(sessionId, asset);

    vi.spyOn(Date, "now").mockReturnValue(now + 366 * 24 * 60 * 60 * 1000);
    expect(() => assertAssetToken(sessionId, asset, token)).toThrow(
      "Access to this saved asset has expired.",
    );
  });
});

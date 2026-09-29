import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertSourceToken, mintSourceToken } from "@/lib/server/source-token";
import { assertSessionToken, mintSessionToken } from "@/lib/server/session-token";
import { mintAssetToken } from "@/lib/server/asset-token";

beforeEach(() => { vi.stubEnv("ADMAT_SESSION_SECRET", "test-secret-that-is-at-least-thirty-two-characters"); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("saved artwork access", () => {
  it("survives the short session lifetime and can authorize a renewed session", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const id = randomUUID();
    const token = mintSourceToken(id);
    const session = mintSessionToken(id);
    vi.spyOn(Date, "now").mockReturnValue(now + 2 * 86400000);
    expect(() => assertSessionToken(id, session)).toThrow();
    expect(() => assertSourceToken(id, token)).not.toThrow();
    expect(() => assertSessionToken(id, mintSessionToken(id))).not.toThrow();
  });
  it("rejects other sources, session and asset tokens, and tampered signatures", () => {
    const id = randomUUID();
    const token = mintSourceToken(id);
    expect(() => assertSourceToken(randomUUID(), token)).toThrow();
    expect(() => assertSourceToken(id, mintSessionToken(id))).toThrow();
    expect(() => assertSourceToken(id, mintAssetToken(id, { requestId: randomUUID(), width: 300, height: 250 }))).toThrow();
    expect(() => assertSourceToken(id, `${token}x`)).toThrow();
  });
  it("expires after one year", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const id = randomUUID();
    const token = mintSourceToken(id);
    vi.spyOn(Date, "now").mockReturnValue(now + 366 * 86400000);
    expect(() => assertSourceToken(id, token)).toThrow("expired");
  });
});

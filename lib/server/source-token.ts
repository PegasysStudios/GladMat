import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getSessionSecret } from "@/lib/server/config";
import { AppError } from "@/lib/server/errors";

const SOURCE_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;

function signature(sessionId: string, expiresAt: string) {
  return createHmac("sha256", getSessionSecret())
    .update(`saved-source.${sessionId}.${expiresAt}`).digest("hex");
}

export function mintSourceToken(sessionId: string) {
  const expiresAt = String(Date.now() + SOURCE_LIFETIME_MS);
  return `${expiresAt}.${signature(sessionId, expiresAt)}`;
}

export function assertSourceToken(sessionId: string, token: string) {
  const [expiresAt, providedSignature, ...extra] = token.split(".");
  const expiry = Number(expiresAt);
  if (!/^\d{10,13}\.[a-f0-9]{64}$/i.test(token) || extra.length || !expiresAt || !providedSignature || !Number.isSafeInteger(expiry)
    || expiry < Date.now() || expiry > Date.now() + SOURCE_LIFETIME_MS + 60_000) {
    throw new AppError("UNAUTHORIZED_SESSION", "Access to this saved artwork has expired. Upload it again.", 401);
  }
  const expected = Buffer.from(signature(sessionId, expiresAt), "hex");
  const provided = Buffer.from(providedSignature, "hex");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new AppError("UNAUTHORIZED_SESSION", "This saved artwork reference is not valid.", 401);
  }
}

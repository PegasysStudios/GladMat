import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getSessionSecret } from "@/lib/server/config";
import { AppError } from "@/lib/server/errors";

const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;

function signature(sessionId: string, expiresAt: string) {
  return createHmac("sha256", getSessionSecret()).update(`${sessionId}.${expiresAt}`).digest("hex");
}

export function mintSessionToken(sessionId: string) {
  const expiresAt = String(Date.now() + SESSION_LIFETIME_MS);
  return `${expiresAt}.${signature(sessionId, expiresAt)}`;
}

export function assertSessionToken(sessionId: string, token: string) {
  const [expiresAt, providedSignature, ...extra] = token.split(".");
  const expiry = Number(expiresAt);
  if (
    extra.length ||
    !expiresAt ||
    !providedSignature ||
    !Number.isSafeInteger(expiry) ||
    expiry < Date.now() ||
    expiry > Date.now() + SESSION_LIFETIME_MS + 60_000
  ) {
    throw new AppError("UNAUTHORIZED_SESSION", "This AdMat session has expired. Upload the artwork again.", 401);
  }

  const expected = Buffer.from(signature(sessionId, expiresAt), "hex");
  const provided = Buffer.from(providedSignature, "hex");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new AppError("UNAUTHORIZED_SESSION", "This AdMat session is not valid. Upload the artwork again.", 401);
  }
}

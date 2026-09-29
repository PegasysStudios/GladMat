import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getSessionSecret } from "@/lib/server/config";
import { AppError } from "@/lib/server/errors";

const SAVED_ASSET_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;

type AssetIdentity = {
  requestId: string;
  width: number;
  height: number;
};

function signature(sessionId: string, asset: AssetIdentity, expiresAt: string) {
  return createHmac("sha256", getSessionSecret())
    .update(`saved-asset.${sessionId}.${asset.width}x${asset.height}.${asset.requestId}.${expiresAt}`)
    .digest("hex");
}

export function mintAssetToken(sessionId: string, asset: AssetIdentity) {
  const expiresAt = String(Date.now() + SAVED_ASSET_LIFETIME_MS);
  return `${expiresAt}.${signature(sessionId, asset, expiresAt)}`;
}

export function assertAssetToken(sessionId: string, asset: AssetIdentity, token: string) {
  const [expiresAt, providedSignature, ...extra] = token.split(".");
  const expiry = Number(expiresAt);
  if (
    extra.length ||
    !expiresAt ||
    !providedSignature ||
    !Number.isSafeInteger(expiry) ||
    expiry < Date.now() ||
    expiry > Date.now() + SAVED_ASSET_LIFETIME_MS + 60_000
  ) {
    throw new AppError(
      "UNAUTHORIZED_SESSION",
      "Access to this saved asset has expired. Remove it from the library and save a newer copy.",
      401,
    );
  }

  const expected = Buffer.from(signature(sessionId, asset, expiresAt), "hex");
  const provided = Buffer.from(providedSignature, "hex");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new AppError(
      "UNAUTHORIZED_SESSION",
      "This saved asset reference is not valid.",
      401,
    );
  }
}

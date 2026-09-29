import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getSessionSecret } from "@/lib/server/config";
import { AppError } from "@/lib/server/errors";

export function mintJobToken(jobId: string) {
  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const body = `ai-job.${jobId}.${expires}`;
  return `${expires}.${createHmac("sha256", getSessionSecret()).update(body).digest("hex")}`;
}
export function assertJobToken(jobId: string, token: string) {
  const [expires, supplied, extra] = token.split(".");
  const expected = createHmac("sha256", getSessionSecret()).update(`ai-job.${jobId}.${expires}`).digest();
  const actual = Buffer.from(supplied ?? "", "hex");
  if (extra || !/^\d{13}$/.test(expires ?? "") || Number(expires) < Date.now()
    || !/^[a-f0-9]{64}$/.test(supplied ?? "") || actual.length !== expected.length
    || !timingSafeEqual(actual, expected)) throw new AppError("UNAUTHORIZED_SESSION", "This job reference has expired or is invalid. Reopen the source or saved ad to reconnect.", 401);
}

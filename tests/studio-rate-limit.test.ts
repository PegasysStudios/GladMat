import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { enforceRateLimit } from "@/lib/server/request";

describe("Studio phase rate limits", () => {
  it("allows background after 32 cached selections without consuming its separate allowance", () => {
    const request = new NextRequest("http://localhost/api/studio/extract", { headers: { "x-forwarded-for": "studio-rate-test" } });
    for (let index = 0; index < 32; index++) enforceRateLimit(request, 60, "studio-extract");
    expect(() => enforceRateLimit(request, 20, "studio-background")).not.toThrow();
    for (let index = 0; index < 28; index++) enforceRateLimit(request, 60, "studio-extract");
    expect(() => enforceRateLimit(request, 60, "studio-extract")).toThrow(/Too many requests/);
    expect(() => enforceRateLimit(request, 180, "studio-image")).not.toThrow();
  });
});

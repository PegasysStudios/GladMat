import { describe, expect, it } from "vitest";
import { outputFilename, sanitizeBaseName, zipFilename } from "@/lib/filenames";

describe("filename helpers", () => {
  it.each([
    ["Nélly Dean FINAL!!.JPG", "nelly-dean-final"],
    ["../../Secret Flyer.png", "secret-flyer"],
    [".env", "artwork"],
    ["CON.png", "artwork"],
    ["night\\show/flyer.webp", "night-show-flyer"],
  ])("sanitizes %s", (input, expected) => {
    expect(sanitizeBaseName(input)).toBe(expected);
  });

  it("builds stable individual and ZIP names", () => {
    expect(outputFilename("Nelly Dean.png", 728, 90)).toBe("nelly-dean_728x90.png");
    expect(zipFilename("Nelly Dean.png")).toBe("nelly-dean_ad-mats.zip");
  });
});

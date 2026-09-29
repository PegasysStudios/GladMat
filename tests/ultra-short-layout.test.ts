import { describe, expect, it } from "vitest";
import { chooseGenerationCanvas } from "@/lib/dimensions";
import {
  buildUltraShortLayoutCorrection,
  classifyUltraShortRetrySeverity,
  formatUltraShortLayoutLog,
  getUltraShortLayoutBudget,
  getUltraShortSafeCropPlan,
  isUltraShortLayoutIssue,
  ultraShortSafeCropInstructions,
} from "@/lib/ultra-short-layout";

describe("ultra-short layout budget", () => {
  it.each([
    [970, 90, "ULTRA_WIDE", 30, 11, 910, 68, 63, 52, 11],
    [728, 90, "ULTRA_WIDE", 30, 11, 668, 68, 63, 52, 11],
    [468, 60, "ULTRA_WIDE", 20, 7, 428, 46, 42, 35, 7],
    [320, 50, "COMPACT", 15, 6, 290, 38, 35, 29, 6],
    [234, 60, "COMPACT", 18, 7, 198, 46, 42, 35, 7],
  ] as const)(
    "computes a positive internal budget for %sx%s",
    (
      width,
      height,
      bannerClass,
      horizontalMargin,
      verticalMargin,
      usableWidth,
      usableHeight,
      maxHeadlineHeight,
      maxCTAHeight,
      minimumGroupGap,
    ) => {
      const budget = getUltraShortLayoutBudget(width, height);
      expect(budget.class).toBe(bannerClass);
      expect(budget.horizontalMargin).toBe(horizontalMargin);
      expect(budget.verticalMargin).toBe(verticalMargin);
      expect(budget.usableWidth).toBe(usableWidth);
      expect(budget.usableHeight).toBe(usableHeight);
      expect(budget.maxHeadlineHeight).toBe(maxHeadlineHeight);
      expect(budget.maxCTAHeight).toBe(maxCTAHeight);
      expect(budget.minimumGroupGap).toBe(minimumGroupGap);
      expect(budget.horizontalMargin).toBeGreaterThan(0);
      expect(budget.verticalMargin).toBeGreaterThan(0);
      expect(budget.usableWidth).toBeLessThan(width);
      expect(budget.usableHeight).toBeLessThan(height);
      expect(budget.maxHeadlineHeight).toBeLessThan(height);
      expect(budget.maxCTAHeight).toBeLessThan(height);
      expect(budget.maxSecondaryGroupHeight).toBeLessThan(height);
      expect(budget.maxDecorativeHeight).toBeLessThan(height);
      expect(budget.minimumGroupGap).toBeGreaterThan(0);
    },
  );

  it("rejects standard formats", () => {
    expect(() => getUltraShortLayoutBudget(320, 100)).toThrow(/only valid for ultra-short banners/);
    expect(() => getUltraShortLayoutBudget(90, 90)).toThrow(/only valid for ultra-short banners/);
  });
});

describe("ultra-short safe crop plan", () => {
  it.each([
    [970, 90, 2160, 720, 28],
    [728, 90, 2160, 720, 37],
    [468, 60, 2160, 720, 38],
    [320, 50, 2160, 720, 47],
    [234, 60, 2160, 720, 77],
  ] as const)(
    "describes the live vertical band for %sx%s",
    (width, height, canvasWidth, canvasHeight, livePercent) => {
      const canvas = chooseGenerationCanvas(width, height);
      const plan = getUltraShortSafeCropPlan(width, height);
      expect(canvas).toMatchObject({ width: canvasWidth, height: canvasHeight, requiresSafeCrop: true });
      expect(plan).toMatchObject({
        generationWidth: canvasWidth,
        generationHeight: canvasHeight,
        requiresSafeCrop: true,
        liveBandAxis: "height",
        liveBandPercent: livePercent,
      });
      expect(plan.liveBandStartPx).toBeGreaterThan(0);
      expect(plan.liveBandEndPx).toBeLessThan(canvasHeight);
      expect(plan.liveBandSizePx).toBeLessThan(canvasHeight);

      const instructions = ultraShortSafeCropInstructions(width, height);
      expect(instructions).toContain(`${canvasWidth} × ${canvasHeight}`);
      expect(instructions).toContain(`${width} × ${height}`);
      expect(instructions).toContain(`central ${livePercent}% of model-canvas height`);
      expect(instructions).toContain("required foreground typography, CTA and important graphic treatments");
      expect(instructions).not.toContain("face");
      expect(instructions).not.toContain("hand");
      expect(instructions).not.toContain("photograph");
      expect(instructions).not.toContain("subject");
    },
  );
});

describe("ultra-short layout retry correction", () => {
  it("keeps geometric crowding issues and asks for a full foreground scale-down", () => {
    const issues = [
      "Headline is too close to top and bottom edges.",
      "CTA is too close to the right edge.",
      "Venue/location group needs more horizontal separation.",
    ];
    expect(issues.every(isUltraShortLayoutIssue)).toBe(true);
    expect(classifyUltraShortRetrySeverity(issues)).toBe("severe");

    const correction = buildUltraShortLayoutCorrection(issues);
    expect(correction).toContain("ULTRA-SHORT LAYOUT CORRECTION");
    expect(correction).toContain("Headline is too close to top and bottom edges.");
    expect(correction).toContain("CTA is too close to the right edge.");
    expect(correction).toContain("Venue/location group needs more horizontal separation.");
    expect(correction).toContain("Scale the COMPLETE foreground composition down by approximately 15–20%.");
    expect(correction).toContain("Do NOT:");
    expect(correction).toContain("add photography");
  });

  it("does not emit a layout correction for a clean result", () => {
    expect(buildUltraShortLayoutCorrection([])).toBe("");
    expect(buildUltraShortLayoutCorrection(["LIVE MUSIC is misspelled."])).toBe("");
  });

  it("formats development layout logging without secrets", () => {
    const log = formatUltraShortLayoutLog(970, 90);
    expect(log).toEqual({
      target: "970x90",
      class: "ULTRA_WIDE",
      layoutBudget: {
        horizontalMargin: 30,
        verticalMargin: 11,
        usableWidth: 910,
        usableHeight: 68,
        maxHeadlineHeight: 63,
      },
      generationCanvas: {
        width: 2160,
        height: 720,
      },
    });
  });
});

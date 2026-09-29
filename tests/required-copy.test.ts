import { describe, expect, it } from "vitest";
import { buildValidationPrompt } from "@/lib/prompts/validate-output";
import {
  filterRetryIssuesForTarget,
  normalizeQualityValidation,
  requiredCopyForTarget,
} from "@/lib/required-copy";
import type { SourceAnalysis } from "@/lib/schemas";
import { getUltraShortLayoutBudget } from "@/lib/ultra-short-layout";

const concertAnalysis: SourceAnalysis = {
  summary: "A cyan concert poster.",
  exactText: [
    "BEST MUSIC PRESENTS",
    "LIVE MUSIC",
    "FEB 02",
    "09 PM",
    "NELLY DEAN",
    "AT BEST CLUB",
    "1556 Buckley Lane",
    "Kansas City, MO",
    "www.example.com",
    "FREE",
  ],
  primaryHeadline: "LIVE MUSIC",
  artistOrEventName: "NELLY DEAN",
  dateText: "FEB 02",
  timeText: "09 PM",
  venueText: "AT BEST CLUB",
  locationText: "Kansas City, MO",
  ctaText: "FREE",
  websiteText: "www.example.com",
  otherRequiredText: ["BEST MUSIC PRESENTS"],
  visualStyle: "Cyan campaign.",
  colorPalette: [{ hex: "#00E5FF", role: "Background" }],
  typography: { headlineStyle: "Heavy display", bodyStyle: "Sans", other: "Outlines" },
  visualHierarchy: ["Headline", "Artist"],
  importantSubjects: [{ description: "Artist photograph", importance: "primary" }],
  logosAndMarks: [],
  decorativeElements: ["Lightning bolts"],
  layoutDescription: "Vertical poster",
  preservationInstructions: ["Keep the photograph"],
};

describe("required copy for a target", () => {
  it("returns only priority banner copy for 970 × 90", () => {
    const required = requiredCopyForTarget({
      analysis: concertAnalysis,
      correctedText: concertAnalysis.exactText,
      width: 970,
      height: 90,
    });

    expect(required).toEqual([
      "LIVE MUSIC",
      "FEB 02",
      "AT BEST CLUB",
      "FREE",
    ]);
    expect(required).not.toContain("NELLY DEAN");
    expect(required).not.toContain("1556 Buckley Lane");
    expect(required).not.toContain("www.example.com");
    expect(required).not.toContain("BEST MUSIC PRESENTS");
  });

  it("uses semantic event copy and omits supporting strings for medium formats", () => {
    expect(
      requiredCopyForTarget({
        analysis: concertAnalysis,
        correctedText: concertAnalysis.exactText,
        width: 300,
        height: 250,
      }),
    ).toEqual(["LIVE MUSIC", "NELLY DEAN", "FEB 02", "09 PM", "AT BEST CLUB", "Kansas City, MO", "FREE"]);
  });

  it("keeps all confirmed copy for large formats", () => {
    expect(requiredCopyForTarget({
      analysis: concertAnalysis, correctedText: concertAnalysis.exactText,
      width: 1080, height: 1350,
    })).toEqual(concertAnalysis.exactText);
  });

  it("applies in-place copy corrections to ultra-short priority fields", () => {
    const correctedText = [...concertAnalysis.exactText];
    correctedText[2] = "FEB 03";
    expect(
      requiredCopyForTarget({
        analysis: concertAnalysis,
        correctedText,
        width: 728,
        height: 90,
      }),
    ).toContain("FEB 03");
  });
});

describe("ultra-short quality validation", () => {
  it("asks QA only for target-required copy and treats optional omissions as success", () => {
    const required = requiredCopyForTarget({
      analysis: concertAnalysis,
      correctedText: concertAnalysis.exactText,
      width: 970,
      height: 90,
    });
    const prompt = buildValidationPrompt(required, 970, 90);

    expect(prompt).toContain("LIVE MUSIC");
    expect(prompt).toContain("FEB 02");
    expect(prompt).toContain("FREE");
    expect(prompt).not.toContain("NELLY DEAN");
    expect(prompt).not.toContain("1556 Buckley Lane");
    expect(prompt).not.toContain("www.example.com");
    expect(prompt).toContain("Intentional omission of other source copy is SUCCESSFUL");
    expect(prompt).toContain("Do not fail for missing photographs");
    expect(prompt).toContain("FINAL exact size 970 × 90");
    expect(prompt).toContain("Headline is too close to top and bottom edges.");
    expect(prompt).toContain("Foreground system should be scaled down.");
    expect(prompt).toContain("Required copy must remain inside the central safe band.");
    expect(prompt).toContain('Do not write vague issues such as "Layout looks bad."');

    expect(prompt).toContain("48.5px left/right");
    expect(prompt).toContain("4.5px top/bottom");

    const copyInput = {
      analysis: concertAnalysis,
      correctedText: concertAnalysis.exactText,
      width: 970,
      height: 90,
    };
    const filtered = filterRetryIssuesForTarget(
      [
        "NELLY DEAN is missing",
        "1556 Buckley Lane is missing",
        "www.example.com is missing",
        "The artist photograph is missing",
        "LIVE MUSIC is clipped",
      ],
      copyInput,
    );
    expect(filtered).toEqual(["LIVE MUSIC is clipped"]);

    expect(
      normalizeQualityValidation(
        {
          passed: false,
          issues: [
            "Headline is too close to top and bottom edges.",
            "CTA is too close to the right edge.",
            "Venue/location group needs more horizontal separation.",
            "NELLY DEAN is missing",
            "The website is missing",
            "The artist photograph is missing",
          ],
        },
        copyInput,
      ),
    ).toEqual({
      passed: false,
      issues: [
        "Headline is too close to top and bottom edges.",
        "CTA is too close to the right edge.",
        "Venue/location group needs more horizontal separation.",
      ],
    });

    expect(
      normalizeQualityValidation(
        {
          passed: true,
          issues: [],
        },
        copyInput,
      ),
    ).toEqual({ passed: true, issues: [] });
  });

  it("retains the existing QA margins for other ultra-short banners", () => {
    const prompt = buildValidationPrompt(["LIVE MUSIC"], 728, 90);
    const budget = getUltraShortLayoutBudget(728, 90);
    expect(prompt).toContain(`${budget.horizontalMargin}px left/right`);
    expect(prompt).toContain(`${budget.verticalMargin}px top/bottom`);
    expect(prompt).not.toContain("NARROW ADMAT SAFE AREA");
  });

  it("validates only the chosen copy for medium formats", () => {
    const required = requiredCopyForTarget({
      analysis: concertAnalysis,
      correctedText: concertAnalysis.exactText,
      width: 300,
      height: 250,
    });
    const prompt = buildValidationPrompt(required, 300, 250);
    expect(prompt).toContain("NELLY DEAN");
    expect(prompt).not.toContain("www.example.com");
    expect(prompt).toContain("a badly distorted primary face, subject, or logo");
    expect(prompt).not.toContain("Intentional omission of other source copy is SUCCESSFUL");
  });

  it("keeps Image B layout-only during reference-aware QA", () => {
    const prompt = buildValidationPrompt(["LIVE MUSIC", "FEB 02"], 300, 250, true);
    expect(prompt).toContain("REFERENCE-AWARE REVIEW");
    expect(prompt).toContain("Validate copy, colors, typography personality, imagery, branding, and campaign identity against Image A");
    expect(prompt).toContain("Validate only layout structure, density, spacing rhythm");
    expect(prompt).toContain("against Image B");
    expect(prompt).toContain("Never request Image B's words, colors, logos, people, brand");
    expect(prompt).toContain("LIVE MUSIC");
    expect(prompt).toContain("FEB 02");
  });
});

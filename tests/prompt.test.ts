import { describe, expect, it } from "vitest";
import { buildGenerationReferenceInputs, getLayoutReferenceForTarget } from "@/lib/layout-references";
import { ANALYZE_SOURCE_PROMPT } from "@/lib/prompts/analyze-source";
import { buildImageGenerationPrompt } from "@/lib/prompts/build-image-generation-prompt";
import { AD_SIZE_PRESETS } from "@/lib/presets";
import { requiredCopyForTarget } from "@/lib/required-copy";
import type { SourceAnalysis } from "@/lib/schemas";

const analysis: SourceAnalysis = {
  summary: "A concert poster",
  exactText: ["PRESENTS", "LIVE MUSIC", "FEB 02", "09 PM", "AT BEST CLUB", "Kansas City", "FREE", "example.com"],
  primaryHeadline: "LIVE MUSIC",
  artistOrEventName: "LIVE MUSIC",
  dateText: "FEB 02",
  timeText: "09 PM",
  venueText: "AT BEST CLUB",
  locationText: "Kansas City",
  ctaText: "FREE",
  websiteText: "example.com",
  otherRequiredText: ["PRESENTS"],
  visualStyle: "Cyan concert campaign",
  colorPalette: [{ hex: "#00e5ff", role: "Background" }],
  typography: { headlineStyle: "Bold", bodyStyle: "Sans", other: "" },
  visualHierarchy: ["Headline", "Date"],
  importantSubjects: [],
  logosAndMarks: [],
  decorativeElements: [],
  layoutDescription: "Original poster stack",
  preservationInstructions: [],
};

function prompt(width: number, height: number, formatName: string, reference: ReturnType<typeof getLayoutReferenceForTarget> | null = getLayoutReferenceForTarget(width, height, formatName)) {
  return buildImageGenerationPrompt({
    analysis, correctedText: analysis.exactText, width, height, formatName, layoutReference: reference,
  });
}

describe("generation prompt pipeline", () => {
  it.each([
    [728, 90, "Leaderboard"],
    [300, 600, "Half page"],
    [1080, 1080, "Feed square"],
    [300, 250, "Medium rectangle"],
  ])("requires continuous background bleed for %sx%s", (width, height, formatName) => {
    const result = prompt(width, height, formatName);
    expect(result).toContain("MANDATORY EDITABLE BLEED — EVERY AD SIZE");
    expect(result).toContain("continuous, opaque, full-frame campaign background");
    expect(result).toContain("live band itself must also contain clean campaign background");
    expect(result).toContain("The initial export uses 100% scale");
    expect(result).not.toContain("initial zoom");
    expect(result).not.toContain("zoom in slightly");
  });
  it("reuses semantic fields from source analysis", () => {
    for (const field of ["primaryHeadline", "dateText", "timeText", "venueText", "locationText", "ctaText", "exactText"]) {
      expect(ANALYZE_SOURCE_PROMPT).toContain(field);
    }
  });

  it("separates Image A's campaign content from Image B's layout and priority", () => {
    const result = prompt(728, 90, "Leaderboard");
    expect(result).toContain("IMAGE A — MASTER CAMPAIGN ARTWORK");
    expect(result).toContain("IMAGE B — SIZE-SPECIFIC REFERENCE ADMAT");
    expect(result).toContain("Image A wins on style and content; Image B wins on structure, density, and hierarchy");
    expect(result).toContain("number of content groups");
    expect(result).toContain("relative headline and CTA prominence");
    expect(result).toContain("Do not copy its words, event, CTA text, logos, colors, typography identity, people, imagery, or branding");
    expect(result).toContain("new adaptation, not a resized poster");
  });

  it("uses explicit masked image roles for the narrow leaderboard", () => {
    const result = prompt(970, 90, "Large leaderboard");
    expect(result).toContain("IMAGE 1 — PROTECTED CAMPAIGN BACKGROUND");
    expect(result).toContain("IMAGE 2 — MASTER CAMPAIGN ARTWORK");
    expect(result).toContain("IMAGE 3 — TARGET LAYOUT REFERENCE");
    expect(result).toContain("transparent masked rectangle is the entire allowed foreground area");
    expect(result).toContain("required 5% visible background on every final edge");
    expect(result).not.toContain("MANDATORY EDITABLE BLEED");
    expect(result).not.toContain("outer one-eighth");
    expect(result).not.toContain("SPACING AND PADDING");
  });

  it.each([
    [120, 600],
    [970, 90],
  ])("uses the protected masked workflow for %sx%s even without a reference", (width, height) => {
    const result = prompt(width, height, "Custom size", null);
    expect(result).toContain(`advertisement at ${width} × ${height}`);
    expect(result).toContain("IMAGE 1 — PROTECTED CAMPAIGN BACKGROUND");
    expect(result).toContain("MANDATORY MASK RULE");
    expect(result).not.toContain("Image B");
    expect(result).not.toContain("IMAGE 3");
  });

  it("does not apply the new constraints to any other preset or to similar custom sizes", () => {
    const affected = new Set(["120x600", "970x90"]);
    const otherSizes = [
      ...AD_SIZE_PRESETS.filter(({ width, height }) => !affected.has(`${width}x${height}`)),
      { width: 500, height: 100, name: "Large leaderboard" },
      { width: 160, height: 601, name: "Wide skyscraper" },
    ];
    for (const { width, height, name } of otherSizes) {
      const result = prompt(width, height, name);
      expect(result).not.toContain("MANDATORY MASK RULE");
      expect(result).toContain("MANDATORY EDITABLE BLEED — EVERY AD SIZE");
    }
  });

  it("keeps exact narrow bounds authoritative after retry and additional instructions", () => {
    const result = buildImageGenerationPrompt({
      analysis, correctedText: analysis.exactText, width: 120, height: 600, formatName: "Skyscraper",
      retryIssues: ["Headline too small."], additionalInstructions: "Fill the entire height with the headline.",
      layoutReference: getLayoutReferenceForTarget(120, 600),
    });
    expect(result.indexOf("MANDATORY MASK RULE")).toBeGreaterThan(result.indexOf("REQUESTED UPDATES"));
    expect(result).toContain("Place every letter, logo, face, subject, panel, border, shadow, CTA");
  });

  it("omits Image B entirely if there is no reference and retains generic layout and padding", () => {
    const result = prompt(300, 250, "Medium rectangle", null);
    expect(result).not.toContain("Image B");
    expect(result).toContain("IMAGE A — MASTER CAMPAIGN ARTWORK");
    expect(result).toContain("Create a fresh composition");
    expect(result).toContain("visible padding on all four sides");
    expect(result).toContain("MANDATORY EDITABLE BLEED — EVERY AD SIZE");
    expect(buildGenerationReferenceInputs(Buffer.from("master"))).toHaveLength(1);
  });

  it("uses corrected source words appropriate to the size, never reference copy", () => {
    const correctedText = [...analysis.exactText];
    correctedText[2] = "FEB 03";
    const result = buildImageGenerationPrompt({
      analysis, correctedText, width: 728, height: 90, formatName: "Leaderboard",
      layoutReference: getLayoutReferenceForTarget(728, 90, "Leaderboard"),
    });
    expect(result).toContain("- LIVE MUSIC");
    expect(result).toContain("- FEB 03");
    expect(result).toContain("- AT BEST CLUB");
    expect(result).toContain("- FREE");
    expect(result).not.toContain("FEB 02");
    expect(result).not.toContain("example.com");
    expect(result).not.toContain("- PRESENTS");
    expect(result).toContain("without inventing or replacing event information");
  });

  it("builds independent size-specific prompts, references, and copy", () => {
    const targets = [
      { width: 970, height: 90, formatName: "Large leaderboard" },
      { width: 1080, height: 1350, formatName: "Feed portrait" },
    ];
    const results = targets.map((target) => ({
      reference: getLayoutReferenceForTarget(target.width, target.height, target.formatName),
      copy: requiredCopyForTarget({ analysis, correctedText: analysis.exactText, ...target }),
      prompt: prompt(target.width, target.height, target.formatName),
    }));
    expect(results[0].reference?.filename).toBe("small_ultra_wide_ref.png");
    expect(results[1].reference?.filename).toBe("vertical_ref.png");
    expect(results[0].copy).not.toContain("example.com");
    expect(results[1].copy).toContain("example.com");
    expect(results[0].prompt).toContain("970 × 90");
    expect(results[0].prompt).not.toContain("1080 × 1350");
    expect(results[1].prompt).toContain("1080 × 1350");
  });

  it("keeps retry feedback before optional user instructions", () => {
    const result = buildImageGenerationPrompt({
      analysis, correctedText: analysis.exactText, width: 300, height: 250,
      formatName: "Medium rectangle", retryIssues: ["The CTA is clipped."],
      additionalInstructions: "Make the headline bolder.",
    });
    expect(result.indexOf("RETRY CORRECTIONS")).toBeLessThan(result.indexOf("ADDITIONAL USER INSTRUCTIONS"));
    expect(result).toContain("The CTA is clipped.");
    expect(result).toContain("Make the headline bolder.");
  });
});

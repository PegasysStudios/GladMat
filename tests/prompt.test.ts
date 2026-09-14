import { describe, expect, it } from "vitest";
import { buildImageGenerationPrompt } from "@/lib/prompts/build-image-generation-prompt";
import type { SourceAnalysis } from "@/lib/schemas";

const analysis: SourceAnalysis = {
  summary: "A high-energy concert poster.",
  exactText: ["THE NIGHT SHOW", "SEPTEMBER 21"],
  primaryHeadline: "THE NIGHT SHOW",
  artistOrEventName: "The Night Show",
  dateText: "SEPTEMBER 21",
  timeText: "8 PM",
  venueText: "Main Hall",
  locationText: "Chicago",
  ctaText: "TICKETS NOW",
  websiteText: "example.com",
  otherRequiredText: [],
  visualStyle: "Editorial black and cobalt composition.",
  colorPalette: [{ hex: "#3157D5", role: "Accent" }],
  typography: { headlineStyle: "Condensed display", bodyStyle: "Sans serif", other: "Uppercase" },
  visualHierarchy: ["Event title", "Artist", "Date and venue"],
  importantSubjects: [{ description: "Singer at center", importance: "primary" }],
  logosAndMarks: ["Promoter logo"],
  decorativeElements: ["Cobalt rules"],
  layoutDescription: "Portrait stack",
  preservationInstructions: ["Keep singer recognizable"],
};

describe("image generation prompt", () => {
  it("includes the target, analysis, corrected copy, and format guidance", () => {
    const prompt = buildImageGenerationPrompt({
      analysis,
      correctedText: ["THE NIGHT SHOW", "SEPTEMBER 22"],
      width: 728,
      height: 90,
      formatName: "Leaderboard",
      additionalInstructions: "Keep the singer large.",
    });
    expect(prompt).toContain("Leaderboard");
    expect(prompt).toContain("728 × 90");
    expect(prompt).toContain("ULTRA_WIDE");
    expect(prompt).toContain("CENTRAL");
    expect(prompt).toContain("SEPTEMBER 22");
    expect(prompt).not.toContain("SEPTEMBER 21");
    expect(prompt).toContain('"visualStyle": "Editorial black and cobalt composition."');
    expect(prompt.endsWith("Keep the singer large.")).toBe(true);
    expect(prompt).not.toContain("undefined");
    expect(prompt).not.toContain("[object Object]");
  });

  it("adds retry issues before optional user instructions", () => {
    const prompt = buildImageGenerationPrompt({
      analysis,
      correctedText: [],
      width: 120,
      height: 600,
      formatName: "Skyscraper",
      retryIssues: ["The date is clipped."],
      additionalInstructions: "Keep the blue border.",
    });
    expect(prompt).toContain("RETRY CORRECTIONS");
    expect(prompt).toContain("The date is clipped.");
    expect(prompt.indexOf("RETRY CORRECTIONS")).toBeLessThan(prompt.indexOf("ADDITIONAL USER INSTRUCTIONS"));
  });

  it("adds a short-banner override only when height is under 150px", () => {
    const shortBanner = buildImageGenerationPrompt({
      analysis,
      correctedText: ["THE NIGHT SHOW", "SEPTEMBER 22"],
      width: 728,
      height: 90,
      formatName: "Leaderboard",
    });
    const tallEnough = buildImageGenerationPrompt({
      analysis,
      correctedText: ["THE NIGHT SHOW", "SEPTEMBER 22"],
      width: 1080,
      height: 1350,
      formatName: "Feed portrait",
    });
    expect(shortBanner).toContain("SHORT BANNER EXCEPTION — THIS TARGET ONLY");
    expect(shortBanner).toContain("Photographs, portraits, people, and large decorative imagery are OPTIONAL");
    expect(tallEnough).not.toContain("SHORT BANNER EXCEPTION — THIS TARGET ONLY");
    expect(tallEnough).toContain("PEOPLE AND SUBJECT PRESERVATION");
  });
});

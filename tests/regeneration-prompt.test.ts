import { describe, expect, it } from "vitest";
import { buildImageRegenerationPrompt } from "@/lib/prompts/build-image-regeneration-prompt";
import type { SourceAnalysis } from "@/lib/schemas";

const analysis: SourceAnalysis = {
  summary: "Concert", exactText: ["THE NIGHT SHOW", "SEPTEMBER 21"],
  primaryHeadline: "THE NIGHT SHOW", artistOrEventName: "", dateText: "SEPTEMBER 21",
  timeText: "", venueText: "", locationText: "", ctaText: "", websiteText: "", otherRequiredText: [],
  visualStyle: "Editorial black and cobalt composition.", colorPalette: [],
  typography: { headlineStyle: "Condensed", bodyStyle: "Sans", other: "" }, visualHierarchy: [],
  importantSubjects: [], logosAndMarks: [], decorativeElements: [], layoutDescription: "Portrait", preservationInstructions: [],
};

describe("individual regeneration", () => {
  it.each([[120, 600], [970, 90]])(
    "retains exact foreground bounds after requested updates for %sx%s", (width, height) => {
      const result = buildImageRegenerationPrompt({
        analysis, correctedText: analysis.exactText, width, height, formatName: "Target",
        regenerationInstructions: "Make the title larger and move it to the edge.",
      });
      expect(result).toContain(`advertisement at ${width} × ${height}`);
      expect(result).toContain("REQUESTED UPDATES\n- Make the title larger and move it to the edge.");
      expect(result.indexOf("REQUESTED UPDATES")).toBeLessThan(result.lastIndexOf("MANDATORY MASK RULE"));
      expect(result).toContain("Do not draw the mask boundary or enlarge foreground beyond it");
      expect(result).not.toContain("mandatory editable bleed");
    },
  );

  it("uses the same new per-size prompt and appends the requested update", () => {
    const result = buildImageRegenerationPrompt({
      analysis, correctedText: ["THE NIGHT SHOW", "SEPTEMBER 22"], width: 300, height: 250,
      formatName: "Medium rectangle", retryIssues: ["Date is clipped."],
      regenerationInstructions: "  Give the date more room.  ",
    });
    expect(result).toContain("SOURCE STYLE ANALYSIS");
    expect(result).toContain("SEPTEMBER 22");
    expect(result).not.toContain("SEPTEMBER 21");
    expect(result).toContain("SPACING AND PADDING");
    expect(result.indexOf("RETRY CORRECTIONS")).toBeLessThan(result.indexOf("INDIVIDUAL ASSET REGENERATION"));
    expect(result).toContain("regenerates only the Medium rectangle asset");
    expect(result).toContain("<requested_updates>\nGive the date more room.\n</requested_updates>");
    expect(result.indexOf("</requested_updates>")).toBeLessThan(result.lastIndexOf("Retain the mandatory editable bleed"));
  });
});

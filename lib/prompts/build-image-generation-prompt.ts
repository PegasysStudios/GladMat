import { chooseGenerationCanvas } from "@/lib/dimensions";
import type { LayoutReference } from "@/lib/layout-references";
import { imageRolesSection, layoutGuidanceSection } from "@/lib/prompts/layout-reference-roles";
import { buildNarrowAdmatCompositionPrompt } from "@/lib/prompts/narrow-admat-layout";
import { SPACING_GUARDRAILS } from "@/lib/prompts/spacing-guardrails";
import { requiredCopyForTarget } from "@/lib/required-copy";
import type { SourceAnalysis } from "@/lib/schemas";

export type ImagePromptInput = {
  analysis: SourceAnalysis;
  correctedText: string[];
  width: number;
  height: number;
  formatName: string;
  layoutReference?: LayoutReference | null;
  additionalInstructions?: string;
  retryIssues?: string[];
};

export function buildImageGenerationPrompt(input: ImagePromptInput) {
  const { analysis, width, height, formatName, layoutReference } = input;
  const canvas = chooseGenerationCanvas(width, height);
  const narrowPrompt = buildNarrowAdmatCompositionPrompt({
    ...input,
    hasLayoutReference: Boolean(layoutReference),
  });
  if (narrowPrompt) return narrowPrompt;
  const cropAxis = canvas.targetRatio > canvas.canvasRatio ? "height" : "width";
  const liveFraction = cropAxis === "height"
    ? canvas.canvasRatio / canvas.targetRatio
    : canvas.targetRatio / canvas.canvasRatio;
  const copy = requiredCopyForTarget(input);
  const style = {
    visualStyle: analysis.visualStyle,
    colorPalette: analysis.colorPalette,
    typography: analysis.typography,
    importantSubjects: analysis.importantSubjects,
    logosAndMarks: analysis.logosAndMarks,
    decorativeElements: analysis.decorativeElements,
  };

  return [
    `Create a professional, intentional, readable paid advertisement for ${formatName || "custom format"}, ${width} × ${height}. Build this size independently.`,
    imageRolesSection(layoutReference),
    `REQUIRED COPY
Render these exact campaign words correctly, without inventing or replacing event information. Include only the copy appropriate to this size; other source text may be omitted for clarity.
${copy.length ? copy.map((line) => `- ${line}`).join("\n") : "- No confirmed copy; do not invent any."}`,
    `SOURCE STYLE ANALYSIS
${JSON.stringify(style)}`,
    layoutGuidanceSection(layoutReference),
    SPACING_GUARDRAILS,
    canvas.requiresSafeCrop
      ? `FINAL CROP
The model canvas is ${canvas.size}; the output will be center-cropped to ${width} × ${height} at 100% scale. Only the central ${Math.round(liveFraction * 100)}% of the model canvas ${cropAxis} is the target-ratio live band. Compose the entire important foreground and a background-only rim inside that band, with padding inside the final crop. Continue the same campaign background beyond the live band to every edge of the model canvas.`
      : "",
    `FINAL QUALITY
Preserve Image A's recognizable visual identity. Make the composition balanced and suited to paid advertising.`,
    input.retryIssues?.length
      ? `RETRY CORRECTIONS
Fix these issues without adding optional copy or borrowing content from the layout reference:
${input.retryIssues.map((issue) => `- ${issue}`).join("\n")}`
      : "",
    input.additionalInstructions?.trim()
      ? `ADDITIONAL USER INSTRUCTIONS
${input.additionalInstructions.trim()}`
      : "",
    `MANDATORY EDITABLE BLEED — EVERY AD SIZE
Make the model image one continuous, opaque, full-frame campaign background. Extend the actual background color, gradient, texture, pattern, lighting, and decorative treatment naturally to all four physical image edges. The background around the designed ad is usable image content for later scaling and repositioning, not an empty page. If it is a single color, continue that color; if it is textured or patterned, continue the texture or pattern seamlessly.

Reserve roughly the outer one-eighth along every edge as background-only overscan. Keep all text, logos, faces, CTA, and other essential foreground content fully inside that area and inside any target-ratio live band. The live band itself must also contain clean campaign background on all four sides of the foreground, especially above and below short banners. Empty space outside the live band does not count as usable bleed. Preserve the detail and readability of the central designed ad. The initial export uses 100% scale; users must be able to zoom out and move the artwork without finding clipped foreground or unmatched background.

Never present a finished ad as a narrow strip floating on white, transparent, or unrelated blank space. In leaderboard and other extreme aspect ratios, the model canvas is larger than the final live band: continue the campaign background above, below, left, and right of that band all the way to the physical image edges. White space in a layout reference describes spacing only; do not copy it as a white letterbox. White is appropriate only when it is the campaign background itself, continued seamlessly. This bleed is required even if additional instructions request content close to an edge.`,
  ].filter(Boolean).join("\n\n");
}

import { getNarrowAdmatPlan } from "@/lib/narrow-admat";
import { requiredCopyForTarget, type RequiredCopyInput } from "@/lib/required-copy";
import type { SourceAnalysis } from "@/lib/schemas";

type NarrowPromptInput = RequiredCopyInput & {
  formatName: string;
  hasLayoutReference: boolean;
  additionalInstructions?: string;
  regenerationInstructions?: string;
  retryIssues?: string[];
};

function strongestCampaignSubject(analysis: SourceAnalysis) {
  return analysis.importantSubjects.find((subject) => subject.importance === "primary")
    ?? analysis.importantSubjects[0];
}

export function buildNarrowAdmatBackgroundPrompt(analysis: SourceAnalysis) {
  return `Create a clean, background-only campaign plate derived from the supplied master artwork.

CAMPAIGN BACKGROUND
Preserve the master artwork's palette, lighting, texture, pattern, grain, decorative line work, and overall visual energy. Extend that background naturally and continuously to all four physical image edges.

STYLE REFERENCE
${JSON.stringify({
    summary: analysis.summary,
    visualStyle: analysis.visualStyle,
    colorPalette: analysis.colorPalette,
    decorativeElements: analysis.decorativeElements,
  })}

BACKGROUND ONLY
Do not include words, letters, numbers, logos, marks, people, faces, bodies, products, CTA controls, panels containing copy, or other foreground subjects. Do not create borders, crop marks, white padding, transparency, or an inset ad. The entire image must be one opaque, seamless campaign background.`;
}

export function buildNarrowAdmatCompositionPrompt(input: NarrowPromptInput) {
  const plan = getNarrowAdmatPlan(input.width, input.height);
  if (!plan) return "";

  const copy = requiredCopyForTarget(input);
  const subject = strongestCampaignSubject(input.analysis);
  const optionalLayoutRole = input.hasLayoutReference
    ? `\nIMAGE 3 — TARGET LAYOUT REFERENCE\nUse Image 3 only for hierarchy, flow, group count, and relative prominence. Do not copy its words, people, imagery, colors, logos, or branding.`
    : "";
  const requestedUpdates = [
    input.additionalInstructions?.trim(),
    input.regenerationInstructions?.trim(),
  ].filter(Boolean);

  return `Create the finished ${input.formatName} advertisement at ${input.width} × ${input.height}.

IMAGE ROLES
IMAGE 1 — PROTECTED CAMPAIGN BACKGROUND
Image 1 is the base canvas. Keep it unchanged outside the transparent editable region of its mask.

IMAGE 2 — MASTER CAMPAIGN ARTWORK
Image 2 controls campaign identity, content, imagery, palette, motifs, and typography personality. Recompose it; do not resize or crop the original poster as a whole.${optionalLayoutRole}

ESSENTIAL CONTENT
Render these confirmed words exactly:
${copy.length ? copy.map((line) => `- ${line}`).join("\n") : "- No confirmed copy; do not invent any."}
${subject ? `Preserve at most one strongest campaign subject when it fits: ${subject.description}` : "Use the strongest recognizable campaign motif instead of adding optional subjects."}
Supporting photography, secondary copy, extra logos, and decoration may be omitted when they compete with the essential hierarchy.

CAMPAIGN STYLE
${JSON.stringify({
    visualStyle: input.analysis.visualStyle,
    colorPalette: input.analysis.colorPalette,
    typography: input.analysis.typography,
    decorativeElements: input.analysis.decorativeElements,
  })}
${input.retryIssues?.length ? `\nREPAIR ONLY THESE QA ISSUES\n${input.retryIssues.map((issue) => `- ${issue}`).join("\n")}` : ""}
${requestedUpdates.length ? `\nREQUESTED UPDATES\n${requestedUpdates.map((instruction) => `- ${instruction}`).join("\n")}` : ""}

MANDATORY MASK RULE
The transparent masked rectangle is the entire allowed foreground area. Place every letter, logo, face, subject, panel, border, shadow, CTA, and decorative foreground element completely inside it. Do not draw the mask boundary or enlarge foreground beyond it. The surrounding protected background supplies the required 5% visible background on every final edge. Produce one integrated ad, without white space, transparency, letterboxing, crop marks, or a framed inset.`;
}

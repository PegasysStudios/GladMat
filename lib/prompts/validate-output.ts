import { isUltraShortBanner } from "@/lib/dimensions";
import { isNarrowAdmatTarget } from "@/lib/narrow-admat";
import { getUltraShortLayoutBudget } from "@/lib/ultra-short-layout";

function layoutReferenceValidationBlock(layoutReferenceUsed: boolean) {
  if (!layoutReferenceUsed) return "";
  return `

REFERENCE-AWARE REVIEW

The supplied images are labeled in the request: GENERATED OUTPUT, IMAGE A (master campaign artwork), and IMAGE B (layout-only reference).

Validate copy, colors, typography personality, imagery, branding, and campaign identity against Image A. Validate only layout structure, density, spacing rhythm, safe margins, relative group sizing, composition simplicity, information priority, and CTA prominence against Image B.

Never request Image B's words, colors, logos, people, brand, typography design, imagery, or artistic style. If the generated output is crowded, poorly grouped, or gives the CTA weak hierarchy, describe how to follow Image B's whitespace and organizational discipline more closely without changing Image A's campaign identity.`;
}

export function buildValidationPrompt(
  expectedCopy: string[],
  width: number,
  height: number,
  layoutReferenceUsed = false,
) {
  const narrowTarget = isNarrowAdmatTarget(width, height);
  const horizontalMargin = width / 20;
  const verticalMargin = height / 20;
  const narrowReview = narrowTarget
    ? `\n\nEXTREME FORMAT SAFE FRAME
The complete foreground must fit within the centered 90% of final width and height. Review for at least ${horizontalMargin}px of campaign background on left/right and ${verticalMargin}px on top/bottom. Report foreground crossing this safe area, a missing background rim, or blank/letterbox strips as layout issues. Do not request enlargement beyond the safe area.`
    : "";
  const expectedCopyBlock = expectedCopy.length
    ? expectedCopy.map((line) => `- ${line}`).join("\n")
    : "- No confirmed copy was supplied.";

  if (isUltraShortBanner(width, height)) {
    const budget = getUltraShortLayoutBudget(width, height);
    return `Review this generated event advertisement at the FINAL exact size ${width} × ${height} as a lightweight production quality check.

Expected confirmed copy:
${expectedCopyBlock}
${layoutReferenceValidationBlock(layoutReferenceUsed)}${narrowReview}

Only the listed strings are REQUIRED for this ${width} × ${height} ultra-short banner. Intentional omission of other source copy is SUCCESSFUL. Do not fail because a website, street address, presenter/promoter line, supporting act, artist photograph, person, or other optional source element is absent unless it appears in the required list above.

This is an ${budget.class} ultra-short banner. Judge the FINAL cropped ${width} × ${height} image, not a larger model canvas.

Mark passed=false only for a clear, severe problem:
- an obvious misspelling or material mutation of confirmed copy
- required confirmed copy missing when it should reasonably fit
- required text clipped, or any required letter touching a canvas edge
- required foreground content obviously outside the safe region (at least ${narrowTarget ? horizontalMargin : budget.horizontalMargin}px left/right and ${narrowTarget ? verticalMargin : budget.verticalMargin}px top/bottom)
- headline excessively tall and visually touching or approaching the top/bottom edges
- CTA badge disproportionately large
- information groups overlapping
- groups visibly misaligned vertically
- spacing between groups obviously too tight
- important content appearing likely to be lost at the edges after the exact-size crop
- overall composition looking edge-to-edge and cramped rather than intentionally spaced
- incorrect campaign styling that no longer matches the source design language

Do not fail for missing photographs, people, optional logos, or optional source copy that was not listed as required. Those omissions are intentional.

When listing issues, use geometric, actionable language such as:
- Headline is too close to top and bottom edges.
- CTA is too close to the right edge.
- Venue/location group needs more horizontal separation.
- Foreground system should be scaled down.
- Required copy must remain inside the central safe band.

Do not write vague issues such as "Layout looks bad." Return the requested structured result only.`;
  }

  return `Review this generated event advertisement at ${width} × ${height} as a lightweight production quality check.

Expected confirmed copy:
${expectedCopyBlock}
${layoutReferenceValidationBlock(layoutReferenceUsed)}${narrowReview}

Only the listed strings are required; omission of other source copy is acceptable for this placement.

Mark passed=false only for a clear, severe problem:
- an obvious misspelling or material mutation of confirmed copy
- important confirmed copy missing when it should reasonably fit
- severely clipped or unreadable key text
- severe layout failure, accidental overlap, or visual corruption
- a badly distorted primary face, subject, or logo

Do not fail for subjective stylistic preferences, harmless line breaks, or tiny supporting copy that is naturally omitted in an extremely small format. List concise actionable issues. Return the requested structured result only.`;
}

import {
  chooseGenerationCanvas,
  classifyAspectRatio,
  formatSpecificInstructions,
} from "@/lib/dimensions";
import type { SourceAnalysis } from "@/lib/schemas";

export type ImagePromptInput = {
  analysis: SourceAnalysis;
  correctedText: string[];
  width: number;
  height: number;
  formatName: string;
  additionalInstructions?: string;
  retryIssues?: string[];
};

const SHORT_BANNER_MAX_HEIGHT = 150;
const SHORT_BANNER_MIN_ASPECT_RATIO = 3;

function shortBannerInstructions(width: number, height: number) {
  const aspectRatio = width / height;

  if (
    height >= SHORT_BANNER_MAX_HEIGHT ||
    aspectRatio < SHORT_BANNER_MIN_ASPECT_RATIO
  ) {
    return "";
  }

  return `
SHORT BANNER EXCEPTION — THIS TARGET ONLY

This target is an extremely short horizontal display banner.

For THIS size only, adapt the source campaign into a purpose-built horizontal composition instead of trying to preserve the original poster layout.

IMPORTANT:
The VISUAL IDENTITY must remain unchanged.

Do NOT redesign the campaign.

Preserve the source artwork's:
- color palette
- typography character
- headline treatment
- border and shadow style
- graphic language
- spacing personality
- recognizable campaign motifs
- logo treatment where usable
- overall visual energy

The layout may change significantly.
The STYLE may not.

Think of this as the same designer adapting the same campaign to a much smaller horizontal placement.

CONTENT PRIORITY

Use this priority order:

1. PRIMARY EVENT INFORMATION
Keep the most important confirmed event copy prominent and readable:
- primary headline or event name
- artist name
- date
- venue or location
- primary call to action when present

2. SECONDARY EVENT INFORMATION
Include secondary details such as:
- time
- price
- URL
- supporting copy

only when they can remain clearly readable without crowding the banner.

Never reduce all text to tiny unreadable copy merely to preserve every source element.

3. VISUAL IDENTITY
Retain the campaign's recognizable visual language using the original:
- colors
- type styling
- text shadows
- outlines
- panels
- bars
- borders
- icons
- shapes
- decorative motifs

Simplify the NUMBER of elements if necessary, but do not simplify the campaign into a generic banner design.

4. PHOTOGRAPHY AND SUBJECTS
Photographs, portraits, people, and large decorative imagery are OPTIONAL for this format.

Include them only when they improve the composition and do not force important copy to become too small, crowded, clipped, or misaligned.

If a portrait is used:
- preserve the person's appearance
- crop intentionally
- use a compact partial crop if appropriate
- do not squeeze the full original portrait into the banner

If the photograph does not fit naturally, omit it rather than shrinking the entire design.

LAYOUT

Prefer a deliberate left-to-right composition.

Treat the banner as several aligned horizontal zones, for example:

[ campaign / headline ] [ artist or event name ] [ date / venue ] [ CTA ]

or another arrangement that better matches the source artwork.

Do NOT recreate the original vertical stacking at miniature scale.

Use strong optical alignment.

Keep major groups vertically centered within the banner.

Maintain even top and bottom breathing room.

Keep text centered within its own panel, badge, bar, or container unless the source design clearly uses another alignment.

Avoid:
- text touching the top or bottom edge
- inconsistent vertical centering
- tiny floating text
- awkward dead space
- arbitrary element placement
- squeezed photographs
- compressed logos
- stretched typography

CAMPAIGN FIDELITY

The banner should immediately look like it belongs to the SAME campaign as the supplied master artwork.

If you remove a photograph or decorative element, preserve the campaign identity through the remaining original visual language.

Do not introduce:
- new colors
- unrelated fonts
- new graphic styles
- generic advertising templates
- replacement imagery
- new motifs that do not exist in the source artwork

The goal is not to make the design simpler.

The goal is to make the SAME DESIGN SYSTEM work successfully in a much shorter horizontal canvas.

CROP SAFETY

All required text and logos must remain inside the safe final composition area.

Background artwork and decorative elements may extend beyond crop-safe boundaries when appropriate.

Never place essential copy where final resizing or cropping could remove it.
`;
}

function safeCropInstructions(width: number, height: number) {
  const plan = chooseGenerationCanvas(width, height);
  if (!plan.requiresSafeCrop) {
    return `Compose across the full ${plan.width} × ${plan.height} model canvas. It closely matches the final target ratio.`;
  }

  if (plan.targetRatio > plan.canvasRatio) {
    const safeHeight = Math.max(1, Math.round((plan.canvasRatio / plan.targetRatio) * 100));
    return `The model canvas is ${plan.width} × ${plan.height}, but the final export is much wider at ${width} × ${height}. Keep every required word, logo, face, hand, and important subject inside the CENTRAL ${safeHeight}% OF THE CANVAS HEIGHT. The areas above and below that safe band are bleed/background only and will be cropped away.`;
  }

  const safeWidth = Math.max(1, Math.round((plan.targetRatio / plan.canvasRatio) * 100));
  return `The model canvas is ${plan.width} × ${plan.height}, but the final export is much narrower at ${width} × ${height}. Keep every required word, logo, face, hand, and important subject inside the CENTRAL ${safeWidth}% OF THE CANVAS WIDTH. The areas to the left and right of that safe band are bleed/background only and will be cropped away.`;
}

export function buildImageGenerationPrompt({
  analysis,
  correctedText,
  width,
  height,
  formatName,
  additionalInstructions = "",
  retryIssues = [],
}: ImagePromptInput) {
  const category = classifyAspectRatio(width, height);
  const exactCopy = (correctedText.length ? correctedText : analysis.exactText)
    .map((line) => line.trim())
    .filter(Boolean);
  const hierarchy = analysis.visualHierarchy.length
    ? analysis.visualHierarchy.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : "Preserve the hierarchy visible in the master artwork.";
  const visualAnalysis = {
    summary: analysis.summary,
    visualStyle: analysis.visualStyle,
    colorPalette: analysis.colorPalette,
    typography: analysis.typography,
    visualHierarchy: analysis.visualHierarchy,
    importantSubjects: analysis.importantSubjects,
    logosAndMarks: analysis.logosAndMarks,
    decorativeElements: analysis.decorativeElements,
    layoutDescription: analysis.layoutDescription,
    preservationInstructions: analysis.preservationInstructions,
  };

  const retryBlock = retryIssues.length
    ? `\nRETRY CORRECTIONS\n\nA quality review found the following severe problems in the previous attempt. Correct each one without changing confirmed copy or campaign identity:\n${retryIssues.map((issue) => `- ${issue}`).join("\n")}\n`
    : "";

  const userBlock = additionalInstructions.trim()
    ? `\nADDITIONAL USER INSTRUCTIONS\n\n${additionalInstructions.trim()}`
    : "";

  return `You are adapting an existing professional event advertisement into a new advertising format.

The supplied reference image is the MASTER ARTWORK and the authoritative source for visual appearance.

TARGET OUTPUT

Format:
${formatName}

Target dimensions:
${width} × ${height} pixels

Target aspect ratio:
${width}:${height}

GOAL

Adapt the original artwork into the target format cleanly and professionally. The result must look like another official asset from the SAME advertising campaign. It must NOT look like a new unrelated design.

Do not simply stretch, squash, or naively crop the source poster. Intelligently RECOMPOSE the design for the new canvas.

SOURCE DESIGN ANALYSIS

${JSON.stringify(visualAnalysis, null, 2)}

VISUAL ELEMENTS TO PRESERVE

Preserve the original overall art direction, primary color palette, background treatments, typography character and hierarchy, headline styling, borders, shadows, shapes, panels, badges, icons, decorative motifs, photographs, artist imagery, people, recognizable subjects, logos and marks, textures, visual energy, and campaign identity.

Do not arbitrarily redesign the campaign.

PEOPLE AND SUBJECT PRESERVATION

The reference artwork is authoritative. Preserve recognizable people and subjects. Do not intentionally change identity, face, hairstyle, clothing, pose, accessories, or distinguishing features. Repositioning, proportional scaling, or cropping the existing visual subject is allowed when necessary. Prefer extending or adapting the surrounding design and background instead of reinventing the main subject.

COPY ACCURACY

The following strings were detected and/or confirmed from the master artwork. Render them exactly as supplied, including punctuation and capitalization:

${exactCopy.length ? exactCopy.map((line) => `• ${line}`).join("\n") : "No exact copy was confidently detected. Do not invent any new copy."}

Treat proper names, artist names, venue names, cities, dates, times, URLs, prices, and sponsor names as immutable. Do not paraphrase, rewrite, translate, invent, autocorrect, substitute words, or change spelling.

VISUAL HIERARCHY

Preserve the source campaign's hierarchy while adapting it to the target canvas. The primary headline, event, or artist name should remain visually dominant. Secondary information should remain readable without competing unnecessarily with the headline.

${hierarchy}

LAYOUT ADAPTATION

Rebuild the composition intentionally for the target aspect ratio. You may move and proportionally resize elements, reflow typography, change line breaks, move supporting copy or panels, reposition the subject, adjust crop, change spacing, reorganize groups, extend simple background areas, and redistribute decorative elements.

You must not stretch the source design, distort people or logos, stretch typography, arbitrarily recolor the campaign, replace its style, introduce unrelated themes, clip important copy, or place key elements outside the canvas.

CENTERING AND ALIGNMENT

Use strong professional alignment and optically center major groups inside their intended regions. Maintain consistent margins and balanced negative space. Avoid accidental asymmetry, slightly misaligned elements, and arbitrary floating objects. Maintain clear alignment relationships among headlines, image panels, artist imagery, copy blocks, badges, and motifs. Text inside boxes, badges, panels, or bars must be visually centered unless the reference clearly uses another alignment. Keep safe margins around all important information.

FORMAT-SPECIFIC COMPOSITION

The requested aspect category is ${category}.

${formatSpecificInstructions(category)}

MODEL CANVAS AND FINAL CROP SAFETY

${safeCropInstructions(width, height)}

SMALL-FORMAT READABILITY

Do not make a small display format look like a tiny unreadable poster. Recompose it, increase the relative scale of the most important information, and use space efficiently. Keep all confirmed required copy whenever reasonably possible while maintaining campaign identity.

QUALITY REQUIREMENTS

Produce polished professional advertising artwork with sharp imagery, clean edges, balanced layout, consistent margins, professional spacing, correct hierarchy, readable copy, no clipped text, no accidental overlaps, no malformed logos, no stretched text, no distorted faces or hands, no unnecessary duplicated elements, no new unrelated imagery, and no spelling changes.

The result should look like a graphic designer received the original campaign artwork and manually adapted it to this exact advertising format.
${shortBannerInstructions(width, height)}${retryBlock}${userBlock}`.trim();
}

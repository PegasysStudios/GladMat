import type { LayoutReference } from "@/lib/layout-references";

export function imageRolesSection(layoutReference?: LayoutReference | null) {
  const master = `IMAGE A — MASTER CAMPAIGN ARTWORK
Image A controls campaign content and identity: the actual event, copy, branding, imagery, colors, motifs, and typography personality. Use the confirmed copy below for the exact words.`;

  if (!layoutReference) return master;

  return `${master}

IMAGE B — SIZE-SPECIFIC REFERENCE ADMAT
Image B controls layout and information priority for this target. It is not campaign content. Do not copy its words, event, CTA text, logos, colors, typography identity, people, imagery, or branding.
If the images conflict, Image A wins on style and content; Image B wins on structure, density, and hierarchy.`;
}

export function layoutGuidanceSection(layoutReference?: LayoutReference | null) {
  if (!layoutReference) {
    return `LAYOUT
Create a fresh composition for this target shape. Prioritize the required copy, a clear hierarchy, and comfortable whitespace; do not simply resize the original poster.`;
  }

  return `LAYOUT
Create a new adaptation, not a resized poster. Use Image B as the structural guide for the number of content groups, relative headline and CTA prominence, approximate placement, flow, whitespace, spacing rhythm, and comfortable content density. The result should feel like Image A's campaign organized in Image B's layout language. Do not reproduce Image B's campaign.`;
}

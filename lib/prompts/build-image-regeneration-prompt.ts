import { buildImageGenerationPrompt, type ImagePromptInput } from "@/lib/prompts/build-image-generation-prompt";
import { isNarrowAdmatTarget } from "@/lib/narrow-admat";
import { buildNarrowAdmatCompositionPrompt } from "@/lib/prompts/narrow-admat-layout";

export function buildImageRegenerationPrompt(
  input: ImagePromptInput & { regenerationInstructions: string },
) {
  const narrowLayout = isNarrowAdmatTarget(input.width, input.height);
  if (narrowLayout) {
    return buildNarrowAdmatCompositionPrompt({
      ...input,
      hasLayoutReference: Boolean(input.layoutReference),
      regenerationInstructions: input.regenerationInstructions,
    });
  }
  return `${buildImageGenerationPrompt(input)}

INDIVIDUAL ASSET REGENERATION
This regenerates only the ${input.formatName} asset at ${input.width} × ${input.height}. Keep the same image roles, required copy, and safe spacing while applying these requested updates:
<requested_updates>
${input.regenerationInstructions.trim()}
</requested_updates>

Retain the mandatory editable bleed on all four sides and the same continuous campaign background across the full model canvas while applying these updates. Do not create letterbox bars.`;
}

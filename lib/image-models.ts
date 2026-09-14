/** GPT Image 1 / 1.5 accept input_fidelity. GPT Image 2 and 2.5 always use high fidelity and reject the parameter. */
export function imageModelSupportsInputFidelity(model: string) {
  const id = model.trim().toLowerCase();
  if (id.includes("mini")) return false;
  return id === "gpt-image-1" || id.startsWith("gpt-image-1.") || /^gpt-image-1-\d/.test(id);
}

export const MAX_IMAGE_PROMPT_CHARS = 32_000;

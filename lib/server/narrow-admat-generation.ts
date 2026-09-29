import { rethrowJobControl } from "@/lib/server/jobs/context";
import "server-only";

import sharp from "sharp";
import { toFile } from "openai";
import { imageModelSupportsInputFidelity, MAX_IMAGE_PROMPT_CHARS } from "@/lib/image-models";
import type { LayoutReference } from "@/lib/layout-references";
import { initialGenerationTransform } from "@/lib/fine-tune";
import { getNarrowAdmatPlan } from "@/lib/narrow-admat";
import {
  buildNarrowAdmatBackgroundPrompt,
  buildNarrowAdmatCompositionPrompt,
} from "@/lib/prompts/narrow-admat-layout";
import { normalizeQualityValidation, requiredCopyForTarget } from "@/lib/required-copy";
import type { SourceAnalysis } from "@/lib/schemas";
import { getOpenAIConfig } from "@/lib/server/config";
import { AppError, logServerError } from "@/lib/server/errors";
import { expandGeneratedBleed, renderFineTunedImage } from "@/lib/server/fine-tune";
import { editAiImage } from "@/lib/server/jobs/ai";
import { assetExists, downloadBuffer, uploadBuffer } from "@/lib/server/storage";
import { validateGeneratedAsset } from "@/lib/server/validate-generated";
import { narrowAdmatBackgroundPath } from "@/lib/storage-paths";

const MAX_MODEL_PIXELS = 10_000_000;
const VALIDATION_UNAVAILABLE = "Automatic safe-area review was unavailable; review this image before publishing.";

export type NarrowAdmatGenerationInput = {
  sessionId: string;
  width: number;
  height: number;
  formatName: string;
  correctedText: string[];
  additionalInstructions?: string;
  regenerationInstructions?: string;
};

type NarrowLayoutReference = {
  reference: LayoutReference;
  buffer: Buffer;
};

type NarrowCandidate = {
  image: Buffer;
  bleed: Buffer;
  issues: string[];
};

export type NarrowAdmatGenerationResult = {
  image: Buffer;
  bleed: Buffer;
  needsReview: boolean;
  validationIssues: string[];
  attempts: number;
};

function requireNarrowPlan(width: number, height: number) {
  const plan = getNarrowAdmatPlan(width, height);
  if (!plan) {
    throw new AppError("GENERATION_FAILED", "The narrow admat workflow received an unsupported size.", 500);
  }
  return plan;
}

async function normalizeModelCanvas(input: Buffer, width: number, height: number) {
  return sharp(input, { failOn: "error", limitInputPixels: MAX_MODEL_PIXELS })
    .rotate()
    .toColourspace("srgb")
    .resize(width, height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

export async function createNarrowAdmatMask(width: number, height: number) {
  const { canvas, safeRect } = requireNarrowPlan(width, height);
  const pixels = Buffer.alloc(canvas.width * canvas.height * 4);

  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index + 3] = 255;
  }
  for (let y = safeRect.top; y < safeRect.top + safeRect.height; y += 1) {
    for (let x = safeRect.left; x < safeRect.left + safeRect.width; x += 1) {
      pixels[(y * canvas.width + x) * 4 + 3] = 0;
    }
  }

  return sharp(pixels, {
    raw: { width: canvas.width, height: canvas.height, channels: 4 },
  }).png({ compressionLevel: 9 }).toBuffer();
}

export async function restoreProtectedNarrowBackground(
  background: Buffer,
  generated: Buffer,
  width: number,
  height: number,
) {
  const { canvas, safeRect } = requireNarrowPlan(width, height);
  const [base, composition] = await Promise.all([
    normalizeModelCanvas(background, canvas.width, canvas.height),
    normalizeModelCanvas(generated, canvas.width, canvas.height),
  ]);
  const editableRegion = await sharp(composition, {
    failOn: "error",
    limitInputPixels: MAX_MODEL_PIXELS,
  }).extract(safeRect).png().toBuffer();

  return sharp(base, { failOn: "error", limitInputPixels: MAX_MODEL_PIXELS })
    .composite([{ input: editableRegion, left: safeRect.left, top: safeRect.top }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

function assertPromptLength(prompt: string) {
  if (prompt.length > MAX_IMAGE_PROMPT_CHARS) {
    throw new AppError(
      "GENERATION_FAILED",
      "The artwork analysis is too large to send to the image model. Remove optional copy or re-analyze a simpler source.",
      400,
    );
  }
}

function decodeGeneratedImage(response: { data?: Array<{ b64_json?: string | null }> | null }) {
  const encoded = response.data?.[0]?.b64_json;
  if (!encoded) {
    throw new AppError(
      "GENERATION_FAILED",
      "The AI service did not return an image. Please retry this size.",
      502,
      true,
    );
  }
  return Buffer.from(encoded, "base64");
}

async function loadOrGenerateBackground(
  input: NarrowAdmatGenerationInput,
  analysis: SourceAnalysis,
  source: Buffer,
  signal?: AbortSignal,
) {
  const config = getOpenAIConfig();
  const plan = requireNarrowPlan(input.width, input.height);
  const path = narrowAdmatBackgroundPath(
    input.sessionId,
    input.width,
    input.height,
    config.imageModel,
  );

  if (await assetExists(path)) {
    try {
      return await normalizeModelCanvas(
        await downloadBuffer(path, "ASSET_NOT_FOUND"),
        plan.canvas.width,
        plan.canvas.height,
      );
    } catch (error) {
    rethrowJobControl(error);
      logServerError(error, {
        stage: "narrow-background-cache-read",
        sessionId: input.sessionId,
        target: `${input.width}x${input.height}`,
      });
    }
  }

  const prompt = buildNarrowAdmatBackgroundPrompt(analysis);
  assertPromptLength(prompt);
  const response = await editAiImage(
    {
      model: config.imageModel,
      image: await toFile(source, "master-campaign.png", { type: "image/png" }),
      prompt,
      size: plan.canvas.size,
      quality: config.imageQuality,
      output_format: "png",
      background: "opaque",
      n: 1,
      user: input.sessionId,
      ...(imageModelSupportsInputFidelity(config.imageModel) ? { input_fidelity: "high" as const } : {}),
    },
    { signal },
  );
  const background = await normalizeModelCanvas(
    decodeGeneratedImage(response),
    plan.canvas.width,
    plan.canvas.height,
  );
  await uploadBuffer(path, background, "image/png", true);
  return background;
}

async function composeNarrowAdmat(
  input: NarrowAdmatGenerationInput,
  analysis: SourceAnalysis,
  source: Buffer,
  background: Buffer,
  mask: Buffer,
  layoutReference: NarrowLayoutReference | undefined,
  retryIssues: string[],
  signal?: AbortSignal,
) {
  const config = getOpenAIConfig();
  const plan = requireNarrowPlan(input.width, input.height);
  const prompt = buildNarrowAdmatCompositionPrompt({
    ...input,
    analysis,
    hasLayoutReference: Boolean(layoutReference),
    retryIssues,
  });
  assertPromptLength(prompt);

  const images = [
    await toFile(background, "protected-background.png", { type: "image/png" }),
    await toFile(source, "master-campaign.png", { type: "image/png" }),
    ...(layoutReference
      ? [await toFile(layoutReference.buffer, layoutReference.reference.filename, { type: "image/png" })]
      : []),
  ];
  const response = await editAiImage(
    {
      model: config.imageModel,
      image: images,
      mask: await toFile(mask, "foreground-safe-area-mask.png", { type: "image/png" }),
      prompt,
      size: plan.canvas.size,
      quality: config.imageQuality,
      output_format: "png",
      background: "opaque",
      n: 1,
      user: input.sessionId,
      ...(imageModelSupportsInputFidelity(config.imageModel) ? { input_fidelity: "high" as const } : {}),
    },
    { signal },
  );
  return decodeGeneratedImage(response);
}

async function renderCandidate(
  background: Buffer,
  generated: Buffer,
  width: number,
  height: number,
) {
  const protectedComposition = await restoreProtectedNarrowBackground(
    background,
    generated,
    width,
    height,
  );
  const bleed = await expandGeneratedBleed(protectedComposition);
  const image = await renderFineTunedImage(
    bleed,
    width,
    height,
    initialGenerationTransform(width, height),
  );
  return { image, bleed };
}

function candidateWithFewerIssues(first: NarrowCandidate, second: NarrowCandidate) {
  return second.issues.length <= first.issues.length ? second : first;
}

export async function generateNarrowAdmat(
  input: NarrowAdmatGenerationInput,
  analysis: SourceAnalysis,
  source: Buffer,
  layoutReference: NarrowLayoutReference | undefined,
  onPhase: (phase: "generating" | "processing", attempt: number) => void,
  signal?: AbortSignal,
): Promise<NarrowAdmatGenerationResult> {
  requireNarrowPlan(input.width, input.height);
  const copyInput = {
    analysis,
    correctedText: input.correctedText,
    width: input.width,
    height: input.height,
  };
  const expectedCopy = requiredCopyForTarget(copyInput);

  onPhase("generating", 1);
  const [background, mask] = await Promise.all([
    loadOrGenerateBackground(input, analysis, source, signal),
    createNarrowAdmatMask(input.width, input.height),
  ]);

  const createCandidate = async (attempt: number, retryIssues: string[]) => {
    if (attempt > 1) onPhase("generating", attempt);
    const generated = await composeNarrowAdmat(
      input,
      analysis,
      source,
      background,
      mask,
      layoutReference,
      retryIssues,
      signal,
    );
    onPhase("processing", attempt);
    return renderCandidate(background, generated, input.width, input.height);
  };

  const validate = async (candidate: { image: Buffer; bleed: Buffer }) => normalizeQualityValidation(
    await validateGeneratedAsset(
      candidate.image,
      expectedCopy,
      input.width,
      input.height,
      signal,
      layoutReference
        ? {
            master: source,
            layout: layoutReference.buffer,
            layoutReferenceUsed: true,
          }
        : { master: source },
    ),
    copyInput,
  );

  const firstRendered = await createCandidate(1, []);
  let firstValidation;
  try {
    firstValidation = await validate(firstRendered);
  } catch (error) {
    rethrowJobControl(error);
    logServerError(error, {
      stage: "narrow-quality-validation",
      sessionId: input.sessionId,
      target: `${input.width}x${input.height}`,
      attempt: 1,
    });
    return {
      ...firstRendered,
      needsReview: true,
      validationIssues: [VALIDATION_UNAVAILABLE],
      attempts: 1,
    };
  }
  if (firstValidation.passed) {
    return {
      ...firstRendered,
      needsReview: false,
      validationIssues: firstValidation.issues,
      attempts: 1,
    };
  }

  const firstCandidate: NarrowCandidate = {
    ...firstRendered,
    issues: firstValidation.issues,
  };
  let secondRendered;
  try {
    secondRendered = await createCandidate(2, firstValidation.issues);
  } catch (error) {
    rethrowJobControl(error);
    logServerError(error, {
      stage: "narrow-repair",
      sessionId: input.sessionId,
      target: `${input.width}x${input.height}`,
      attempt: 2,
    });
    return {
      image: firstCandidate.image,
      bleed: firstCandidate.bleed,
      needsReview: true,
      validationIssues: [
        ...firstCandidate.issues,
        "The automatic correction attempt failed; review the retained first image.",
      ],
      attempts: 2,
    };
  }

  let secondValidation;
  try {
    secondValidation = await validate(secondRendered);
  } catch (error) {
    rethrowJobControl(error);
    logServerError(error, {
      stage: "narrow-quality-validation",
      sessionId: input.sessionId,
      target: `${input.width}x${input.height}`,
      attempt: 2,
    });
    return {
      ...secondRendered,
      needsReview: true,
      validationIssues: [VALIDATION_UNAVAILABLE],
      attempts: 2,
    };
  }
  if (secondValidation.passed) {
    return {
      ...secondRendered,
      needsReview: false,
      validationIssues: secondValidation.issues,
      attempts: 2,
    };
  }

  const selected = candidateWithFewerIssues(firstCandidate, {
    ...secondRendered,
    issues: secondValidation.issues,
  });
  return {
    image: selected.image,
    bleed: selected.bleed,
    needsReview: true,
    validationIssues: selected.issues,
    attempts: 2,
  };
}

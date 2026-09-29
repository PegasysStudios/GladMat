import "server-only";

import { readFile } from "node:fs/promises";
import { toFile } from "openai";
import { chooseGenerationCanvas, isUltraShortBanner } from "@/lib/dimensions";
import { imageModelSupportsInputFidelity, MAX_IMAGE_PROMPT_CHARS } from "@/lib/image-models";
import { initialGenerationTransform } from "@/lib/fine-tune";
import { isNarrowAdmatTarget } from "@/lib/narrow-admat";
import {
  buildGenerationReferenceInputs,
  formatLayoutReferenceLog,
  getLayoutReferenceForTarget,
} from "@/lib/layout-references";
import { buildImageGenerationPrompt } from "@/lib/prompts/build-image-generation-prompt";
import { buildImageRegenerationPrompt } from "@/lib/prompts/build-image-regeneration-prompt";
import { normalizeQualityValidation, requiredCopyForTarget } from "@/lib/required-copy";
import type { z } from "zod";
import { GenerateRequestSchema } from "@/lib/schemas";
import { mintAssetToken } from "@/lib/server/asset-token";
import { loadStoredAnalysis } from "@/lib/server/analyze-source";
import { getOpenAIConfig } from "@/lib/server/config";
import { AppError, logServerError, normalizeError } from "@/lib/server/errors";
import { expandGeneratedBleed, renderFineTunedImage, resolveGeneratedAssetPath } from "@/lib/server/fine-tune";
import { generateNarrowAdmat } from "@/lib/server/narrow-admat-generation";
import { getOpenAIClient } from "@/lib/server/openai";
import {
  assetExists,
  createSignedPreview,
  downloadBuffer,
  uploadBuffer,
} from "@/lib/server/storage";
import { validateGeneratedAsset } from "@/lib/server/validate-generated";
import { generatedAssetPath, generatedBleedPath, generatedEditorBleedPath } from "@/lib/storage-paths";
import { logUltraShortLayoutPlan } from "@/lib/ultra-short-layout";

type GenerateInput = z.infer<typeof GenerateRequestSchema>;
export type GenerationPhase = "generating" | "processing";

export async function generateAsset(
  input: GenerateInput,
  onPhase: (phase: GenerationPhase, attempt: number) => void,
  signal?: AbortSignal,
) {
  const outputPath = generatedAssetPath(
    input.sessionId,
    input.width,
    input.height,
    input.requestId,
  );
  const bleedPath = generatedEditorBleedPath(input.sessionId, input.width, input.height, input.requestId);
  const legacyBleedPath = generatedBleedPath(input.sessionId, input.width, input.height, input.requestId);
  const assetIdentity = {
    requestId: input.requestId,
    width: input.width,
    height: input.height,
  };

  if (await assetExists(outputPath)) {
    const activePath = await resolveGeneratedAssetPath(input.sessionId, input.width, input.height, input.requestId);
    return {
      requestId: input.requestId,
      assetToken: mintAssetToken(input.sessionId, assetIdentity),
      previewUrl: await createSignedPreview(activePath),
      width: input.width,
      height: input.height,
      needsReview: false,
      validationIssues: [] as string[],
      attempts: 0,
      fineTuneAvailable: await assetExists(bleedPath) || await assetExists(legacyBleedPath),
      reused: true,
    };
  }

  const analysis = await loadStoredAnalysis(input.sessionId);
  const source = await downloadBuffer(input.sourcePath, "SOURCE_NOT_FOUND");
  const config = getOpenAIConfig();
  const canvas = chooseGenerationCanvas(input.width, input.height);
  const ultraShort = isUltraShortBanner(input.width, input.height);
  if (ultraShort) logUltraShortLayoutPlan(input.width, input.height, canvas);

  const selectedLayoutReference = getLayoutReferenceForTarget(
    input.width,
    input.height,
    input.formatName,
  );
  let layoutReference: { reference: NonNullable<typeof selectedLayoutReference>; buffer: Buffer } | undefined;
  if (selectedLayoutReference) {
    try {
      layoutReference = {
        reference: selectedLayoutReference,
        buffer: await readFile(selectedLayoutReference.path),
      };
    } catch (error) {
      logServerError(error, {
        stage: "layout-reference-load",
        target: `${input.width}x${input.height}`,
        layoutReferencePath: selectedLayoutReference.path,
      });
    }
  }
  if (process.env.NODE_ENV === "development") {
    console.info(
      "[AdMat] layout reference",
      formatLayoutReferenceLog(
        input.width,
        input.height,
        input.sourcePath,
        layoutReference?.reference,
        ultraShort ? "ultra-short" : "standard",
      ),
    );
  }
  const referenceInputs = buildGenerationReferenceInputs(source, layoutReference);
  const copyInput = {
    analysis,
    correctedText: input.correctedText,
    width: input.width,
    height: input.height,
  };
  const expectedCopy = requiredCopyForTarget(copyInput);

  let retryIssues: string[] = [];
  let firstReviewCandidate: Buffer | undefined;
  let firstReviewBleed: Buffer | undefined;
  let firstReviewIssues: string[] = [];
  let selected: Buffer | undefined;
  let selectedBleed: Buffer | undefined;
  let needsReview = false;
  let validationIssues: string[] = [];
  let attempts = 0;

  if (isNarrowAdmatTarget(input.width, input.height)) {
    const result = await generateNarrowAdmat(
      input,
      analysis,
      source,
      layoutReference,
      onPhase,
      signal,
    );
    selected = result.image;
    selectedBleed = result.bleed;
    needsReview = result.needsReview;
    validationIssues = result.validationIssues;
    attempts = result.attempts;
  } else {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      attempts = attempt;
      onPhase("generating", attempt);
      try {
      const promptInput = {
        analysis,
        correctedText: input.correctedText,
        width: input.width,
        height: input.height,
        formatName: input.formatName,
        additionalInstructions: input.additionalInstructions,
        retryIssues,
        layoutReference: layoutReference?.reference ?? null,
      };
      const prompt = input.regenerationInstructions
        ? buildImageRegenerationPrompt({
            ...promptInput,
            regenerationInstructions: input.regenerationInstructions,
          })
        : buildImageGenerationPrompt(promptInput);
      if (prompt.length > MAX_IMAGE_PROMPT_CHARS) {
        throw new AppError(
          "GENERATION_FAILED",
          "The artwork analysis is too large to send to the image model. Remove optional copy or re-analyze a simpler source.",
          400,
        );
      }

      const response = await getOpenAIClient().images.edit(
        {
          model: config.imageModel,
          image:
            referenceInputs.length > 1
              ? await Promise.all(
                  referenceInputs.map((reference) =>
                    toFile(reference.buffer, reference.name, { type: reference.type }),
                  ),
                )
              : await toFile(referenceInputs[0].buffer, referenceInputs[0].name, {
                  type: referenceInputs[0].type,
                }),
          prompt,
          size: canvas.size,
          quality: config.imageQuality,
          output_format: "png",
          background: "opaque",
          n: 1,
          user: input.sessionId,
          ...(imageModelSupportsInputFidelity(config.imageModel) ? { input_fidelity: "high" as const } : {}),
        },
        { signal },
      );

      const encoded = response.data?.[0]?.b64_json;
      if (!encoded) {
        throw new AppError(
          "GENERATION_FAILED",
          "The AI service did not return an image. Please retry this size.",
          502,
          true,
        );
      }

      onPhase("processing", attempt);
      const bleedImage = await expandGeneratedBleed(Buffer.from(encoded, "base64"));
      const finalImage = await renderFineTunedImage(
        bleedImage,
        input.width,
        input.height,
        initialGenerationTransform(input.width, input.height),
      );

      if (!config.validationEnabled) {
        selected = finalImage;
        selectedBleed = bleedImage;
        break;
      }

      try {
        const validation = normalizeQualityValidation(
          await validateGeneratedAsset(
            finalImage,
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
              : undefined,
          ),
          copyInput,
        );
        if (validation.passed) {
          selected = finalImage;
          selectedBleed = bleedImage;
          validationIssues = validation.issues;
          break;
        }

        if (attempt === 1) {
          firstReviewCandidate = finalImage;
          firstReviewBleed = bleedImage;
          firstReviewIssues = validation.issues;
          retryIssues = validation.issues;
          continue;
        }

        selected = finalImage;
        selectedBleed = bleedImage;
        needsReview = true;
        validationIssues = validation.issues;
        break;
      } catch (error) {
        logServerError(error, {
          stage: "quality-validation",
          sessionId: input.sessionId,
          target: `${input.width}x${input.height}`,
          attempt,
        });
        selected = finalImage;
        selectedBleed = bleedImage;
        break;
      }
      } catch (error) {
        if (attempt === 2 && firstReviewCandidate) {
          selected = firstReviewCandidate;
          selectedBleed = firstReviewBleed;
          needsReview = true;
          validationIssues = [
            ...firstReviewIssues,
            "The automatic correction attempt failed; review the retained first image.",
          ];
          break;
        }
        throw normalizeError(
          error,
          new AppError(
            "GENERATION_FAILED",
            "This asset could not be generated. Retry this size without affecting the others.",
            502,
            true,
          ),
        );
      }
    }
  }

  if (!selected || !selectedBleed) {
    throw new AppError(
      "GENERATION_FAILED",
      "This asset could not be generated. Retry this size without affecting the others.",
      502,
      true,
    );
  }

  await uploadBuffer(bleedPath, selectedBleed, "image/png", true);
  await uploadBuffer(outputPath, selected, "image/png", false);
  return {
    requestId: input.requestId,
    assetToken: mintAssetToken(input.sessionId, assetIdentity),
    previewUrl: await createSignedPreview(outputPath),
    width: input.width,
    height: input.height,
    needsReview,
    validationIssues,
    attempts,
    fineTuneAvailable: true,
    reused: false,
  };
}

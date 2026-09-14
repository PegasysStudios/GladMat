import "server-only";

import { toFile } from "openai";
import { chooseGenerationCanvas } from "@/lib/dimensions";
import { imageModelSupportsInputFidelity, MAX_IMAGE_PROMPT_CHARS } from "@/lib/image-models";
import { buildImageGenerationPrompt } from "@/lib/prompts/build-image-generation-prompt";
import type { z } from "zod";
import { GenerateRequestSchema } from "@/lib/schemas";
import { loadStoredAnalysis } from "@/lib/server/analyze-source";
import { getOpenAIConfig } from "@/lib/server/config";
import { AppError, logServerError, normalizeError } from "@/lib/server/errors";
import { finalizeGeneratedImage } from "@/lib/server/image-processing";
import { getOpenAIClient } from "@/lib/server/openai";
import {
  assetExists,
  createSignedPreview,
  downloadBuffer,
  uploadBuffer,
} from "@/lib/server/storage";
import { validateGeneratedAsset } from "@/lib/server/validate-generated";
import { generatedAssetPath } from "@/lib/storage-paths";

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

  if (await assetExists(outputPath)) {
    return {
      requestId: input.requestId,
      previewUrl: await createSignedPreview(outputPath),
      width: input.width,
      height: input.height,
      needsReview: false,
      validationIssues: [] as string[],
      attempts: 0,
      reused: true,
    };
  }

  const analysis = await loadStoredAnalysis(input.sessionId);
  const source = await downloadBuffer(input.sourcePath, "SOURCE_NOT_FOUND");
  const config = getOpenAIConfig();
  const canvas = chooseGenerationCanvas(input.width, input.height);
  const expectedCopy = (input.correctedText.length ? input.correctedText : analysis.exactText)
    .map((line) => line.trim())
    .filter(Boolean);

  let retryIssues: string[] = [];
  let firstReviewCandidate: Buffer | undefined;
  let firstReviewIssues: string[] = [];
  let selected: Buffer | undefined;
  let needsReview = false;
  let validationIssues: string[] = [];
  let attempts = 0;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    attempts = attempt;
    onPhase("generating", attempt);
    try {
      const prompt = buildImageGenerationPrompt({
        analysis,
        correctedText: expectedCopy,
        width: input.width,
        height: input.height,
        formatName: input.formatName,
        additionalInstructions: input.additionalInstructions,
        retryIssues,
      });
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
          image: await toFile(source, "source.png", { type: "image/png" }),
          prompt,
          size: canvas.size,
          quality: config.imageQuality,
          output_format: "png",
          background: "auto",
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
      const finalImage = await finalizeGeneratedImage(
        Buffer.from(encoded, "base64"),
        input.width,
        input.height,
      );

      if (!config.validationEnabled) {
        selected = finalImage;
        break;
      }

      try {
        const validation = await validateGeneratedAsset(
          finalImage,
          expectedCopy,
          input.width,
          input.height,
          signal,
        );
        if (validation.passed) {
          selected = finalImage;
          validationIssues = validation.issues;
          break;
        }

        if (attempt === 1) {
          firstReviewCandidate = finalImage;
          firstReviewIssues = validation.issues;
          retryIssues = validation.issues;
          continue;
        }

        selected = finalImage;
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
        break;
      }
    } catch (error) {
      if (attempt === 2 && firstReviewCandidate) {
        selected = firstReviewCandidate;
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

  if (!selected) {
    throw new AppError(
      "GENERATION_FAILED",
      "This asset could not be generated. Retry this size without affecting the others.",
      502,
      true,
    );
  }

  await uploadBuffer(outputPath, selected, "image/png", false);
  return {
    requestId: input.requestId,
    previewUrl: await createSignedPreview(outputPath),
    width: input.width,
    height: input.height,
    needsReview,
    validationIssues,
    attempts,
    reused: false,
  };
}

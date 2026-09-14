import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import { buildValidationPrompt } from "@/lib/prompts/validate-output";
import { QualityValidationSchema, type QualityValidation } from "@/lib/schemas";
import { getOpenAIConfig } from "@/lib/server/config";
import { AppError } from "@/lib/server/errors";
import { getOpenAIClient } from "@/lib/server/openai";

export async function validateGeneratedAsset(
  image: Buffer,
  expectedCopy: string[],
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<QualityValidation> {
  const { analysisModel } = getOpenAIConfig();
  const response = await getOpenAIClient().responses.parse(
    {
      model: analysisModel,
      store: false,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: buildValidationPrompt(expectedCopy, width, height) },
            {
              type: "input_image",
              image_url: `data:image/png;base64,${image.toString("base64")}`,
              detail: "original",
            },
          ],
        },
      ],
      text: {
        format: zodTextFormat(QualityValidationSchema, "generated_ad_quality_check"),
      },
    },
    { signal },
  );

  const parsed = QualityValidationSchema.safeParse(response.output_parsed);
  if (!parsed.success) {
    throw new AppError("ANALYSIS_FAILED", "Automated image review returned an invalid result.", 502, true);
  }
  return parsed.data;
}

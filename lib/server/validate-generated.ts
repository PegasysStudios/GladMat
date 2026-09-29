import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import { buildValidationPrompt } from "@/lib/prompts/validate-output";
import { QualityValidationSchema, type QualityValidation } from "@/lib/schemas";
import { getOpenAIConfig } from "@/lib/server/config";
import { AppError } from "@/lib/server/errors";
import { parseAiResponse } from "@/lib/server/jobs/ai";

export type ValidationReferenceImages = {
  master?: Buffer;
  layout?: Buffer;
  layoutReferenceUsed?: boolean;
};

export async function validateGeneratedAsset(
  image: Buffer,
  expectedCopy: string[],
  width: number,
  height: number,
  signal?: AbortSignal,
  references: ValidationReferenceImages = {},
): Promise<QualityValidation> {
  const { analysisModel } = getOpenAIConfig();
  const referenceContent = [
    ...(references.master
      ? [
          { type: "input_text" as const, text: "IMAGE A — MASTER CAMPAIGN ARTWORK" },
          {
            type: "input_image" as const,
            image_url: `data:image/png;base64,${references.master.toString("base64")}`,
            detail: "original" as const,
          },
        ]
      : []),
    ...(references.layout
      ? [
          { type: "input_text" as const, text: "IMAGE B — TARGET FORMAT LAYOUT REFERENCE (layout only)" },
          {
            type: "input_image" as const,
            image_url: `data:image/png;base64,${references.layout.toString("base64")}`,
            detail: "original" as const,
          },
        ]
      : []),
  ];
  const response = await parseAiResponse(
    {
      model: analysisModel,
      store: false,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildValidationPrompt(
                expectedCopy,
                width,
                height,
                Boolean(references.layout && references.layoutReferenceUsed),
              ),
            },
            { type: "input_text", text: "GENERATED OUTPUT — review this candidate" },
            {
              type: "input_image",
              image_url: `data:image/png;base64,${image.toString("base64")}`,
              detail: "original",
            },
            ...referenceContent,
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

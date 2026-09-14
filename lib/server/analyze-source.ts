import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import { ANALYZE_SOURCE_PROMPT } from "@/lib/prompts/analyze-source";
import { SourceAnalysisSchema, type SourceAnalysis } from "@/lib/schemas";
import { getOpenAIConfig } from "@/lib/server/config";
import { AppError } from "@/lib/server/errors";
import { getOpenAIClient } from "@/lib/server/openai";
import { downloadBuffer, uploadBuffer } from "@/lib/server/storage";
import { analysisPath } from "@/lib/storage-paths";

export async function analyzeSourceArtwork(
  sessionId: string,
  sourcePath: string,
  signal?: AbortSignal,
) {
  const source = await downloadBuffer(sourcePath, "SOURCE_NOT_FOUND");
  const { analysisModel } = getOpenAIConfig();

  const response = await getOpenAIClient().responses.parse(
    {
      model: analysisModel,
      store: false,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: ANALYZE_SOURCE_PROMPT },
            {
              type: "input_image",
              image_url: `data:image/png;base64,${source.toString("base64")}`,
              detail: "original",
            },
          ],
        },
      ],
      text: {
        format: zodTextFormat(SourceAnalysisSchema, "source_artwork_analysis"),
      },
    },
    { signal },
  );

  const analysis = SourceAnalysisSchema.safeParse(response.output_parsed);
  if (!analysis.success) {
    throw new AppError(
      "ANALYSIS_FAILED",
      "The artwork could not be analyzed reliably. Please try again or replace the source image.",
      502,
      true,
    );
  }

  await uploadBuffer(
    analysisPath(sessionId),
    JSON.stringify(analysis.data),
    "application/json; charset=utf-8",
  );
  return analysis.data;
}

export async function loadStoredAnalysis(sessionId: string): Promise<SourceAnalysis> {
  const buffer = await downloadBuffer(analysisPath(sessionId), "SOURCE_NOT_FOUND");
  try {
    return SourceAnalysisSchema.parse(JSON.parse(buffer.toString("utf8")));
  } catch {
    throw new AppError(
      "ANALYSIS_FAILED",
      "The stored artwork analysis is unavailable. Analyze the artwork again.",
      409,
      true,
    );
  }
}

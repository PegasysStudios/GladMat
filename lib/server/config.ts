import "server-only";

import { AppError } from "@/lib/server/errors";

const IMAGE_QUALITIES = ["low", "medium", "high", "xhigh", "max", "auto"] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AppError(
      "CONFIGURATION_REQUIRED",
      `AdMat needs ${name} configured on the server before this action can run.`,
      503,
    );
  }
  return value;
}

export function getSupabaseConfig() {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL"),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    bucket: required("SUPABASE_STORAGE_BUCKET"),
  };
}

export function getOpenAIConfig() {
  const configuredQuality = (process.env.OPENAI_IMAGE_QUALITY ?? "high").trim();
  if (!IMAGE_QUALITIES.includes(configuredQuality as ImageQuality)) {
    throw new AppError(
      "CONFIGURATION_REQUIRED",
      "OPENAI_IMAGE_QUALITY must be low, medium, high, xhigh, max, or auto.",
      503,
    );
  }
  return {
    apiKey: required("OPENAI_API_KEY"),
    analysisModel: process.env.OPENAI_ANALYSIS_MODEL?.trim() || "gpt-5.6-sol",
    imageModel: process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2.5-sunburst",
    imageQuality: configuredQuality as ImageQuality,
    validationEnabled: /^(1|true|yes)$/i.test(process.env.ENABLE_IMAGE_VALIDATION ?? "false"),
  };
}

export function getSessionSecret() {
  const secret = required("ADMAT_SESSION_SECRET");
  if (secret.length < 32) {
    throw new AppError(
      "CONFIGURATION_REQUIRED",
      "ADMAT_SESSION_SECRET must be at least 32 characters.",
      503,
    );
  }
  return secret;
}

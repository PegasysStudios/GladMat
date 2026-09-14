import "server-only";

import OpenAI from "openai";
import { getOpenAIConfig } from "@/lib/server/config";

let client: OpenAI | undefined;

export function getOpenAIClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: getOpenAIConfig().apiKey,
      maxRetries: 1,
      timeout: 270_000,
    });
  }
  return client;
}

"use client";

import { useEffect, useRef } from "react";
import { DimensionPairSchema } from "@/lib/schemas";

type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute(input: unknown): unknown | Promise<unknown>;
};

type ModelContext = {
  registerTool(tool: ToolDefinition, options?: { signal?: AbortSignal }): void | Promise<void>;
};

declare global {
  interface Document {
    readonly modelContext?: ModelContext;
  }
}

type WebMcpOptions = {
  readState: () => Record<string, unknown>;
  setOutputSizes: (
    dimensions: Array<{ width: number; height: number }>,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
};

export function useAdMatWebMcp(options: WebMcpOptions) {
  const latest = useRef(options);

  useEffect(() => {
    latest.current = options;
  }, [options]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    const tools: ToolDefinition[] = [
      {
        name: "read_admat_state",
        title: "Read AdMat state",
        description: "Read the visible source, output-size selection, and generation status without changing anything.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute(input) {
          if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) {
            throw new Error("Input must be an empty object.");
          }
          return latest.current.readState();
        },
      },
      {
        name: "set_admat_output_sizes",
        title: "Set AdMat output sizes",
        description: "Replace the visible output-size selection with a batch of exact pixel dimensions. This only stages the selection; it does not upload artwork or start paid AI generation.",
        inputSchema: {
          type: "object",
          properties: {
            dimensions: {
              type: "array",
              minItems: 1,
              maxItems: 20,
              items: {
                type: "object",
                properties: {
                  width: { type: "integer", minimum: 64, maximum: 4000 },
                  height: { type: "integer", minimum: 50, maximum: 4000 },
                },
                required: ["width", "height"],
                additionalProperties: false,
              },
            },
          },
          required: ["dimensions"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          if (!input || typeof input !== "object" || Array.isArray(input)) {
            throw new Error("Input must contain a dimensions array.");
          }
          const candidate = input as { dimensions?: unknown };
          if (!Array.isArray(candidate.dimensions) || !candidate.dimensions.length || candidate.dimensions.length > 20) {
            throw new Error("dimensions must contain between 1 and 20 sizes.");
          }
          const dimensions = candidate.dimensions.map((item) => {
            const parsed = DimensionPairSchema.safeParse(item);
            if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid dimensions.");
            return parsed.data;
          });
          return latest.current.setOutputSizes(dimensions);
        },
      },
    ];

    for (const tool of tools) {
      try {
        void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
      } catch {
        // WebMCP is optional and must never make the visible workflow fragile.
      }
    }
    return () => lifecycle.abort();
  }, []);
}

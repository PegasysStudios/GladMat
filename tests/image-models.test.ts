import { describe, expect, it } from "vitest";
import { imageModelSupportsInputFidelity } from "@/lib/image-models";

describe("image model parameter compatibility", () => {
  it("keeps input_fidelity only for GPT Image 1 and 1.5", () => {
    expect(imageModelSupportsInputFidelity("gpt-image-1")).toBe(true);
    expect(imageModelSupportsInputFidelity("gpt-image-1.5")).toBe(true);
    expect(imageModelSupportsInputFidelity("gpt-image-1.5-2026-01-01")).toBe(true);
    expect(imageModelSupportsInputFidelity("gpt-image-1-mini")).toBe(false);
    expect(imageModelSupportsInputFidelity("gpt-image-2")).toBe(false);
    expect(imageModelSupportsInputFidelity("gpt-image-2.5-sunburst")).toBe(false);
    expect(imageModelSupportsInputFidelity("gpt-image-2.5-flare")).toBe(false);
  });
});

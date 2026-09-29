import { describe, expect, it } from "vitest";
import {
  buildGenerationReferenceInputs,
  formatLayoutReferenceLog,
  getLayoutReferenceForTarget,
  LAYOUT_REFERENCE_LIBRARY,
  layoutFamilyForTarget,
} from "@/lib/layout-references";
import { AD_SIZE_PRESETS } from "@/lib/presets";

describe("layout reference selection", () => {
  it("prefers an exact target mapping", () => {
    const reference = getLayoutReferenceForTarget(970, 90, "Large leaderboard");
    expect(reference).toMatchObject({
      width: 970,
      height: 90,
      family: "ultra-wide-horizontal",
      filename: "small_ultra_wide_ref.png",
      match: "exact",
    });
  });

  it("wires every supplied size-reference filename", () => {
    expect(
      [...new Set(LAYOUT_REFERENCE_LIBRARY.map((entry) => entry.path.split("/").at(-1)))].sort(),
    ).toEqual([
      "leaderboard_ref.png",
      "skyscraper_ref.png",
      "small_square_ref.png",
      "small_ultra_wide_ref.png",
      "small_wide_ref.png",
      "vertical_ref.png",
    ]);
  });

  it("has an explicit available reference for every built-in target size", () => {
    const expectedById: Record<string, string> = {
      "feed-portrait": "vertical_ref.png",
      "feed-square": "small_square_ref.png",
      landscape: "small_wide_ref.png",
      "medium-rectangle": "small_square_ref.png",
      "large-rectangle": "small_square_ref.png",
      leaderboard: "leaderboard_ref.png",
      mobile: "small_ultra_wide_ref.png",
      "large-mobile": "small_wide_ref.png",
      "half-page": "vertical_ref.png",
      "wide-skyscraper": "skyscraper_ref.png",
      skyscraper: "skyscraper_ref.png",
      square: "small_square_ref.png",
      "small-square": "small_square_ref.png",
      "main-banner": "leaderboard_ref.png",
      portrait: "vertical_ref.png",
      billboard: "small_wide_ref.png",
      "large-leaderboard": "small_ultra_wide_ref.png",
      "half-banner": "small_wide_ref.png",
      "vertical-rectangle": "vertical_ref.png",
      "small-rectangle": "small_square_ref.png",
    };
    for (const size of AD_SIZE_PRESETS) {
      const selected = getLayoutReferenceForTarget(size.width, size.height, size.name);
      expect(selected, size.name).toBeDefined();
      expect(selected?.match, size.name).toBe("exact");
      expect(selected?.filename, size.name).toBe(expectedById[size.id]);
    }
  });

  it("falls back deterministically to the designated reference in the same layout family", () => {
    const reference = getLayoutReferenceForTarget(1000, 100, "Custom leaderboard");
    expect(layoutFamilyForTarget(1000, 100)).toBe("ultra-wide-horizontal");
    expect(reference).toMatchObject({
      family: "ultra-wide-horizontal",
      filename: "small_ultra_wide_ref.png",
      match: "family",
    });
  });

  it("uses a compact reference for a custom billboard rather than an ultra-wide leaderboard", () => {
    expect(getLayoutReferenceForTarget(1000, 240, "Custom billboard")).toMatchObject({
      filename: "small_wide_ref.png", match: "family",
    });
  });

  it("returns undefined without crashing when no reference asset is available", () => {
    expect(
      getLayoutReferenceForTarget(970, 90, "Large leaderboard", { library: [] }),
    ).toBeUndefined();
    expect(
      getLayoutReferenceForTarget(970, 90, "Large leaderboard", {
        fileExists: () => false,
      }),
    ).toBeUndefined();
  });

  it("orders the master first and the optional layout reference second", () => {
    const reference = getLayoutReferenceForTarget(728, 90, "Leaderboard");
    expect(reference).toBeDefined();
    const inputs = buildGenerationReferenceInputs(Buffer.from("master"), {
      reference: reference!,
      buffer: Buffer.from("layout"),
    });
    expect(inputs.map(({ role, name }) => ({ role, name }))).toEqual([
      { role: "master", name: "source.png" },
      { role: "layout", name: "leaderboard_ref.png" },
    ]);
    expect(inputs[0].buffer.toString()).toBe("master");
    expect(inputs[1].buffer.toString()).toBe("layout");
  });

  it("preserves the existing single-image request shape when no layout reference exists", () => {
    const inputs = buildGenerationReferenceInputs(Buffer.from("master"));
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({ role: "master", name: "source.png", type: "image/png" });
  });

  it("formats safe development diagnostics without image data", () => {
    const reference = getLayoutReferenceForTarget(300, 250, "Medium rectangle");
    const log = formatLayoutReferenceLog(300, 250, "sessions/example/source.png", reference);
    expect(log).toMatchObject({
      target: "300x250",
      layoutReferenceUsed: true,
      sourceArtworkPath: "sessions/example/source.png",
      promptMode: "standard-with-layout-reference",
    });
    expect(JSON.stringify(log)).not.toContain("master");
  });
});

import { describe, expect, it } from "vitest";
import { AD_SIZE_PRESETS, DEFAULT_SELECTED_SIZE_IDS } from "@/lib/presets";

describe("ad size presets", () => {
  it("contains the required unique presets with social sizes first", () => {
    expect(AD_SIZE_PRESETS).toHaveLength(20);
    expect(new Set(AD_SIZE_PRESETS.map((size) => size.id)).size).toBe(20);
    expect(AD_SIZE_PRESETS.map(({ name, width, height }) => [name, width, height])).toEqual([
      ["Feed portrait", 1080, 1350],
      ["Feed square", 1080, 1080],
      ["Landscape", 1920, 1005],
      ["Medium rectangle", 300, 250],
      ["Large rectangle", 336, 280],
      ["Leaderboard", 728, 90],
      ["Mobile", 320, 50],
      ["Large mobile", 320, 100],
      ["Half page", 300, 600],
      ["Wide skyscraper", 160, 600],
      ["Skyscraper", 120, 600],
      ["Square", 250, 250],
      ["Small square", 200, 200],
      ["Main banner", 468, 60],
      ["Portrait", 300, 1050],
      ["Billboard", 970, 250],
      ["Large leaderboard", 970, 90],
      ["Half banner", 234, 60],
      ["Vertical rectangle", 120, 240],
      ["Small rectangle", 180, 150],
    ]);
  });

  it("starts with no output sizes selected", () => {
    expect(DEFAULT_SELECTED_SIZE_IDS.size).toBe(0);
  });
});

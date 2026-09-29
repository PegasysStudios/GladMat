import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SizeSelector } from "@/components/size-selector";

describe("SizeSelector", () => {
  it("shows the three large-format presets in Popular sizes only", () => {
    const markup = renderToStaticMarkup(createElement(SizeSelector, {
      selectedIds: new Set<string>(),
      customSizes: [],
      onToggle: () => {},
      onSelectAll: () => {},
      onClear: () => {},
      onAddCustom: () => {},
      onRemoveCustom: () => {},
    }));
    const popularStart = markup.indexOf("Popular sizes");
    const socialStart = markup.indexOf("Social &amp; square");
    const popular = markup.slice(popularStart, socialStart);
    expect(popularStart).toBeGreaterThan(-1);
    expect(socialStart).toBeGreaterThan(popularStart);
    for (const label of ["1080 × 1350", "1080 × 1080", "1920 × 1005"]) {
      expect(popular).toContain(label);
      expect(markup.split(label)).toHaveLength(2);
    }
  });

  it("shows selected custom sizes in a visible group under Other formats", () => {
    const markup = renderToStaticMarkup(createElement(SizeSelector, {
      selectedIds: new Set(["custom-640x360"]),
      customSizes: [{ id: "custom-640x360", name: "Custom size", width: 640, height: 360, custom: true }],
      onToggle: () => {}, onSelectAll: () => {}, onClear: () => {}, onAddCustom: () => {}, onRemoveCustom: () => {},
    }));
    const customStart = markup.indexOf('aria-label="Custom output sizes"');
    expect(customStart).toBeGreaterThan(markup.indexOf("Other formats"));
    const custom = markup.slice(customStart);
    expect(custom).toContain('aria-label="Custom Size 640 by 360"');
    expect(custom).toContain('aria-checked="true"');
    expect(custom).toContain("Custom Size");
    expect(custom).toContain("640 × 360");
    expect(custom).toContain("lucide-rectangle-horizontal");
    expect(custom).toContain('aria-label="Remove custom size 640 by 360"');
    expect(custom).not.toContain("overflow-x-auto");
  });
});

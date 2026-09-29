"use client";

import { RectangleHorizontal, Trash2 } from "lucide-react";
import { AdSizeShape } from "@/components/ad-size-shape";
import { Checkbox } from "@/components/ui/checkbox";
import { CustomSizeDialog } from "@/components/custom-size-dialog";
import { Button } from "@/components/ui/button";
import { StepHeading } from "@/components/step-heading";
import { AD_SIZE_PRESETS } from "@/lib/presets";
import { cn } from "@/lib/cn";
import type { AdSize } from "@/lib/types";

const SIZE_GROUPS = [
  {
    label: "Popular sizes",
    ids: [
      "feed-portrait",
      "feed-square",
      "landscape",
      "medium-rectangle",
      "large-rectangle",
      "leaderboard",
      "mobile",
      "large-mobile",
    ],
  },
  {
    label: "Social & square",
    ids: [
      "square",
      "small-square",
      "vertical-rectangle",
      "portrait",
      "half-banner",
    ],
  },
  {
    label: "Other formats",
    ids: [
      "half-page",
      "wide-skyscraper",
      "skyscraper",
      "billboard",
      "large-leaderboard",
      "small-rectangle",
      "main-banner",
    ],
  },
] as const;

export function SizeSelector({
  selectedIds,
  customSizes,
  onToggle,
  onSelectAll,
  onClear,
  onAddCustom,
  onRemoveCustom,
}: {
  selectedIds: Set<string>;
  customSizes: AdSize[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onAddCustom: (size: AdSize) => void;
  onRemoveCustom: (id: string) => void;
}) {
  const sizes: AdSize[] = [...AD_SIZE_PRESETS, ...customSizes];
  const sizeById = new Map(sizes.map((size) => [size.id, size]));

  return (
    <>
      <StepHeading
        step={2}
        title="Choose your output sizes"
        description="Select the ad sizes you want to generate from your artwork."
        action={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <p className="mr-1 whitespace-nowrap text-[12px] font-semibold text-[var(--ink)]">
              {selectedIds.size} selected
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" className="min-h-9 rounded-[8px] px-3 text-[12px]" onClick={onSelectAll}>
                Select all
              </Button>
              <Button variant="secondary" size="sm" className="min-h-9 rounded-[8px] px-3 text-[12px]" onClick={onClear}>
                Clear
              </Button>
            </div>
          </div>
        )}
      />

      <div className="space-y-4">
        {SIZE_GROUPS.map((group) => {
          const groupSizes = group.ids
            .map((id) => sizeById.get(id))
            .filter((size): size is AdSize => Boolean(size));
          const isLastGroup = group.label === "Other formats";
          const visibleSizes = isLastGroup ? groupSizes.slice(0, 5) : groupSizes;
          const overflowSizes = isLastGroup ? groupSizes.slice(5) : [];
          return (
            <div key={group.label}>
              <h3 className="mb-2 text-[13px] font-semibold text-[var(--ink)]">{group.label}</h3>
              <div className={cn("size-row -mx-0.5 flex snap-x gap-2 overflow-x-auto px-0.5 pb-1", isLastGroup && "other-size-row")}>
                {visibleSizes.map((size) => {
                  const selected = selectedIds.has(size.id);
                  return (
                    <div key={size.id} className="size-card relative shrink-0 snap-start">
                      <label
                        className={cn(
                          "relative flex h-[114px] cursor-pointer flex-col items-center rounded-[9px] border px-2 pb-2.5 pt-2 transition-[border-color,background-color,box-shadow,transform] duration-150 active:scale-[0.99]",
                          selected
                            ? "border-[var(--accent)] bg-[#f6faff] shadow-[0_0_0_1px_rgb(37_99_235/0.05)]"
                            : "border-[var(--line)] bg-white hover:border-[var(--line-strong)] hover:bg-[var(--surface-subtle)]",
                        )}
                      >
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => onToggle(size.id)}
                          aria-label={`${size.name} ${size.width} by ${size.height}`}
                          className="absolute left-2 top-2 size-4 rounded-[4px]"
                        />
                        <div className="flex min-h-0 w-full flex-1 items-center justify-center pb-1 pt-3">
                          <AdSizeShape width={size.width} height={size.height} max={43} />
                        </div>
                        <span className="w-full text-center">
                          <span className="block truncate text-[12px] font-semibold leading-tight text-[var(--ink)]">{size.name}</span>
                          <span className="mt-0.5 block text-[11px] tabular-nums text-[var(--ink-muted)]">{size.width} × {size.height}</span>
                        </span>
                      </label>
                      {size.custom ? (
                        <button
                          type="button"
                          onClick={() => onRemoveCustom(size.id)}
                          aria-label={`Remove custom size ${size.width} by ${size.height}`}
                          className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-md text-[var(--ink-muted)] hover:bg-white hover:text-[var(--danger)]"
                        >
                          <Trash2 aria-hidden="true" size={13} />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                {isLastGroup ? (
                  <>
                    <CustomSizeDialog onAdd={onAddCustom} />
                    {overflowSizes.map((size) => {
                      const selected = selectedIds.has(size.id);
                      return (
                        <div key={size.id} className="size-card relative shrink-0 snap-start">
                          <label className={cn("relative flex h-[114px] cursor-pointer flex-col items-center rounded-[9px] border px-2 pb-2.5 pt-2", selected ? "border-[var(--accent)] bg-[#f6faff]" : "border-[var(--line)] bg-white")}>
                            <Checkbox checked={selected} onCheckedChange={() => onToggle(size.id)} aria-label={`${size.name} ${size.width} by ${size.height}`} className="absolute left-2 top-2 size-4 rounded-[4px]" />
                            <div className="flex min-h-0 w-full flex-1 items-center justify-center pb-1 pt-3">
                              <AdSizeShape width={size.width} height={size.height} max={43} />
                            </div>
                            <span className="w-full text-center">
                              <span className="block truncate text-[12px] font-semibold leading-tight">{size.name}</span>
                              <span className="mt-0.5 block text-[11px] tabular-nums text-[var(--ink-muted)]">{size.width} × {size.height}</span>
                            </span>
                          </label>
                        </div>
                      );
                    })}
                  </>
                ) : null}
              </div>
              {isLastGroup && customSizes.length ? (
                <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Custom output sizes">
                  {customSizes.map((size) => {
                    const selected = selectedIds.has(size.id);
                    return (
                      <div key={size.id} className="size-card relative shrink-0">
                        <label className={cn("relative flex h-[114px] cursor-pointer flex-col items-center rounded-[9px] border px-2 pb-2.5 pt-2", selected ? "border-[var(--accent)] bg-[#f6faff] shadow-[0_0_0_1px_rgb(37_99_235/0.05)]" : "border-[var(--line)] bg-white hover:border-[var(--line-strong)] hover:bg-[var(--surface-subtle)]")}>
                          <Checkbox checked={selected} onCheckedChange={() => onToggle(size.id)} aria-label={`Custom Size ${size.width} by ${size.height}`} className="absolute left-2 top-2 size-4 rounded-[4px]" />
                          <div className="flex min-h-0 w-full flex-1 items-center justify-center pb-1 pt-3">
                            <RectangleHorizontal aria-hidden="true" size={38} strokeWidth={1.6} className="text-[var(--shape)]" />
                          </div>
                          <span className="w-full text-center">
                            <span className="block text-[12px] font-semibold leading-tight">Custom Size</span>
                            <span className="mt-0.5 block text-[11px] tabular-nums text-[var(--ink-muted)]">{size.width} × {size.height}</span>
                          </span>
                        </label>
                        <button type="button" onClick={() => onRemoveCustom(size.id)} aria-label={`Remove custom size ${size.width} by ${size.height}`} className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-md text-[var(--ink-muted)] hover:bg-white hover:text-[var(--danger)]">
                          <Trash2 aria-hidden="true" size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

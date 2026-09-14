"use client";

import { Trash2 } from "lucide-react";
import { AdSizeShape } from "@/components/ad-size-shape";
import { Checkbox } from "@/components/ui/checkbox";
import { CustomSizeDialog } from "@/components/custom-size-dialog";
import { Button } from "@/components/ui/button";
import { StepHeading } from "@/components/step-heading";
import { AD_SIZE_PRESETS } from "@/lib/presets";
import { cn } from "@/lib/cn";
import type { AdSize } from "@/lib/types";

const COMPACT_NAMES: Record<string, string> = {
  "medium-rectangle": "Medium",
  "large-rectangle": "Large",
  "feed-portrait": "Feed port",
  "feed-square": "Feed sq",
  "landscape": "Landscape",
  "vertical-rectangle": "Vertical",
  "small-rectangle": "Small rec",
  "wide-skyscraper": "Wide sky",
  "large-leaderboard": "Large board",
  "half-banner": "Half ban",
  "main-banner": "Main ban",
  "small-square": "Small sq",
};

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

  return (
    <>
      <StepHeading
        step={2}
        title="Output sizes"
        description="Select the ad sizes you want to generate."
        action={(
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            <p className="whitespace-nowrap text-[13px] font-medium text-[var(--ink-muted)]">
              {selectedIds.size} selected
            </p>
            <div className="hidden items-center gap-1 md:flex">
              <Button variant="ghost" size="sm" className="min-h-8 px-2 text-[13px]" onClick={onSelectAll}>
                Select all
              </Button>
              <Button variant="ghost" size="sm" className="min-h-8 px-2 text-[13px]" onClick={onClear}>
                Clear
              </Button>
            </div>
          </div>
        )}
      />

      <div className="max-w-full overflow-x-auto">
      <div className="flex w-max gap-2 pb-1 md:grid md:w-full md:grid-cols-5 md:gap-2.5">
        {sizes.map((size) => {
          const selected = selectedIds.has(size.id);
          const compactName = COMPACT_NAMES[size.id] ?? size.name;
          return (
            <div key={size.id} className="relative min-w-[6.85rem] shrink-0 snap-start md:min-w-0 md:shrink">
              <label
                className={cn(
                  "flex h-[108px] cursor-pointer flex-col rounded-[12px] border p-2.5 transition",
                  selected
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--line)] bg-white hover:border-[var(--line-strong)]",
                )}
              >
                <Checkbox
                  checked={selected}
                  onCheckedChange={() => onToggle(size.id)}
                  aria-label={`${size.name} ${size.width} by ${size.height}`}
                  className="size-4 rounded-[4px]"
                />
                <span className="flex min-h-0 flex-1 items-center px-0.5">
                  <AdSizeShape width={size.width} height={size.height} max={32} />
                </span>
                <span>
                  <span className="block text-[12px] font-semibold leading-tight text-[var(--ink)] md:hidden">{compactName}</span>
                  <span className="hidden text-[12px] font-semibold leading-tight text-[var(--ink)] md:block">{size.name}</span>
                  <span className="mt-0.5 block text-[11px] tabular-nums text-[var(--ink-muted)]">{size.width} × {size.height}</span>
                </span>
              </label>
              {size.custom ? (
                <button
                  type="button"
                  onClick={() => onRemoveCustom(size.id)}
                  aria-label={`Remove custom size ${size.width} by ${size.height}`}
                  className="absolute right-1.5 top-8 grid size-7 place-items-center rounded-md text-[var(--ink-muted)] hover:bg-white hover:text-[var(--danger)]"
                >
                  <Trash2 aria-hidden="true" size={13} />
                </button>
              ) : null}
            </div>
          );
        })}
        <CustomSizeDialog onAdd={onAddCustom} />
      </div>
      </div>
    </>
  );
}

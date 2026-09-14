"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DimensionPairSchema } from "@/lib/schemas";
import type { AdSize } from "@/lib/types";

export function CustomSizeDialog({ onAdd }: { onAdd: (size: AdSize) => void }) {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState("300");
  const [height, setHeight] = useState("250");
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = DimensionPairSchema.safeParse({ width: Number(width), height: Number(height) });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter valid pixel dimensions.");
      return;
    }
    onAdd({
      id: `custom-${parsed.data.width}x${parsed.data.height}`,
      name: "Custom size",
      width: parsed.data.width,
      height: parsed.data.height,
      custom: true,
    });
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="flex h-[108px] min-w-[6.85rem] shrink-0 snap-start flex-col items-center justify-center rounded-[12px] border border-dashed border-[var(--line-strong)] bg-[var(--surface-subtle)] p-3 text-center text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] md:min-w-0 md:shrink">
          <Plus aria-hidden="true" size={18} />
          <span className="mt-2 text-[12px] font-semibold">Custom size</span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Add a custom size</DialogTitle>
        <DialogDescription>Enter the exact final PNG dimensions in pixels.</DialogDescription>
        <form onSubmit={submit} className="mt-6">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <label className="text-[13px] font-medium">
              Width
              <input
                inputMode="numeric"
                type="number"
                min={64}
                max={4000}
                step={1}
                value={width}
                onChange={(event) => setWidth(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-[9px] border border-[var(--line)] px-3 text-[14px] tabular-nums focus:border-[var(--accent)] focus:outline-none"
              />
            </label>
            <span className="pb-3 text-[var(--ink-muted)]" aria-hidden="true">×</span>
            <label className="text-[13px] font-medium">
              Height
              <input
                inputMode="numeric"
                type="number"
                min={50}
                max={4000}
                step={1}
                value={height}
                onChange={(event) => setHeight(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-[9px] border border-[var(--line)] px-3 text-[14px] tabular-nums focus:border-[var(--accent)] focus:outline-none"
              />
            </label>
          </div>
          {error ? <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">{error}</p> : null}
          <p className="mt-3 text-[12px] text-[var(--ink-muted)]">64–4,000 px per edge · maximum 8 megapixels · maximum 12:1 ratio</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="accent" type="submit">Add size</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

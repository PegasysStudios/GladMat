"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { GenerationJob } from "@/lib/types";

const REGENERATION_INSTRUCTIONS_MAX = 1500;

export function RegenerationPromptDialog({
  job,
  open,
  onOpenChange,
  onSubmit,
}: {
  job: GenerationJob;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (job: GenerationJob, instructions: string) => void;
}) {
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const requestedUpdates = instructions.trim();
    if (!requestedUpdates) {
      setError("Describe what you would like to change for this size.");
      return;
    }
    onSubmit(job, requestedUpdates);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Regenerate {job.size.name}</DialogTitle>
        <DialogDescription>
          Request targeted changes for this {job.size.width} × {job.size.height} px asset.
          Your source artwork, confirmed copy, and original generation instructions will be reused.
        </DialogDescription>

        <form onSubmit={submit} className="mt-6">
          <label htmlFor="regeneration-instructions" className="text-[13px] font-semibold text-[var(--ink)]">
            What should change?
          </label>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-muted)]">
            Be specific about layout, scale, spacing, imagery, color, or emphasis. Only this selected size will be regenerated.
          </p>
          <div className="relative mt-3">
            <textarea
              id="regeneration-instructions"
              rows={5}
              required
              maxLength={REGENERATION_INSTRUCTIONS_MAX}
              value={instructions}
              onChange={(event) => {
                setInstructions(event.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. Make the artist 20% larger, move the date above the venue, and add more space around the headline."
              className="min-h-[132px] w-full resize-y rounded-[12px] border border-[var(--line)] bg-white px-3.5 py-3 pb-8 text-[14px] placeholder:text-[#9ca3af] focus:border-[var(--accent)] focus:outline-none"
            />
            <span className="pointer-events-none absolute bottom-3 right-3 text-[11px] tabular-nums text-[var(--ink-muted)]">
              {instructions.length}/{REGENERATION_INSTRUCTIONS_MAX}
            </span>
          </div>
          {error ? <p role="alert" className="mt-2 text-[13px] text-[var(--danger)]">{error}</p> : null}

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="accent" type="submit" disabled={!instructions.trim()}>
              <RotateCcw aria-hidden="true" size={15} />
              Regenerate this size
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

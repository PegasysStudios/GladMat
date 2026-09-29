"use client";

import { FileText, Plus, SquareArrowOutUpRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function CopyReview({
  lines,
  onChange,
}: {
  lines: string[];
  onChange: (lines: string[]) => void;
}) {
  function updateLine(index: number, value: string) {
    const next = [...lines];
    next[index] = value;
    onChange(next);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="group mt-4 flex min-h-12 w-full items-center justify-between gap-3 rounded-[9px] border border-[var(--line)] bg-white px-3.5 text-left transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-subtle)]"
        >
          <span className="flex items-center gap-2 text-[13px] font-semibold text-[var(--ink)]">
            <FileText aria-hidden="true" size={17} className="text-[var(--ink-muted)]" />
            Review detected copy
          </span>
          <SquareArrowOutUpRight
            aria-hidden="true"
            size={16}
            className="shrink-0 text-[var(--ink-muted)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--ink)]"
          />
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-[640px] p-0">
        <div className="border-b border-[var(--line)] px-6 py-5 pr-16">
          <DialogTitle>Review detected copy</DialogTitle>
          <DialogDescription>
            Correct names, dates, venues, and URLs before generating. These exact strings are used in every format.
          </DialogDescription>
        </div>

        <div className="max-h-[min(58vh,520px)] overflow-y-auto px-6 py-5">
          {lines.length ? (
            <div className="space-y-2.5">
              {lines.map((line, index) => (
                <div key={index} className="flex items-center gap-2">
                  <label htmlFor={`copy-line-${index}`} className="sr-only">Detected copy line {index + 1}</label>
                  <input
                    id={`copy-line-${index}`}
                    value={line}
                    onChange={(event) => updateLine(index, event.target.value)}
                    maxLength={300}
                    className="min-h-11 min-w-0 flex-1 rounded-[9px] border border-[var(--line)] bg-white px-3 text-[13px] text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-10 min-h-10"
                    onClick={() => onChange(lines.filter((_, candidateIndex) => candidateIndex !== index))}
                    aria-label={`Remove detected copy line ${index + 1}`}
                  >
                    <Trash2 aria-hidden="true" size={15} />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[10px] border border-dashed border-[var(--line-strong)] px-4 py-8 text-center">
              <p className="text-[13px] font-medium text-[var(--ink)]">No copy was detected</p>
              <p className="mt-1 text-[12px] text-[var(--ink-muted)]">Add any text that must appear exactly in the generated assets.</p>
            </div>
          )}

          {lines.length < 80 ? (
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => onChange([...lines, ""])}>
              <Plus aria-hidden="true" size={15} /> Add copy line
            </Button>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] bg-[var(--surface-subtle)] px-6 py-4">
          <p className="text-[12px] tabular-nums text-[var(--ink-muted)]">
            {lines.length} {lines.length === 1 ? "line" : "lines"}
          </p>
          <DialogClose asChild>
            <Button variant="primary" size="sm" className="min-w-20">Done</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

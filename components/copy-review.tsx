"use client";

import { useState } from "react";
import { ChevronDown, FileText, Plus, Trash2 } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";

export function CopyReview({
  lines,
  onChange,
}: {
  lines: string[];
  onChange: (lines: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  function updateLine(index: number, value: string) {
    const next = [...lines];
    next[index] = value;
    onChange(next);
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-4">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex min-h-11 w-full items-center justify-between gap-3 rounded-[12px] border border-[var(--line)] bg-[var(--surface-subtle)] px-3.5 text-left hover:bg-white"
        >
          <span className="flex items-center gap-2 text-[13px] font-medium text-[var(--ink)]">
            <FileText aria-hidden="true" size={16} className="text-[var(--ink-muted)]" />
            Review detected copy
          </span>
          <ChevronDown
            aria-hidden="true"
            size={16}
            className="shrink-0 text-[var(--ink-muted)] transition-transform group-data-[state=open]:rotate-180"
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 data-[state=open]:animate-[reveal_160ms_ease-out]">
        <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-subtle)] p-3.5">
          <p className="mb-3 text-[12px] leading-relaxed text-[var(--ink-muted)]">
            Correct names, dates, venues, and URLs if needed. These exact strings will be sent with every format.
          </p>
          <div className="space-y-2">
            {lines.map((line, index) => (
              <div key={index} className="flex items-center gap-2">
                <label htmlFor={`copy-line-${index}`} className="sr-only">Detected copy line {index + 1}</label>
                <input
                  id={`copy-line-${index}`}
                  value={line}
                  onChange={(event) => updateLine(index, event.target.value)}
                  maxLength={300}
                  className="min-h-10 min-w-0 flex-1 rounded-[8px] border border-[var(--line)] bg-white px-3 text-[13px] text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none"
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
          {lines.length < 80 ? (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => onChange([...lines, ""])}>
              <Plus aria-hidden="true" size={15} /> Add copy line
            </Button>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

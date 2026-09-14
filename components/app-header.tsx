"use client";

import { CircleHelp, Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AppHeader() {
  return (
    <header className="flex w-full min-w-0 items-start justify-between gap-2 sm:items-center sm:gap-3">
      <div className="w-0 min-w-0 flex-1 overflow-hidden">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
          <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-[var(--ink)]">GladMat</h1>
          <p className="text-[13px] leading-snug text-[var(--ink-muted)] sm:text-[14px]">
            Turn one campaign asset into every ad size you need.
          </p>
        </div>
      </div>

      {/* <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label="Help"
              className="grid size-8 place-items-center rounded-full border border-[var(--line)] bg-white text-[var(--ink-muted)] hover:text-[var(--ink)] sm:size-9"
            >
              <CircleHelp aria-hidden="true" size={16} />
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>How AdMat works</DialogTitle>
            <DialogDescription>
              Upload one flyer, confirm the detected copy, pick the sizes you need, then generate each format independently.
            </DialogDescription>
            <ol className="mt-5 space-y-3 text-[14px] text-[var(--ink)]">
              <li>
                <span className="font-semibold">1. Source artwork.</span> PNG, JPG, or WEBP up to 20 MB. AdMat analyzes layout, style, and exact text once.
              </li>
              <li>
                <span className="font-semibold">2. Output sizes.</span> Choose presets or add a custom size. Each selected format is its own image request.
              </li>
              <li>
                <span className="font-semibold">3. Additional instructions.</span> Optional notes for how the design should adapt across formats.
              </li>
            </ol>
            <p className="mt-5 text-[13px] leading-relaxed text-[var(--ink-muted)]">
              Review names, dates, venues, and logos before publishing. Generated ads are a production draft, not a final approval.
            </p>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label="Settings"
              className="grid size-8 place-items-center rounded-full border border-[var(--line)] bg-white text-[var(--ink-muted)] hover:text-[var(--ink)] sm:size-9"
            >
              <Settings aria-hidden="true" size={16} />
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Workspace</DialogTitle>
            <DialogDescription>
              This session lives in your browser. Refreshing starts a new workspace; artwork and outputs are not kept as an account history.
            </DialogDescription>
            <ul className="mt-5 space-y-2 text-[14px] text-[var(--ink)]">
              <li>Uploads go to a private storage bucket for this session only.</li>
              <li>At most two formats generate at once.</li>
              <li>ZIP downloads include only successfully generated PNGs.</li>
            </ul>
          </DialogContent>
        </Dialog>

        <div className="ml-0.5 flex items-center gap-1.5 sm:ml-1 sm:gap-2 sm:pl-1">
          <span className="grid size-8 place-items-center rounded-full bg-[#1e3a8a] text-[10px] font-semibold tracking-wide text-white sm:size-9 sm:text-[11px]">
            JD
          </span>
          <span className="leading-tight">
            <span className="block text-[12px] font-semibold text-[var(--ink)] sm:text-[13px]">Jordan</span>
            <span className="block text-[11px] text-[var(--ink-muted)] sm:text-[12px]">Marketing</span>
          </span>
        </div> 
      </div> */}
    </header>
  );
}

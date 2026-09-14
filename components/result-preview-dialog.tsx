"use client";

import { Download, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { GenerationJob } from "@/lib/types";

export function ResultPreviewDialog({
  job,
  open,
  onOpenChange,
  onDownload,
}: {
  job: GenerationJob | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload: (job: GenerationJob) => Promise<void>;
}) {
  const [downloading, setDownloading] = useState(false);
  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-2rem)] max-w-[min(1180px,calc(100%-2rem))] flex-col overflow-hidden p-0">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4 pr-14">
          <div>
            <DialogTitle>{job.size.name}</DialogTitle>
            <DialogDescription>{job.size.width} × {job.size.height} px</DialogDescription>
          </div>
          <Button
            variant="accent"
            size="sm"
            disabled={downloading}
            onClick={async () => {
              setDownloading(true);
              try { await onDownload(job); } finally { setDownloading(false); }
            }}
          >
            {downloading ? <LoaderCircle aria-hidden="true" size={14} className="animate-spin" /> : <Download aria-hidden="true" size={14} />}
            Download PNG
          </Button>
        </div>
        <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-[var(--surface-subtle)] p-6 sm:p-10">
          {job.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={job.previewUrl} alt={`${job.size.name} generated advertisement preview`} className="max-h-full max-w-full object-contain shadow-[0_18px_60px_rgb(28_28_26/0.18)]" />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

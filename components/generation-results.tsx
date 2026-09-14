"use client";

import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/panel";
import { Progress } from "@/components/ui/progress";
import { ResultCard } from "@/components/result-card";
import { ResultPreviewDialog } from "@/components/result-preview-dialog";
import { cn } from "@/lib/cn";
import type { GenerationJob } from "@/lib/types";

export function GenerationResults({
  jobs,
  className,
  onDownload,
  onDownloadAll,
  onRegenerate,
  onRefreshPreview,
}: {
  jobs: GenerationJob[];
  className?: string;
  onDownload: (job: GenerationJob) => Promise<void>;
  onDownloadAll: (jobs: GenerationJob[]) => Promise<void>;
  onRegenerate: (job: GenerationJob) => void;
  onRefreshPreview: (job: GenerationJob) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mountedRef = useRef(false);
  const [selectedPreview, setSelectedPreview] = useState<GenerationJob | null>(null);
  const [zipLoading, setZipLoading] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  const successful = jobs.filter((job) => job.status === "complete");
  const failed = jobs.filter((job) => job.status === "error").length;
  const terminal = successful.length + failed;
  const needsReview = successful.filter((job) => job.needsReview).length;
  const progress = jobs.length ? (terminal / jobs.length) * 100 : 0;

  useEffect(() => {
    if (!mountedRef.current && jobs.length) {
      mountedRef.current = true;
      headingRef.current?.focus();
    }
  }, [jobs.length]);

  const currentPreview = selectedPreview
    ? jobs.find((job) => job.size.id === selectedPreview.size.id) ?? selectedPreview
    : null;

  return (
    <Panel className={cn("scroll-mt-6", className)} aria-labelledby="results-heading">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id="results-heading" ref={headingRef} tabIndex={-1} className="text-[15px] font-semibold tracking-[-0.015em] outline-none">
              Generated assets
            </h2>
            <p className="text-[13px] text-[var(--ink-muted)]" aria-live="polite">
              {jobs.length ? `${successful.length} of ${jobs.length} complete` : "Waiting for generation"}
              {needsReview ? ` · ${needsReview} ${needsReview === 1 ? "needs" : "need"} review` : ""}
              {failed ? ` · ${failed} failed` : ""}
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          className="min-h-9 shrink-0 rounded-lg px-3 text-[13px]"
          disabled={!successful.length || zipLoading}
          onClick={async () => {
            setZipLoading(true);
            setZipError(null);
            try {
              await onDownloadAll(successful);
            } catch (caught) {
              setZipError(caught instanceof Error ? caught.message : "The ZIP could not be prepared.");
            } finally {
              setZipLoading(false);
            }
          }}
        >
          {zipLoading ? <LoaderCircle aria-hidden="true" size={15} className="animate-spin" /> : <Download aria-hidden="true" size={15} />}
          <span className="hidden sm:inline">Download all (.zip)</span>
          <span className="sm:hidden">Download</span>
        </Button>
      </div>

      <Progress value={jobs.length ? progress : 0} className="mt-3" />
      {zipError ? <p role="alert" className="mt-2 text-[12px] text-[var(--danger)]">{zipError}</p> : null}

      {jobs.length ? (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {jobs.map((job) => (
            <ResultCard
              key={job.size.id}
              job={job}
              onPreview={(candidate) => setSelectedPreview(candidate)}
              onDownload={onDownload}
              onRegenerate={onRegenerate}
              onRefreshPreview={onRefreshPreview}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 grid min-h-[220px] place-items-center rounded-[12px] border border-dashed border-[var(--line)] px-4 py-10 text-center">
          <div>
            <p className="text-[14px] font-medium text-[var(--ink)]">No assets yet</p>
            <p className="mt-1 max-w-sm text-[13px] text-[var(--ink-muted)]">
              Generated ads will appear here as each size finishes.
            </p>
          </div>
        </div>
      )}

      <ResultPreviewDialog
        job={currentPreview}
        open={Boolean(currentPreview)}
        onOpenChange={(open) => { if (!open) setSelectedPreview(null); }}
        onDownload={onDownload}
      />
    </Panel>
  );
}

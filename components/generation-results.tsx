"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/panel";
import { Progress } from "@/components/ui/progress";
import { ResultCard } from "@/components/result-card";
import { ResultPreviewDialog } from "@/components/result-preview-dialog";
import { RegenerationPromptDialog } from "@/components/regeneration-prompt-dialog";
import { FineTuneDialog } from "@/components/fine-tune-dialog";
import { cn } from "@/lib/cn";
import type { GenerationJob } from "@/lib/types";

export function GenerationResults({
  jobs,
  className,
  onDownload,
  onDownloadAll,
  onRegenerate,
  onRefreshPreview,
  onOpenStudio,
  onFineTuneSaved,
  sessionId,
  isSaved,
  onToggleSaved,
  expanded = false,
  sourceName,
  onBack,
}: {
  jobs: GenerationJob[];
  className?: string;
  onDownload: (job: GenerationJob) => Promise<void>;
  onDownloadAll: (jobs: GenerationJob[]) => Promise<void>;
  onRegenerate: (job: GenerationJob, instructions: string) => void;
  onRefreshPreview: (job: GenerationJob) => void;
  onOpenStudio: (job: GenerationJob) => void;
  onFineTuneSaved: (job: GenerationJob, previewUrl: string) => void;
  sessionId: string;
  isSaved: (job: GenerationJob) => boolean;
  onToggleSaved: (job: GenerationJob) => void;
  expanded?: boolean;
  sourceName?: string;
  onBack?: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mountedRef = useRef(false);
  const [selectedPreview, setSelectedPreview] = useState<GenerationJob | null>(null);
  const [regenerationTarget, setRegenerationTarget] = useState<GenerationJob | null>(null);
  const [fineTuneTarget, setFineTuneTarget] = useState<GenerationJob | null>(null);
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

  useEffect(() => {
    if (expanded) headingRef.current?.focus();
  }, [expanded]);

  const currentPreview = selectedPreview
    ? jobs.find((job) => job.size.id === selectedPreview.size.id) ?? selectedPreview
    : null;
  const currentRegenerationTarget = regenerationTarget
    ? jobs.find((job) => job.size.id === regenerationTarget.size.id) ?? regenerationTarget
    : null;

  return (
    <Panel className={cn("scroll-mt-6 flex flex-col overflow-hidden p-3.5", expanded && "p-4 sm:p-6", className)} aria-labelledby="results-heading">
      {expanded && onBack ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Button variant="secondary" size="sm" onClick={onBack}>
            <ArrowLeft aria-hidden="true" size={15} /> Back to sizes
          </Button>
          <p className="min-w-0 truncate text-[12px] text-[var(--ink-muted)]" title={sourceName}>{sourceName}</p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="results-heading" ref={headingRef} tabIndex={-1} className={cn("text-[15px] font-semibold tracking-[-0.015em] outline-none", expanded && "text-[22px]")}>
          Generated assets
        </h2>
        <p className="whitespace-nowrap text-[11px] tabular-nums text-[var(--ink-muted)]" aria-live="polite">
          {jobs.length ? `${successful.length} of ${jobs.length} complete` : "Waiting for generation"}
        </p>
      </div>
      {expanded ? <p className="mt-1 text-[13px] text-[var(--ink-muted)]">Review each format as it finishes, or go back to create more assets with the same artwork.</p> : null}

      <Progress value={jobs.length ? progress : 0} className="mt-2.5" />
      <Button
          variant="primary"
          size="sm"
          className={cn("mt-2.5 min-h-9 w-full rounded-[8px] px-3 text-[12px]", expanded && "mt-4 min-h-10 sm:w-fit")}
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
          {zipLoading ? <LoaderCircle aria-hidden="true" size={14} className="animate-spin" /> : <Download aria-hidden="true" size={14} />}
          <span className="hidden sm:inline">Download all (.zip)</span>
          <span className="sm:hidden">Download</span>
      </Button>
      {zipError ? <p role="alert" className="mt-2 text-[12px] text-[var(--danger)]">{zipError}</p> : null}
      {needsReview || failed ? (
        <p className="mt-2 text-[11px] text-[var(--ink-muted)]">
          {needsReview ? `${needsReview} ${needsReview === 1 ? "needs" : "need"} review` : ""}
          {needsReview && failed ? " · " : ""}
          {failed ? `${failed} failed` : ""}
        </p>
      ) : null}

      {jobs.length ? (
        <div
          className={cn("mt-2.5 min-h-0 space-y-2 overflow-y-auto pr-0.5", expanded && "mt-6 grid w-full items-start justify-start gap-4 space-y-0 overflow-visible p-0 sm:gap-5")}
          style={expanded ? {
            gridTemplateColumns: "repeat(auto-fill, minmax(0, min(100%, 320px)))",
          } : undefined}
        >
          {jobs.map((job) => (
            <ResultCard
              key={job.size.id}
              job={job}
              expanded={expanded}
              onPreview={(candidate) => setSelectedPreview(candidate)}
              onDownload={onDownload}
              onRegenerate={(candidate) => setRegenerationTarget(candidate)}
              onRefreshPreview={onRefreshPreview}
              onOpenStudio={onOpenStudio}
              onFineTune={(candidate) => setFineTuneTarget(candidate)}
              saved={isSaved(job)}
              onToggleSaved={onToggleSaved}
            />
          ))}
        </div>
      ) : (
        <div className="mt-3 grid min-h-[220px] flex-1 place-items-center rounded-[9px] border border-dashed border-[var(--line)] px-4 py-10 text-center">
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
      {currentRegenerationTarget ? (
        <RegenerationPromptDialog
          key={currentRegenerationTarget.requestId}
          job={currentRegenerationTarget}
          open
          onOpenChange={(open) => { if (!open) setRegenerationTarget(null); }}
          onSubmit={(job, instructions) => onRegenerate(job, instructions)}
        />
      ) : null}
      {fineTuneTarget?.assetToken ? (
        <FineTuneDialog
          key={fineTuneTarget.requestId}
          asset={{
            sessionId,
            assetToken: fineTuneTarget.assetToken,
            requestId: fineTuneTarget.requestId,
            width: fineTuneTarget.size.width,
            height: fineTuneTarget.size.height,
            name: fineTuneTarget.size.name,
          }}
          onOpenChange={(open) => { if (!open) setFineTuneTarget(null); }}
          onSaved={(previewUrl) => onFineTuneSaved(fineTuneTarget, previewUrl)}
        />
      ) : null}
    </Panel>
  );
}

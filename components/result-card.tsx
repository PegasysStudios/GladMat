"use client";

import { useState } from "react";
import {
  AlertCircle,
  Check,
  Clock,
  Download,
  Eye,
  Heart,
  LoaderCircle,
  Frame,
  RefreshCw,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconMenu } from "@/components/icon-menu";
import { cn } from "@/lib/cn";
import type { GenerationJob } from "@/lib/types";

export function ResultCard({
  job,
  onPreview,
  onDownload,
  onRegenerate,
  onRefreshPreview,
  onOpenStudio,
  onFineTune,
  saved,
  onToggleSaved,
  expanded = false,
}: {
  job: GenerationJob;
  onPreview: (job: GenerationJob) => void;
  onDownload: (job: GenerationJob) => Promise<void>;
  onRegenerate: (job: GenerationJob) => void;
  onRefreshPreview: (job: GenerationJob) => void;
  onOpenStudio: (job: GenerationJob) => void;
  onFineTune?: (job: GenerationJob) => void;
  saved: boolean;
  onToggleSaved: (job: GenerationJob) => void;
  expanded?: boolean;
}) {
  const [downloading, setDownloading] = useState(false);
  const [refreshAttempted, setRefreshAttempted] = useState(false);
  const active = job.status === "queued" || job.status === "generating" || job.status === "processing";
  const canPreview = job.status === "complete" && Boolean(job.previewUrl);
  const canOpenStudio = job.status === "complete" && Boolean(job.assetToken);
  const canFineTune = canOpenStudio && job.fineTuneAvailable && Boolean(onFineTune);

  const status = (() => {
    if (job.status === "queued") return { label: "Queued", icon: <Clock size={14} />, className: "text-[var(--ink-muted)]" };
    if (job.status === "generating") return { label: (job.attempts ?? 1) > 1 ? "Refining…" : "Generating…", icon: <LoaderCircle size={14} className="animate-spin" />, className: "text-[var(--accent)]" };
    if (job.status === "processing") return { label: "Processing…", icon: <LoaderCircle size={14} className="animate-spin" />, className: "text-[var(--accent)]" };
    if (job.status === "error") return { label: "Generation failed", icon: <AlertCircle size={14} />, className: "text-[var(--danger)]" };
    if (job.needsReview) return { label: "Needs review", icon: <TriangleAlert size={14} />, className: "text-[var(--warning)]" };
    return { label: "Complete", icon: <Check size={14} />, className: "text-[var(--success)]" };
  })();
  const statusBadgeClass = job.status === "error"
    ? "bg-[var(--danger-soft)] text-[var(--danger)]"
    : job.status === "complete" && job.needsReview
      ? "bg-[#fff4dd] text-[var(--warning)]"
      : job.status === "complete"
        ? "bg-[var(--success-soft)] text-[#07883f]"
        : job.status === "queued"
          ? "bg-[#f0f1f3] text-[var(--ink-muted)]"
          : "bg-[var(--accent-soft)] text-[var(--accent)]";

  async function download() {
    setDownloading(true);
    try {
      await onDownload(job);
    } finally {
      setDownloading(false);
    }
  }

  const previewBody = (() => {
    if (job.status === "queued") {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-2 text-center text-[var(--ink-muted)]">
          <Clock aria-hidden="true" size={18} className="shrink-0" />
          <p className="text-[11px] font-medium leading-4">Queued</p>
        </div>
      );
    }
    if ((job.status === "generating" || job.status === "processing") && !job.previewUrl) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-2 text-center">
          <LoaderCircle aria-hidden="true" size={18} className="shrink-0 animate-spin text-[var(--accent)]" />
          <p className="text-[11px] font-medium leading-4 text-[var(--ink)]">Working...</p>
        </div>
      );
    }
    if (job.previewUrl) {
      return (
        <button
          type="button"
          disabled={!canPreview}
          onClick={() => onPreview(job)}
          className="group relative grid h-full min-h-0 w-full min-w-0 place-items-center disabled:cursor-default"
          aria-label={`Preview ${job.size.name}, ${job.size.width} by ${job.size.height}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={job.previewUrl}
            alt={`${job.size.name} generated advertisement`}
            className={cn("max-h-full max-w-full object-contain", expanded && "min-h-0 min-w-0 drop-shadow-[0_8px_18px_rgb(17_24_39/0.12)]")}
            onLoad={() => setRefreshAttempted(false)}
            onError={() => {
              if (job.status === "complete" && !refreshAttempted) {
                setRefreshAttempted(true);
                onRefreshPreview(job);
              }
            }}
          />
          {active ? (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-white/85 px-2 text-center">
              <LoaderCircle aria-hidden="true" size={18} className="shrink-0 animate-spin text-[var(--accent)]" />
              <span className="text-[11px] font-medium leading-4 text-[var(--ink)]">
                {job.status === "processing" ? "Processing" : "Regenerating"}
              </span>
            </span>
          ) : null}
        </button>
      );
    }
    if (job.status === "error") {
      return (
        <div className="flex h-full w-full items-center justify-center px-3 text-center text-[12px] text-[var(--danger)]">
          Generation failed
        </div>
      );
    }
    return (
      <div className="h-full w-full animate-pulse rounded-lg bg-[#eef0f3]" aria-hidden="true" />
    );
  })();

  const actionButtonClass = cn("size-7 min-h-7 rounded-[7px]", expanded && "size-8 min-h-8");
  const actions = job.status === "complete" ? (
    <div className="mt-1.5 flex items-center justify-end gap-1" role="group" aria-label={`Actions for ${job.size.name}`}>
      <Button variant="secondary" size="icon" className={actionButtonClass} aria-label={`Preview ${job.size.name}`} title="Preview" onClick={() => onPreview(job)} disabled={!canPreview}>
        <Eye aria-hidden="true" size={15} />
      </Button>
      <Button variant="secondary" size="icon" className={actionButtonClass} aria-label={`Download ${job.size.name}`} title="Download PNG" onClick={() => void download()} disabled={downloading}>
        {downloading ? <LoaderCircle aria-hidden="true" size={15} className="animate-spin" /> : <Download aria-hidden="true" size={15} />}
      </Button>
      {canFineTune ? (
        <Button variant="secondary" size="icon" className={actionButtonClass} aria-label={`Fine-tune ${job.size.name}`} title="Fine-tune" onClick={() => onFineTune?.(job)}>
          <SlidersHorizontal aria-hidden="true" size={15} />
        </Button>
      ) : null}
      {canOpenStudio ? (
        <Button variant="secondary" size="icon" className={cn(actionButtonClass, "text-[var(--accent)]")} aria-label={`Open ${job.size.name} in Studio`} title="Open in Studio" onClick={() => onOpenStudio(job)}>
          <Frame aria-hidden="true" size={15} />
        </Button>
      ) : null}
    </div>
  ) : job.status === "error" ? (
    <Button variant="secondary" size="icon" className={cn(actionButtonClass, "mt-1.5")} aria-label={`Retry ${job.size.name}`} title="Retry" onClick={() => onRegenerate(job)}>
      <RefreshCw aria-hidden="true" size={15} />
    </Button>
  ) : null;

  return (
    <article className={cn("relative rounded-[9px] border border-[var(--line)] bg-white p-2", expanded && "flex min-w-0 flex-col overflow-hidden rounded-[12px] p-0 shadow-sm")}>
      <div className={cn("flex gap-2", expanded && "flex-col gap-0")}>
        <div className={cn(
          "grid h-[82px] w-[100px] shrink-0 grid-rows-[minmax(0,1fr)] place-items-center overflow-hidden rounded-[6px] border border-[var(--line)] bg-[var(--surface-subtle)]",
          expanded && "h-[220px] w-full rounded-none border-0 border-b bg-[#eef0f3] p-4",
        )}>
          {previewBody}
        </div>

        <div className={cn("flex min-w-0 flex-1 flex-col", expanded && "flex-none p-4 sm:p-5")}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className={cn("truncate text-[12px] font-semibold leading-tight text-[var(--ink)]", expanded && "text-[15px]")}>{job.size.name}</h3>
              <p className={cn("mt-0.5 text-[11px] tabular-nums leading-tight text-[var(--ink-muted)]", expanded && "mt-1 text-[12px]")}>{job.size.width} × {job.size.height}{expanded ? " px" : ""}</p>
              <div className={cn("mt-1", expanded && "mt-3")}>
                <div className={cn("flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-4", expanded && "gap-1.5 px-2 py-1 text-[12px]", statusBadgeClass)}>
                  {status.icon}
                  <span>{status.label}</span>
                </div>
              </div>
            </div>
            <div className="-mr-0.5 -mt-0.5 flex shrink-0 flex-col items-end">
              <div className="flex items-center">
                {job.status === "complete" && job.assetToken ? (
                  <button
                    type="button"
                    aria-label={saved ? `Remove ${job.size.name} from saved AdMats` : `Save ${job.size.name} to saved AdMats`}
                    aria-pressed={saved}
                    title={saved ? "Remove from saved" : "Save to library"}
                    onClick={() => onToggleSaved(job)}
                    className="grid size-7 place-items-center rounded-md text-[#e11d48] transition-colors hover:bg-[#fff1f2]"
                  >
                    <Heart aria-hidden="true" size={15} fill={saved ? "currentColor" : "none"} />
                  </button>
                ) : null}
                <IconMenu
                  label={`More actions for ${job.size.name}`}
                  items={[
                    ...(canPreview ? [{ label: "Preview", onClick: () => onPreview(job) }] : []),
                    ...(job.status === "complete" ? [{ label: "Download", onClick: () => void download(), disabled: downloading }] : []),
                    ...(canOpenStudio ? [{ label: "Open in Studio", onClick: () => onOpenStudio(job) }] : []),
                    ...(canFineTune ? [{ label: "Fine-tune", onClick: () => onFineTune?.(job) }] : []),
                    { label: job.status === "error" ? "Retry" : "Regenerate", onClick: () => onRegenerate(job), disabled: active },
                  ]}
                />
              </div>
              {actions}
            </div>
          </div>

          {job.error ? <p role="alert" className="mt-1 text-[10px] leading-tight text-[var(--danger)]">{job.error}</p> : null}
          {job.needsReview && job.validationIssues?.length ? (
            <p className="mt-1 line-clamp-1 text-[10px] leading-tight text-[var(--warning)]">{job.validationIssues[0]}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

"use client";

import { useState } from "react";
import {
  AlertCircle,
  Check,
  Clock,
  Download,
  Eye,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
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
}: {
  job: GenerationJob;
  onPreview: (job: GenerationJob) => void;
  onDownload: (job: GenerationJob) => Promise<void>;
  onRegenerate: (job: GenerationJob) => void;
  onRefreshPreview: (job: GenerationJob) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [refreshAttempted, setRefreshAttempted] = useState(false);
  const active = job.status === "queued" || job.status === "generating" || job.status === "processing";
  const canPreview = job.status === "complete" && Boolean(job.previewUrl);

  const status = (() => {
    if (job.status === "queued") return { label: "Queued", icon: <Clock size={14} />, className: "text-[var(--ink-muted)]" };
    if (job.status === "generating") return { label: (job.attempts ?? 1) > 1 ? "Refining…" : "Generating…", icon: <LoaderCircle size={14} className="animate-spin" />, className: "text-[var(--accent)]" };
    if (job.status === "processing") return { label: "Processing…", icon: <LoaderCircle size={14} className="animate-spin" />, className: "text-[var(--accent)]" };
    if (job.status === "error") return { label: "Generation failed", icon: <AlertCircle size={14} />, className: "text-[var(--danger)]" };
    if (job.needsReview) return { label: "Needs review", icon: <TriangleAlert size={14} />, className: "text-[var(--warning)]" };
    return { label: "Complete", icon: <Check size={14} />, className: "text-[var(--success)]" };
  })();

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
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-3 text-center text-[var(--ink-muted)]">
          <Clock aria-hidden="true" size={18} />
          <p className="hidden text-[13px] font-medium md:block">In queue...</p>
          <p className="hidden text-[12px] md:block">{"We'll start this next."}</p>
        </div>
      );
    }
    if ((job.status === "generating" || job.status === "processing") && !job.previewUrl) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
          <LoaderCircle aria-hidden="true" size={22} className="animate-spin text-[var(--accent)]" />
          <p className="hidden text-[13px] font-medium text-[var(--ink)] md:block">Creating your ad...</p>
          <p className="hidden text-[12px] text-[var(--ink-muted)] md:block">This usually takes a few seconds.</p>
        </div>
      );
    }
    if (job.previewUrl) {
      return (
        <button
          type="button"
          disabled={!canPreview}
          onClick={() => onPreview(job)}
          className="group relative grid h-full w-full place-items-center disabled:cursor-default"
          aria-label={`Preview ${job.size.name}, ${job.size.width} by ${job.size.height}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={job.previewUrl}
            alt={`${job.size.name} generated advertisement`}
            className="max-h-full max-w-full object-contain"
            onLoad={() => setRefreshAttempted(false)}
            onError={() => {
              if (job.status === "complete" && !refreshAttempted) {
                setRefreshAttempted(true);
                onRefreshPreview(job);
              }
            }}
          />
          {active ? (
            <span className="absolute inset-0 grid place-items-center bg-white/72">
              <span className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[12px] font-medium shadow-sm">
                <LoaderCircle aria-hidden="true" size={15} className="animate-spin text-[var(--accent)]" />
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

  const actions = (
    <div className="flex gap-2">
      {job.status === "complete" ? (
        job.needsReview ? (
          <>
            <Button variant="secondary" size="sm" className="min-h-8 flex-1 rounded-lg px-2 text-[12px] md:min-h-9 md:px-2.5" onClick={() => onPreview(job)} disabled={!canPreview}>
              <Eye aria-hidden="true" size={14} />
              Preview
            </Button>
            <Button variant="secondary" size="sm" className="min-h-8 flex-1 rounded-lg px-2 text-[12px] md:min-h-9 md:px-2.5" onClick={() => onRegenerate(job)}>
              <RotateCcw aria-hidden="true" size={14} />
              Regenerate
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" size="sm" className="min-h-8 flex-1 rounded-lg px-2 text-[12px] md:min-h-9 md:px-2.5" onClick={() => onPreview(job)} disabled={!canPreview}>
              <Eye aria-hidden="true" size={14} />
              Preview
            </Button>
            <Button variant="secondary" size="sm" className="min-h-8 flex-1 rounded-lg px-2 text-[12px] md:min-h-9 md:px-2.5" onClick={() => void download()} disabled={downloading}>
              {downloading ? <LoaderCircle aria-hidden="true" size={14} className="animate-spin" /> : <Download aria-hidden="true" size={14} />}
              Download
            </Button>
          </>
        )
      ) : job.status === "error" ? (
        <Button variant="secondary" size="sm" className="min-h-8 rounded-lg px-2 text-[12px] md:min-h-9 md:px-2.5" onClick={() => onRegenerate(job)}>
          <RefreshCw aria-hidden="true" size={14} /> Retry
        </Button>
      ) : null}
    </div>
  );

  return (
    <article className="relative overflow-hidden rounded-[14px] border border-[var(--line)] bg-white p-3 md:p-3.5">
      <div className="flex gap-3 md:flex-col">
        <div className="order-1 grid size-16 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--surface-subtle)] md:order-3 md:h-[132px] md:w-full md:size-auto">
          {previewBody}
        </div>

        <div className="order-2 flex min-w-0 flex-1 flex-col md:contents">
          <div className="md:order-1 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-[13px] font-semibold text-[var(--ink)]">{job.size.name}</h3>
              <p className="mt-0.5 text-[12px] tabular-nums text-[var(--ink-muted)]">{job.size.width} × {job.size.height}</p>
            </div>
            <IconMenu
              label={`More actions for ${job.size.name}`}
              className="shrink-0"
              items={[
                ...(canPreview ? [{ label: "Preview", onClick: () => onPreview(job) }] : []),
                ...(job.status === "complete" ? [{ label: "Download", onClick: () => void download(), disabled: downloading }] : []),
                { label: job.status === "error" ? "Retry" : "Regenerate", onClick: () => onRegenerate(job), disabled: active },
              ]}
            />
          </div>

          <div className="mt-auto flex items-center justify-between gap-2 pt-1 md:contents">
            <div className={cn("flex items-center gap-1.5 text-[12px] font-medium md:order-2 md:mt-1", status.className)}>
              {status.icon}
              <span>{status.label}</span>
            </div>
            <div className="md:order-5 md:mt-3">
              {actions}
            </div>
          </div>

          {job.error ? <p role="alert" className="mt-2 text-[12px] leading-relaxed text-[var(--danger)] md:order-4">{job.error}</p> : null}
          {job.needsReview && job.validationIssues?.length ? (
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--warning)] md:order-4">{job.validationIssues[0]}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

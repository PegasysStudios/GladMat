"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyReview } from "@/components/copy-review";
import { Panel } from "@/components/panel";
import { StepHeading } from "@/components/step-heading";
import { cn } from "@/lib/cn";
import type { SourceAsset, UploadStatus } from "@/lib/types";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SourceUploader({
  status,
  source,
  localPreviewUrl,
  fileSize,
  error,
  correctedText,
  onCorrectedTextChange,
  onFile,
  onRetryAnalysis,
}: {
  status: UploadStatus;
  source: SourceAsset | null;
  localPreviewUrl: string | null;
  fileSize: number | null;
  error: string | null;
  correctedText: string[];
  onCorrectedTextChange: (lines: string[]) => void;
  onFile: (file: File) => void;
  onRetryAnalysis: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const preview = source?.previewUrl ?? localPreviewUrl;
  const busy = status === "uploading" || status === "analyzing";

  function choose(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  function openPicker() {
    inputRef.current?.click();
  }

  const dropzone = (
    <button
      type="button"
      onClick={openPicker}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        choose(event.dataTransfer.files);
      }}
      className={cn(
        "flex h-full w-full flex-col items-center justify-center rounded-[12px] border border-dashed px-3 py-4 text-center transition",
        preview ? "min-h-[148px] md:min-h-[168px]" : "min-h-[188px] md:min-h-[200px]",
        dragging
          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
          : "border-[var(--line-strong)] bg-[var(--surface-subtle)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]",
      )}
    >
      <span className="mb-3 grid size-10 place-items-center rounded-[10px] border border-[var(--line)] bg-white text-[var(--ink-muted)] shadow-sm">
        <Upload aria-hidden="true" size={18} strokeWidth={1.8} />
      </span>
      <span className="text-[13px] font-semibold leading-snug text-[var(--ink)]">Drag & drop your image here</span>
      <span className="mt-1 text-[13px] text-[var(--accent)]">or click to browse</span>
      <span className="mt-2 text-[11px] leading-snug text-[var(--ink-muted)]">PNG, JPG, or WEBP up to 20MB</span>
    </button>
  );

  return (
    <Panel>
      <StepHeading
        step={1}
        title="Source artwork"
        description="Upload your event flyer or campaign image."
      />

      <div className={preview ? "grid grid-cols-2 items-stretch gap-3 md:grid-cols-[minmax(168px,1fr)_auto_minmax(0,1.15fr)] md:items-center" : ""}>
        <div className={preview ? "min-h-[148px] md:min-h-[168px]" : ""}>{dropzone}</div>

        {preview ? (
          <>
            <div className="relative hidden overflow-hidden rounded-[12px] border border-[var(--line)] bg-white md:block">
              {/* Private signed and local object URLs are deliberately rendered without an optimization proxy. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt={source ? `Source artwork: ${source.originalName}` : "Selected source artwork"}
                className="h-[168px] w-auto max-w-[148px] object-contain"
              />
              {busy ? (
                <div className="absolute inset-0 grid place-items-center bg-white/72">
                  <LoaderCircle aria-hidden="true" size={18} className="animate-spin text-[var(--accent)]" />
                </div>
              ) : null}
            </div>

            <div className="min-w-0">
              <div className="relative mb-2 overflow-hidden rounded-[12px] border border-[var(--line)] bg-white md:hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt={source ? `Source artwork: ${source.originalName}` : "Selected source artwork"}
                  className="h-[92px] w-full object-contain bg-[var(--surface-subtle)]"
                />
                {busy ? (
                  <div className="absolute inset-0 grid place-items-center bg-white/72">
                    <LoaderCircle aria-hidden="true" size={18} className="animate-spin text-[var(--accent)]" />
                  </div>
                ) : null}
              </div>

              <p className="truncate text-[13px] font-semibold">{source?.originalName ?? "Preparing artwork…"}</p>
              {source ? (
                <p className="mt-0.5 text-[12px] tabular-nums text-[var(--ink-muted)]">
                  {source.width} × {source.height} px
                </p>
              ) : null}
              {fileSize != null ? (
                <p className="text-[12px] tabular-nums text-[var(--ink-muted)]">{formatFileSize(fileSize)}</p>
              ) : null}

              {status === "ready" ? (
                <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-[var(--success)]">
                  <CheckCircle2 aria-hidden="true" size={16} />
                  Artwork analyzed
                </p>
              ) : busy ? (
                <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-[var(--accent)]">
                  <LoaderCircle aria-hidden="true" size={15} className="animate-spin" />
                  {status === "uploading" ? "Uploading artwork…" : "Analyzing artwork…"}
                </p>
              ) : null}

              <Button variant="secondary" size="sm" className="mt-3 min-h-9 rounded-lg" onClick={openPicker}>
                <RefreshCw aria-hidden="true" size={14} />
                Replace artwork
              </Button>
            </div>
          </>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="Choose source artwork"
        onChange={(event) => {
          choose(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      {error ? (
        <div role="alert" className="mt-4 rounded-[10px] border border-[#fecaca] bg-[var(--danger-soft)] p-3 text-[13px] text-[var(--danger)]">
          <div className="flex gap-2">
            <AlertCircle aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
          {source && status === "error" ? (
            <Button variant="ghost" size="sm" className="mt-2 text-[var(--danger)] hover:bg-white/60" onClick={onRetryAnalysis}>
              <RefreshCw aria-hidden="true" size={14} /> Retry analysis
            </Button>
          ) : null}
        </div>
      ) : null}

      {status === "ready" ? (
        <CopyReview lines={correctedText} onChange={onCorrectedTextChange} />
      ) : null}
    </Panel>
  );
}

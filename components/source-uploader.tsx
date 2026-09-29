"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  LoaderCircle,
  Maximize2,
  RefreshCw,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyReview } from "@/components/copy-review";
import { Panel } from "@/components/panel";
import { StepHeading } from "@/components/step-heading";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
  savedArtworkCount = 0,
  onOpenSavedArtwork,
  storageError,
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
  savedArtworkCount?: number;
  onOpenSavedArtwork?: () => void;
  storageError?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
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
        "flex h-[178px] w-full flex-col items-center justify-center rounded-[9px] border border-dashed px-3 py-4 text-center transition",
        dragging
          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
          : "border-[var(--line-strong)] bg-white hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]",
      )}
    >
      <span className="mb-2.5 grid size-10 place-items-center text-[var(--ink)]">
        <Upload aria-hidden="true" size={28} strokeWidth={1.65} />
      </span>
      <span className="text-[13px] font-medium leading-snug text-[var(--ink)]">Drag & drop your image here</span>
      <span className="mt-1 text-[13px] text-[var(--accent)]">or click to browse</span>
      <span className="mt-2 text-[11px] leading-snug text-[var(--ink-muted)]">PNG, JPG, or WEBP up to 20 MB</span>
    </button>
  );

  return (
    <Panel className="h-full">
      <StepHeading
        step={1}
        title="Source artwork"
        description="Upload your event flyer or campaign image."
      />

      <div>
        {!preview ? dropzone : null}

        {preview ? (
          <div className="min-w-0">
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                aria-label="Preview source artwork"
                aria-haspopup="dialog"
                title="View full artwork"
                className="group relative block w-full max-w-full overflow-hidden rounded-[9px] border border-[var(--line)] bg-[var(--surface-subtle)] p-1.5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt={source ? `Source artwork: ${source.originalName}` : "Selected source artwork"}
                  width={source?.width}
                  height={source?.height}
                  className="block h-auto max-h-[70vh] w-full object-contain"
                />
                {busy ? (
                  <span className="absolute inset-0 grid place-items-center bg-white/72">
                    <LoaderCircle aria-hidden="true" size={18} className="animate-spin text-[var(--accent)]" />
                  </span>
                ) : null}
                <span className="pointer-events-none absolute bottom-3 right-3 grid size-8 place-items-center rounded-md bg-white/90 text-[var(--ink)] opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Maximize2 aria-hidden="true" size={16} />
                </span>
              </button>

              <p className="mt-2.5 truncate text-[13px] font-semibold">{source?.originalName ?? "Preparing artwork…"}</p>
              {source ? (
                <p className="mt-0.5 text-[12px] tabular-nums text-[var(--ink-muted)]">
                  {source.width} × {source.height} px
                  {fileSize != null ? `  ·  ${formatFileSize(fileSize)}` : ""}
                </p>
              ) : null}
              {!source && fileSize != null ? (
                <p className="text-[12px] tabular-nums text-[var(--ink-muted)]">{formatFileSize(fileSize)}</p>
              ) : null}

              {status === "ready" ? (
                <p className="mt-2.5 flex w-fit items-center gap-1.5 rounded-full bg-[var(--success-soft)] px-2 py-1 text-[12px] font-medium text-[#07883f]">
                  <CheckCircle2 aria-hidden="true" size={15} />
                  Artwork analyzed
                </p>
              ) : busy ? (
                <p className="mt-2.5 flex w-fit items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-2 py-1 text-[12px] font-medium text-[var(--accent)]">
                  <LoaderCircle aria-hidden="true" size={15} className="animate-spin" />
                  {status === "uploading" ? "Uploading artwork…" : "Analyzing artwork…"}
                </p>
              ) : null}

              <Button variant="secondary" size="sm" className="mt-3.5 min-h-10 w-full rounded-[8px]" onClick={openPicker}>
                <RefreshCw aria-hidden="true" size={14} />
                Replace artwork
              </Button>
          </div>
        ) : null}
      </div>

      {onOpenSavedArtwork ? (
        <Button variant="secondary" size="sm" className="mt-3 min-h-10 w-full rounded-[8px]" onClick={onOpenSavedArtwork} disabled={busy}>
          <FolderOpen aria-hidden="true" size={14} />
          Saved artwork{savedArtworkCount ? ` (${savedArtworkCount})` : ""}
        </Button>
      ) : null}
      {storageError ? <p role="alert" className="mt-3 text-[12px] text-[var(--danger)]">{storageError}</p> : null}

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
      {preview ? (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="flex h-[calc(100dvh-2rem)] max-w-[min(1180px,calc(100%-2rem))] flex-col overflow-hidden p-0">
            <div className="shrink-0 border-b border-[var(--line)] px-5 py-4 pr-16">
              <DialogTitle>Source artwork</DialogTitle>
              <DialogDescription className="break-words">
                {source?.originalName ?? "Selected artwork"}
                {source ? ` · ${source.width} × ${source.height} px` : ""}
              </DialogDescription>
            </div>
            <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] place-items-center bg-[var(--surface-subtle)] p-4 sm:p-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt={source ? `Full source artwork: ${source.originalName}` : "Full selected artwork"}
                className="h-full min-h-0 w-full min-w-0 object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </Panel>
  );
}

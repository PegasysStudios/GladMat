"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Heart, ImageOff, LoaderCircle, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { FineTuneDialog } from "@/components/fine-tune-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SavedAdMat } from "@/lib/types";

function savedDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SavedAdMatLibrary({
  items,
  open,
  onOpenChange,
  onRemove,
  onRefreshPreview,
  onDownload,
  onFineTuneSaved,
}: {
  items: SavedAdMat[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: (id: string) => string | null;
  onRefreshPreview: (item: SavedAdMat) => Promise<string>;
  onDownload: (item: SavedAdMat) => Promise<void>;
  onFineTuneSaved: (id: string, previewUrl: string) => string | null;
}) {
  const attemptedRefreshes = useRef(new Set<string>());
  const [busyIds, setBusyIds] = useState(new Set<string>());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fineTuneTarget, setFineTuneTarget] = useState<SavedAdMat | null>(null);

  useEffect(() => {
    if (!open) {
      attemptedRefreshes.current.clear();
      setBusyIds(new Set());
      setErrors({});
    }
  }, [open]);

  async function refresh(item: SavedAdMat) {
    if (attemptedRefreshes.current.has(item.id)) {
      setErrors((current) => ({
        ...current,
        [item.id]: "This saved asset is no longer available in private storage.",
      }));
      return;
    }
    attemptedRefreshes.current.add(item.id);
    setBusyIds((current) => new Set(current).add(item.id));
    try {
      await onRefreshPreview(item);
      setErrors((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } catch (caught) {
      setErrors((current) => ({
        ...current,
        [item.id]: caught instanceof Error ? caught.message : "This saved asset is unavailable.",
      }));
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function download(item: SavedAdMat) {
    setBusyIds((current) => new Set(current).add(item.id));
    try {
      await onDownload(item);
    } catch (caught) {
      setErrors((current) => ({
        ...current,
        [item.id]: caught instanceof Error ? caught.message : "This saved asset could not be downloaded.",
      }));
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] max-w-[min(1040px,calc(100%-2rem))] flex-col overflow-hidden p-0">
        <div className="border-b border-[var(--line)] px-6 py-5 pr-16">
          <DialogTitle>Saved AdMats</DialogTitle>
          <DialogDescription>
            Saved in this browser and linked to the private generated asset in Supabase.
          </DialogDescription>
        </div>

        {items.length ? (
          <div className="grid min-h-0 grid-cols-1 gap-4 overflow-y-auto bg-[var(--surface-subtle)] p-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const busy = busyIds.has(item.id);
              const error = errors[item.id];
              return (
                <article key={item.id} className="flex min-w-0 flex-col overflow-hidden rounded-[12px] border border-[var(--line)] bg-white shadow-sm">
                  <div className="relative grid h-52 place-items-center overflow-hidden bg-[#eef0f3] p-3">
                    {item.previewUrl && !error ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.previewUrl}
                        alt={`${item.formatName} saved advertisement`}
                        className="max-h-full max-w-full object-contain shadow-[0_10px_30px_rgb(17_24_39/0.14)]"
                        onLoad={() => attemptedRefreshes.current.delete(item.id)}
                        onError={() => void refresh(item)}
                      />
                    ) : (
                      <div className="px-5 text-center text-[var(--ink-muted)]">
                        {busy ? (
                          <LoaderCircle aria-hidden="true" size={24} className="mx-auto animate-spin text-[var(--accent)]" />
                        ) : (
                          <ImageOff aria-hidden="true" size={24} className="mx-auto" />
                        )}
                        <p className="mt-2 text-[12px]">{error ?? "Preview unavailable"}</p>
                        {!busy ? (
                          <button
                            type="button"
                            className="mt-2 text-[11px] font-semibold text-[var(--accent)] hover:underline"
                            onClick={() => {
                              attemptedRefreshes.current.delete(item.id);
                              setErrors((current) => {
                                const next = { ...current };
                                delete next[item.id];
                                return next;
                              });
                              void refresh(item);
                            }}
                          >
                            Retry preview
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-[13px] font-semibold text-[var(--ink)]">{item.formatName}</h3>
                        <p className="mt-0.5 text-[11px] tabular-nums text-[var(--ink-muted)]">{item.width} × {item.height} px</p>
                      </div>
                      {item.needsReview ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--warning-soft)] px-2 py-1 text-[10px] font-medium text-[var(--warning)]">
                          <TriangleAlert aria-hidden="true" size={12} /> Review
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 truncate text-[12px] text-[var(--ink-muted)]" title={item.sourceOriginalName}>
                      {item.sourceOriginalName}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[var(--ink-muted)]">Saved {savedDate(item.savedAt)}</p>

                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="min-h-9 flex-1 rounded-[8px] text-[12px]"
                        disabled={busy}
                        onClick={() => void download(item)}
                      >
                        {busy ? <LoaderCircle aria-hidden="true" size={14} className="animate-spin" /> : <Download aria-hidden="true" size={14} />}
                        Download
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9 min-h-9 text-[#e11d48]"
                        aria-label={`Remove ${item.formatName} from saved AdMats`}
                        title="Remove from saved"
                        onClick={() => {
                          const storageError = onRemove(item.id);
                          if (storageError) setErrors((current) => ({ ...current, [item.id]: storageError }));
                        }}
                      >
                        <Heart aria-hidden="true" size={17} fill="currentColor" />
                      </Button>
                    </div>
                    {item.fineTuneAvailable ? (
                      <Button variant="secondary" size="sm" className="mt-2 min-h-9 w-full rounded-[8px] text-[12px]" onClick={() => setFineTuneTarget(item)}>
                        <SlidersHorizontal aria-hidden="true" size={14} /> Fine-tune
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="grid min-h-[320px] place-items-center px-6 py-12 text-center">
            <div>
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#fff1f2] text-[#e11d48]">
                <Heart aria-hidden="true" size={22} />
              </span>
              <p className="mt-4 text-[15px] font-semibold text-[var(--ink)]">No saved AdMats yet</p>
              <p className="mx-auto mt-1 max-w-sm text-[13px] text-[var(--ink-muted)]">
                Select the heart on a completed generated asset to keep it in this browser library.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    {fineTuneTarget ? (
      <FineTuneDialog
        key={fineTuneTarget.id}
        asset={{
          sessionId: fineTuneTarget.sessionId,
          assetToken: fineTuneTarget.assetToken,
          requestId: fineTuneTarget.requestId,
          width: fineTuneTarget.width,
          height: fineTuneTarget.height,
          name: fineTuneTarget.formatName,
        }}
        onOpenChange={(nextOpen) => { if (!nextOpen) setFineTuneTarget(null); }}
        onSaved={(previewUrl) => {
          const storageError = onFineTuneSaved(fineTuneTarget.id, previewUrl);
          if (storageError) setErrors((current) => ({ ...current, [fineTuneTarget.id]: storageError }));
        }}
      />
    ) : null}
    </>
  );
}

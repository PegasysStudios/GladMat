"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FolderOpen, ImageOff, LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { SavedArtwork } from "@/lib/saved-artwork";

export function SavedArtworkLibrary({ items, open, onOpenChange, onUse, onRemove, onRefreshPreview }: {
  items: SavedArtwork[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUse: (item: SavedArtwork) => Promise<boolean>;
  onRemove: (sessionId: string) => string | null;
  onRefreshPreview: (item: SavedArtwork) => Promise<string>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previewErrors, setPreviewErrors] = useState(new Set<string>());
  const refreshAttempts = useRef(new Set<string>());

  async function openArtwork(item: SavedArtwork) {
    setBusyId(item.source.sessionId);
    setErrors({});
    try {
      if (await onUse(item)) onOpenChange(false);
    } catch (error) {
      setErrors({ [item.source.sessionId]: error instanceof Error ? error.message : "This artwork could not be opened. Try again." });
    } finally {
      setBusyId(null);
    }
  }

  async function refresh(item: SavedArtwork) {
    const id = item.source.sessionId;
    if (refreshAttempts.current.has(id)) {
      setPreviewErrors((current) => new Set(current).add(id));
      return;
    }
    refreshAttempts.current.add(id);
    try { await onRefreshPreview(item); } catch { setPreviewErrors((current) => new Set(current).add(id)); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-w-[min(1040px,calc(100%-2rem))] flex-col overflow-hidden p-0">
        <div className="border-b border-[var(--line)] px-6 py-5 pr-16">
          <DialogTitle>Saved artwork</DialogTitle>
          <DialogDescription>Reuse an upload and its analysis. Artwork is saved automatically in this browser.</DialogDescription>
        </div>
        {items.length ? (
          <div className="grid min-h-0 grid-cols-1 gap-4 overflow-y-auto bg-[var(--surface-subtle)] p-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const id = item.source.sessionId;
              return (
                <article key={id} className="flex min-w-0 flex-col overflow-hidden rounded-[12px] border border-[var(--line)] bg-white shadow-sm">
                  <div className="grid h-56 grid-rows-[minmax(0,1fr)] place-items-center overflow-hidden bg-[#eef0f3] p-3">
                    {previewErrors.has(id) ? (
                      <div className="text-center text-[12px] text-[var(--ink-muted)]"><ImageOff aria-hidden="true" className="mx-auto mb-2" />Preview unavailable. Try opening the artwork.</div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.source.previewUrl} alt={item.source.originalName} className="h-full min-h-0 w-full min-w-0 object-contain shadow-sm" onError={() => void refresh(item)} />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="truncate text-[13px] font-semibold" title={item.source.originalName}>{item.source.originalName}</h3>
                    <p className="mt-1 text-[12px] tabular-nums text-[var(--ink-muted)]">{item.source.width} × {item.source.height} px</p>
                    <p className="mt-2 flex items-center gap-1.5 text-[12px] text-[var(--ink-muted)]">
                      {item.analysis ? <CheckCircle2 aria-hidden="true" size={14} className="text-[var(--success)]" /> : null}
                      {item.analysis ? "Analysis saved" : "Ready to analyze"}
                    </p>
                    {errors[id] ? <p role="alert" className="mt-2 text-[12px] text-[var(--danger)]">{errors[id]}</p> : null}
                    <div className="mt-auto flex gap-2 pt-4">
                      <Button variant="primary" size="sm" className="flex-1" disabled={Boolean(busyId)} onClick={() => void openArtwork(item)}>
                        {busyId === id ? <LoaderCircle aria-hidden="true" size={14} className="animate-spin" /> : <FolderOpen aria-hidden="true" size={14} />}
                        {busyId === id ? "Opening…" : "Use artwork"}
                      </Button>
                      <Button variant="ghost" size="icon" disabled={Boolean(busyId)} aria-label={`Remove ${item.source.originalName} from saved artwork`} title="Remove from this browser" onClick={() => {
                        const error = onRemove(id);
                        if (error) setErrors((current) => ({ ...current, [id]: error }));
                      }}><Trash2 aria-hidden="true" size={16} /></Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <FolderOpen aria-hidden="true" size={28} className="mx-auto text-[var(--accent)]" />
            <p className="mt-4 text-[15px] font-semibold">No saved artwork yet</p>
            <p className="mt-1 text-[13px] text-[var(--ink-muted)]">Upload artwork once to reuse it here later.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

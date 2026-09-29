"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { postJson, putJson } from "@/lib/api-client";
import {
  DEFAULT_FINE_TUNE_TRANSFORM,
  fineTuneImageRect,
  MAX_FINE_TUNE_SCALE,
  MIN_FINE_TUNE_SCALE,
  type FineTuneTransform,
} from "@/lib/fine-tune";

export type FineTuneAsset = {
  sessionId: string;
  assetToken: string;
  requestId: string;
  width: number;
  height: number;
  name: string;
};

export function FineTuneDialog({ asset, onOpenChange, onSaved }: {
  asset: FineTuneAsset;
  onOpenChange: (open: boolean) => void;
  onSaved: (previewUrl: string) => void;
}) {
  const [previewAreaNode, setPreviewAreaNode] = useState<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [sourceSize, setSourceSize] = useState({ width: 0, height: 0 });
  const [bleedUrl, setBleedUrl] = useState<string | null>(null);
  const [transform, setTransform] = useState<FineTuneTransform>(DEFAULT_FINE_TUNE_TRANSFORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!previewAreaNode) return;
    // Radix mounts DialogContent through a portal after this component's first effect.
    // Observing the node itself ensures the viewport is measured once it exists.
    const measure = () => {
      const style = getComputedStyle(previewAreaNode);
      setArea({
        width: Math.max(0, previewAreaNode.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)),
        height: Math.max(0, previewAreaNode.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(previewAreaNode);
    return () => observer.disconnect();
  }, [previewAreaNode]);

  useEffect(() => {
    let cancelled = false;
    const identity = { requestId: asset.requestId, width: asset.width, height: asset.height };
    void postJson<{ bleedUrl: string; transform: FineTuneTransform }>("/api/assets/fine-tune", {
      sessionId: asset.sessionId,
      assetToken: asset.assetToken,
      asset: identity,
    }).then((result) => {
      if (cancelled) return;
      setBleedUrl(result.bleedUrl);
      setTransform(result.transform);
      setLoading(false);
    }).catch((caught) => {
      if (cancelled) return;
      setError(caught instanceof Error ? caught.message : "The image could not be opened for fine-tuning.");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [asset.assetToken, asset.height, asset.requestId, asset.sessionId, asset.width]);

  const fit = area.width && area.height
    ? Math.min(area.width / asset.width, area.height / asset.height) * 0.82
    : 0;
  const viewport = { width: asset.width * fit, height: asset.height * fit };
  const rect = sourceSize.width && viewport.width
    ? fineTuneImageRect(sourceSize.width, sourceSize.height, viewport.width, viewport.height, transform)
    : null;

  function changeScale(scale: number) {
    setTransform((current) => {
      if (!sourceSize.width || !viewport.width) return { ...current, scale };
      const next = fineTuneImageRect(sourceSize.width, sourceSize.height, viewport.width, viewport.height, { ...current, scale });
      return { scale, offsetX: next.offsetX, offsetY: next.offsetY };
    });
  }

  function moveTo(offsetX: number, offsetY: number) {
    if (!sourceSize.width || !viewport.width) return;
    setTransform((current) => {
      const next = fineTuneImageRect(sourceSize.width, sourceSize.height, viewport.width, viewport.height, {
        ...current, offsetX, offsetY,
      });
      return { ...current, offsetX: next.offsetX, offsetY: next.offsetY };
    });
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!rect) return;
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: transform.offsetX,
      offsetY: transform.offsetY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !viewport.width) return;
    moveTo(
      drag.offsetX + (event.clientX - drag.x) / viewport.width,
      drag.offsetY + (event.clientY - drag.y) / viewport.height,
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const result = await putJson<{ previewUrl: string }>("/api/assets/fine-tune", {
        sessionId: asset.sessionId,
        assetToken: asset.assetToken,
        asset: { requestId: asset.requestId, width: asset.width, height: asset.height },
        transform,
      });
      onSaved(result.previewUrl);
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The adjustment could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!saving) onOpenChange(open); }}>
      <DialogContent className="flex h-[min(90vh,900px)] max-w-[min(1180px,calc(100%-2rem))] flex-col overflow-hidden p-0">
        <div className="border-b border-[var(--line)] px-5 py-4 pr-14">
          <DialogTitle>Fine-tune {asset.name}</DialogTitle>
          <DialogDescription>Drag to reposition and use the slider to scale. The blue outline is the {asset.width} × {asset.height} px export; artwork outside it is bleed.</DialogDescription>
        </div>

        <div ref={setPreviewAreaNode} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[var(--surface-subtle)] p-5 sm:p-8">
          {(loading || (bleedUrl && !viewport.width)) ? <LoaderCircle aria-label="Loading fine-tune preview" size={28} className="animate-spin text-[var(--accent)]" /> : null}
          {!loading && bleedUrl && viewport.width > 0 ? (
            <div
              role="group"
              aria-label={`${asset.name} fine-tune canvas. Use arrow keys to reposition the image.`}
              tabIndex={0}
              className="relative shrink-0 cursor-grab bg-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] active:cursor-grabbing"
              style={{ width: viewport.width, height: viewport.height, touchAction: "none" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={(event) => {
                dragRef.current = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => { dragRef.current = null; }}
              onLostPointerCapture={() => { dragRef.current = null; }}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 0.05 : 0.01;
                if (event.key === "ArrowLeft") moveTo(transform.offsetX - step, transform.offsetY);
                else if (event.key === "ArrowRight") moveTo(transform.offsetX + step, transform.offsetY);
                else if (event.key === "ArrowUp") moveTo(transform.offsetX, transform.offsetY - step);
                else if (event.key === "ArrowDown") moveTo(transform.offsetX, transform.offsetY + step);
                else return;
                event.preventDefault();
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bleedUrl}
                alt=""
                draggable={false}
                onLoad={(event) => setSourceSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                onError={() => setError("The bleed image could not be loaded. Close and try again.")}
                className="pointer-events-none absolute max-w-none select-none"
                style={rect ? { width: rect.width, height: rect.height, left: rect.left, top: rect.top } : { visibility: "hidden" }}
              />
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 border-2 border-[var(--accent)] shadow-[0_0_0_2px_white,0_16px_40px_rgb(28_28_26/0.2)]" />
              <span aria-hidden="true" className="pointer-events-none absolute -top-7 left-0 rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold text-[var(--ink)] shadow-sm">
                Canvas · {asset.width} × {asset.height}
              </span>
            </div>
          ) : null}
        </div>

        <div className="border-t border-[var(--line)] px-5 py-4">
          <div className="flex items-center gap-3">
            <label htmlFor="fine-tune-scale" className="shrink-0 text-[12px] font-medium">Scale</label>
            <input
              id="fine-tune-scale"
              type="range"
              min={MIN_FINE_TUNE_SCALE}
              max={MAX_FINE_TUNE_SCALE}
              step="0.01"
              value={transform.scale}
              disabled={loading || !sourceSize.width || !viewport.width || saving}
              onChange={(event) => changeScale(Number(event.target.value))}
              className="min-w-0 flex-1 accent-[var(--accent)]"
            />
            <output htmlFor="fine-tune-scale" className="w-12 text-right text-[12px] tabular-nums">{Math.round(transform.scale * 100)}%</output>
            <Button variant="ghost" size="sm" className="min-h-8 px-2" disabled={loading || saving} onClick={() => setTransform(DEFAULT_FINE_TUNE_TRANSFORM)}>
              <RotateCcw aria-hidden="true" size={14} /> Reset
            </Button>
          </div>
          {error ? <p role="alert" className="mt-2 text-[12px] text-[var(--danger)]">{error}</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button variant="accent" size="sm" disabled={loading || !sourceSize.width || !viewport.width || saving || Boolean(error)} onClick={() => void save()}>
              {saving ? <LoaderCircle aria-hidden="true" size={14} className="animate-spin" /> : null}
              Save adjustment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

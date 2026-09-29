"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  LoaderCircle,
  Maximize2,
  Save,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { StudioCanvasHandle, StudioZoom } from "@/components/studio/studio-canvas";
import { StudioLayersPanel } from "@/components/studio/studio-layers-panel";
import { StudioPreparation } from "@/components/studio/studio-preparation";
import { StudioPropertiesPanel } from "@/components/studio/studio-properties-panel";
import { useStudioDocument } from "@/hooks/use-studio-document";
import { STUDIO_DEFAULT_ZOOM, studioExportFilename } from "@/lib/studio";
import { clampReferenceOpacity } from "@/lib/studio-reference";

const StudioCanvas = dynamic(() => import("@/components/studio/studio-canvas"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-[12px] text-[#718097]">
      <LoaderCircle aria-hidden="true" size={20} className="animate-spin text-[#147cff]" />
    </div>
  ),
});

const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2] as const;

function GladMatStudioBrand() {
  return (
    <div className="flex items-center gap-5">
      <span className="text-[25px] font-bold tracking-[-0.055em] text-white">
        Glad<span className="text-[#3f96ff]">Mat</span>
      </span>
      <span className="flex items-center gap-2 text-[14px] font-medium text-white">
        Studio
        <span className="rounded-md bg-[#9656eb] px-1.5 py-0.5 text-[9px] font-bold tracking-[0.08em] text-white">BETA</span>
      </span>
    </div>
  );
}

function ZoomControls({
  zoom,
  resolvedZoom,
  onChange,
}: {
  zoom: StudioZoom;
  resolvedZoom: number;
  onChange: (zoom: StudioZoom) => void;
}) {
  const current = zoom === "fit" ? resolvedZoom : zoom;
  const decrease = () => {
    const target = [...ZOOM_STEPS].reverse().find((candidate) => candidate < current - 0.01) ?? 0.5;
    onChange(target);
  };
  const increase = () => {
    const target = ZOOM_STEPS.find((candidate) => candidate > current + 0.01) ?? 2;
    onChange(target);
  };

  return (
    <div className="studio-zoom-controls" aria-label="Canvas zoom controls">
      <button type="button" onClick={decrease} aria-label="Zoom out" title="Zoom out">
        <ZoomOut aria-hidden="true" size={17} />
      </button>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#d9e0e9]">
        <div className="h-full rounded-full bg-[#1683ff]" style={{ width: `${Math.min(100, Math.max(0, ((current - 0.5) / 1.5) * 100))}%` }} />
      </div>
      <button type="button" onClick={increase} aria-label="Zoom in" title="Zoom in">
        <ZoomIn aria-hidden="true" size={17} />
      </button>
      <div className="relative">
        <select
          aria-label="Zoom level"
          value={zoom}
          onChange={(event) => onChange(event.target.value === "fit" ? "fit" : Number(event.target.value) as StudioZoom)}
          className="h-8 appearance-none rounded-lg border border-[#d9e0e9] bg-white py-0 pl-3 pr-8 text-[12px] font-medium text-[#26344b]"
        >
          <option value="fit">Fit</option>
          {ZOOM_STEPS.map((step) => <option key={step} value={step}>{step * 100}%</option>)}
        </select>
        <ChevronDown aria-hidden="true" size={13} className="pointer-events-none absolute right-2 top-2.5 text-[#66758c]" />
      </div>
      <button type="button" onClick={() => onChange("fit")} aria-label="Fit canvas" title="Fit canvas">
        <Maximize2 aria-hidden="true" size={16} />
      </button>
    </div>
  );
}

export function StudioWorkspace({ sessionId, assetId }: { sessionId: string; assetId: string }) {
  const router = useRouter();
  const studio = useStudioDocument(sessionId, assetId);
  const canvasRef = useRef<StudioCanvasHandle>(null);
  const [zoom, setZoom] = useState<StudioZoom>(STUDIO_DEFAULT_ZOOM);
  const [resolvedZoom, setResolvedZoom] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const goBack = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }, [router]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "Escape") {
        studio.selectLayer(null);
        return;
      }
      const layer = studio.selectedLayer;
      if (!layer || layer.locked) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        studio.removeLayer(layer.id);
        return;
      }
      const distance = event.shiftKey ? 10 : 1;
      const movement = {
        ArrowLeft: [-distance, 0],
        ArrowRight: [distance, 0],
        ArrowUp: [0, -distance],
        ArrowDown: [0, distance],
      }[event.key];
      if (movement) {
        event.preventDefault();
        studio.moveLayer(layer.id, layer.x + movement[0], layer.y + movement[1]);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [studio]);

  async function exportPng() {
    if (!studio.document || !canvasRef.current) return;
    setExporting(true);
    setExportError(null);
    try {
      const blob = await canvasRef.current.exportPng();
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = studioExportFilename(
        studio.document.sourceAsset.sourceName,
        studio.document.canvas.width,
        studio.document.canvas.height,
      );
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (caught) {
      setExportError(caught instanceof Error ? caught.message : "Studio could not export this PNG.");
    } finally {
      setExporting(false);
    }
  }

  const title = studio.document?.sourceAsset.formatName ?? studio.launch?.formatName ?? "Studio";
  const dimensions = studio.document?.canvas ?? (studio.launch
    ? { width: studio.launch.width, height: studio.launch.height }
    : null);

  return (
    <div className="studio-shell">
      <header className="studio-toolbar">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={goBack} className="studio-toolbar-icon" aria-label="Back to GladMat" title="Back to GladMat">
            <ArrowLeft aria-hidden="true" size={18} />
          </button>
          <GladMatStudioBrand />
        </div>

        <div className="min-w-0 text-center text-white">
          <p className="truncate text-[13px] font-semibold">{title}</p>
          {dimensions ? <p className="mt-0.5 text-[11px] tabular-nums text-[#d9e3ef]">{dimensions.width} × {dimensions.height}</p> : null}
        </div>

        <div className="flex items-center justify-end gap-2">
          {studio.phase === "ready" ? (
            <div className="studio-reference-controls">
              <button
                type="button"
                onClick={() => studio.setReferenceVisible(!studio.referenceVisible)}
                aria-pressed={studio.referenceVisible}
                title="Show Reference"
              >
                {studio.referenceVisible ? <Eye aria-hidden="true" size={15} /> : <EyeOff aria-hidden="true" size={15} />}
                <span className="hidden lg:inline">Show Reference</span>
              </button>
              <label className="sr-only" htmlFor="studio-reference-opacity">Reference opacity</label>
              <input
                id="studio-reference-opacity"
                type="range"
                min={0.05}
                max={0.8}
                step={0.05}
                disabled={!studio.referenceVisible}
                value={studio.referenceOpacity}
                onChange={(event) => studio.setReferenceOpacity(clampReferenceOpacity(Number(event.currentTarget.value)))}
                aria-label="Reference opacity"
              />
            </div>
          ) : null}
          <span className={`hidden min-w-[60px] text-right text-[10px] sm:block ${studio.saveStatus === "error" ? "text-[#fca5a5]" : "text-[#bdc9d8]"}`}>
            {studio.saveStatus === "saving" ? "Saving…" : studio.saveStatus === "saved" ? "Saved" : studio.saveStatus === "error" ? "Save failed" : ""}
          </span>
          <button
            type="button"
            onClick={() => void studio.saveNow()}
            disabled={studio.phase !== "ready" || studio.saveStatus === "saving"}
            className="studio-save-button"
          >
            {studio.saveStatus === "saving" ? <LoaderCircle aria-hidden="true" size={15} className="animate-spin" /> : studio.saveStatus === "saved" ? <Check aria-hidden="true" size={15} /> : <Save aria-hidden="true" size={15} />}
            <span className="hidden xl:inline">Save</span>
          </button>
          <button
            type="button"
            onClick={() => void exportPng()}
            disabled={studio.phase !== "ready" || exporting}
            className="studio-export-button"
          >
            {exporting ? <LoaderCircle aria-hidden="true" size={16} className="animate-spin" /> : <Download aria-hidden="true" size={16} />}
            <span>Export PNG</span>
          </button>
        </div>
      </header>

      <div className="studio-mobile-message">
        <div>
          <Maximize2 aria-hidden="true" size={26} className="mx-auto text-[#1677ee]" />
          <h1 className="mt-4 text-[18px] font-semibold text-[#17233a]">Studio works best on a larger screen</h1>
          <p className="mt-1 text-[13px] text-[#68778d]">Open this asset on a laptop or desktop to edit its layers.</p>
          <button type="button" onClick={goBack} className="mt-5 rounded-lg bg-[#1677ee] px-4 py-2.5 text-[13px] font-semibold text-white">Back to GladMat</button>
        </div>
      </div>

      <div className="studio-desktop-area">
        {studio.phase !== "ready" || !studio.document ? (
          <StudioPreparation
            preparation={studio.preparation}
            failure={studio.failure}
            onRetry={() => {
              if (studio.failure?.recovery === "reload") window.location.reload();
              else if (["reopen", "regenerate", "check-configuration"].includes(studio.failure?.recovery ?? "")) goBack();
              else studio.retryPreparation();
            }}
          />
        ) : (
          <div className="studio-editor-grid">
            <StudioLayersPanel
              layers={studio.document.layers}
              images={studio.layerImages}
              selectedLayerId={studio.selectedLayerId}
              onSelectLayer={studio.selectLayer}
              onToggleVisibility={studio.toggleVisibility}
              onReorder={studio.reorderLayers}
              onRetry={(layerId) => void studio.retryLayer(layerId)}
            />

            <section className="studio-work-area">
              <StudioCanvas
                ref={canvasRef}
                document={studio.document}
                imageUrls={studio.layerImages}
                selectedLayerId={studio.selectedLayerId}
                zoom={zoom}
                referenceVisible={studio.referenceVisible}
                referenceOpacity={studio.referenceOpacity}
                onResolvedZoom={setResolvedZoom}
                onSelectLayer={studio.selectLayer}
                onMoveLayer={studio.moveLayer}
                onTransformLayer={studio.transformLayer}
              />
              <div className="studio-canvas-footer">
                <div className="studio-document-chip">
                  <span className="font-semibold tabular-nums">{studio.document.canvas.width} × {studio.document.canvas.height}</span>
                  <span className="text-[#738198]">{studio.document.sourceAsset.formatName}</span>
                </div>
                <ZoomControls zoom={zoom} resolvedZoom={resolvedZoom} onChange={setZoom} />
              </div>
              {exportError ? (
                <div role="alert" className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-lg bg-[#7f1d1d] px-3 py-2 text-[11px] text-white shadow-lg">
                  {exportError}
                </div>
              ) : null}
            </section>

            <StudioPropertiesPanel
              layer={studio.selectedLayer}
              imageUrl={studio.selectedLayer ? studio.layerImages[studio.selectedLayer.id] : undefined}
              onPositionChange={(axis, value) => {
                if (studio.selectedLayer) studio.updateLayerPosition(studio.selectedLayer.id, axis, value);
              }}
              onToggleVisibility={() => {
                if (studio.selectedLayer) studio.toggleVisibility(studio.selectedLayer.id);
              }}
              onMoveToEdge={(edge) => {
                if (studio.selectedLayer) studio.moveLayerToEdge(studio.selectedLayer.id, edge);
              }}
              onRemove={() => {
                if (studio.selectedLayer) studio.removeLayer(studio.selectedLayer.id);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

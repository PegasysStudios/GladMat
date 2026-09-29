"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Sparkles, X } from "lucide-react";
import { BackgroundJobs } from "@/components/background-jobs";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { GenerationResults } from "@/components/generation-results";
import { Panel } from "@/components/panel";
import { SizeSelector } from "@/components/size-selector";
import { SourceUploader } from "@/components/source-uploader";
import { SavedAdMatLibrary } from "@/components/saved-admat-library";
import { SavedArtworkLibrary } from "@/components/saved-artwork-library";
import { StepHeading } from "@/components/step-heading";
import { postJson, triggerBrowserDownload } from "@/lib/api-client";
import { AD_SIZE_PRESETS, DEFAULT_SELECTED_SIZE_IDS } from "@/lib/presets";
import type { AdSize, GenerationJob } from "@/lib/types";
import { useGenerationQueue } from "@/hooks/use-generation-queue";
import { useSourceArtwork } from "@/hooks/use-source-artwork";
import { useSavedAdMats } from "@/hooks/use-saved-admats";
import { useAdMatWebMcp } from "@/hooks/use-admat-webmcp";
import { storeStudioLaunchContext } from "@/lib/studio-access";
import { savedAdMatId } from "@/lib/saved-admats";

const INSTRUCTIONS_MAX = 500;

export function AdMatWorkspace() {
  const router = useRouter();
  const generation = useGenerationQueue();
  const savedAdMats = useSavedAdMats();
  const source = useSourceArtwork(generation.reset);
  const [selectedIds, setSelectedIds] = useState(() => new Set(DEFAULT_SELECTED_SIZE_IDS));
  const [customSizes, setCustomSizes] = useState<AdSize[]>([]);
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [savedLibraryOpen, setSavedLibraryOpen] = useState(false);
  const [artworkLibraryOpen, setArtworkLibraryOpen] = useState(false);
  const [resultsView, setResultsView] = useState(false);
  const [showRemainingSteps, setShowRemainingSteps] = useState(false);
  const sourceCardRef = useRef<HTMLDivElement>(null);
  const centeredCardRectRef = useRef<DOMRect | null>(null);
  const hasSelectedArtwork = Boolean(source.localPreviewUrl || source.source);

  useLayoutEffect(() => {
    if (!hasSelectedArtwork || showRemainingSteps) return;

    const card = sourceCardRef.current;
    const start = centeredCardRectRef.current;
    if (!card || !start || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShowRemainingSteps(true);
      return;
    }

    const end = card.getBoundingClientRect();
    const animation = card.animate(
      [
        { transform: `translate(${start.left - end.left}px, ${start.top - end.top}px)` },
        { transform: "translate(0, 0)" },
      ],
      { duration: 620, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" },
    );
    const revealSteps = () => setShowRemainingSteps(true);
    animation.addEventListener("finish", revealSteps);
    return () => {
      animation.removeEventListener("finish", revealSteps);
      animation.cancel();
    };
  }, [hasSelectedArtwork, showRemainingSteps]);

  const allSizes = useMemo<AdSize[]>(() => [...AD_SIZE_PRESETS, ...customSizes], [customSizes]);
  const selectedSizes = useMemo(
    () => allSizes.filter((size) => selectedIds.has(size.id)),
    [allSizes, selectedIds],
  );
  const generationRunning = generation.jobs.some((job) => (
    job.status === "queued" || job.status === "generating" || job.status === "processing"
  ));
  const canGenerate = source.status === "ready" && Boolean(source.source) && selectedSizes.length > 0 && !generationRunning;

  function toggleSize(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addCustomSize(size: AdSize) {
    const existing = allSizes.find((candidate) => (
      candidate.width === size.width && candidate.height === size.height
    ));
    if (existing) {
      setSelectedIds((current) => new Set(current).add(existing.id));
      return;
    }
    setCustomSizes((current) => [...current, size]);
    setSelectedIds((current) => new Set(current).add(size.id));
  }

  function generationContext() {
    if (!source.source) throw new Error("Upload and analyze artwork first.");
    return {
      source: source.source,
      correctedText: source.correctedText.map((line) => line.trim()).filter(Boolean),
      additionalInstructions: additionalInstructions.trim(),
    };
  }

  async function downloadJob(job: GenerationJob) {
    if (!source.source) return;
    try {
      setNotice(null);
      const response = await postJson<{ downloadUrl: string; filename: string }>("/api/download", {
        sessionId: source.source.sessionId,
        sessionToken: source.source.sessionToken,
        sourceName: source.source.sourceName,
        asset: {
          requestId: job.requestId,
          width: job.size.width,
          height: job.size.height,
        },
      });
      triggerBrowserDownload(response.downloadUrl, response.filename);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The asset could not be downloaded.");
    }
  }

  async function downloadAll(jobs: GenerationJob[]) {
    if (!source.source) return;
    const response = await postJson<{ downloadUrl: string; filename: string; count: number }>(
      "/api/download-zip",
      {
        sessionId: source.source.sessionId,
        sessionToken: source.source.sessionToken,
        sourceName: source.source.sourceName,
        assets: jobs.map((job) => ({
          requestId: job.requestId,
          width: job.size.width,
          height: job.size.height,
        })),
      },
    );
    triggerBrowserDownload(response.downloadUrl, response.filename);
  }

  async function refreshPreview(job: GenerationJob) {
    if (!source.source) return;
    try {
      const response = await postJson<{ previewUrl: string }>("/api/assets/sign", {
        sessionId: source.source.sessionId,
        sessionToken: source.source.sessionToken,
        asset: {
          requestId: job.requestId,
          width: job.size.width,
          height: job.size.height,
        },
      });
      generation.setPreviewUrl(job.requestId, response.previewUrl);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The preview link could not be refreshed.");
    }
  }

  function openStudio(job: GenerationJob) {
    if (!source.source || job.status !== "complete" || !job.assetToken) return;
    try {
      storeStudioLaunchContext(source.source.sessionId, job.requestId, {
        assetToken: job.assetToken,
        width: job.size.width,
        height: job.size.height,
        formatName: job.size.name,
        sourceName: source.source.sourceName,
      });
      router.push(`/studio/${source.source.sessionId}/${job.requestId}`);
    } catch {
      setNotice("Studio could not be opened in this browser. Check that session storage is available.");
    }
  }

  const disabledReason = (() => {
    if (generationRunning) return "The current generation queue is still running.";
    if (source.status === "uploading") return "Finish uploading the source artwork first.";
    if (source.status === "analyzing") return "Artwork analysis is still running.";
    if (source.status !== "ready") return "Upload artwork to begin analysis.";
    if (!selectedSizes.length) return "Select at least one output size.";
    return `${selectedSizes.length} independent ${selectedSizes.length === 1 ? "request is" : "requests are"} ready to generate.`;
  })();

  useAdMatWebMcp({
    readState: () => ({
      sourceStatus: source.status,
      source: source.source
        ? {
            filename: source.source.originalName,
            width: source.source.width,
            height: source.source.height,
          }
        : null,
      selectedSizes: selectedSizes.map(({ name, width, height }) => ({ name, width, height })),
      generation: {
        total: generation.jobs.length,
        queued: generation.jobs.filter((job) => job.status === "queued").length,
        generating: generation.jobs.filter((job) => job.status === "generating").length,
        processing: generation.jobs.filter((job) => job.status === "processing").length,
        complete: generation.jobs.filter((job) => job.status === "complete").length,
        failed: generation.jobs.filter((job) => job.status === "error").length,
      },
    }),
    setOutputSizes: async (dimensions) => {
      const chosen: AdSize[] = [];
      const additions: AdSize[] = [];
      const known = [...allSizes];
      for (const { width, height } of dimensions) {
        const existing = known.find((size) => size.width === width && size.height === height);
        if (existing) {
          if (!chosen.some((size) => size.id === existing.id)) chosen.push(existing);
          continue;
        }
        const custom: AdSize = {
          id: `custom-${width}x${height}`,
          name: "Custom size",
          width,
          height,
          custom: true,
        };
        known.push(custom);
        additions.push(custom);
        chosen.push(custom);
      }
      if (additions.length) {
        setCustomSizes((current) => [
          ...current,
          ...additions.filter((addition) => !current.some((size) => size.id === addition.id)),
        ]);
      }
      setSelectedIds(new Set(chosen.map((size) => size.id)));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return {
        selectedCount: chosen.length,
        selectedSizes: chosen.map(({ name, width, height }) => ({ name, width, height })),
      };
    },
  });

  return (
    <div className="min-h-screen overflow-x-clip bg-[var(--canvas)]">
      <AppHeader savedCount={savedAdMats.items.length} onOpenSaved={() => setSavedLibraryOpen(true)} />
      <BackgroundJobs onReconnect={async (scope) => {
        // Restoring artwork resets the current generation queue. Keep its
        // durable-job contexts long enough to reconnect those results.
        const pendingGenerations = scope.startsWith("generation:")
          ? localStorage.getItem("gladmat.pending-generation-contexts.v1") : null;
        const sessionId = scope.startsWith("analysis:") ? scope.slice("analysis:".length) : (() => {
          const requestId = scope.slice("generation:".length);
          try {
            const saved = JSON.parse(localStorage.getItem("gladmat.pending-generation-contexts.v1") ?? "[]") as Array<{ job: GenerationJob; context: { source: { sessionId: string } } }>;
            return saved.find((item) => item.job.requestId === requestId)?.context.source.sessionId;
          } catch { return undefined; }
        })();
        const artwork = source.savedArtwork.find((item) => item.source.sessionId === sessionId);
        if (!artwork) { setSavedLibraryOpen(true); setNotice("Open the saved artwork associated with this job to reconnect its results."); return; }
        await source.restore(artwork);
        if (scope.startsWith("generation:") && pendingGenerations) {
          localStorage.setItem("gladmat.pending-generation-contexts.v1", pendingGenerations);
          generation.restorePending();
          setResultsView(true);
        }
      }} />
      <main className="mx-auto flex min-h-[calc(100dvh-57px)] w-full max-w-[1540px] flex-col overflow-x-hidden px-3 py-3 sm:px-4 sm:py-4 2xl:pr-[30px]">

        {notice ? (
          <div role="alert" className="mb-3 flex items-start justify-between gap-4 rounded-[10px] border border-[#fecaca] bg-[var(--danger-soft)] px-4 py-3 text-[13px] text-[var(--danger)]">
            <div className="flex gap-2">
              <AlertCircle aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
              <p>{notice}</p>
            </div>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message" className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-white/60">
              <X aria-hidden="true" size={15} />
            </button>
          </div>
        ) : null}

        <div className={resultsView ? "w-full min-w-0" : hasSelectedArtwork
          ? "grid w-full min-w-0 grid-cols-1 items-stretch gap-3 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_360px] 2xl:grid-cols-[304px_minmax(0,1fr)_405px]"
          : "flex w-full min-w-0 flex-1 items-center justify-center"
        }>
          <div ref={sourceCardRef} className={resultsView ? "hidden" : hasSelectedArtwork ? "min-w-0" : "w-full lg:w-[280px] 2xl:w-[304px]"}>
            <SourceUploader
              status={source.status}
              source={source.source}
              localPreviewUrl={source.localPreviewUrl}
              fileSize={source.fileSize}
              error={source.error}
              correctedText={source.correctedText}
              onCorrectedTextChange={source.setCorrectedText}
              onFile={(file) => {
                if (!hasSelectedArtwork) centeredCardRectRef.current = sourceCardRef.current?.getBoundingClientRect() ?? null;
                void source.upload(file);
              }}
              onRetryAnalysis={source.retryAnalysis}
              savedArtworkCount={source.savedArtwork.length}
              onOpenSavedArtwork={() => setArtworkLibraryOpen(true)}
              storageError={source.storageError}
            />
          </div>

          {!resultsView && hasSelectedArtwork && showRemainingSteps && (
            <Panel className="workspace-step-enter flex h-full min-h-[720px] flex-col xl:min-h-[calc(100vh-89px)]">
              <SizeSelector
                selectedIds={selectedIds}
                customSizes={customSizes}
                onToggle={toggleSize}
                onSelectAll={() => setSelectedIds(new Set(allSizes.map((size) => size.id)))}
                onClear={() => setSelectedIds(new Set())}
                onAddCustom={addCustomSize}
                onRemoveCustom={(id) => {
                  setCustomSizes((current) => current.filter((size) => size.id !== id));
                  setSelectedIds((current) => {
                    const next = new Set(current);
                    next.delete(id);
                    return next;
                  });
                }}
              />
            </Panel>
          )}

          {!resultsView && hasSelectedArtwork && showRemainingSteps && (
            <Panel className="workspace-step-enter flex h-full min-h-[320px] flex-col lg:col-span-2 xl:col-span-1">
              <StepHeading
                step={3}
                title={(
                  <>
                    Additional instructions
                    <span className="font-normal text-[var(--ink-muted)]"> (optional)</span>
                  </>
                )}
                description="Tell us how to adapt your design for different formats."
              />
              <div className="relative flex min-h-[220px] flex-1">
                <label htmlFor="instructions" className="sr-only">Additional instructions, optional</label>
                <textarea
                  id="instructions"
                  rows={8}
                  maxLength={INSTRUCTIONS_MAX}
                  value={additionalInstructions}
                  onChange={(event) => setAdditionalInstructions(event.target.value)}
                  placeholder="e.g. Keep the artist larger, emphasize the date, use a darker color palette..."
                  className="min-h-[220px] w-full flex-1 resize-y rounded-[9px] border border-[var(--line)] bg-white px-3.5 py-3 pb-9 text-[13px] placeholder:text-[#9ca3af] focus:border-[var(--accent)] focus:outline-none"
                />
                <span className="pointer-events-none absolute bottom-3 right-3 text-[11px] tabular-nums text-[var(--ink-muted)]">
                  {additionalInstructions.length}/{INSTRUCTIONS_MAX}
                </span>
              </div>
              <Button
                variant="primary"
                disabled={!canGenerate}
                title={disabledReason}
                className="mt-3 h-[54px] min-h-[54px] w-full rounded-[9px] text-[16px] font-medium"
                onClick={() => {
                  if (!canGenerate) return;
                  setNotice(null);
                  generation.generateAll(selectedSizes, generationContext());
                  setResultsView(true);
                }}
              >
                <Sparkles aria-hidden="true" size={16} />
                Generate {selectedSizes.length} {selectedSizes.length === 1 ? "asset" : "assets"}
              </Button>
              {generation.jobs.length ? (
                <Button variant="secondary" className="mt-3 h-[54px] min-h-[54px] w-full rounded-[9px] text-[16px] font-medium" onClick={() => setResultsView(true)}>
                  View generated assets
                </Button>
              ) : null}
            </Panel>
          )}

          {resultsView && (
            <GenerationResults
              jobs={generation.jobs}
              expanded
              sourceName={source.source?.originalName}
              onBack={() => setResultsView(false)}
              className="workspace-step-enter min-h-[calc(100dvh-89px)]"
              onDownload={downloadJob}
              onDownloadAll={downloadAll}
              onRegenerate={(job, instructions) => {
                setNotice(null);
                generation.regenerate(job, instructions);
              }}
              onRefreshPreview={(job) => void refreshPreview(job)}
              onOpenStudio={openStudio}
              sessionId={source.source?.sessionId ?? ""}
              onFineTuneSaved={(job, previewUrl) => {
                generation.setPreviewUrl(job.requestId, previewUrl);
                if (source.source) {
                  const id = savedAdMatId(source.source.sessionId, job.size.width, job.size.height, job.requestId);
                  const storageError = savedAdMats.updatePreview(id, previewUrl);
                  if (storageError) setNotice(storageError);
                }
              }}
              isSaved={(job) => savedAdMats.isSaved(job, source.source?.sessionId)}
              onToggleSaved={(job) => {
                if (!source.source) return;
                const storageError = savedAdMats.toggle(job, source.source);
                if (storageError) setNotice(storageError);
              }}
            />
          )}
        </div>
      </main>
      <SavedArtworkLibrary
        key={artworkLibraryOpen ? "open" : "closed"}
        items={source.savedArtwork}
        open={artworkLibraryOpen}
        onOpenChange={setArtworkLibraryOpen}
        onUse={async (item) => {
          if (!hasSelectedArtwork) centeredCardRectRef.current = sourceCardRef.current?.getBoundingClientRect() ?? null;
          const restored = await source.restore(item);
          if (restored) {
            setResultsView(false);
            setNotice(null);
          }
          return restored;
        }}
        onRemove={source.removeSavedArtwork}
        onRefreshPreview={source.refreshSavedPreview}
      />
      <SavedAdMatLibrary
        items={savedAdMats.items}
        open={savedLibraryOpen}
        onOpenChange={setSavedLibraryOpen}
        onRemove={savedAdMats.remove}
        onRefreshPreview={savedAdMats.refreshPreview}
        onDownload={savedAdMats.download}
        onFineTuneSaved={savedAdMats.updatePreview}
      />
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Sparkles, X } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { GenerationResults } from "@/components/generation-results";
import { Panel } from "@/components/panel";
import { SizeSelector } from "@/components/size-selector";
import { SourceUploader } from "@/components/source-uploader";
import { StepHeading } from "@/components/step-heading";
import { postJson, triggerBrowserDownload } from "@/lib/api-client";
import { AD_SIZE_PRESETS, DEFAULT_SELECTED_SIZE_IDS } from "@/lib/presets";
import type { AdSize, GenerationJob } from "@/lib/types";
import { useGenerationQueue } from "@/hooks/use-generation-queue";
import { useSourceArtwork } from "@/hooks/use-source-artwork";
import { useAdMatWebMcp } from "@/hooks/use-admat-webmcp";

const INSTRUCTIONS_MAX = 500;

export function AdMatWorkspace() {
  const generation = useGenerationQueue();
  const source = useSourceArtwork(generation.reset);
  const [selectedIds, setSelectedIds] = useState(() => new Set(DEFAULT_SELECTED_SIZE_IDS));
  const [customSizes, setCustomSizes] = useState<AdSize[]>([]);
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

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
      <div className="mx-auto w-full max-w-[1680px] overflow-x-hidden px-3 pb-10 pt-4 sm:px-6 sm:pt-5 lg:px-8">
        <AppHeader />

        {notice ? (
          <div role="alert" className="mt-4 flex items-start justify-between gap-4 rounded-[12px] border border-[#fecaca] bg-[var(--danger-soft)] px-4 py-3 text-[13px] text-[var(--danger)]">
            <div className="flex gap-2">
              <AlertCircle aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
              <p>{notice}</p>
            </div>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message" className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-white/60">
              <X aria-hidden="true" size={15} />
            </button>
          </div>
        ) : null}

        <div className="mt-4 flex w-full min-w-0 flex-col gap-4 lg:mt-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          <div className="flex w-full min-w-0 flex-col gap-4">
            <SourceUploader
              status={source.status}
              source={source.source}
              localPreviewUrl={source.localPreviewUrl}
              fileSize={source.fileSize}
              error={source.error}
              correctedText={source.correctedText}
              onCorrectedTextChange={source.setCorrectedText}
              onFile={(file) => void source.upload(file)}
              onRetryAnalysis={source.retryAnalysis}
            />

            <Panel>
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

            <Panel>
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
              <div className="relative">
                <label htmlFor="instructions" className="sr-only">Additional instructions, optional</label>
                <textarea
                  id="instructions"
                  rows={3}
                  maxLength={INSTRUCTIONS_MAX}
                  value={additionalInstructions}
                  onChange={(event) => setAdditionalInstructions(event.target.value)}
                  placeholder="e.g. Keep the artist larger, emphasize the date, use a darker color palette..."
                  className="min-h-[88px] w-full resize-y rounded-[12px] border border-[var(--line)] bg-white px-3.5 py-3 pr-16 text-[14px] placeholder:text-[#9ca3af] focus:border-[var(--accent)] focus:outline-none"
                />
                <span className="pointer-events-none absolute bottom-3 right-3 text-[11px] tabular-nums text-[var(--ink-muted)]">
                  {additionalInstructions.length}/{INSTRUCTIONS_MAX}
                </span>
              </div>
            </Panel>

            <Button
              variant="primary"
              disabled={!canGenerate}
              title={disabledReason}
              className="h-12 min-h-12 w-full rounded-xl text-[15px]"
              onClick={() => {
                if (!canGenerate) return;
                setNotice(null);
                generation.generateAll(selectedSizes, generationContext());
              }}
            >
              <Sparkles aria-hidden="true" size={16} />
              Generate {selectedSizes.length} {selectedSizes.length === 1 ? "asset" : "assets"}
            </Button>
          </div>

          <GenerationResults
            jobs={generation.jobs}
            className={generation.jobs.length ? undefined : "hidden lg:block"}
            onDownload={downloadJob}
            onDownloadAll={downloadAll}
            onRegenerate={(job) => {
              setNotice(null);
              generation.regenerate(job, generationContext());
            }}
            onRefreshPreview={(job) => void refreshPreview(job)}
          />
        </div>
      </div>
    </div>
  );
}

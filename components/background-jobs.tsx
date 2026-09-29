"use client";
import { useEffect, useRef, useState } from "react";
import { cancelAiJob, jobRequest, retryAiJob, savedAiJobs, rememberAiJob } from "@/lib/ai-job-client";
import type { AiJobSnapshot } from "@/lib/ai-jobs";
import { Button } from "@/components/ui/button";

export function BackgroundJobs({ onReconnect }: { onReconnect: (scope: string) => Promise<void> }) {
  const [jobs, setJobs] = useState<Array<{ scope: string; snapshot: AiJobSnapshot }>>([]);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef(new Map<string, { snapshot: AiJobSnapshot; fetchedAt: number }>());
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let reading = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (disposed || reading) return;
      reading = true;
      try {
        const result = await Promise.all(savedAiJobs().slice(-10).map(async (saved) => {
          const prior = cache.current.get(saved.scope);
          if (prior?.snapshot.jobId === saved.ticket.jobId
            && ["complete", "error", "cancelled"].includes(prior.snapshot.status)
            && Date.now() - prior.fetchedAt < 60_000) {
            return { scope: saved.scope, snapshot: prior.snapshot };
          }
          try {
            const snapshot = await jobRequest<AiJobSnapshot>("/api/jobs/status", saved.ticket, controller.signal);
            cache.current.set(saved.scope, { snapshot, fetchedAt: Date.now() });
            return { scope: saved.scope, snapshot };
          } catch { return prior ? { scope: saved.scope, snapshot: prior.snapshot } : null; }
        }));
        if (!disposed) setJobs(result.filter((item): item is NonNullable<typeof item> => item !== null));
      } finally {
        reading = false;
        if (!disposed) { clearTimeout(timer); timer = setTimeout(() => void refresh(), document.hidden ? 10_000 : 3_000); }
      }
    };
    const update = () => { cache.current.clear(); void refresh(); };
    void refresh(); window.addEventListener("gladmat-ai-jobs", update);
    return () => { disposed = true; clearTimeout(timer); controller.abort(); window.removeEventListener("gladmat-ai-jobs", update); };
  }, []);
  if (!jobs.length) return null;
  async function act(work: () => Promise<unknown>) {
    setError(null); try { await work(); window.dispatchEvent(new Event("gladmat-ai-jobs")); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update this job. Retry shortly."); }
  }
  return <section className="mx-auto mb-4 w-full max-w-6xl rounded-xl border border-[var(--line)] bg-white p-4" aria-label="Background jobs">
    <p className="text-sm font-semibold">Background work</p>
    <p className="mb-3 text-xs text-[var(--ink-muted)]">Accepted work continues when you close this page. Reopen its source or ad to reconnect.</p>
    {jobs.slice(-10).map(({ scope, snapshot }) => <div key={snapshot.jobId} className="flex flex-wrap items-center gap-3 py-2 text-xs">
      <span className="mr-auto">{snapshot.kind === "studio" ? "Studio preparation" : snapshot.kind === "generation" ? "Ad generation" : "Artwork analysis"} · {snapshot.status === "running" ? snapshot.phase : snapshot.status}</span>
      {snapshot.kind !== "studio" ? <Button size="sm" variant="secondary" onClick={() => void act(() => onReconnect(scope))}>Open results</Button> : null}
      {snapshot.status === "error" && snapshot.error?.code === "AI_SUBMISSION_UNKNOWN" ? <Button size="sm" variant="secondary" onClick={() => void act(async () => {
        const restarted = await retryAiJob(snapshot, true); rememberAiJob(scope, restarted);
      })}>Start new attempt</Button> : null}
      {snapshot.status === "error" && snapshot.error?.retryable ? <Button size="sm" variant="secondary" onClick={() => void act(async () => {
        const resumed = await retryAiJob(snapshot); rememberAiJob(scope, resumed);
      })}>Resume</Button> : null}
      {["queued", "running"].includes(snapshot.status) ? <Button size="sm" variant="secondary" onClick={() => void act(() => cancelAiJob(snapshot))}>Cancel</Button> : null}
      {snapshot.error ? <p role="alert" className="w-full text-[var(--danger)]">{snapshot.error.message} Issue reference: {snapshot.jobId}</p> : null}
    </div>)}
    {error ? <p role="alert" className="mt-2 text-xs text-[var(--danger)]">{error}</p> : null}
  </section>;
}

import "server-only";
import { GenerateRequestSchema, AnalyzeRequestSchema } from "@/lib/schemas";
import { StudioAnalyzeRequestSchema } from "@/lib/studio";
import { INITIAL_STUDIO_PREPARATION, STUDIO_API_VERSION, type StudioPreparationState } from "@/lib/studio-protocol";
import { mintAssetToken } from "@/lib/server/asset-token";
import { mintSessionToken } from "@/lib/server/session-token";
import { analyzeSourceArtwork } from "@/lib/server/analyze-source";
import { generateAsset } from "@/lib/server/generate-asset";
import { analyzeStudioAsset, extractStudioLayer, prepareStudioBackground, loadStudioDocument } from "@/lib/server/studio";
import { resolveGeneratedAssetPath } from "@/lib/server/fine-tune";
import { withStorageContext } from "@/lib/server/storage";
import { AppError, logServerError, normalizeError, publicError } from "@/lib/server/errors";
import { studioFailure } from "@/lib/server/studio-request";
import { AiBoundary, JobStopped, jobExecution, type JobExecution } from "./context";
import { guardJob, readJob, updateJob, type JobRow } from "./store";

export type PipelineTurn = { state: "pending"; keys: string[] } | { state: "complete" | "stopped" };
export async function executePipeline(jobId: string, revision: number): Promise<PipelineTurn> {
  let job = await guardJob(jobId, revision);
  let phase = job.phase;
  let progress: StudioPreparationState = job.progress ?? { ...INITIAL_STUDIO_PREPARATION, currentLayers: [] };
  let writes = Promise.resolve();
  const record = (values: Partial<JobRow>) => { writes = writes.then(() => updateJob(job, values)); return writes; };
  const setPhase = (value: string, attempt = 1) => { phase = value; return record({ phase, attempt }); };
  const context: JobExecution = { jobId, revision, scope: job.kind === "studio" ? `analyzing:${job.retry_scopes.analyzing ?? 0}` : "pipeline", callIndex: 0, pending: false,
    guard: async () => { await writes; await guardJob(jobId, revision); }, phase: setPhase };
  const signal = AbortSignal.timeout(240_000);
  async function run(): Promise<unknown> {
    if (job.kind === "analysis") {
      await setPhase("analyzing");
      const input = AnalyzeRequestSchema.parse({ ...job.input, sessionToken: mintSessionToken(job.session_id) });
      return { analysis: await analyzeSourceArtwork(input.sessionId, input.sourcePath, signal) };
    }
    if (job.kind === "generation") {
      const input = GenerateRequestSchema.parse({ ...job.input, sessionToken: mintSessionToken(job.session_id) });
      return { asset: await generateAsset(input, (value, attempt) => { void setPhase(value, attempt); }, signal) };
    }
    const asset = job.input.asset as { requestId: string; width: number; height: number };
    const stored = { ...job.input };
    const { selectedPath, repairLayerIds } = stored;
    delete stored.selectedPath; delete stored.repairLayerIds; delete stored.repairOutputs;
    const access = StudioAnalyzeRequestSchema.parse({ ...stored, apiVersion: STUDIO_API_VERSION,
      assetToken: mintAssetToken(job.session_id, asset) });
    const activePath = await resolveGeneratedAssetPath(access.sessionId, asset.width, asset.height, asset.requestId);
    if (activePath !== selectedPath) throw new AppError("STUDIO_PREPARATION_CHANGED", "The selected ad has changed. Reopen Studio to prepare its latest version.", 409, true, { stage: "analyzing", recovery: "reopen" });
    await setPhase("analyzing");
    progress = { ...progress, analyzing: "working" };
    await record({ progress });
    const document = await analyzeStudioAsset(access, access.formatName, access.sourceName, signal);
    if (job.preparation_id && job.preparation_id !== document.preparationId) throw new AppError("STUDIO_PREPARATION_CHANGED", "Studio preparation has changed. Reopen the latest preparation.", 409, true, { stage: "analyzing", recovery: "reopen" });
    await record({ preparation_id: document.preparationId });
    job = { ...job, preparation_id: document.preparationId! };
    const preparedAccess = { ...access, preparationId: document.preparationId };
    const layers = document.layers.filter((layer) => layer.type !== "background");
    progress = { ...progress, analyzing: "complete", extracting: "working", totalLayers: layers.length, completedLayers: 0 };
    if (!document.preparationComplete || repairLayerIds) {
      await setPhase("extracting");
      for (let offset = 0; offset < layers.length; offset += 3) {
        const batch = layers.slice(offset, offset + 3);
        progress = { ...progress, currentLayers: batch.map((layer) => layer.name) };
        await record({ progress });
        const results = await Promise.allSettled(batch.map(async (layer) => {
          const layerScope = Math.max(job.retry_scopes[`layer:${layer.id}`] ?? 0, job.retry_scopes.layers ?? 0);
          const child = { ...context, scope: `layer:${layer.id}:${layerScope}`, callIndex: 0, pending: false };
          try {
            await jobExecution.run(child, () => extractStudioLayer(preparedAccess, layer.id, signal,
              Array.isArray(repairLayerIds) && repairLayerIds.includes(layer.id)));
            return null;
          } catch (error) {
            if (error instanceof AiBoundary) return error.stepKey;
            throw studioFailure(error, "extracting", [layer.id]);
          }
        }));
        const keys = results.flatMap((result) => result.status === "fulfilled" && result.value !== null ? [result.value] : []);
        if (keys.length) throw new PendingBatch(keys);
        const firstFailure = results.find((result) => result.status === "rejected");
        if (firstFailure?.status === "rejected") throw firstFailure.reason;
        progress = { ...progress, completedLayers: offset + batch.length };
        await record({ progress });
      }
    }
    progress = { ...progress, extracting: "complete", completedLayers: layers.length, currentLayers: [], background: "working" };
    await record({ progress });
    await setPhase("background");
    context.scope = `background:${job.retry_scopes.background ?? 0}`;
    context.callIndex = 0;
    const result = await prepareStudioBackground(preparedAccess, signal, (event) => {
      if (event.type === "stage") {
        progress = { ...progress, [event.stage]: event.status };
        void record({ phase: event.stage, progress }); phase = event.stage;
      }
    });
    const latest = await loadStudioDocument(preparedAccess);
    if (latest?.preparationId !== result.preparationId) throw new AppError("STUDIO_PREPARATION_CHANGED", "Studio preparation changed while publishing. Reopen Studio.", 409, true, { stage: "composition", recovery: "reopen" });
    progress = { ...progress, background: "complete", composition: "working" };
    await record({ progress, phase: "composition" });
    return { document: result };
  }
  try {
    const result = await withStorageContext({ jobId, requestId: jobId, stage: phase }, () => jobExecution.run(context, run));
    await writes;
    await guardJob(jobId, revision);
    await updateJob(job, { status: "complete", result, error: null });
    return { state: "complete" };
  } catch (error) {
    await writes;
    if (error instanceof AiBoundary) return { state: "pending", keys: [error.stepKey] };
    if (error instanceof PendingBatch) return { state: "pending", keys: error.keys };
    if (error instanceof JobStopped) return { state: "stopped" };
    const fallback = new AppError("PROCESSING_FAILED", "The background work was interrupted. Retry to resume saved results.", 502, true);
    if (error instanceof AppError && error.code === "STORAGE_FAILED" && error.retryable) throw error;
    const normalized = job.kind === "studio" ? studioFailure(error, phase as "analyzing" | "extracting" | "background" | "composition") : normalizeError(error, fallback);
    logServerError(error, { operation: "durable-pipeline", jobId, requestId: jobId, stage: phase, preparationId: job.preparation_id ?? undefined });
    await updateJob(job, { status: "error", error: publicError(normalized, jobId) });
    return { state: "stopped" };
  }
}
class PendingBatch extends Error { constructor(public keys: string[]) { super("Selections are waiting for AI"); } }
export async function currentJobRevision(jobId: string) { return (await readJob(jobId)).revision; }

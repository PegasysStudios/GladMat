import { sleep } from "workflow";
import { claimJobStep, processJobStep, submitAiStep, pollAiStep, finishAiStep, failJobStep } from "./ai-job-steps";
import { providerPollDelay } from "@/lib/ai-jobs";

// Pure orchestration. Node/Sharp/Supabase/OpenAI imports live only in steps.
export async function aiJobWorkflow(jobId: string, revision: number) {
  "use workflow";
  try {
    let claim = await claimJobStep(jobId, revision);
    while (claim === "waiting") { await sleep(15_000); claim = await claimJobStep(jobId, revision); }
    if (claim !== "claimed") return;
    while (true) {
      const turn = await processJobStep(jobId, revision);
      if (turn.state !== "pending") return;
      await Promise.all(turn.keys.map(async (key) => {
        await submitAiStep(jobId, revision, key);
        let result = await pollAiStep(jobId, revision, key);
        while (!result.done) {
          await sleep(providerPollDelay(Date.now() - new Date(result.startedAt).getTime()));
          result = await pollAiStep(jobId, revision, key);
        }
        await finishAiStep(jobId, revision, key);
      }));
    }
  } catch (error) {
    await failJobStep(jobId, revision, error instanceof Error ? error.message : "The durable worker was interrupted.");
  }
}

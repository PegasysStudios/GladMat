"use client";

import { AlertCircle, Check, Layers3, LoaderCircle, WandSparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { studioRecoveryLabel, type StudioFailure, type StudioPreparationState } from "@/lib/studio-protocol";
export type { StudioPreparationState } from "@/lib/studio-protocol";

type Step = "pending" | "working" | "complete" | "error";

function StepIcon({ status }: { status: Step }) {
  if (status === "complete") return <Check aria-hidden="true" size={15} />;
  if (status === "working") return <LoaderCircle aria-hidden="true" size={15} className="animate-spin" />;
  if (status === "error") return <AlertCircle aria-hidden="true" size={15} />;
  return <span className="size-2 rounded-full bg-[#cbd5e1]" />;
}

function PreparationRow({ label, detail, status }: { label: string; detail?: string; status: Step }) {
  return (
    <div role="group" aria-label={`${label}: ${status}`} className="flex items-center gap-3 py-2.5">
      <span className={`grid size-7 shrink-0 place-items-center rounded-full ${
        status === "complete" ? "bg-[#dcfce7] text-[#168a46]"
          : status === "working" ? "bg-[#e8f2ff] text-[#147cff]"
            : status === "error" ? "bg-[#fee2e2] text-[#dc2626]"
              : "bg-[#f1f5f9] text-[#94a3b8]"
      }`}>
        <StepIcon status={status} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-[#26344b]">{label}</p>
        {detail ? <p className="mt-0.5 truncate text-[11px] text-[#718097]">{detail}</p> : null}
      </div>
    </div>
  );
}

export function StudioPreparation({
  preparation,
  failure,
  onRetry,
  onCancel,
}: {
  preparation: StudioPreparationState;
  failure: StudioFailure | null;
  onRetry: () => void;
  onCancel?: () => void;
}) {
  const error = failure?.message;
  const extractFraction = preparation.totalLayers
    ? preparation.completedLayers / preparation.totalLayers
    : (preparation.extracting === "complete" ? 1 : 0);
  const progress = Math.min(100,
    (preparation.analyzing === "complete" ? 20 : 0)
      + (preparation.background === "complete" ? 25 : 0)
      + extractFraction * 45
      + (preparation.composition === "complete" ? 10 : 0),
  );
  const extractDetail = preparation.totalLayers
    ? `${preparation.completedLayers} / ${preparation.totalLayers}`
    : undefined;

  return (
    <main className="studio-preparation-area">
      <section className="w-full max-w-[500px] rounded-2xl border border-[#dce3ec] bg-white p-7 shadow-[0_24px_70px_rgb(28_44_68/0.12)]">
        <span className="grid size-12 place-items-center rounded-xl bg-[#e9f3ff] text-[#147cff]">
          {error ? <AlertCircle aria-hidden="true" size={23} /> : <WandSparkles aria-hidden="true" size={23} />}
        </span>
        <h1 className="mt-5 text-[21px] font-semibold tracking-[-0.025em] text-[#16243a]">
          {error ? "Studio needs your attention" : "Preparing Studio"}
        </h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[#6a788e]">
          {error ?? "We’re analyzing this generated ad and reconstructing it as a small set of editable layers."}
        </p>

        <Progress value={progress} className="mt-6 h-2" />
        <p className="mt-2 text-right text-[11px] font-medium tabular-nums text-[#718097]">{Math.round(progress)}%</p>

        <div className="mt-3 divide-y divide-[#edf0f4]">
          <PreparationRow label="Preparing artwork" status={preparation.analyzing} />
          <PreparationRow
            label="Selecting editable elements"
            detail={extractDetail}
            status={preparation.extracting}
          />
          <PreparationRow label="Creating background" status={preparation.background} />
          <PreparationRow label="Building and verifying canvas" status={preparation.composition} />
        </div>

        {preparation.currentLayers.length ? (
          <p className="mt-4 text-[12px] text-[#5b6b82]">
            Currently selecting:{" "}
            <span className="font-semibold text-[#26344b]">{preparation.currentLayers.join(", ")}</span>
          </p>
        ) : null}

        {!error && onCancel ? <button type="button" onClick={onCancel} className="mt-4 text-[12px] text-[#68778d] underline">Cancel preparation</button> : null}
        {failure?.requestId ? <p className="mt-3 break-all text-[10px] text-[#718097]">Issue reference: {failure.requestId}</p> : null}
        {error ? (
          <button type="button" onClick={onRetry} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#1677ee] text-[13px] font-semibold text-white transition hover:bg-[#0f68d8]">
            <LoaderCircle aria-hidden="true" size={15} /> {studioRecoveryLabel(failure?.recovery)}
          </button>
        ) : (
          <div className="mt-5 flex items-center gap-2 rounded-lg bg-[#f6f8fb] px-3 py-2.5 text-[11px] text-[#68778d]">
            <Layers3 aria-hidden="true" size={15} className="text-[#147cff]" />
            You can move, resize, hide, and delete layers after Studio opens.
          </div>
        )}
      </section>
    </main>
  );
}

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function StepHeading({
  step,
  title,
  description,
  action,
  className,
}: {
  step: number;
  title: ReactNode;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-2", className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[12px] font-semibold leading-none text-white">
          {step}
        </span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--ink)]">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-[13px] leading-snug text-[var(--ink-muted)]">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2 pt-0.5">{action}</div> : null}
    </div>
  );
}

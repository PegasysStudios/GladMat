import { cn } from "@/lib/cn";

export function Progress({ value, className }: { value: number; className?: string }) {
  const bounded = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(bounded)}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-[#e5e7eb]", className)}
    >
      <div className="h-full rounded-full bg-[var(--success)] transition-[width] duration-300" style={{ width: `${bounded}%` }} />
    </div>
  );
}

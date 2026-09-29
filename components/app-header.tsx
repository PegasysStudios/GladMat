import { Heart } from "lucide-react";

export function AppHeader({ savedCount, onOpenSaved }: { savedCount: number; onOpenSaved: () => void }) {
  return (
    <header className="border-b border-[var(--line)] bg-white">
      <div className="mx-auto flex h-[57px] w-full max-w-[1540px] min-w-0 items-center justify-between gap-4 px-4 sm:px-5">
        <div className="flex min-w-0 flex-col gap-0 sm:flex-row sm:items-baseline sm:gap-5">
          <h1 className="shrink-0 text-[23px] font-bold tracking-[-0.045em] text-[var(--ink)]">GladMat</h1>
          <p className="truncate text-[13px] leading-snug text-[var(--ink-muted)]">
            Turn one campaign asset into every ad size you need.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSaved}
          className="flex min-h-9 shrink-0 items-center gap-2 rounded-[8px] border border-[var(--line)] bg-white px-3 text-[12px] font-semibold text-[var(--ink)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-subtle)]"
          aria-label={`Open saved AdMats library${savedCount ? `, ${savedCount} saved` : ""}`}
        >
          <Heart aria-hidden="true" size={15} className="text-[#e11d48]" fill={savedCount ? "currentColor" : "none"} />
          <span>Saved</span>
          {savedCount ? (
            <span className="grid min-w-5 place-items-center rounded-full bg-[#fff1f2] px-1.5 py-0.5 text-[10px] tabular-nums text-[#be123c]">
              {savedCount}
            </span>
          ) : null}
        </button>
      </div>
    </header>
  );
}

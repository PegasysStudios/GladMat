"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/cn";

export function IconMenu({
  label,
  items,
  className,
}: {
  label: string;
  items: Array<{ label: string; onClick: () => void; disabled?: boolean }>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent | PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
        className="grid size-8 place-items-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)]"
      >
        <MoreVertical aria-hidden="true" size={16} />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-9 z-30 min-w-[148px] overflow-hidden rounded-[10px] border border-[var(--line)] bg-white py-1 shadow-[0_10px_30px_rgb(17_24_39/0.12)]"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-[13px] font-medium text-[var(--ink)] hover:bg-[var(--surface-subtle)] disabled:opacity-40"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

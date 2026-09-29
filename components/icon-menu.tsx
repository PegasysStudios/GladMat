"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/cn";

const MENU_WIDTH = 156;
const MENU_GAP = 6;
const VIEWPORT_GUTTER = 8;

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
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent | PointerEvent) {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const triggerRect = trigger.getBoundingClientRect();
      const menuHeight = menuRef.current?.offsetHeight ?? items.length * 32 + 8;
      const maxLeft = Math.max(VIEWPORT_GUTTER, window.innerWidth - MENU_WIDTH - VIEWPORT_GUTTER);
      const left = Math.min(Math.max(VIEWPORT_GUTTER, triggerRect.right - MENU_WIDTH), maxLeft);
      const spaceBelow = window.innerHeight - triggerRect.bottom - VIEWPORT_GUTTER;
      const top = spaceBelow >= menuHeight + MENU_GAP
        ? triggerRect.bottom + MENU_GAP
        : Math.max(VIEWPORT_GUTTER, triggerRect.top - menuHeight - MENU_GAP);

      setPosition({ left, top });
    }

    updatePosition();
    menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [items.length, open]);

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
        className="grid size-7 place-items-center rounded-md text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)]"
      >
        <MoreVertical aria-hidden="true" size={15} />
      </button>
      {open ? createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          style={{ left: position.left, top: position.top, width: MENU_WIDTH }}
          className="fixed z-[100] overflow-hidden rounded-[8px] border border-[var(--line)] bg-white py-1 shadow-[0_12px_32px_rgb(17_24_39/0.16)]"
          onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const enabledItems = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
            const currentIndex = enabledItems.indexOf(document.activeElement as HTMLButtonElement);
            const nextIndex = event.key === "Home"
              ? 0
              : event.key === "End"
                ? enabledItems.length - 1
                : event.key === "ArrowDown"
                  ? (currentIndex + 1) % enabledItems.length
                  : (currentIndex - 1 + enabledItems.length) % enabledItems.length;
            enabledItems[nextIndex]?.focus();
          }}
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
              className="block min-h-8 w-full px-2.5 py-1.5 text-left text-[12px] font-medium leading-4 text-[var(--ink)] transition-colors hover:bg-[var(--surface-subtle)] disabled:opacity-40"
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

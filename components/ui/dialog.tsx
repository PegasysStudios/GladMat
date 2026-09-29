"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const DialogPortalContext = React.createContext<HTMLElement | null | undefined>(undefined);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [portalContainer, setPortalContainer] = React.useState<HTMLDivElement | null>(null);

  return (
    <DialogPortalContext.Provider value={portalContainer}>
      {children}
      <div id="dialog-root" ref={setPortalContainer} />
    </DialogPortalContext.Provider>
  );
}

export function DialogContent({
  className,
  children,
  showClose = true,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { showClose?: boolean }) {
  const portalContainer = React.useContext(DialogPortalContext);
  // Wait for the global host instead of moving an open dialog between portal roots.
  if (portalContainer === null) return null;

  return (
    <DialogPrimitive.Portal container={portalContainer}>
      <DialogPrimitive.Overlay className="app-dialog-backdrop fixed inset-0 z-50 bg-[#171714]/55 backdrop-blur-[2px]" />
      <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center">
        <DialogPrimitive.Content
          className={cn(
            "app-dialog-content pointer-events-auto relative max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-auto rounded-[14px] border border-[var(--line)] bg-white p-6 shadow-2xl",
            className,
          )}
          {...props}
        >
          {children}
          {showClose ? (
            <DialogPrimitive.Close className="absolute right-3 top-3 grid size-10 place-items-center rounded-[9px] text-[var(--ink-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)]" aria-label="Close dialog">
              <X aria-hidden="true" size={18} />
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-[18px] font-semibold tracking-[-0.02em]", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("mt-1 text-[14px] text-[var(--ink-muted)]", className)} {...props} />;
}

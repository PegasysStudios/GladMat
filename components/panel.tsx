import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

export function Panel({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"section">) {
  return (
    <section
      className={cn("min-w-0 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow)]", className)}
      {...props}
    >
      {children}
    </section>
  );
}

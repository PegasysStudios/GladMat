import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

export function Panel({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"section">) {
  return (
    <section
      className={cn("min-w-0 rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5", className)}
      {...props}
    >
      {children}
    </section>
  );
}

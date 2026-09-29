import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] text-[12px] font-semibold transition disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary: "bg-[var(--ink)] text-white hover:bg-[#1f2937]",
        accent: "bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]",
        secondary: "border border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-subtle)]",
        ghost: "text-[var(--ink-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)]",
        danger: "bg-[var(--danger-soft)] text-[var(--danger)] hover:bg-[#ffe4e0]",
      },
      size: {
        default: "px-4",
        sm: "min-h-10 rounded-[9px] px-3 text-[13px]",
        icon: "size-11 px-0",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

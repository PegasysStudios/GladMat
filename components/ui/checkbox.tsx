"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export function Checkbox({ className, ...props }: React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "grid size-[16px] shrink-0 place-items-center rounded-[4px] border border-[var(--line-strong)] bg-white text-white transition data-[state=checked]:border-[var(--accent)] data-[state=checked]:bg-[var(--accent)]",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check aria-hidden="true" size={11} strokeWidth={2.8} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

import { cn } from "@/lib/cn";

export function AdSizeShape({
  width,
  height,
  max = 36,
  className,
}: {
  width: number;
  height: number;
  max?: number;
  className?: string;
}) {
  const ratio = width / height;
  const boxWidth = ratio >= 1 ? max : Math.max(6, max * ratio);
  const boxHeight = ratio >= 1 ? Math.max(6, max / ratio) : max;

  return (
    <span
      aria-hidden="true"
      className={cn("block rounded-[2px] bg-[var(--shape)]", className)}
      style={{ width: boxWidth, height: boxHeight }}
    />
  );
}

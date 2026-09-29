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
    <div
      aria-hidden="true"
      className={cn(
        "relative block self-center overflow-hidden rounded-[3px] border border-white/10 shadow-[0_4px_10px_rgb(91_16_22/0.18)]",
        "bg-[linear-gradient(135deg,#5c090f_0%,#87151b_40%,#c43e3c_100%)]",
        "after:absolute after:bottom-[5px] after:left-1/2 after:h-px after:w-[38%] after:-translate-x-1/2 after:rounded-full after:bg-white/55",
        className,
      )}
      style={{ width: boxWidth, height: boxHeight }}
    />
  );
}

import { LoaderCircle } from "lucide-react";

export default function StudioLoading() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#edf2f7] text-[#64748b]">
      <div className="text-center">
        <LoaderCircle aria-hidden="true" size={24} className="mx-auto animate-spin text-[#1677ee]" />
        <p className="mt-3 text-sm">Opening Studio…</p>
      </div>
    </div>
  );
}

"use client";

import {
  ArrowDownToLine,
  ArrowUpToLine,
  Eye,
  EyeOff,
  ImageIcon,
  LockKeyhole,
  Trash2,
} from "lucide-react";
import type { StudioLayer } from "@/lib/studio";

function NumberField({
  label,
  value,
  readOnly,
  onChange,
}: {
  label: string;
  value: number;
  readOnly?: boolean;
  onChange?: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[45px_1fr] items-center gap-2 text-[12px] text-[#53647d]">
      <span>{label}</span>
      <input
        type="number"
        step="1"
        readOnly={readOnly}
        value={Math.round(value * 100) / 100}
        onChange={(event) => onChange?.(event.currentTarget.valueAsNumber)}
        className="h-9 min-w-0 rounded-lg border border-[#d8e0ea] bg-white px-2.5 text-[13px] tabular-nums text-[#17233a] read-only:bg-[#f7f9fb] read-only:text-[#7a8799]"
      />
    </label>
  );
}

export function StudioPropertiesPanel({
  layer,
  imageUrl,
  onPositionChange,
  onToggleVisibility,
  onMoveToEdge,
  onRemove,
}: {
  layer: StudioLayer | null;
  imageUrl?: string;
  onPositionChange: (axis: "x" | "y", value: number) => void;
  onToggleVisibility: () => void;
  onMoveToEdge: (edge: "front" | "back") => void;
  onRemove: () => void;
}) {
  if (!layer) {
    return (
      <aside className="studio-side-panel studio-properties-panel grid place-items-center px-8 text-center" aria-label="Properties panel">
        <div className="text-[#6d7b90]">
          <span className="mx-auto grid size-11 place-items-center rounded-xl bg-[#edf2f7]">
            <ImageIcon aria-hidden="true" size={20} />
          </span>
          <p className="mt-3 text-[13px] font-semibold text-[#26344b]">No layer selected</p>
          <p className="mt-1 text-[12px] leading-relaxed">Choose an element on the canvas or in Layers.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="studio-side-panel studio-properties-panel overflow-y-auto" aria-label="Properties panel">
      <div className="flex min-h-[96px] items-center gap-3 border-b border-[#dce2ea] px-4 py-3">
        <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-[#e0e6ee] bg-[#f1f4f8]">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <ImageIcon aria-hidden="true" size={21} className="text-[#68778d]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13px] font-semibold text-[#17233a]">{layer.name}</h2>
          <p className="mt-1 capitalize text-[11px] text-[#758298]">{layer.type === "background" ? "Locked layer" : `${layer.type} layer`}</p>
        </div>
        {layer.locked ? <LockKeyhole aria-label="Locked" size={17} className="text-[#53647d]" /> : null}
      </div>

      <section className="border-b border-[#dce2ea] p-4">
        <h3 className="text-[13px] font-semibold text-[#17233a]">Transform</h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField label="X" value={layer.x} readOnly={layer.locked} onChange={(value) => onPositionChange("x", value)} />
          <NumberField label="Y" value={layer.y} readOnly={layer.locked} onChange={(value) => onPositionChange("y", value)} />
          <NumberField label="Width" value={layer.width} readOnly />
          <NumberField label="Height" value={layer.height} readOnly />
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-[#8290a3]">Resize proportionally with the canvas handles.</p>
      </section>

      <section className="border-b border-[#dce2ea] p-4">
        <h3 className="text-[13px] font-semibold text-[#17233a]">Layer</h3>
        <button
          type="button"
          onClick={onToggleVisibility}
          className="mt-3 flex w-full items-center justify-between rounded-lg px-1 py-2 text-[12px] text-[#40516b] hover:bg-[#f4f7fa]"
        >
          <span>Visible</span>
          <span className={`relative h-6 w-11 rounded-full transition ${layer.visible ? "bg-[#1683ff]" : "bg-[#cbd5e1]"}`}>
            <span className={`absolute top-1 size-4 rounded-full bg-white shadow transition ${layer.visible ? "left-6" : "left-1"}`} />
          </span>
        </button>
        <div className="flex items-center justify-between px-1 py-2 text-[12px] text-[#40516b]">
          <span>Locked</span>
          <span className={`flex h-6 w-11 items-center rounded-full px-1 ${layer.locked ? "bg-[#334155]" : "bg-[#cbd5e1]"}`}>
            <span className={`size-4 rounded-full bg-white shadow ${layer.locked ? "ml-auto" : ""}`} />
          </span>
        </div>
      </section>

      {!layer.locked ? (
        <section className="p-4">
          <h3 className="text-[13px] font-semibold text-[#17233a]">Actions</h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onMoveToEdge("front")} className="studio-inspector-action">
              <ArrowUpToLine aria-hidden="true" size={15} /> Bring to Front
            </button>
            <button type="button" onClick={() => onMoveToEdge("back")} className="studio-inspector-action">
              <ArrowDownToLine aria-hidden="true" size={15} /> Send to Back
            </button>
            <button type="button" onClick={onToggleVisibility} className="studio-inspector-action">
              {layer.visible ? <EyeOff aria-hidden="true" size={15} /> : <Eye aria-hidden="true" size={15} />}
              {layer.visible ? "Hide Layer" : "Show Layer"}
            </button>
            <button type="button" onClick={onRemove} className="studio-inspector-action border-[#fecaca]! text-[#dc2626]! hover:bg-[#fff5f5]!">
              <Trash2 aria-hidden="true" size={15} /> Delete Layer
            </button>
          </div>
        </section>
      ) : null}
    </aside>
  );
}

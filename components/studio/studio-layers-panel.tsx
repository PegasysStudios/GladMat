"use client";

/* dnd-kit exposes render-time connector refs and transform state as its documented sortable API. */
/* eslint-disable react-hooks/refs */

import { useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle,
  Badge,
  Eye,
  EyeOff,
  GripVertical,
  ImageIcon,
  LockKeyhole,
  RefreshCw,
  Shapes,
  Type,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { StudioLayer } from "@/lib/studio";

function LayerTypeIcon({ layer }: { layer: StudioLayer }) {
  const className = "text-[#53647d]";
  if (layer.type === "text") return <Type aria-hidden="true" size={17} className={className} />;
  if (layer.type === "subject") return <UserRound aria-hidden="true" size={17} className={className} />;
  if (layer.type === "badge") return <Badge aria-hidden="true" size={17} className={className} />;
  if (layer.type === "graphic" || layer.type === "logo") {
    return <Shapes aria-hidden="true" size={17} className={className} />;
  }
  return <ImageIcon aria-hidden="true" size={17} className={className} />;
}

function SortableLayerRow({
  layer,
  imageUrl,
  selected,
  onSelect,
  onToggleVisibility,
  onRetry,
}: {
  layer: StudioLayer;
  imageUrl?: string;
  selected: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  onRetry: () => void;
}) {
  const sortable = useSortable({ id: layer.id, disabled: layer.locked });
  return (
    <div
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}
      className={cn(
        "group flex min-h-[50px] items-center gap-2 border-b border-[#e3e8ef] px-2.5 text-[12px] text-[#22314a]",
        selected ? "bg-[#deecff] ring-1 ring-inset ring-[#8cbcff]" : "bg-white hover:bg-[#f8fafc]",
        sortable.isDragging && "relative z-20 shadow-lg",
      )}
      onClick={onSelect}
    >
      <button
        type="button"
        className="grid size-8 shrink-0 place-items-center rounded-md text-[#147cff] hover:bg-[#e8f2ff]"
        aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
        onClick={(event) => { event.stopPropagation(); onToggleVisibility(); }}
      >
        {layer.visible ? <Eye aria-hidden="true" size={17} /> : <EyeOff aria-hidden="true" size={17} />}
      </button>

      <div className="grid h-9 w-12 shrink-0 place-items-center overflow-hidden rounded-md border border-[#e2e7ef] bg-[#f4f6f9]">
        {imageUrl && layer.status === "complete" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="max-h-full max-w-full object-contain" />
        ) : layer.status === "error" ? (
          <AlertCircle aria-hidden="true" size={17} className="text-[#dc2626]" />
        ) : (
          <LayerTypeIcon layer={layer} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{layer.name}</p>
        {layer.status === "extracting" ? <p className="truncate text-[10px] text-[#6b7b91]">Extracting…</p> : null}
        {layer.status === "error" ? (
          <button
            type="button"
            className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-[#d12d2d] hover:underline"
            onClick={(event) => { event.stopPropagation(); onRetry(); }}
          >
            <RefreshCw aria-hidden="true" size={10} /> Retry layer
          </button>
        ) : null}
      </div>

      {layer.locked ? (
        <LockKeyhole aria-label="Locked layer" size={15} className="mr-1 shrink-0 text-[#53647d]" />
      ) : (
        <button
          type="button"
          className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-md text-[#66758c] hover:bg-[#e9eef5] active:cursor-grabbing"
          aria-label={`Reorder ${layer.name}`}
          {...sortable.attributes}
          {...sortable.listeners}
          onClick={(event) => event.stopPropagation()}
        >
          <GripVertical aria-hidden="true" size={16} />
        </button>
      )}
    </div>
  );
}

export function StudioLayersPanel({
  layers,
  images,
  selectedLayerId,
  onSelectLayer,
  onToggleVisibility,
  onReorder,
  onRetry,
}: {
  layers: StudioLayer[];
  images: Record<string, string>;
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onRetry: (layerId: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const panelLayers = useMemo(() => (
    [...layers].sort((a, b) => b.zIndex - a.zIndex)
  ), [layers]);
  const layerIds = panelLayers.map((layer) => layer.id);

  function handleDragEnd(event: DragEndEvent) {
    if (event.over && event.active.id !== event.over.id) {
      onReorder(String(event.active.id), String(event.over.id));
    }
  }

  return (
    <aside className="studio-side-panel studio-layers-panel" aria-label="Layers panel">
      <div className="flex h-[51px] items-center justify-between border-b border-[#dce2ea] px-4">
        <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#17233a]">Layers</h2>
        <span className="rounded-full bg-[#eef2f7] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[#617087]">
          {layers.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={layerIds} strategy={verticalListSortingStrategy}>
            {panelLayers.map((layer) => (
              <SortableLayerRow
                key={layer.id}
                layer={layer}
                imageUrl={images[layer.id]}
                selected={selectedLayerId === layer.id}
                onSelect={() => onSelectLayer(layer.id)}
                onToggleVisibility={() => onToggleVisibility(layer.id)}
                onRetry={() => onRetry(layer.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </aside>
  );
}

"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import Konva from "konva";
import { Image as KonvaImage, Layer, Stage, Transformer } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { calculateFitZoom, type StudioDocument } from "@/lib/studio";
import { STUDIO_REFERENCE_DEFAULT_OPACITY, STUDIO_REFERENCE_LAYER_ID } from "@/lib/studio-reference";

export type StudioZoom = "fit" | 0.5 | 0.75 | 1 | 1.5 | 2;

export type StudioCanvasHandle = {
  exportPng: () => Promise<Blob>;
};

type Props = {
  document: StudioDocument;
  imageUrls: Record<string, string>;
  selectedLayerId: string | null;
  zoom: StudioZoom;
  referenceVisible?: boolean;
  referenceOpacity?: number;
  onResolvedZoom: (zoom: number) => void;
  onSelectLayer: (layerId: string | null) => void;
  onMoveLayer: (layerId: string, x: number, y: number) => void;
  onTransformLayer: (
    layerId: string,
    transform: { x: number; y: number; scaleX: number; scaleY: number },
  ) => void;
};

function useLoadedImages(urls: Record<string, string>) {
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});

  useEffect(() => {
    let active = true;
    const next: Record<string, HTMLImageElement> = {};
    const entries = Object.entries(urls);
    void Promise.all(entries.map(([id, url]) => new Promise<void>((resolve) => {
      const image = new window.Image();
      image.onload = () => {
        next[id] = image;
        resolve();
      };
      image.onerror = () => resolve();
      image.src = url;
    }))).then(() => {
      if (active) setImages(next);
    });
    return () => { active = false; };
  }, [urls]);

  return images;
}

const StudioCanvas = forwardRef<StudioCanvasHandle, Props>(function StudioCanvas({
  document,
  imageUrls,
  selectedLayerId,
  zoom,
  referenceVisible = false,
  referenceOpacity = STUDIO_REFERENCE_DEFAULT_OPACITY,
  onResolvedZoom,
  onSelectLayer,
  onMoveLayer,
  onTransformLayer,
}, forwardedRef) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const referenceLayerRef = useRef<Konva.Layer>(null);
  const nodeRefs = useRef<Record<string, Konva.Image | null>>({});
  const hitCacheRef = useRef(new WeakMap<Konva.Image, { image: HTMLImageElement; width: number; height: number }>());
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const images = useLoadedImages(imageUrls);
  const layers = useMemo(
    () => [...document.layers].sort((a, b) => a.zIndex - b.zIndex),
    [document.layers],
  );
  const resolvedZoom = zoom === "fit"
    ? calculateFitZoom(
        Math.max(1, viewport.width - 72),
        Math.max(1, viewport.height - 112),
        document.canvas.width,
        document.canvas.height,
      )
    : zoom;

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    onResolvedZoom(resolvedZoom);
  }, [onResolvedZoom, resolvedZoom]);

  useEffect(() => {
    // Hit-test the selected pixels rather than the transparent bounding box,
    // so gaps in text and silhouettes do not block elements behind them.
    for (const layer of layers) {
      const node = nodeRefs.current[layer.id];
      const image = images[layer.id];
      if (!node || !image || layer.locked) continue;
      const cached = hitCacheRef.current.get(node);
      if (cached?.image === image && cached.width === layer.width && cached.height === layer.height) continue;
      node.cache({ pixelRatio: 1 });
      node.drawHitFromCache(8);
      hitCacheRef.current.set(node, { image, width: layer.width, height: layer.height });
    }
    const transformer = transformerRef.current;
    if (!transformer) return;
    const node = selectedLayerId ? nodeRefs.current[selectedLayerId] : null;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [images, layers, selectedLayerId]);

  useImperativeHandle(forwardedRef, () => ({
    async exportPng() {
      const stage = stageRef.current;
      if (!stage) throw new Error("The Studio canvas is not ready yet.");
      const missingVisibleLayer = !document.preparationComplete || document.layers.some((layer) => (
        layer.visible && (layer.status !== "complete" || !images[layer.id])
      ));
      if (missingVisibleLayer) throw new Error("The Studio layers are still loading. Try export again in a moment.");
      const transformer = transformerRef.current;
      const referenceLayer = referenceLayerRef.current;
      transformer?.visible(false);
      const referenceWasVisible = referenceLayer?.visible() ?? false;
      referenceLayer?.visible(false);
      transformer?.getLayer()?.batchDraw();
      let blob: Blob | null;
      try {
        blob = await stage.toBlob({
          x: 0,
          y: 0,
          width: document.canvas.width,
          height: document.canvas.height,
          pixelRatio: 1,
          mimeType: "image/png",
        });
      } finally {
        transformer?.visible(true);
        referenceLayer?.visible(referenceWasVisible);
        transformer?.getLayer()?.batchDraw();
        referenceLayer?.batchDraw();
      }
      if (!blob) throw new Error("Studio could not create the PNG export.");
      const bitmap = await createImageBitmap(blob);
      const valid = bitmap.width === document.canvas.width && bitmap.height === document.canvas.height;
      bitmap.close();
      if (!valid) throw new Error("The exported PNG did not match the original dimensions.");
      return blob;
    },
  }), [document.canvas.height, document.canvas.width, document.layers, document.preparationComplete, images]);

  function deselectOnEmpty(event: KonvaEventObject<MouseEvent | TouchEvent>) {
    if (event.target === event.target.getStage()) onSelectLayer(null);
  }

  return (
    <div ref={viewportRef} className="studio-canvas-viewport" aria-label="Studio canvas workspace">
      <div className="studio-canvas-centering">
        <div
          className="studio-artboard-frame"
          style={{
            width: document.canvas.width * resolvedZoom,
            height: document.canvas.height * resolvedZoom,
          }}
        >
          <div
            style={{
              width: document.canvas.width,
              height: document.canvas.height,
              transform: `scale(${resolvedZoom})`,
              transformOrigin: "top left",
            }}
          >
            <Stage
              ref={stageRef}
              width={document.canvas.width}
              height={document.canvas.height}
              onMouseDown={deselectOnEmpty}
              onTouchStart={deselectOnEmpty}
            >
              <Layer clip={{ x: 0, y: 0, width: document.canvas.width, height: document.canvas.height }}>
                {layers.map((layer) => {
                  const image = images[layer.id];
                  if (!layer.visible || layer.status !== "complete" || !image) return null;
                  const editable = !layer.locked && layer.type !== "background";
                  return (
                    <KonvaImage
                      key={layer.id}
                      ref={(node) => { nodeRefs.current[layer.id] = node; }}
                      image={image}
                      x={layer.x}
                      y={layer.y}
                      width={layer.width}
                      height={layer.height}
                      draggable={editable}
                      listening={editable}
                      onClick={() => onSelectLayer(layer.id)}
                      onTap={() => onSelectLayer(layer.id)}
                      onDragEnd={(event) => {
                        onMoveLayer(layer.id, event.target.x(), event.target.y());
                      }}
                      onTransformEnd={(event) => {
                        const node = event.target;
                        const scaleX = node.scaleX();
                        const scaleY = node.scaleY();
                        node.scaleX(1);
                        node.scaleY(1);
                        onTransformLayer(layer.id, {
                          x: node.x(),
                          y: node.y(),
                          scaleX,
                          scaleY,
                        });
                      }}
                    />
                  );
                })}
                <Transformer
                  ref={transformerRef}
                  rotateEnabled={false}
                  keepRatio
                  shiftBehavior="none"
                  flipEnabled={false}
                  enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
                  borderStroke="#1683ff"
                  anchorFill="#ffffff"
                  anchorStroke="#1683ff"
                  anchorSize={9}
                  padding={1}
                  boundBoxFunc={(oldBox, nextBox) => (
                    nextBox.width < 4 || nextBox.height < 4 ? oldBox : nextBox
                  )}
                />
              </Layer>
              <Layer
                ref={referenceLayerRef}
                listening={false}
                visible={Boolean(referenceVisible && images[STUDIO_REFERENCE_LAYER_ID])}
              >
                {images[STUDIO_REFERENCE_LAYER_ID] ? (
                  <KonvaImage
                    image={images[STUDIO_REFERENCE_LAYER_ID]}
                    x={0}
                    y={0}
                    width={document.canvas.width}
                    height={document.canvas.height}
                    opacity={referenceOpacity}
                    listening={false}
                  />
                ) : null}
              </Layer>
            </Stage>
          </div>
        </div>
      </div>
    </div>
  );
});

export default StudioCanvas;

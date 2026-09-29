export function studioRootPath(sessionId: string, assetId: string) {
  return `studio/${sessionId}/${assetId}`;
}

function pipelineRoot(sessionId: string, assetId: string, preparationId?: string) {
  return `${studioRootPath(sessionId, assetId)}/source-pixels-v2${preparationId ? `/${preparationId}` : ""}`;
}

export function studioOriginalPath(sessionId: string, assetId: string, preparationId?: string) {
  return preparationId ? `${pipelineRoot(sessionId, assetId, preparationId)}/original.png` : `${studioRootPath(sessionId, assetId)}/original.png`;
}

export function studioAnalysisPath(sessionId: string, assetId: string, preparationId?: string) {
  return preparationId ? `${pipelineRoot(sessionId, assetId, preparationId)}/analysis.json` : `${studioRootPath(sessionId, assetId)}/analysis.json`;
}

export function studioBackgroundPath(sessionId: string, assetId: string, preparationId?: string) {
  return `${pipelineRoot(sessionId, assetId, preparationId)}/background.png`;
}

export function studioBackgroundCheckpointPath(sessionId: string, assetId: string, preparationId?: string) {
  return `${pipelineRoot(sessionId, assetId, preparationId)}/background.json`;
}

export function studioLayerPath(sessionId: string, assetId: string, layerId: string, preparationId?: string) {
  return `${pipelineRoot(sessionId, assetId, preparationId)}/layers/${layerId}.png`;
}

export function studioMaskPath(sessionId: string, assetId: string, layerId: string, preparationId?: string) {
  return `${pipelineRoot(sessionId, assetId, preparationId)}/masks/${layerId}.png`;
}

export function studioPreparedLayerPath(sessionId: string, assetId: string, layerId: string, preparationId?: string) {
  return `${pipelineRoot(sessionId, assetId, preparationId)}/layers/${layerId}.json`;
}

export function studioDocumentPath(sessionId: string, assetId: string) {
  return `${studioRootPath(sessionId, assetId)}/document.json`;
}

export function isAllowedStudioLayerAssetPath(
  sessionId: string,
  generatedAssetId: string,
  layer: {
    id: string;
    type: string;
    assetPath: string;
  },
  preparationId?: string,
) {
  if (layer.type === "background") {
    return layer.assetPath === studioBackgroundPath(sessionId, generatedAssetId, preparationId);
  }
  return layer.assetPath === studioLayerPath(sessionId, generatedAssetId, layer.id, preparationId);
}

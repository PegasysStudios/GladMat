export function originalSourcePath(sessionId: string, extension: string) {
  return `sources/${sessionId}/original.${extension}`;
}

export function normalizedSourcePath(sessionId: string) {
  return `sources/${sessionId}/source.png`;
}

export function analysisPath(sessionId: string) {
  return `sources/${sessionId}/analysis.json`;
}

export function generatedAssetPath(
  sessionId: string,
  width: number,
  height: number,
  requestId: string,
) {
  return `generated/${sessionId}/${width}x${height}/${requestId}.png`;
}

export function generatedBleedPath(sessionId: string, width: number, height: number, requestId: string) {
  return `generated/${sessionId}/${width}x${height}/${requestId}.bleed.png`;
}

export function generatedEditorBleedPath(sessionId: string, width: number, height: number, requestId: string) {
  return `generated/${sessionId}/${width}x${height}/${requestId}.editor-bleed.png`;
}

export function narrowAdmatBackgroundPath(
  sessionId: string,
  width: number,
  height: number,
  imageModel: string,
) {
  const orientation = width > height ? "horizontal" : "vertical";
  const safeModel = imageModel.replace(/[^a-z0-9._-]/gi, "_").slice(0, 80);
  return `generated/${sessionId}/narrow-backgrounds/${orientation}-${safeModel}.png`;
}

export function generatedFineTunePath(sessionId: string, width: number, height: number, requestId: string) {
  return `generated/${sessionId}/${width}x${height}/${requestId}.fine-tune.json`;
}

export function generatedFineTunedOutputPath(sessionId: string, width: number, height: number, requestId: string, versionId: string) {
  return `generated/${sessionId}/${width}x${height}/${requestId}.${versionId}.png`;
}

export function archivePath(sessionId: string, archiveId: string) {
  return `archives/${sessionId}/${archiveId}.zip`;
}

export function isExpectedOriginalPath(path: string, sessionId: string) {
  return new RegExp(`^sources/${sessionId}/original\\.(png|jpg|webp)$`).test(path);
}

export function isExpectedSourcePath(path: string, sessionId: string) {
  return path === normalizedSourcePath(sessionId);
}

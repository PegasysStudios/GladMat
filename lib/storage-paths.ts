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

export function archivePath(sessionId: string, archiveId: string) {
  return `archives/${sessionId}/${archiveId}.zip`;
}

export function isExpectedOriginalPath(path: string, sessionId: string) {
  return new RegExp(`^sources/${sessionId}/original\\.(png|jpg|webp)$`).test(path);
}

export function isExpectedSourcePath(path: string, sessionId: string) {
  return path === normalizedSourcePath(sessionId);
}

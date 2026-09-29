export function logStudio(event: string, details: Record<string, unknown> = {}) {
  console.info(`[AdMat Studio] ${event}`, details);
}

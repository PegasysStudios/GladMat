const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function sanitizeBaseName(filename: string, fallback = "artwork") {
  const withoutExtension = filename.replace(/\.[^.]*$/, "");
  const normalized = withoutExtension
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/<>:"|?*]+/g, "-")
    .replace(/[^a-zA-Z0-9._ -]+/g, "-")
    .trim()
    .replace(/^[. ]+|[. ]+$/g, "")
    .replace(/[._ ]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");

  if (!normalized || RESERVED_WINDOWS_NAMES.test(normalized)) return fallback;
  return normalized;
}

export function outputFilename(sourceName: string, width: number, height: number) {
  return `${sanitizeBaseName(sourceName)}_${width}x${height}.png`;
}

export function zipFilename(sourceName: string) {
  return `${sanitizeBaseName(sourceName)}_ad-mats.zip`;
}

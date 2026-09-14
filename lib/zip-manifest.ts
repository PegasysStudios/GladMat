import { outputFilename } from "@/lib/filenames";

export type ManifestAsset = {
  requestId: string;
  width: number;
  height: number;
};

export function buildZipManifest(sourceName: string, assets: ManifestAsset[]) {
  const seen = new Set<string>();
  return assets
    .map((asset) => ({
      ...asset,
      filename: outputFilename(sourceName, asset.width, asset.height),
    }))
    .filter((asset) => {
      const key = asset.filename;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.width - b.width || a.height - b.height || a.requestId.localeCompare(b.requestId));
}

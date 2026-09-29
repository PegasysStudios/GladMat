import { existsSync } from "node:fs";
import path from "node:path";

export type LayoutReferenceFamily =
  | "ultra-wide-horizontal"
  | "compact-horizontal"
  | "square-rectangle"
  | "portrait"
  | "skyscraper";

export type LayoutReference = {
  width: number;
  height: number;
  family: LayoutReferenceFamily;
  path: string;
  filename: string;
  match: "exact" | "family";
};

type LayoutReferenceEntry = Omit<LayoutReference, "filename" | "match">;

const REFERENCE_DIR = path.join(process.cwd(), "assets", "references");

function reference(
  width: number,
  height: number,
  family: LayoutReferenceFamily,
  filename: string,
): LayoutReferenceEntry {
  return { width, height, family, path: path.join(REFERENCE_DIR, filename) };
}

/**
 * The supplied files are format references rather than pixel-perfect templates.
 * Reusing a file for multiple named targets is intentional: an exact map entry
 * means the target has been explicitly assigned, not that the reference bitmap
 * itself has those pixel dimensions.
 */
export const LAYOUT_REFERENCE_LIBRARY: readonly LayoutReferenceEntry[] = [
  reference(970, 90, "ultra-wide-horizontal", "small_ultra_wide_ref.png"),
  reference(728, 90, "ultra-wide-horizontal", "leaderboard_ref.png"),
  reference(468, 60, "ultra-wide-horizontal", "leaderboard_ref.png"),
  reference(320, 50, "ultra-wide-horizontal", "small_ultra_wide_ref.png"),
  reference(234, 60, "compact-horizontal", "small_wide_ref.png"),
  reference(320, 100, "compact-horizontal", "small_wide_ref.png"),
  reference(970, 250, "compact-horizontal", "small_wide_ref.png"),
  reference(1920, 1005, "compact-horizontal", "small_wide_ref.png"),
  reference(300, 250, "square-rectangle", "small_square_ref.png"),
  reference(336, 280, "square-rectangle", "small_square_ref.png"),
  reference(250, 250, "square-rectangle", "small_square_ref.png"),
  reference(200, 200, "square-rectangle", "small_square_ref.png"),
  reference(180, 150, "square-rectangle", "small_square_ref.png"),
  reference(1080, 1080, "square-rectangle", "small_square_ref.png"),
  reference(1080, 1350, "portrait", "vertical_ref.png"),
  reference(300, 1050, "portrait", "vertical_ref.png"),
  reference(300, 600, "portrait", "vertical_ref.png"),
  reference(120, 240, "portrait", "vertical_ref.png"),
  reference(160, 600, "skyscraper", "skyscraper_ref.png"),
  reference(120, 600, "skyscraper", "skyscraper_ref.png"),
  reference(300, 1050, "skyscraper", "skyscraper_ref.png"),
];

export function layoutFamilyForTarget(
  width: number,
  height: number,
  formatName = "",
): LayoutReferenceFamily {
  const format = formatName.trim().toLowerCase();
  if (format.includes("skyscraper")) return "skyscraper";
  if (/portrait|half page|vertical/.test(format)) return "portrait";
  if (format.includes("billboard")) return "compact-horizontal";
  if (/square|rectangle/.test(format) && width / height >= 0.85) return "square-rectangle";
  if (format.includes("leaderboard")) return "ultra-wide-horizontal";

  const ratio = width / height;
  if (ratio >= 4) return "ultra-wide-horizontal";
  if (ratio >= 1.35) return "compact-horizontal";
  if (ratio >= 0.85) return "square-rectangle";
  if (height / width >= 2.5) return "skyscraper";
  return "portrait";
}

export type LayoutReferenceSelectionOptions = {
  library?: readonly LayoutReferenceEntry[];
  fileExists?: (filePath: string) => boolean;
};

export function getLayoutReferenceForTarget(
  width: number,
  height: number,
  formatName = "",
  options: LayoutReferenceSelectionOptions = {},
): LayoutReference | undefined {
  const library = options.library ?? LAYOUT_REFERENCE_LIBRARY;
  const fileExists = options.fileExists ?? existsSync;
  const available = library.filter((entry) => fileExists(entry.path));
  const exact = available.find((entry) => entry.width === width && entry.height === height);
  const family = layoutFamilyForTarget(width, height, formatName);
  const familyFallback: Record<LayoutReferenceFamily, string> = {
    "ultra-wide-horizontal": width / height >= 8 ? "small_ultra_wide_ref.png" : "leaderboard_ref.png",
    "compact-horizontal": "small_wide_ref.png",
    "square-rectangle": "small_square_ref.png",
    portrait: "vertical_ref.png",
    skyscraper: "skyscraper_ref.png",
  };
  const selected = exact ?? available.find(
    (entry) => entry.family === family && path.basename(entry.path) === familyFallback[family],
  ) ?? available.find((entry) => entry.family === family);

  if (!selected) return undefined;
  return {
    ...selected,
    filename: path.basename(selected.path),
    match: exact ? "exact" : "family",
  };
}

export function getLayoutReferenceMimeType(filePath: string) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

export type GenerationReferenceInput = {
  role: "master" | "layout";
  name: string;
  buffer: Buffer;
  type: string;
};

export function buildGenerationReferenceInputs(
  master: Buffer,
  layout?: { reference: LayoutReference; buffer: Buffer },
): GenerationReferenceInput[] {
  return [
    { role: "master", name: "source.png", buffer: master, type: "image/png" },
    ...(layout
      ? [
          {
            role: "layout" as const,
            name: layout.reference.filename,
            buffer: layout.buffer,
            type: getLayoutReferenceMimeType(layout.reference.path),
          },
        ]
      : []),
  ];
}

export function formatLayoutReferenceLog(
  width: number,
  height: number,
  sourceArtworkPath: string,
  layoutReference?: LayoutReference,
  promptMode = "standard",
) {
  return {
    target: `${width}x${height}`,
    layoutReferenceUsed: Boolean(layoutReference),
    layoutReferencePath: layoutReference?.path,
    sourceArtworkPath,
    promptMode: layoutReference ? `${promptMode}-with-layout-reference` : promptMode,
  };
}

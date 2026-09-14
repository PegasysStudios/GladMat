import type { AdSize } from "@/lib/types";

export const AD_SIZE_PRESETS = [
  { id: "feed-portrait", name: "Feed portrait", width: 1080, height: 1350 },
  { id: "feed-square", name: "Feed square", width: 1080, height: 1080 },
  { id: "landscape", name: "Landscape", width: 1920, height: 1005 },
  { id: "medium-rectangle", name: "Medium rectangle", width: 300, height: 250 },
  { id: "large-rectangle", name: "Large rectangle", width: 336, height: 280 },
  { id: "leaderboard", name: "Leaderboard", width: 728, height: 90 },
  { id: "mobile", name: "Mobile", width: 320, height: 50 },
  { id: "large-mobile", name: "Large mobile", width: 320, height: 100 },
  { id: "half-page", name: "Half page", width: 300, height: 600 },
  { id: "wide-skyscraper", name: "Wide skyscraper", width: 160, height: 600 },
  { id: "skyscraper", name: "Skyscraper", width: 120, height: 600 },
  { id: "square", name: "Square", width: 250, height: 250 },
  { id: "small-square", name: "Small square", width: 200, height: 200 },
  { id: "main-banner", name: "Main banner", width: 468, height: 60 },
  { id: "portrait", name: "Portrait", width: 300, height: 1050 },
  { id: "billboard", name: "Billboard", width: 970, height: 250 },
  { id: "large-leaderboard", name: "Large leaderboard", width: 970, height: 90 },
  { id: "half-banner", name: "Half banner", width: 234, height: 60 },
  { id: "vertical-rectangle", name: "Vertical rectangle", width: 120, height: 240 },
  { id: "small-rectangle", name: "Small rectangle", width: 180, height: 150 },
] as const satisfies readonly AdSize[];

export const DEFAULT_SELECTED_SIZE_IDS = new Set([
  "feed-portrait",
  "feed-square",
  "landscape",
  "medium-rectangle",
  "leaderboard",
  "mobile",
  "half-page",
  "square",
  "billboard",
]);

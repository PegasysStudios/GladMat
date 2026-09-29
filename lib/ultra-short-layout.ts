import {
  chooseGenerationCanvas,
  classifyUltraShortBanner,
  type GenerationCanvas,
  type UltraShortBannerClass,
} from "@/lib/dimensions";

export type UltraShortGroupBudget = {
  minPercent: number;
  maxPercent: number;
};

export type UltraShortLayoutBudget = {
  class: UltraShortBannerClass;
  width: number;
  height: number;
  horizontalMargin: number;
  verticalMargin: number;
  usableWidth: number;
  usableHeight: number;
  minimumGroupGap: number;
  maxHeadlineHeight: number;
  maxSecondaryGroupHeight: number;
  maxCTAHeight: number;
  maxDecorativeHeight: number;
  groups: {
    headline: UltraShortGroupBudget;
    dateTime: UltraShortGroupBudget;
    venueLocation: UltraShortGroupBudget;
    cta: UltraShortGroupBudget;
  };
};

export type UltraShortSafeCropPlan = {
  generationWidth: number;
  generationHeight: number;
  targetWidth: number;
  targetHeight: number;
  targetRatio: number;
  canvasRatio: number;
  requiresSafeCrop: boolean;
  liveBandAxis: "height" | "width" | null;
  liveBandPercent: number;
  liveBandStartPercent: number;
  liveBandEndPercent: number;
  liveBandStartPx: number;
  liveBandEndPx: number;
  liveBandSizePx: number;
};

export type UltraShortRetrySeverity = "minor" | "moderate" | "severe";

const ULTRA_WIDE_GROUPS = {
  headline: { minPercent: 38, maxPercent: 42 },
  dateTime: { minPercent: 14, maxPercent: 17 },
  venueLocation: { minPercent: 21, maxPercent: 25 },
  cta: { minPercent: 8, maxPercent: 10 },
} as const;

const COMPACT_GROUPS = {
  headline: { minPercent: 35, maxPercent: 40 },
  dateTime: { minPercent: 16, maxPercent: 20 },
  venueLocation: { minPercent: 22, maxPercent: 26 },
  cta: { minPercent: 8, maxPercent: 10 },
} as const;

const LAYOUT_ISSUE_PATTERN =
  /clip|edge|crowd|spac|separat|scale|gutter|overlap|cramp|tall|too large|misalign|safe (frame|band|region)|too close|foreground|breathing|margin|align|unsafe/i;
const SEVERE_LAYOUT_PATTERN =
  /clip|too close|edges?|outside|lost in|crop|cross(es|ing)? the|edge-to-edge/i;
const MODERATE_LAYOUT_PATTERN =
  /too (tall|large|close)|crowd|overlap|cramp|tight|unsafe|misalign|spacing|separation/i;

function assertUltraShortClass(width: number, height: number): UltraShortBannerClass {
  const bannerClass = classifyUltraShortBanner(width, height);
  if (!bannerClass) {
    throw new Error(`getUltraShortLayoutBudget is only valid for ultra-short banners, got ${width}×${height}`);
  }
  return bannerClass;
}

export function getUltraShortLayoutBudget(width: number, height: number): UltraShortLayoutBudget {
  const bannerClass = assertUltraShortClass(width, height);
  const horizontalMargin = Math.max(8, Math.round(height * (bannerClass === "ULTRA_WIDE" ? 0.33 : 0.3)));
  const verticalMargin = Math.max(4, Math.round(height * 0.12));
  const minimumGroupGap = Math.max(5, Math.round(height * 0.12));
  const maxHeadlineHeight = Math.round(height * 0.7);
  const maxSecondaryGroupHeight = Math.round(height * 0.62);
  const maxCTAHeight = Math.round(height * 0.58);
  const maxDecorativeHeight = Math.round(height * 0.42);

  return {
    class: bannerClass,
    width,
    height,
    horizontalMargin,
    verticalMargin,
    usableWidth: width - horizontalMargin * 2,
    usableHeight: height - verticalMargin * 2,
    minimumGroupGap,
    maxHeadlineHeight,
    maxSecondaryGroupHeight,
    maxCTAHeight,
    maxDecorativeHeight,
    groups: bannerClass === "ULTRA_WIDE" ? ULTRA_WIDE_GROUPS : COMPACT_GROUPS,
  };
}

export function getUltraShortSafeCropPlan(width: number, height: number): UltraShortSafeCropPlan {
  const plan = chooseGenerationCanvas(width, height);
  const base = {
    generationWidth: plan.width,
    generationHeight: plan.height,
    targetWidth: width,
    targetHeight: height,
    targetRatio: plan.targetRatio,
    canvasRatio: plan.canvasRatio,
    requiresSafeCrop: plan.requiresSafeCrop,
  };

  if (!plan.requiresSafeCrop) {
    return {
      ...base,
      liveBandAxis: null,
      liveBandPercent: 100,
      liveBandStartPercent: 0,
      liveBandEndPercent: 100,
      liveBandStartPx: 0,
      liveBandEndPx: plan.height,
      liveBandSizePx: plan.height,
    };
  }

  if (plan.targetRatio > plan.canvasRatio) {
    const ratio = plan.canvasRatio / plan.targetRatio;
    const liveBandPercent = Math.max(1, Math.round(ratio * 100));
    const liveBandSizePx = Math.max(1, Math.round(plan.height * ratio));
    const liveBandStartPx = Math.max(0, Math.round((plan.height - liveBandSizePx) / 2));
    const inset = (100 - liveBandPercent) / 2;
    return {
      ...base,
      liveBandAxis: "height",
      liveBandPercent,
      liveBandStartPercent: inset,
      liveBandEndPercent: 100 - inset,
      liveBandStartPx,
      liveBandEndPx: Math.min(plan.height, liveBandStartPx + liveBandSizePx),
      liveBandSizePx,
    };
  }

  const ratio = plan.targetRatio / plan.canvasRatio;
  const liveBandPercent = Math.max(1, Math.round(ratio * 100));
  const liveBandSizePx = Math.max(1, Math.round(plan.width * ratio));
  const liveBandStartPx = Math.max(0, Math.round((plan.width - liveBandSizePx) / 2));
  const inset = (100 - liveBandPercent) / 2;
  return {
    ...base,
    liveBandAxis: "width",
    liveBandPercent,
    liveBandStartPercent: inset,
    liveBandEndPercent: 100 - inset,
    liveBandStartPx,
    liveBandEndPx: Math.min(plan.width, liveBandStartPx + liveBandSizePx),
    liveBandSizePx,
  };
}

export function ultraShortSafeCropInstructions(width: number, height: number) {
  const plan = getUltraShortSafeCropPlan(width, height);
  if (!plan.requiresSafeCrop || !plan.liveBandAxis) {
    return `The model canvas is ${plan.generationWidth} × ${plan.generationHeight} and closely matches the final ${width} × ${height} target. Keep every required text group, CTA, and essential graphic treatment fully inside the canvas with comfortable padding.`;
  }

  const axisLabel = plan.liveBandAxis === "height" ? "height" : "width";
  const startEdge = plan.liveBandAxis === "height" ? "top" : "left";
  const canvasSpan = plan.liveBandAxis === "height" ? plan.generationHeight : plan.generationWidth;

  return `The model canvas is ${plan.generationWidth} × ${plan.generationHeight} but the final target is ${width} × ${height}.

Only the central ${plan.liveBandPercent}% of model-canvas ${axisLabel} will survive final cropping — approximately ${plan.liveBandStartPx}px to ${plan.liveBandEndPx}px of the ${canvasSpan}px canvas ${axisLabel} (about ${plan.liveBandStartPercent}% to ${plan.liveBandEndPercent}% from the ${startEdge}).

Keep ALL required foreground typography, CTA and important graphic treatments completely inside this central live band.

Outside the live band use only background/bleed.

Do not compose required text for the full ${canvasSpan}px model-canvas ${axisLabel}. After cropping, that live band becomes the entire ${plan.liveBandAxis === "height" ? height : width}px ${plan.liveBandAxis === "height" ? "banner height" : "banner width"}, so the safe-frame margins and maximum element heights apply inside the live band.`;
}

export function isUltraShortLayoutIssue(issue: string) {
  return LAYOUT_ISSUE_PATTERN.test(issue);
}

export function classifyUltraShortRetrySeverity(issues: string[]): UltraShortRetrySeverity {
  const layoutIssues = issues.filter(isUltraShortLayoutIssue);
  if (!layoutIssues.length) return "minor";
  const text = layoutIssues.join("\n");
  if (SEVERE_LAYOUT_PATTERN.test(text)) return "severe";
  if (MODERATE_LAYOUT_PATTERN.test(text)) return "moderate";
  return "minor";
}

export function ultraShortScaleReduction(severity: UltraShortRetrySeverity) {
  switch (severity) {
    case "minor":
      return "5–8%";
    case "moderate":
      return "10–12%";
    case "severe":
      return "15–20%";
  }
}

export function buildUltraShortLayoutCorrection(issues: string[]) {
  const layoutIssues = issues.filter(isUltraShortLayoutIssue);
  if (!layoutIssues.length) return "";

  const reduction = ultraShortScaleReduction(classifyUltraShortRetrySeverity(layoutIssues));
  return `ULTRA-SHORT LAYOUT CORRECTION

The previous result used unsafe foreground scaling or spacing.

Correct these issues:
${layoutIssues.map((issue) => `- ${issue}`).join("\n")}

REQUIRED CORRECTION:

Scale the COMPLETE foreground composition down by approximately ${reduction}.

Increase outer horizontal gutters.

Increase top and bottom breathing room.

Keep all required typography and CTA completely inside the safe frame.

Maintain the same content hierarchy.

Maintain the same campaign style.

Do NOT:

- add new copy
- restore omitted source content
- add photography
- remove required information
- change campaign identity

The desired result is the SAME sparse composition with safer spacing and slightly smaller foreground elements.`;
}

export function formatUltraShortLayoutLog(
  width: number,
  height: number,
  canvas: GenerationCanvas = chooseGenerationCanvas(width, height),
) {
  const budget = getUltraShortLayoutBudget(width, height);
  return {
    target: `${width}x${height}`,
    class: budget.class,
    layoutBudget: {
      horizontalMargin: budget.horizontalMargin,
      verticalMargin: budget.verticalMargin,
      usableWidth: budget.usableWidth,
      usableHeight: budget.usableHeight,
      maxHeadlineHeight: budget.maxHeadlineHeight,
    },
    generationCanvas: {
      width: canvas.width,
      height: canvas.height,
    },
  };
}

export function logUltraShortLayoutPlan(
  width: number,
  height: number,
  canvas?: GenerationCanvas,
) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[AdMat] ultra-short layout", formatUltraShortLayoutLog(width, height, canvas));
}

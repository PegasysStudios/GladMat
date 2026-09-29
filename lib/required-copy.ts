import { isUltraShortBanner } from "@/lib/dimensions";
import type { QualityValidation, SourceAnalysis } from "@/lib/schemas";

export type PriorityBannerContent = {
  headline?: string;
  date?: string;
  time?: string;
  venue?: string;
  location?: string;
  cta?: string;
};

export type RequiredCopyInput = {
  analysis: SourceAnalysis;
  correctedText: string[];
  width: number;
  height: number;
};

function trimCopy(value: string | undefined) {
  return value?.trim() ?? "";
}

function uniqueCopy(values: Array<string | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = trimCopy(value);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function correctionMap(exactText: string[], correctedText: string[]) {
  const replacements = new Map<string, string>();
  if (!correctedText.length) return replacements;

  const limit = Math.min(exactText.length, correctedText.length);
  for (let index = 0; index < limit; index += 1) {
    const original = trimCopy(exactText[index]);
    const corrected = trimCopy(correctedText[index]);
    if (original && corrected && original !== corrected) {
      replacements.set(original, corrected);
    }
  }
  return replacements;
}

export function priorityBannerContentFromAnalysis(
  analysis: SourceAnalysis,
  correctedText: string[] = [],
): PriorityBannerContent {
  const replacements = correctionMap(analysis.exactText, correctedText);
  const resolve = (value: string | undefined) => {
    const trimmed = trimCopy(value);
    if (!trimmed) return undefined;
    return replacements.get(trimmed) ?? trimmed;
  };

  return {
    headline: resolve(analysis.primaryHeadline),
    date: resolve(analysis.dateText),
    time: resolve(analysis.timeText),
    venue: resolve(analysis.venueText),
    location: resolve(analysis.locationText),
    cta: resolve(analysis.ctaText),
  };
}

export function requiredCopyForTarget({
  analysis,
  correctedText,
  width,
  height,
}: RequiredCopyInput) {
  const priority = priorityBannerContentFromAnalysis(analysis, correctedText);
  const replacements = correctionMap(analysis.exactText, correctedText);
  const artist = replacements.get(analysis.artistOrEventName) ?? analysis.artistOrEventName;
  const essential = [
    priority.headline,
    priority.date,
    priority.venue || priority.location,
    priority.cta,
  ];

  // References teach density; these three broad copy tiers keep small placements
  // from inheriting every line of a full-size poster.
  if (isUltraShortBanner(width, height) || width / height >= 3 || width <= 160) {
    return uniqueCopy(essential);
  }
  if (width * height < 200_000) {
    return uniqueCopy([
      priority.headline,
      artist,
      priority.date,
      priority.time,
      priority.venue,
      priority.location,
      priority.cta,
    ]);
  }
  return uniqueCopy(correctedText.length ? correctedText : analysis.exactText);
}

const OPTIONAL_OMISSION_PATTERN =
  /photograph|portrait|people|person|face|website|\burl\b|street address|presenter|promoter|supporting act|sponsor|artist imagery/i;
const MISSING_PATTERN =
  /missing|omitted|absent|left out|not (present|included|shown|visible)|should (include|contain|keep|preserve|add|restore)/i;

function mentionsCopyLine(issue: string, line: string) {
  const needle = line.trim().toLowerCase();
  return Boolean(needle) && issue.toLowerCase().includes(needle);
}

export function isIntentionalOmissionIssue(
  issue: string,
  requiredCopy: string[],
  allCopy: string[],
) {
  if (requiredCopy.some((line) => mentionsCopyLine(issue, line))) return false;

  const mentionsOptionalCopy = allCopy.some((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (requiredCopy.some((required) => required.toLowerCase() === trimmed.toLowerCase())) {
      return false;
    }
    return mentionsCopyLine(issue, trimmed);
  });

  return mentionsOptionalCopy || (OPTIONAL_OMISSION_PATTERN.test(issue) && MISSING_PATTERN.test(issue));
}

export function filterRetryIssuesForTarget(
  issues: string[],
  input: RequiredCopyInput,
) {
  const requiredCopy = requiredCopyForTarget(input);
  return issues.filter(
    (issue) => !isIntentionalOmissionIssue(issue, requiredCopy, input.analysis.exactText),
  );
}

export function normalizeQualityValidation(
  validation: QualityValidation,
  input: RequiredCopyInput,
): QualityValidation {
  const issues = filterRetryIssuesForTarget(validation.issues, input);
  if (!issues.length) return { passed: true, issues: [] };
  return { passed: validation.passed, issues };
}

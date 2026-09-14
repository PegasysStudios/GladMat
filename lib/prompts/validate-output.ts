export function buildValidationPrompt(expectedCopy: string[], width: number, height: number) {
  return `Review this generated event advertisement at ${width} × ${height} as a lightweight production quality check.

Expected confirmed copy:
${expectedCopy.length ? expectedCopy.map((line) => `- ${line}`).join("\n") : "- No confirmed copy was supplied."}

Mark passed=false only for a clear, severe problem:
- an obvious misspelling or material mutation of confirmed copy
- important confirmed copy missing when it should reasonably fit
- severely clipped or unreadable key text
- severe layout failure, accidental overlap, or visual corruption
- a badly distorted primary face, subject, or logo

Do not fail for subjective stylistic preferences, harmless line breaks, or tiny supporting copy that is naturally omitted in an extremely small format. List concise actionable issues. Return the requested structured result only.`;
}

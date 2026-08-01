export type StudentScoreLanguage = "zh" | "en";

export function projectStudentScoreText(value: unknown, language: StudentScoreLanguage) {
  const replacement = language === "en" ? "final percentage result" : "最终百分制结果";
  return String(value ?? "")
    .replace(/\b(?:raw\s+|final\s+)?\d+(?:\.\d+)?\s*\/\s*360(?:\s*(?:points?|score))?\b/gi, replacement)
    .replace(/\b(?:raw\s+|final\s+)?360(?:[- ]points?|\s+points?|\s+score)(?:\s+(?:scale|result))?\b/gi, replacement)
    .replace(/(?:原始|内部|最终|终末)?\s*360\s*(?:分(?:制|总分|合同)?|总分|评分合同)/g, replacement)
    .replace(/\b360\s*分\b/g, replacement);
}

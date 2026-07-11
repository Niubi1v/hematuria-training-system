export const blockedPatientOutputTerms = [
  "根据原始病史",
  "根据病例资料",
  "根据病史",
  "病例显示",
  "病例提示",
  "未主动诉",
  "未诉",
  "需追问",
  "需主动询问",
  "评分点",
  "扣分",
  "教师提示",
  "高危错误",
  "MDT建议",
  "CT提示",
  "CTU提示",
  "彩超提示",
  "超声提示",
  "膀胱镜",
  "病理",
  "癌栓",
  "肿瘤",
  "占位",
  "淋巴结",
  "骨转移",
  "诊断",
  "治疗",
  "手术",
  "化疗",
  "放疗",
  "围术期",
  "TURBT",
  "尿检以",
  "24小时尿蛋白",
  "畸形红细胞",
  "肌酐",
  "eGFR",
  "PSA",
  "尿培养",
  "药敏",
  "肾活检",
  "the diagnosis is",
  "you have cancer",
  "the tumor is",
  "ct shows",
  "pathology shows",
  "the treatment is",
  "you need surgery"
];

export function normalizeQuestion(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").replace(/[，。！？；：、,.!?;:()[\]{}'"“”‘’]/g, "");
}

export function filterPatientReply(text: string, language: "zh" | "en" = "zh") {
  const hits = blockedPatientOutputTerms.filter((term) => text.includes(term));
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const hasBulletShape = lines.length > 0 && lines.every((line) => !/^[-•*#]/.test(line));
  const wrongLanguage = language === "en" && /[\u3400-\u9fff]/.test(text);
  const tooLong = lines.some((line) => line.replace(/^-\s*/, "").length > 160) || text.length > 600;
  return {
    ok: hits.length === 0 && hasBulletShape && !tooLong && !wrongLanguage,
    hits,
    hasBulletShape,
    tooLong,
    wrongLanguage
  };
}

export function sanitizeRuleReply(text: string, language: "zh" | "en" = "zh") {
  const cleaned = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-•\s]*/, ""))
    .filter((line) => !blockedPatientOutputTerms.some((term) => line.includes(term)))
    .slice(0, 8)
    .map((line) => line.length > 160 ? `${line.slice(0, 160)}${language === "en" ? "." : "。"}` : line);
  return cleaned.length ? cleaned.join("\n") : language === "en" ? "I am not sure about that." : "这个我不太清楚。";
}

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
  "肾活检"
];

export function normalizeQuestion(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").replace(/[，。！？；：、,.!?;:()[\]{}'"“”‘’]/g, "");
}

export function filterPatientReply(text: string) {
  const hits = blockedPatientOutputTerms.filter((term) => text.includes(term));
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const hasBulletShape = lines.length > 0 && lines.every((line) => !/^[-•*#]/.test(line));
  const tooLong = lines.some((line) => line.replace(/^-\s*/, "").length > 80) || text.length > 180;
  return {
    ok: hits.length === 0 && hasBulletShape && !tooLong,
    hits,
    hasBulletShape,
    tooLong
  };
}

export function sanitizeRuleReply(text: string) {
  const cleaned = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-•\s]*/, ""))
    .filter((line) => !blockedPatientOutputTerms.some((term) => line.includes(term)))
    .slice(0, 2)
    .map((line) => line.length > 80 ? `${line.slice(0, 80)}。` : line);
  return cleaned.length ? cleaned.join("") : "这个我不太清楚。";
}

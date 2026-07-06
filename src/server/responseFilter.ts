export const blockedPatientOutputTerms = [
  "根据原始病史",
  "根据病例资料",
  "未主动诉",
  "未诉",
  "需追问",
  "CT提示",
  "彩超提示",
  "膀胱镜",
  "病理",
  "癌",
  "肿瘤",
  "占位",
  "癌栓",
  "淋巴结",
  "骨转移",
  "诊断",
  "治疗",
  "手术",
  "化疗",
  "放疗",
  "评分"
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
  const hasBulletShape = lines.every((line) => line.startsWith("- "));
  const tooLong = lines.some((line) => line.replace(/^-\s*/, "").length > 60) || text.length > 140;
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
    .map((line) => line.replace(/^[-•]\s*/, ""))
    .filter((line) => !blockedPatientOutputTerms.some((term) => line.includes(term)))
    .slice(0, 2)
    .map((line) => `- ${line.length > 60 ? `${line.slice(0, 60)}。` : line}`);
  return cleaned.length ? cleaned.join("\n") : "- 这个我不太清楚。";
}

import rules from "@/data/scoring-rules.json";
import { KEY_POINTS } from "./keyPoints";
import type { CaseData, CollectedMap, KeyPointId, ScoreReport, StudentSummary } from "./types";

type ScoringRule = {
  id: string;
  label: string;
  max: number;
  keyPoints: KeyPointId[];
  summaryKeywords: string[];
};

function countKeywords(text: string, keywords: string[]) {
  return keywords.filter((word) => text.includes(word)).length;
}

function clamp(value: number, max: number) {
  return Math.max(0, Math.min(max, Math.round(value)));
}

export function scoreTraining(caseData: CaseData, collected: CollectedMap, summary: StudentSummary): ScoreReport {
  const text = Object.values(summary).join(" ");
  const items = (rules as ScoringRule[]).map((rule) => {
    const checklistScore = rule.keyPoints.length
      ? rule.keyPoints.filter((id) => collected[id]).length / rule.keyPoints.length
      : 0;
    const keywordScore = rule.summaryKeywords.length
      ? Math.min(1, countKeywords(text, rule.summaryKeywords) / Math.min(5, rule.summaryKeywords.length))
      : 0;
    const combined = rule.keyPoints.length ? checklistScore * 0.7 + keywordScore * 0.3 : keywordScore;
    const score = clamp(combined * rule.max, rule.max);
    return {
      id: rule.id,
      label: rule.label,
      max: rule.max,
      score,
      comment: score >= rule.max * 0.8 ? "完成较好。" : score >= rule.max * 0.5 ? "部分完成，仍需补充关键线索。" : "覆盖不足，建议按血尿问诊框架重新梳理。"
    };
  });

  const collectedIds = KEY_POINTS.filter((item) => collected[item.id]).map((item) => item.id);
  const missing = KEY_POINTS.filter((item) => !collected[item.id]).map((item) => item.id);
  const total = items.reduce((sum, item) => sum + item.score, 0);
  const preliminary = summary.preliminaryDiagnosis + " " + summary.differentialDiagnosis;
  const dxHit = caseData.differentialDiagnosis.some((dx) => preliminary.includes(dx)) || preliminary.includes(caseData.diagnosis);

  return {
    total: clamp(total + (dxHit ? 2 : 0), 100),
    items,
    collected: collectedIds,
    missing,
    summaryFeedback: text.length > 80
      ? "病史总结已有基本结构，请继续突出时间轴、关键阳性和关键阴性。"
      : "总结偏短，建议用“主诉-起病-血尿特征-伴随症状-危险因素-检查线索”的顺序重写。",
    standardSummary: caseData.standardSummary,
    differentialThinking: `本例标准诊断为“${caseData.diagnosis}”。鉴别时建议先区分肿瘤、结石、感染、前列腺疾病和肾小球性血尿，再结合疼痛、感染线索、危险因素、尿检和影像学证据排序。`,
    teacherComment: caseData.teacherComment
  };
}

export function keyPointLabel(id: KeyPointId) {
  return KEY_POINTS.find((item) => item.id === id)?.label ?? id;
}

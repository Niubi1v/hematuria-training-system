export type PublicLanguage = "zh" | "en";

const TRAJECTORY_ACTION_LABELS: Record<string, Record<PublicLanguage, string>> = {
  diagnosis: { zh: "诊断结论", en: "Diagnosis" },
  department: { zh: "会诊科室", en: "Consulting specialty" },
  trigger: { zh: "会诊原因", en: "Reason for consultation" },
  question: { zh: "会诊问题", en: "Consultation question" },
  evidence: { zh: "提供依据", en: "Evidence provided" },
  consult: { zh: "会诊意见", en: "Consultation advice" },
  treatment: { zh: "治疗计划", en: "Treatment plan" },
  perioperative: { zh: "围术期管理", en: "Perioperative management" }
};

export function publicTrajectoryActionLabel(action: unknown, language: PublicLanguage) {
  const key = String(action || "").trim().toLowerCase();
  return TRAJECTORY_ACTION_LABELS[key]?.[language] || "";
}

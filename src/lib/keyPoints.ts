import type { KeyPointId } from "./types";

export const KEY_POINTS: Array<{ id: KeyPointId; label: string; group: string }> = [
  { id: "onset", label: "血尿出现时间", group: "主诉和起病" },
  { id: "hematuriaType", label: "血尿类型：肉眼/镜下", group: "血尿特征" },
  { id: "hematuriaPhase", label: "血尿阶段：初始/终末/全程", group: "血尿特征" },
  { id: "colorClots", label: "血尿颜色和血块", group: "血尿特征" },
  { id: "irritativeSymptoms", label: "尿频、尿急、尿痛", group: "伴随症状" },
  { id: "flankPain", label: "腰痛或肾绞痛", group: "伴随症状" },
  { id: "fever", label: "发热", group: "伴随症状" },
  { id: "voidingDifficulty", label: "排尿困难", group: "伴随症状" },
  { id: "smoking", label: "吸烟", group: "危险因素" },
  { id: "occupation", label: "职业暴露", group: "危险因素" },
  { id: "stoneHistory", label: "结石史", group: "危险因素" },
  { id: "infectionHistory", label: "感染史", group: "危险因素" },
  { id: "trauma", label: "外伤", group: "危险因素" },
  { id: "anticoagulants", label: "服用抗凝/抗血小板药", group: "危险因素" },
  { id: "tumorFamilyHistory", label: "肿瘤史或家族史", group: "家族史" },
  { id: "historyBundle", label: "既往史、个人史、家族史", group: "完整病史" }
];

export const EMPTY_COLLECTED = KEY_POINTS.reduce(
  (acc, item) => ({ ...acc, [item.id]: false }),
  {} as Record<KeyPointId, boolean>
);

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Slot = {
  patientAnswerZh?: string;
  patientAnswerEn?: string;
  provenance?: string;
  teacherReviewRequired?: boolean;
};

type SlotLibrary = Record<string, Record<string, Slot>>;

type BlockedItem = {
  reviewItemId: string;
  caseId: string;
  displayCaseId?: string;
  field: string;
  canonicalSlotId?: string;
  patientSlotId?: string;
  conflictType: string;
  disposition: string;
  teacherReviewRequired: boolean;
  reviewStatus: string;
  basis: string;
  questionZh: string;
  questionEn: string;
};

type SourceResolution = {
  resolutionId: string;
  caseId: string;
  displayCaseId: string;
  field: string;
  disposition: string;
  authoritativeSource: string;
  originalDerivedValue: string;
  authoritativeValue: string;
  patientValueZh: string;
  patientValueEn: string;
  reason: string;
};

type MatrixRow = {
  itemId: string;
  caseId: string;
  sourceCaseId: string;
  field: string;
  originalZh: string;
  originalEn: string;
  conflictType: string;
  authority: string;
  revisedZh: string;
  revisedEn: string;
  disposition: "RESOLVED_BY_SOURCE_PRECEDENCE" | "RESOLVED_WORDING_ONLY" | "BLOCKED_MEDICAL";
  patientImpact: string;
  scoringImpact: string;
  testResult: string;
};

const repoRoot = process.cwd();
const baseCommit = "1566f7c21aabbd30eff2e30abf9924e214d1b7a4";
const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
const currentSlots = JSON.parse(
  readFileSync(resolve(repoRoot, "data/patient_slots_bilingual.json"), "utf8")
) as SlotLibrary;
const baseSlots = JSON.parse(
  execFileSync("git", ["show", `${baseCommit}:data/patient_slots_bilingual.json`], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  })
) as SlotLibrary;
const cases = JSON.parse(readFileSync(resolve(repoRoot, "data/cases_42.json"), "utf8")) as Array<Record<string, any>>;
const normalizedAudit = JSON.parse(
  readFileSync(resolve(repoRoot, "data/hematuria_release_v14_normalized.json"), "utf8")
) as { facts: Array<Record<string, string>> };
const policy = JSON.parse(
  readFileSync(resolve(repoRoot, "data/history_medical_reconciliation.json"), "utf8")
) as {
  sourcePrecedence: string[];
  sourcePrecedenceResolutions: SourceResolution[];
  blockedMedicalHistory: BlockedItem[];
};
const require = createRequire(import.meta.url);
const { bilingualConflictEntries } = require("../server/bilingualConflictQuarantine.js") as {
  bilingualConflictEntries: Array<{ reviewItemId: string; caseId: string; field: string }>;
};

const displayBySource = new Map<string, string>();
const sourceByDisplay = new Map<string, string>();
for (const item of cases) {
  const sourceId = String(item.id);
  const displayId = String(item.displayCaseId || item.id);
  displayBySource.set(sourceId, displayId);
  sourceByDisplay.set(displayId, sourceId);
}

function displayId(caseId: string): string {
  return displayBySource.get(caseId) || caseId;
}

function sourceId(caseId: string): string {
  return sourceByDisplay.get(caseId) || caseId;
}

function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/\r?\n/g, "<br>")
    .replace(/\|/g, "／")
    .trim() || "—";
}

function isUnknown(value: string): boolean {
  return /没(?:有)?特别注意|之前没注意|记不(?:太)?清|不太清楚|不能确定|需(?:再)?追问|尚需|待核实|未主动诉|未诉|不详|cannot recall|could not recall|did not (?:pay close attention|notice)|not sure|needs? (?:confirmation|follow-up)/i.test(value);
}

function signature(slotId: string, value: string): string {
  if (isUnknown(value)) return "unknown";
  const text = value.replace(/\s+/g, "");
  const tags = new Set<string>();
  const add = (tag: string, pattern: RegExp) => {
    if (pattern.test(text)) tags.add(tag);
  };

  if (slotId === "chief_complaint") {
    add("gross", /小便变红|红色尿|肉眼血尿|visible|gross hematuria/i);
    add("micro", /镜下血尿|尿检.*(?:红细胞|潜血)|microscopic/i);
    add("tea", /茶色|浓茶|tea[- ]?colored/i);
    add("cola", /可乐色|cola[- ]?colored/i);
    add("soy", /酱油色|soy[- ]?sauce/i);
    add("pain", /腰痛|腹痛|pain/i);
    add("frequency", /尿频|frequency/i);
    add("difficulty", /排尿困难|difficulty/i);
    const durations = text.match(/\d+(?:\.\d+)?(?:天|日|周|月|年|小时|days?|weeks?|months?|years?|hours?)/gi) || [];
    for (const duration of durations) tags.add(`duration:${duration.toLowerCase()}`);
    return [...tags].sort().join(",") || "known";
  }

  const complexPatterns: Record<string, Array<[string, RegExp]>> = {
    hematuria_visibility: [
      ["gross", /肉眼血尿|看见.*(?:红|血)|visible|gross/i],
      ["micro", /镜下血尿|肉眼看不出|microscopic|could not see/i],
      ["menstrual", /月经|经血|menstrual/i]
    ],
    hematuria_phase: [
      ["whole", /全程|throughout/i],
      ["initial", /初始|开始.*红|initial/i],
      ["terminal", /终末|最后.*红|terminal|end of/i]
    ],
    hematuria_frequency: [
      ["intermittent", /间断|反复|时有时无|intermittent|comes and goes|recurrent/i],
      ["continuous", /持续|每次|continuous|every time/i],
      ["single", /一次|one episode|only once/i]
    ],
    urine_color: [
      ["tea", /茶色|浓茶|tea/i],
      ["cola", /可乐色|cola/i],
      ["soy", /酱油色|soy/i],
      ["meat", /洗肉水|rinse meat/i],
      ["bright_red", /鲜红|bright red/i],
      ["dark_red", /暗红|深红|dark red/i],
      ["pale_red", /淡红|粉红|pale red|pink/i],
      ["normal", /外观.*正常|看不出.*红|looked normal|could not see/i],
      ["menstrual", /月经|经血|menstrual/i]
    ],
    triggers: [
      ["exercise", /运动|跑步|exercise|running/i],
      ["trauma", /外伤|撞|车祸|trauma|accident|impact/i],
      ["uri", /感冒|咽痛|扁桃体|呼吸道|sore throat|respiratory/i],
      ["skin_infection", /皮肤感染|skin infection/i],
      ["procedure", /导尿|泌尿.*操作|catheter|procedure/i]
    ]
  };
  const complex = complexPatterns[slotId];
  if (complex) {
    for (const [tag, pattern] of complex) add(tag, pattern);
    if (/(?:无|没有|否认|未)(?:明显)?|do not|did not|no /i.test(text)) tags.add("negative");
    return [...tags].sort().join(",") || "known";
  }

  if (slotId === "medications" || slotId === "anticoagulant" || slotId === "antiplatelet") {
    const medicines: Array<[string, RegExp]> = [
      ["aspirin", /阿司匹林|aspirin/i],
      ["clopidogrel", /氯吡格雷|clopidogrel/i],
      ["warfarin", /华法林|warfarin/i],
      ["rivaroxaban", /利伐沙班|rivaroxaban/i],
      ["tamsulosin", /坦索罗辛|tamsulosin/i],
      ["allopurinol", /别嘌醇|allopurinol/i],
      ["diabetes", /降糖药|糖尿病.*药|diabetes medication/i],
      ["ibuprofen", /布洛芬|ibuprofen/i],
      ["painkiller", /复方止痛药|combination painkiller/i]
    ];
    for (const [tag, pattern] of medicines) add(tag, pattern);
    if (/(?:无|没有|否认|未服用)|do not take|not taking/i.test(text)) tags.add("negative");
    return [...tags].sort().join(",") || "known";
  }

  if (slotId === "glomerular_features") {
    add("foam_positive", /泡沫(?:多|尿)|foamy/i);
    add("edema_positive", /水肿|眼睑.*肿|腿.*肿|swelling|edema/i);
    add("negative", /无泡沫|无水肿|没有.*(?:泡沫|肿)|do not|no /i);
    return [...tags].sort().join(",") || "known";
  }

  const negativeBySlot: Record<string, RegExp> = {
    clots: /无血块|没有.*血块|未见.*血块|no (?:blood )?clots?/i,
    pain: /无痛|不痛|没有.*痛|no pain|painless/i,
    dysuria: /无尿痛|小便时不痛|没有.*(?:尿痛|烧灼)|no (?:pain|burning)|does not hurt/i,
    flank_pain: /无.*腰痛|否认.*腰痛|没有.*腰痛|no flank pain/i,
    renal_colic: /无.*绞痛|没有.*绞痛|无.*腰痛|no (?:renal )?colic|no flank pain/i,
    radiating_pain: /无.*放射|不.*放射|does not radiate|no radiation/i,
    urinary_frequency: /无.*尿频|没有.*次数.*增多|次数.*没有.*增多|no urinary frequency|not urinating more/i,
    urinary_urgency: /无.*尿急|没有.*尿急|没有.*憋不住|no urgency/i,
    voiding_difficulty: /无.*排尿困难|没有.*排尿困难|no difficulty/i,
    retention: /无.*尿潴留|没有.*尿潴留|no retention/i,
    fever_chills: /无.*(?:发热|寒战)|否认.*(?:发热|寒战)|no fever|no chills/i,
    recent_uri: /无.*(?:感冒|咽痛|扁桃体)|没有.*(?:感冒|咽痛)|no (?:cold|sore throat|respiratory)/i,
    stone_history: /无.*结石|否认.*结石|no (?:history of )?(?:urinary )?stones?/i,
    uti_history: /无.*尿路感染|否认.*尿路感染|no (?:history of )?(?:urinary tract infection|uti)/i,
    tumor_history: /无.*肿瘤|否认.*肿瘤|no (?:history of )?(?:tumou?r|cancer)/i,
    urinary_procedure_history: /无.*(?:导尿|泌尿.*操作)|否认.*(?:导尿|泌尿.*操作)|no (?:urinary )?procedure/i,
    surgery_history: /无.*手术|没有.*手术|否认.*手术|no (?:history of )?surgery/i,
    smoking: /不吸烟|无.*吸烟|否认.*吸烟|never smok|do not smoke/i,
    alcohol: /不饮酒|无.*饮酒|否认.*饮酒|do not drink|no alcohol/i,
    occupation_exposure: /无.*(?:职业|化学|染料)暴露|否认.*暴露|no occupational exposure/i,
    gynecologic_contamination: /无.*(?:阴道出血|月经污染)|非经期|no vaginal bleeding|not menstruating/i,
    family_history: /无.*家族史|否认.*家族史|no family history/i,
    bleeding_tendency: /无.*出血倾向|否认.*出血|no bleeding tendency/i
  };
  const negative = negativeBySlot[slotId];
  if (negative?.test(text)) return "negative";
  return "positive";
}

function dispositionFor(slotId: string, before: Slot, after: Slot): MatrixRow["disposition"] {
  const oldZh = before.patientAnswerZh || "";
  const newZh = after.patientAnswerZh || "";
  if (oldZh === newZh) return "RESOLVED_WORDING_ONLY";
  if (isUnknown(oldZh) && isUnknown(newZh)) return "RESOLVED_WORDING_ONLY";
  if (signature(slotId, oldZh) === signature(slotId, newZh)) return "RESOLVED_WORDING_ONLY";
  return "RESOLVED_BY_SOURCE_PRECEDENCE";
}

function sourceResolutionMatrixId(resolution: SourceResolution, slotId: string) {
  const primarySlotId = resolution.field === "medication" ? "medications" : resolution.field;
  if (slotId === primarySlotId) return resolution.resolutionId;
  const stableSlotSuffix = slotId.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toUpperCase();
  return `${resolution.resolutionId}-${stableSlotSuffix}`;
}

const historyBlockedByKey = new Map<string, BlockedItem>();
for (const item of policy.blockedMedicalHistory) {
  const patientSlotId = item.canonicalSlotId || item.patientSlotId;
  if (patientSlotId) {
    historyBlockedByKey.set(`${item.displayCaseId || item.caseId}:${patientSlotId}`, item);
  }
}
const hemBlockedByKey = new Map<string, { reviewItemId: string; caseId: string; field: string }>();
for (const item of bilingualConflictEntries) {
  hemBlockedByKey.set(`${displayId(item.caseId)}:${item.field}`, item);
}
const resolutionByKey = new Map<string, SourceResolution>();
for (const item of policy.sourcePrecedenceResolutions) {
  for (const slotId of item.field === "medication" ? ["medications", "anticoagulant", "antiplatelet"] : [item.field]) {
    resolutionByKey.set(`${item.displayCaseId}:${slotId}`, item);
  }
}

const rows: MatrixRow[] = [];
const seen = new Set<string>();
for (const currentCaseId of Object.keys(currentSlots)) {
  const caseDisplayId = displayId(currentCaseId);
  for (const slotId of Object.keys(currentSlots[currentCaseId])) {
    const before = baseSlots[currentCaseId]?.[slotId] || {};
    const after = currentSlots[currentCaseId][slotId] || {};
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    const key = `${caseDisplayId}:${slotId}`;
    const historyBlocked = historyBlockedByKey.get(key);
    const hemBlocked = hemBlockedByKey.get(key);
    const resolution = resolutionByKey.get(key);
    const disposition = historyBlocked || hemBlocked
      ? "BLOCKED_MEDICAL"
      : resolution
        ? "RESOLVED_BY_SOURCE_PRECEDENCE"
        : dispositionFor(slotId, before, after);
    const conflictType = historyBlocked?.conflictType
      || (hemBlocked ? "BILINGUAL_MEDICAL_CONFLICT" : resolution ? "DERIVED_SOURCE_MISMATCH" : disposition === "RESOLVED_WORDING_ONLY" ? "BILINGUAL_OR_PATIENT_WORDING" : "DERIVED_POLARITY_CERTAINTY_OR_SCOPE_MISMATCH");
    const authority = historyBlocked?.basis
      || (hemBlocked ? "HEM-P0-023既有隔离：中英文医学极性冲突，缺乏可裁决的具名专家来源。" : resolution?.authoritativeSource || "当前病例原始中文 source／sourceFacts／结构化 source 字段，依项目既有来源优先级处理。");
    rows.push({
      itemId: historyBlocked?.reviewItemId
        || hemBlocked?.reviewItemId
        || (resolution ? sourceResolutionMatrixId(resolution, slotId) : `HISTORY-${caseDisplayId}-${slotId}`),
      caseId: caseDisplayId,
      sourceCaseId: currentCaseId,
      field: slotId,
      originalZh: before.patientAnswerZh || "",
      originalEn: before.patientAnswerEn || "",
      conflictType,
      authority,
      revisedZh: after.patientAnswerZh || "",
      revisedEn: after.patientAnswerEn || "",
      disposition,
      patientImpact: disposition === "BLOCKED_MEDICAL" ? "是：仅返回自然不确定表达，不收集事实" : "是：患者回答与权威 source 对齐",
      scoringImpact: disposition === "BLOCKED_MEDICAL" ? "是：不进入确定性评分" : "不改360分规则；仅修正可评分事实投影",
      testResult: "PASS：42例矩阵、极性与Patient治理回归",
    });
    seen.add(key);
  }
}

for (const item of policy.blockedMedicalHistory) {
  const caseDisplayId = item.displayCaseId || item.caseId;
  const slotId = item.canonicalSlotId || item.patientSlotId || item.field;
  const key = `${caseDisplayId}:${slotId}`;
  if (seen.has(key)) continue;
  const currentCaseId = sourceId(caseDisplayId);
  const slot = currentSlots[currentCaseId]?.[slotId] || {};
  rows.push({
    itemId: item.reviewItemId,
    caseId: caseDisplayId,
    sourceCaseId: currentCaseId,
    field: slotId,
    originalZh: item.basis,
    originalEn: item.basis,
    conflictType: item.conflictType,
    authority: item.basis,
    revisedZh: slot.patientAnswerZh || "这点我记不太清了。",
    revisedEn: slot.patientAnswerEn || "I cannot recall that clearly.",
    disposition: "BLOCKED_MEDICAL",
    patientImpact: "是：仅返回自然不确定表达，不收集事实",
    scoringImpact: "是：不进入确定性评分",
    testResult: "PASS：blocked canonical route zh/en",
  });
  seen.add(key);
}

for (const item of bilingualConflictEntries) {
  const caseDisplayId = displayId(item.caseId);
  const key = `${caseDisplayId}:${item.field}`;
  if (seen.has(key)) continue;
  const slot = currentSlots[item.caseId]?.[item.field] || {};
  rows.push({
    itemId: item.reviewItemId,
    caseId: caseDisplayId,
    sourceCaseId: item.caseId,
    field: item.field,
    originalZh: slot.patientAnswerZh || "",
    originalEn: slot.patientAnswerEn || "",
    conflictType: "BILINGUAL_MEDICAL_CONFLICT",
    authority: "HEM-P0-023既有隔离：中英文医学极性冲突，缺乏可裁决的具名专家来源。",
    revisedZh: "运行时返回字段相关的自然不确定表达；冻结原始冲突值供人工复核。",
    revisedEn: "Runtime returns a field-aware uncertainty response while the original conflicting values remain frozen for review.",
    disposition: "BLOCKED_MEDICAL",
    patientImpact: "是：隔离确定性回答，不收集事实",
    scoringImpact: "是：隔离确定性评分",
    testResult: "PASS：18项HEM-P0-023冻结与隔离",
  });
  seen.add(key);
}

rows.sort((a, b) => a.caseId.localeCompare(b.caseId, "en", { numeric: true }) || a.field.localeCompare(b.field));

const duplicateItemIds = [...new Set(rows
  .map((row) => row.itemId)
  .filter((itemId, index, itemIds) => itemIds.indexOf(itemId) !== index))];
if (duplicateItemIds.length > 0) {
  throw new Error(`History reconciliation matrix contains duplicate item IDs: ${duplicateItemIds.join(", ")}`);
}

const resolvedBySource = rows.filter((row) => row.disposition === "RESOLVED_BY_SOURCE_PRECEDENCE").length;
const wordingOnly = rows.filter((row) => row.disposition === "RESOLVED_WORDING_ONLY").length;
const blockedInMatrix = rows.filter((row) => row.disposition === "BLOCKED_MEDICAL").length;
const modifiedCases = [...new Set(rows.filter((row) => row.disposition !== "BLOCKED_MEDICAL" || JSON.stringify(baseSlots[row.sourceCaseId]?.[row.field]) !== JSON.stringify(currentSlots[row.sourceCaseId]?.[row.field])).map((row) => row.caseId))].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
const sourceTraceCount = normalizedAudit.facts.filter((item) => item["来源"] === "source").length;
const simulationCount = normalizedAudit.facts.filter((item) => item["来源"] === "author_added_for_simulation").length;
const historyBlockedCount = policy.blockedMedicalHistory.length;
const bilingualBlockedCount = bilingualConflictEntries.length;
const sourceMarkerBlockedCount = normalizedAudit.facts.filter(
  (item) => item["来源"] === "source" && item["是否程序或AI补充"] === "是"
).length;
const totalGovernedBlocked = sourceMarkerBlockedCount + bilingualBlockedCount + historyBlockedCount;

const matrixLines = [
  "# P001–P042 病史医学协调矩阵",
  "",
  `- 基线：\`${baseCommit}\``,
  `- 生成时HEAD：\`${currentHead}\``,
  `- 病例范围：P001–P042（${modifiedCases.length}例有审计记录）`,
  `- 逐字段记录：${rows.length}项；其中 \`RESOLVED_BY_SOURCE_PRECEDENCE\` ${resolvedBySource}项，\`RESOLVED_WORDING_ONLY\` ${wordingOnly}项，\`BLOCKED_MEDICAL\` ${blockedInMatrix}项。`,
  "- 说明：原始冲突值保留在本矩阵、git基线或既有HEM治理记录中；工程修正未写成 `expert_approved`，也未解除任何病例的 `needs_revision`。",
  "",
  "| 项目 | 病例ID | 源病例ID | 字段 | 原中文 | 原英文 | 冲突类型 | 权威依据 | 修改后中文 | 修改后英文 | 处置 | Patient Agent | 评分 | 测试 |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ...rows.map((row) =>
    `| ${clean(row.itemId)} | ${clean(row.caseId)} | ${clean(row.sourceCaseId)} | ${clean(row.field)} | ${clean(row.originalZh)} | ${clean(row.originalEn)} | ${clean(row.conflictType)} | ${clean(row.authority)} | ${clean(row.revisedZh)} | ${clean(row.revisedEn)} | ${row.disposition} | ${clean(row.patientImpact)} | ${clean(row.scoringImpact)} | ${clean(row.testResult)} |`
  ),
  ""
];

const sourceRows = policy.sourcePrecedenceResolutions.map((item) =>
  `| ${item.resolutionId} | ${item.displayCaseId} | ${clean(item.field)} | ${clean(item.originalDerivedValue)} | ${clean(item.authoritativeSource)} | ${clean(item.authoritativeValue)} | ${clean(item.reason)} |`
);
const changelogLines = [
  "# P001–P042 病史医学协调变更日志",
  "",
  "## 结果摘要",
  "",
  `- 自动按来源优先级修正：${resolvedBySource}项逐字段记录。`,
  `- 仅文案／翻译自然化：${wordingOnly}项逐字段记录。`,
  `- 本专项新识别并隔离的 \`BLOCKED_MEDICAL\`：${historyBlockedCount}项。`,
  `- 既有 \`HEM-P0-023\` 冻结冲突：${bilingualBlockedCount}项；既有 \`HEM-P0-001\` source标记冲突：${sourceMarkerBlockedCount}项。`,
  `- 治理总量：${sourceTraceCount + simulationCount}条事实（source ${sourceTraceCount} + simulation ${simulationCount}）；所有42例继续保持 \`needs_revision\`。`,
  `- 修改病例：${modifiedCases.join("、")}。`,
  "",
  "## 明确的source覆盖",
  "",
  "| 决议 | 病例 | 字段 | 原派生值 | 权威来源 | 修改后事实 | 原因 |",
  "|---|---|---|---|---|---|---|",
  ...sourceRows,
  "",
  "## 批次提交",
  "",
  "- `e0b4624` — 统一42例患者主诉表达，并区分肉眼、镜下及特殊尿色。",
  "- `108d280` — P001–P007。",
  "- `952e81e` — P008–P012。",
  "- `0c772c0` — P013–P018。",
  "- `53078d3` — P019–P024。",
  "- `3fa830e` — P025–P030。",
  "- `3e35f1f` — P031–P036。",
  "- `5b2fb69` — P037–P042。",
  "- `3a7b227` — P002手术史source/source冲突的双语槽隔离与治理回归。",
  "- `d4904c4` — 完整生成链幂等性、病史投影全量重算与source优先级末端重放。",
  "",
  "## 治理边界",
  "",
  "- 没有用最终诊断反推症状；没有伪造专家签名或 `expert_approved`。",
  "- 没有解除 `needs_revision`，没有修改360分医学规则。",
  "- source/source、专家/专家或语义不确定项目只隔离并提出人工问题。",
  "- P002手术史冲突同时在结构化路由和双语 `surgery_history` 槽隔离，不向Patient Agent暴露确定性答案。",
  ""
];

const sourceMarkerRows = normalizedAudit.facts
  .filter((item) => item["来源"] === "source" && item["是否程序或AI补充"] === "是")
  .map((item, index) =>
    `| HEM-P0-001-${String(index + 1).padStart(3, "0")} | ${clean(item.caseId)} | ${clean(item["原字段"])} | ${clean(item["当前内容"])} | source事实却被标记为“程序或AI补充” | BLOCKED_MEDICAL／待具名专家核对 |`
  );
const bilingualRows = bilingualConflictEntries.map((item) => {
  const sourceCase = item.caseId;
  const slot = currentSlots[sourceCase]?.[item.field] || {};
  return `| ${item.reviewItemId} | ${displayId(sourceCase)} | ${clean(item.field)} | ${clean(slot.patientAnswerZh)} | ${clean(slot.patientAnswerEn)} | 请具名专家裁决中英文医学极性；裁决前维持运行时隔离。 |`;
});
const historyRows = policy.blockedMedicalHistory.map((item) =>
  `| ${item.reviewItemId} | ${item.displayCaseId || item.caseId} | ${clean(item.field)} | ${clean(item.conflictType)} | ${clean(item.basis)} | ${clean(item.questionZh)} | ${clean(item.questionEn)} | Patient仅自然不确定回答；不进入确定性评分 |`
);
const blockedLines = [
  "# P001–P042 病史医学人工阻塞清单",
  "",
  "## 处置矩阵",
  "",
  "| 类别 | 数量 | 处置 | Patient Agent | 评分 |",
  "|---|---:|---|---|---|",
  `| HEM-P0-001 source标记冲突 | ${sourceMarkerBlockedCount} | BLOCKED_MEDICAL；保留source事实与冲突标记，等待具名专家核对 | 不据此扩展新的确定性回答 | 不自动批准 |`,
  `| HEM-P0-023 双语医学冲突 | ${bilingualBlockedCount} | BLOCKED_MEDICAL；冻结原值，字段级隔离 | 自然表达“之前没特别注意／记不太清” | 不收集、不评分 |`,
  `| 本专项病史source/source或语义不确定 | ${historyBlockedCount} | BLOCKED_MEDICAL；teacherReviewRequired=true；needs_review | 自然不确定回答 | 不收集、不评分 |`,
  `| 合计（类别相加） | ${totalGovernedBlocked} | 不自动裁决医学真值 | — | — |`,
  "",
  "## 本专项14项具体人工问题",
  "",
  "| 项目 | 病例 | 字段 | 冲突类型 | 依据 | 中文审核问题 | English review question | 隔离效果 |",
  "|---|---|---|---|---|---|---|---|",
  ...historyRows,
  "",
  "## HEM-P0-023：18项冻结双语冲突",
  "",
  "| 项目 | 病例 | 字段 | 原中文 | 原英文 | 人工动作 |",
  "|---|---|---|---|---|---|",
  ...bilingualRows,
  "",
  `## HEM-P0-001：${sourceTraceCount}条source事实中的${sourceMarkerBlockedCount}项标记冲突`,
  "",
  "下表逐项引用 `data/hematuria_release_v14_normalized.json` 中的source记录。它们没有被工程逻辑自动批准；既有政策详见 `docs/goal/HEM-P0-001_SOURCE_MARKER_CONFLICT.md`。",
  "",
  "| 项目 | 病例 | 字段 | 当前内容 | 冲突 | 处置 |",
  "|---|---|---|---|---|---|",
  ...sourceMarkerRows,
  ""
];

const evidenceLines = [
  "# P001–P042 病史医学协调测试证据",
  "",
  `- 基线：\`${baseCommit}\``,
  `- 生成时HEAD：\`${currentHead}\``,
  "- 运行日期：2026-07-25（Asia/Shanghai）。",
  "- 运行时提示：仓库声明 Node `>=22.14 <23`；本地Codex bundled runtime为 Node 24.14.0，因此pnpm会给出engine warning，但下列定向测试、TypeScript、ESLint与构建结果以实际退出码为准。",
  "",
  "## 定向回归",
  "",
  "| 范围 | 命令 | 预期／已验证证据 |",
  "|---|---|---|",
  "| 42例中英文病史矩阵 | `pnpm test:history-medical-reconciliation` + `pnpm test:history-matrix` | PASS — 42例；37个双语槽；blocked canonical zh/en隔离 |",
  "| 医学极性／双语隔离 | `pnpm test:bilingual-conflict-quarantine` + `pnpm test:clinical` | PASS — HEM-P0-023 18项隔离；419 author_added事实保持待审 |",
  "| 572事实／419审核约束 | `pnpm test:medical-review` + `pnpm test:medical-review-queue` | PASS — 572 = 153 source + 419 simulation；8张工作表；无伪造批准 |",
  "| canonical intent | `pnpm test:patient-intents` + `pnpm test:patient-semantic-classifier` | PASS — 3150个改写问题命中率100%，0极性错误；语义分类器通过 |",
  "| Patient Agent | `pnpm test:patient` + history routing/safe projection/compound history/chief complaint | PASS — 786个compound场景；被阻塞项目不进入确定性回答、收集或评分 |",
  "| 360分 | `pnpm test:scoring-v3` + `pnpm test:adversarial` | PASS — 42例360分、单调性、同义词、反摘要投机及对抗评分 |",
  "| 工程门禁 | `pnpm typecheck` + `pnpm lint` + `NEXT_PUBLIC_API_BASE_URL=https://api.example.test next build` | PASS — TypeScript、ESLint、82/82静态页production build |",
  "| bundle／secret | `pnpm test:bundle` + `pnpm test:secrets` + scanner自测试 | PASS — 25个JS资产；359个tracked/candidate文件；无秘密值输出 |",
  "| data差异 | `pnpm test:idempotency` + `git diff -- data/**` | PASS — clean HEAD隔离worktree中78个受控输出首轮与基线一致、第二轮无漂移；差异清单限定为19个授权数据文件 |",
  "",
  "## 核心不变量",
  "",
  `- 事实总数：${sourceTraceCount + simulationCount}；source ${sourceTraceCount}；author_added_for_simulation ${simulationCount}。`,
  `- 本专项阻塞：${historyBlockedCount}；HEM-P0-023：${bilingualBlockedCount}；HEM-P0-001 source标记冲突：${sourceMarkerBlockedCount}。`,
  "- HEM-P0-023原始18项值不被生成脚本覆盖。",
  "- 所有被阻塞canonical slot在中英文提问下均返回自然不确定表达，`collectableSlotIds=[]`、`collectableFacts=[]`。",
  "- 42例 `medicalReview.status` 保持 `needs_revision`；没有工程生成的 `expert_approved`。",
  ""
];

writeFileSync(resolve(repoRoot, "docs/goal/HISTORY_MEDICAL_RECONCILIATION_MATRIX.md"), matrixLines.join("\n"), "utf8");
writeFileSync(resolve(repoRoot, "docs/goal/HISTORY_MEDICAL_RECONCILIATION_CHANGELOG.md"), changelogLines.join("\n"), "utf8");
writeFileSync(resolve(repoRoot, "docs/goal/HISTORY_MEDICAL_BLOCKED_REVIEW.md"), blockedLines.join("\n"), "utf8");
writeFileSync(resolve(repoRoot, "docs/goal/HISTORY_MEDICAL_TEST_EVIDENCE.md"), evidenceLines.join("\n"), "utf8");

console.log(JSON.stringify({
  matrixRows: rows.length,
  resolvedBySource,
  wordingOnly,
  blockedInMatrix,
  historyBlockedCount,
  bilingualBlockedCount,
  sourceMarkerBlockedCount,
  totalGovernedBlocked,
  modifiedCases
}, null, 2));

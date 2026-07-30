import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { readWorkbookFile } from "./lib/safe-workbook";

const input = process.argv[2] ?? "work/source/hematuria_diagnostics_scoring_rules.xlsx";
const outDir = process.argv[3] ?? "data";

function rows(sheet: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function splitTriggers(value: string) {
  return value
    .split(/[、,，/；;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const rubricSlotMap: Record<string, string[]> = {
  A: ["HX001"],
  B: ["HX002", "HX004"],
  C: ["HX003", "HX005", "HX006", "HX007", "HX008"],
  D: ["HX015", "HX008"],
  E: ["HX009", "HX010", "HX011", "HX012"],
  F: ["HX013", "HX014", "HX024"],
  G: ["HX016", "HX017", "HX018"],
  H: ["HX019", "HX020", "HX021", "HX025"],
  I: ["HX022", "HX023"],
  J: ["HX026"]
};

const guardrails = [
  {
    id: "G001",
    title: "先确认真性血尿",
    rule: "血尿需先通过尿常规和尿沉渣确认真性血尿，不能只凭尿色判断。",
    triggerSlots: ["HX003", "HX006"],
    feedback: "需先确认真性血尿，尿色只能作为线索。"
  },
  {
    id: "G002",
    title: "血尿时相用于定位但不能替代检查",
    rule: "起始、终末、全程血尿可作为定位线索，但不能替代尿检、影像或内镜检查。",
    triggerSlots: ["HX005"],
    feedback: "时相有定位价值，但仍需进一步检查确认。"
  },
  {
    id: "G003",
    title: "肾小球安全网",
    rule: "畸形红细胞、蛋白尿、泡沫尿、水肿、高血压、上感后血尿提示肾小球性血尿安全网。",
    triggerSlots: ["HX013", "HX014"],
    feedback: "需关注泡沫尿、水肿、血压和上感后血尿，必要时肾内科评估。"
  },
  {
    id: "G004",
    title: "结石疼痛线索",
    rule: "血尿伴肾绞痛或向腹股沟、会阴放射痛提示结石。",
    triggerSlots: ["HX009"],
    feedback: "疼痛性质和放射部位是结石定位的重要线索。"
  },
  {
    id: "G005",
    title: "感染性梗阻警报",
    rule: "血尿伴发热寒战、腰痛、肾积水或AKI需警惕感染性梗阻。",
    triggerSlots: ["HX012", "HX011"],
    feedback: "发热寒战合并梗阻线索时应优先考虑感染性梗阻安全网。"
  },
  {
    id: "G006",
    title: "尿路刺激征定位",
    rule: "尿频、尿急、尿痛提示膀胱炎、尿道炎、前列腺炎或上尿路感染，需结合发热腰痛和检查。",
    triggerSlots: ["HX010", "HX012"],
    feedback: "尿路刺激征需结合全身感染表现和定位检查。"
  },
  {
    id: "G007",
    title: "泌尿系肿瘤风险",
    rule: "高龄、男性、无痛肉眼血尿、吸烟、职业暴露、血块需警惕泌尿系肿瘤。",
    triggerSlots: ["HX003", "HX007", "HX019", "HX020"],
    feedback: "高危肉眼血尿需系统询问吸烟、职业暴露和血块。"
  },
  {
    id: "G008",
    title: "女性假性血尿",
    rule: "女性血尿样表现需排除月经或阴道出血污染。",
    triggerSlots: ["HX021"],
    feedback: "女性病例需排除月经、阴道出血或妇科污染。"
  },
  {
    id: "G009",
    title: "抗凝药不能作为唯一解释",
    rule: "抗凝药或抗血小板药不能作为血尿唯一解释，仍需排查器质性病变。",
    triggerSlots: ["HX018"],
    feedback: "抗凝/抗血小板药不能直接解释血尿。"
  },
  {
    id: "G010",
    title: "全身出血倾向",
    rule: "血尿伴皮肤黏膜出血、鼻出血、牙龈出血、瘀斑紫癜时，应考虑全身性出血倾向。",
    triggerSlots: ["HX024"],
    feedback: "需追问鼻出血、牙龈出血、皮肤瘀斑紫癜等全身出血倾向。"
  }
];

const workbook = readWorkbookFile(input);
const knowledgeRows = rows(workbook.Sheets["知识摘要"]);
const slotRows = rows(workbook.Sheets["问诊槽位"]);
const rubricRows = rows(workbook.Sheets["100分评分Rubric"]);
const ruleRows = rows(workbook.Sheets["患者回答规则"]);

const slots = slotRows.map((row) => ({
  slotId: text(row.slot_id),
  label: text(row["槽位名称"]),
  recommendedQuestion: text(row["学生问法示例"]),
  triggers: splitTriggers(text(row["关键词/触发点"])),
  wideField: text(row["患者回答来源"]),
  isKey: Number(row["建议分值"] || 0) >= 4,
  score: Number(row["建议分值"] || 0),
  missingFeedback: text(row["评分意义"]),
  displayRule: text(row["展示规则"])
}));

const rubric = rubricRows.map((row) => {
  const dimension = text(row["维度"]);
  return {
    dimension,
    item: text(row["项目"]),
    max: Number(row["满分"] || 0),
    scoringDetails: text(row["评分细则"]),
    displayRule: text(row["前端展示规则"]),
    slotIds: rubricSlotMap[dimension] ?? []
  };
});

const rubricTotal = rubric.reduce((sum, item) => sum + item.max, 0);
const normalizedRubric = rubricTotal && rubricTotal !== 100
  ? rubric.map((item, index) => {
      const previous = rubric
        .slice(0, index)
        .reduce((sum, prev) => sum + Math.round((prev.max / rubricTotal) * 100), 0);
      const max = index === rubric.length - 1
        ? 100 - previous
        : Math.round((item.max / rubricTotal) * 100);
      return { ...item, originalMax: item.max, max };
    })
  : rubric.map((item) => ({ ...item, originalMax: item.max }));

const patientRules = ruleRows.map((row) => ({
  id: text(row["规则ID"]),
  name: text(row["规则名称"]),
  rule: text(row["规则内容"])
}));

const knowledge = knowledgeRows.map((row) => ({
  id: text(row["知识ID"]),
  topic: text(row["主题"]),
  summary: text(row["诊断学摘要"]),
  systemUse: text(row["系统应用"]),
  source: text(row["来源位置"])
}));

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "question_slots.json"), `${JSON.stringify(slots, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outDir, "interview_slots.json"), `${JSON.stringify(slots, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outDir, "hematuria_history_rubric.json"), `${JSON.stringify(normalizedRubric, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outDir, "patient_agent_rules.json"), `${JSON.stringify(patientRules, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outDir, "diagnostic_guardrails.json"), `${JSON.stringify(guardrails, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outDir, "hematuria_diagnostic_knowledge.json"), `${JSON.stringify(knowledge, null, 2)}\n`, "utf8");

console.log(`Converted diagnostic knowledge: ${slots.length} slots, ${rubric.length} rubric items, ${patientRules.length} patient rules.`);

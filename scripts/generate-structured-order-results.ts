import fs from "node:fs";
import casesJson from "../data/cases.json";
import labsJson from "../data/order_catalog_labs.json";
import imagingJson from "../data/order_catalog_imaging.json";
import proceduresJson from "../data/order_catalog_procedures.json";
import perioperativeJson from "../data/order_catalog_perioperative.json";
import legacyResultsJson from "../data/order_results.json";
import type { CaseData, OrderCatalogItem, OrderResultItem } from "../src/lib/types";

type StructuredOrderResult = {
  resultId: string;
  caseId: string;
  orderId: string;
  status: "final" | "not_available" | "not_performed";
  value: string;
  unit: string;
  referenceRange: string;
  impression: string;
  abnormalFlags: string[];
  availableAt: "immediate" | "delayed";
  prerequisites: string[];
  sourceVersion: string;
};

const catalogs = [...labsJson, ...imagingJson, ...proceduresJson, ...perioperativeJson] as OrderCatalogItem[];
const cases = casesJson as CaseData[];
const legacyResults = legacyResultsJson as OrderResultItem[];
const normalize = (text: string) => String(text || "").toLowerCase().replace(/[\s+＋/｜|()（）_-]/g, "");

const explicitLegacyMap: Record<string, string> = {
  LAB_URINE_ROUTINE: "LAB-UR-001", LAB_URINE_CULTURE: "LAB-UR-008", LAB_URINE_CYTOLOGY: "LAB-UR-006",
  LAB_RBC_MORPH: "LAB-UR-003", LAB_UPCR: "LAB-UR-004", LAB_CBC: "LAB-BL-001", LAB_RENAL: "LAB-BL-003",
  LAB_CRP_PCT: "LAB-BL-002", LAB_COAG: "LAB-BL-006", IMG_US: "IMG-US-001", IMG_CTU: "IMG-CT-002",
  IMG_CT_KUB: "IMG-CT-001", IMG_MRI: "IMG-MR-001", PROC_CYSTOSCOPY: "END-001", PROC_TURBT_PATH: "LAB-PATH-001",
  PROC_RENAL_BIOPSY: "LAB-PATH-003"
};

function exactCatalogOrder(result: OrderResultItem) {
  if (result.orderId && explicitLegacyMap[result.orderId]) return explicitLegacyMap[result.orderId];
  const resultNames = new Set((result.synonyms || []).map(normalize).filter(Boolean));
  const exact = catalogs.filter((catalog) => [catalog.displayName, ...(catalog.synonyms || [])].some((name) => resultNames.has(normalize(name))));
  if (exact.length === 1) return exact[0].orderId;
  const displayExact = exact.find((catalog) => resultNames.has(normalize(catalog.displayName)));
  return displayExact?.orderId || null;
}

function prerequisites(orderId: string) {
  if (orderId === "IMG-CT-002") return ["LAB-BL-003"];
  if (orderId === "LAB-PATH-001") return ["END-002"];
  if (orderId === "LAB-PATH-003") return ["LAB-BL-006"];
  return [];
}

function p008Override(orderId: string): Partial<StructuredOrderResult> | null {
  if (orderId === "LAB-BL-001") return { status: "not_available", value: "", impression: "病例原始资料未提供血常规具体数值。", abnormalFlags: [] };
  if (orderId === "LAB-BL-003") return { status: "not_available", value: "", impression: "病例原始资料未提供肌酐或eGFR具体数值。", abnormalFlags: [] };
  if (orderId === "IMG-CT-002") return { status: "final", value: "盆腔CT显示膀胱内多发结石，约1-2 cm；前列腺约54×43×42 mm。", impression: "膀胱多发结石并前列腺增大；该报告不混入尿动力、心肺评估或病理内容。", abnormalFlags: ["bladder_stones", "prostate_enlargement"] };
  if (orderId === "LAB-PATH-001") return { status: "not_performed", value: "", impression: "本例未实施TURBT，故无TURBT病理结果。", abnormalFlags: [] };
  return null;
}

const resultKeywords: Record<string, RegExp> = {
  "LAB-UR-001": /尿常规|尿检|红细胞|潜血|白细胞|蛋白尿/i,
  "LAB-UR-002": /尿沉渣|镜检|红细胞形态|管型/i,
  "LAB-UR-003": /红细胞形态|相差显微镜|畸形红细胞/i,
  "LAB-UR-004": /UPCR|ACR|尿蛋白\/肌酐|24小时尿蛋白/i,
  "LAB-UR-006": /尿细胞学|脱落细胞/i,
  "LAB-UR-008": /尿培养|药敏|菌落/i,
  "LAB-BL-001": /血常规|血红蛋白|白细胞|中性粒|血小板/i,
  "LAB-BL-002": /CRP|PCT|降钙素原|炎症指标/i,
  "LAB-BL-003": /肾功能|肌酐|eGFR|尿素氮/i,
  "LAB-BL-006": /凝血|INR|APTT|PT\b/i,
  "IMG-US-001": /超声|彩超|B超/i,
  "IMG-CT-001": /CT\s*KUB|CTKUB|泌尿系CT平扫|非增强CT|低剂量CT/i,
  "IMG-CT-002": /CTU|泌尿系增强CT|尿路造影CT/i,
  "IMG-MR-001": /MRI|磁共振|盆腔MR|mpMRI/i,
  "END-001": /膀胱镜(?!.*建议)|镜下见|内镜/i,
  "LAB-PATH-001": /TURBT病理|病理(?:提示|诊断|结果)|尿路上皮癌/i,
  "LAB-PATH-003": /肾活检|肾穿刺病理|免疫荧光/i
};

function resultLines(caseData: CaseData | undefined) {
  if (!caseData) return [];
  const investigationLines = (caseData.investigations || []).flatMap((item) => String(item.result || "").split(/\n|；|;/));
  const specialLines = String(caseData.clinical?.specialTests || "").split(/\n|；|;/);
  const urineLines = caseData.urineTestResult ? [`尿检：${caseData.urineTestResult}`] : [];
  return [...investigationLines, ...specialLines, ...urineLines].map((line) => line.trim()).filter(Boolean);
}

function exactCaseResult(caseData: CaseData | undefined, orderId: string) {
  const pattern = resultKeywords[orderId];
  if (!pattern) return "";
  const matches = resultLines(caseData).filter((line) => pattern.test(line));
  return [...new Set(matches)].join("\n");
}

const structured: StructuredOrderResult[] = [];
const mappings: Array<{ caseId: string; orderId: string; resultId: string }> = [];
const seen = new Set<string>();
for (const legacy of legacyResults) {
  const orderId = exactCatalogOrder(legacy);
  if (!orderId) continue;
  const uniqueKey = `${legacy.caseId}:${orderId}`;
  if (seen.has(uniqueKey)) continue;
  seen.add(uniqueKey);
  const caseData = cases.find((item) => item.id === legacy.caseId);
  const override = legacy.caseId === "P008" ? p008Override(orderId) : null;
  const exactValue = exactCaseResult(caseData, orderId);
  const resultId = `${legacy.caseId}:${orderId}:v1`;
  const result: StructuredOrderResult = {
    resultId,
    caseId: legacy.caseId,
    orderId,
    status: exactValue ? "final" : "not_available",
    value: exactValue,
    unit: "",
    referenceRange: "",
    impression: exactValue || "病例原始资料未提供该项目的可独立归属结果。",
    abnormalFlags: [],
    availableAt: /病理|培养/.test(`${legacy.orderCategory} ${legacy.synonyms?.join(" ")}`) ? "delayed" : "immediate",
    prerequisites: prerequisites(orderId),
    sourceVersion: caseData?.caseVersion || "42-case-2.3",
    ...override
  };
  structured.push(result);
  mappings.push({ caseId: legacy.caseId, orderId, resultId });
}

structured.sort((a, b) => `${a.caseId}:${a.orderId}`.localeCompare(`${b.caseId}:${b.orderId}`));
mappings.sort((a, b) => `${a.caseId}:${a.orderId}`.localeCompare(`${b.caseId}:${b.orderId}`));
fs.writeFileSync("data/order_results_structured.json", `${JSON.stringify(structured, null, 2)}\n`, "utf8");
fs.writeFileSync("data/order_result_map.json", `${JSON.stringify(mappings, null, 2)}\n`, "utf8");
console.log(`Generated ${structured.length} exact caseId + orderId results; ${legacyResults.length - structured.length} legacy rows intentionally remain unmapped.`);

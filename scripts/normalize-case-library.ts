import fs from "node:fs";
import path from "node:path";
import { validateCaseLibrary } from "../src/lib/caseSchema";
import { simplifiedChiefComplaintEn } from "../src/lib/chiefComplaint";
import type { CaseData, MdtTrigger, OrderResultItem, PhysicalExamResult } from "../src/lib/types";

type MutableCase = CaseData & Record<string, unknown>;

const root = process.cwd();
const dataDir = path.join(root, "data");
const reviewDate = "2026-07-10";
const references = [
  { title: "AUA/SUFU Microhematuria Guideline (2025 amendment)", url: "https://www.auanet.org/guidelines-and-quality/guidelines/microhematuria" },
  { title: "EAU Guidelines on Urological Infections", url: "https://uroweb.org/guidelines/urological-infections" },
  { title: "EAU Guidelines on Urolithiasis", url: "https://uroweb.org/guidelines/urolithiasis" },
  { title: "EAU Guidelines on Non-muscle-invasive Bladder Cancer", url: "https://uroweb.org/guidelines/non-muscle-invasive-bladder-cancer" },
  { title: "KDIGO 2025 IgA Nephropathy/IgA Vasculitis Guideline", url: "https://kdigo.org/guidelines/iga-nephropathy/" }
];

const supplementMetadata: Record<string, { major: string; sub: string; difficulty: "基础" | "标准" | "挑战" }> = {
  "HX-ADD-001": { major: "泌尿系肿瘤", sub: "膀胱尿路上皮癌", difficulty: "挑战" },
  "HX-ADD-002": { major: "泌尿系肿瘤", sub: "膀胱癌/感染样表现", difficulty: "挑战" },
  "HX-ADD-003": { major: "泌尿系肿瘤", sub: "上尿路尿路上皮癌", difficulty: "挑战" },
  "HX-ADD-004": { major: "泌尿系肿瘤", sub: "肾细胞癌", difficulty: "挑战" },
  "HX-ADD-005": { major: "药物/凝血相关", sub: "抗凝相关血尿并器质性病变排查", difficulty: "挑战" },
  "HX-ADD-006": { major: "感染", sub: "急性膀胱炎", difficulty: "基础" },
  "HX-ADD-007": { major: "感染", sub: "急性肾盂肾炎/系统性UTI", difficulty: "标准" },
  "HX-ADD-008": { major: "感染", sub: "急性细菌性前列腺炎", difficulty: "标准" },
  "HX-ADD-009": { major: "感染", sub: "复杂性尿路感染", difficulty: "标准" },
  "HX-ADD-010": { major: "感染", sub: "复发性UTI后持续血尿", difficulty: "挑战" },
  "HX-ADD-011": { major: "结石", sub: "输尿管结石", difficulty: "标准" },
  "HX-ADD-012": { major: "结石", sub: "肾盂/肾盏结石", difficulty: "标准" },
  "HX-ADD-013": { major: "结石", sub: "膀胱结石", difficulty: "标准" },
  "HX-ADD-014": { major: "结石", sub: "感染性鹿角形结石", difficulty: "挑战" },
  "HX-ADD-015": { major: "结石", sub: "尿酸结石", difficulty: "标准" },
  "HX-ADD-016": { major: "前列腺疾病", sub: "良性前列腺增生相关血尿", difficulty: "标准" },
  "HX-ADD-017": { major: "前列腺疾病", sub: "BPH急性尿潴留/导尿相关血尿", difficulty: "挑战" },
  "HX-ADD-018": { major: "前列腺疾病", sub: "前列腺癌相关血尿", difficulty: "挑战" },
  "HX-ADD-019": { major: "肾小球疾病", sub: "IgA肾病", difficulty: "标准" },
  "HX-ADD-020": { major: "肾小球疾病", sub: "感染后急性肾小球肾炎", difficulty: "标准" },
  "HX-ADD-021": { major: "肾小球疾病", sub: "薄基底膜肾病", difficulty: "标准" },
  "HX-ADD-022": { major: "肾小球疾病", sub: "Alport综合征", difficulty: "挑战" },
  "HX-ADD-023": { major: "肾小球疾病", sub: "狼疮性肾炎", difficulty: "挑战" },
  "HX-ADD-024": { major: "功能性血尿", sub: "运动性血尿", difficulty: "基础" },
  "HX-ADD-025": { major: "假性血尿", sub: "月经污染/妇科来源", difficulty: "基础" },
  "HX-ADD-026": { major: "外伤", sub: "肾挫伤/泌尿系外伤", difficulty: "挑战" },
  "HX-ADD-027": { major: "肾实质/结构性疾病", sub: "肾乳头坏死", difficulty: "挑战" },
  "HX-ADD-028": { major: "肾实质/结构性疾病", sub: "多囊肾囊肿出血", difficulty: "挑战" },
  "HX-ADD-029": { major: "血管性疾病", sub: "胡桃夹综合征", difficulty: "挑战" },
  "HX-ADD-030": { major: "泌尿系肿瘤", sub: "高危无症状镜下血尿", difficulty: "挑战" }
};

const supplementTitlesEn: Record<string, string> = {
  "HX-ADD-001": "Bladder urothelial carcinoma", "HX-ADD-002": "Bladder cancer mimicking recurrent UTI", "HX-ADD-003": "Upper tract urothelial carcinoma", "HX-ADD-004": "Renal cell carcinoma", "HX-ADD-005": "Hematuria during anticoagulation requiring structural evaluation",
  "HX-ADD-006": "Acute cystitis", "HX-ADD-007": "Acute pyelonephritis / systemic UTI", "HX-ADD-008": "Acute bacterial prostatitis", "HX-ADD-009": "Complicated UTI associated with diabetes", "HX-ADD-010": "Persistent hematuria after recurrent UTI",
  "HX-ADD-011": "Ureteral stone", "HX-ADD-012": "Renal pelvic/calyceal stone", "HX-ADD-013": "Bladder stone", "HX-ADD-014": "Infected staghorn calculus", "HX-ADD-015": "Uric acid stone",
  "HX-ADD-016": "BPH-associated hematuria", "HX-ADD-017": "Acute urinary retention from BPH with catheter-associated hematuria", "HX-ADD-018": "Prostate cancer presenting with hematuria", "HX-ADD-019": "IgA nephropathy", "HX-ADD-020": "Post-infectious acute glomerulonephritis",
  "HX-ADD-021": "Thin basement membrane nephropathy", "HX-ADD-022": "Alport syndrome", "HX-ADD-023": "Lupus nephritis", "HX-ADD-024": "Exercise-induced hematuria", "HX-ADD-025": "Menstrual contamination / pseudohematuria",
  "HX-ADD-026": "Renal contusion / urinary tract trauma", "HX-ADD-027": "Renal papillary necrosis", "HX-ADD-028": "Bleeding renal cyst in polycystic kidney disease", "HX-ADD-029": "Nutcracker syndrome", "HX-ADD-030": "High-risk asymptomatic microscopic hematuria"
};

const categoryEn: Record<string, string> = {
  "泌尿系肿瘤": "Urologic oncology", "感染": "Infection", "结石": "Urolithiasis", "前列腺疾病": "Prostatic disease", "肾小球疾病": "Glomerular disease", "外伤": "Trauma", "假性血尿": "Pseudohematuria", "药物/凝血相关": "Medication/coagulation related", "功能性血尿": "Functional hematuria", "肾实质/结构性疾病": "Renal structural disease", "血管性疾病": "Vascular disease"
};
const difficultyEn: Record<string, string> = { "基础": "Foundation", "标准": "Standard", "挑战": "Challenging" };

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8")) as T;
}

function writeJson(file: string, value: unknown) {
  fs.writeFileSync(path.join(dataDir, file), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeTerminology(value: string) {
  return (value || "").replace(/IGA肾病/gi, "IgA肾病").replace(/CT\s*KUB/gi, "CT KUB").replace(/eGFR/gi, "eGFR");
}

function normalizeStringsDeep<T>(value: T): T {
  if (typeof value === "string") return normalizeTerminology(value) as T;
  if (Array.isArray(value)) return value.map(normalizeStringsDeep) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeStringsDeep(item)])) as T;
  }
  return value;
}

function majorCategory(caseData: MutableCase) {
  const override = supplementMetadata[caseData.id];
  if (override) return override;
  const source = `${caseData.diseaseCategory || ""} ${caseData.diagnosis || ""}`;
  if (/假性|月经污染|阴道/.test(source)) return { major: "假性血尿", sub: caseData.diagnosis, difficulty: caseData.difficulty || "标准" };
  if (/外伤|挫伤|车祸/.test(source)) return { major: "外伤", sub: caseData.diagnosis, difficulty: caseData.difficulty || "挑战" };
  if (/肾小球|IgA|Alport|薄基底膜|狼疮性肾炎/.test(source)) return { major: "肾小球疾病", sub: caseData.diagnosis, difficulty: caseData.difficulty || "标准" };
  if (/前列腺|BPH/.test(source)) return { major: "前列腺疾病", sub: caseData.diagnosis, difficulty: caseData.difficulty || "标准" };
  if (/癌|肿瘤|恶性/.test(source)) return { major: "泌尿系肿瘤", sub: caseData.diagnosis, difficulty: caseData.difficulty || "挑战" };
  if (/感染|膀胱炎|肾盂肾炎|尿路/.test(source)) return { major: "感染", sub: caseData.diagnosis, difficulty: caseData.difficulty || "标准" };
  if (/结石/.test(source)) return { major: "结石", sub: caseData.diagnosis, difficulty: caseData.difficulty || "标准" };
  return { major: "肾实质/结构性疾病", sub: caseData.diagnosis, difficulty: caseData.difficulty || "挑战" };
}

function differentialFor(caseData: MutableCase, major: string) {
  const dx = caseData.diagnosis;
  if (/膀胱/.test(dx) && /癌|肿瘤/.test(dx)) return ["尿路感染", "膀胱结石", "上尿路尿路上皮癌", "良性前列腺增生相关出血"];
  if (/输尿管癌|肾盂癌|上尿路尿路上皮癌/.test(dx)) return ["肾细胞癌", "输尿管结石", "血块或炎症性狭窄", "膀胱尿路上皮癌"];
  if (/肾癌|肾细胞癌/.test(dx)) return ["上尿路尿路上皮癌", "复杂性肾囊肿", "肾血管平滑肌脂肪瘤", "肾结石"];
  if (/前列腺癌/.test(dx)) return ["良性前列腺增生", "前列腺炎", "膀胱肿瘤", "尿路感染"];
  if (/前列腺增生|BPH/.test(dx)) return ["前列腺癌", "膀胱颈挛缩", "尿道狭窄", "神经源性膀胱"];
  if (/抗凝/.test(dx)) return ["膀胱肿瘤", "上尿路尿路上皮癌", "尿路感染", "泌尿系结石"];
  if (/膀胱炎/.test(dx)) return ["尿道炎", "急性肾盂肾炎", "泌尿系结石", "月经或阴道出血污染"];
  if (/肾盂肾炎|系统性UTI/.test(dx)) return ["感染性梗阻结石", "急性膀胱炎", "肾脓肿", "盆腔炎"];
  if (/前列腺炎/.test(dx)) return ["急性膀胱炎", "良性前列腺增生并感染", "前列腺脓肿", "尿道炎"];
  if (/鹿角形/.test(dx)) return ["感染性梗阻结石", "肾盂肾炎", "肾结核", "肾盂肿瘤"];
  if (/输尿管结石/.test(dx)) return ["急性肾盂肾炎", "肾梗死", "阑尾炎或胆道疾病", "上尿路尿路上皮癌"];
  if (/肾盂|肾盏|肾结石|尿酸结石/.test(dx)) return ["输尿管结石", "急性肾盂肾炎", "肾盂肿瘤", "肾乳头坏死"];
  if (/膀胱结石/.test(dx)) return ["良性前列腺增生", "膀胱肿瘤", "尿路感染", "尿道狭窄"];
  if (/IgA/.test(dx)) return ["感染后肾小球肾炎", "薄基底膜肾病", "Alport综合征", "狼疮性肾炎"];
  if (/感染后急性肾小球肾炎/.test(dx)) return ["IgA肾病", "狼疮性肾炎", "膜增生性肾小球肾炎", "溶血尿毒综合征"];
  if (/薄基底膜/.test(dx)) return ["Alport综合征", "IgA肾病", "泌尿系结石", "高钙尿症"];
  if (/Alport/.test(dx)) return ["薄基底膜肾病", "IgA肾病", "遗传性耳聋伴非肾性血尿", "其他遗传性肾病"];
  if (/狼疮/.test(dx)) return ["IgA肾病", "ANCA相关性血管炎", "感染后肾小球肾炎", "抗GBM病"];
  if (/运动性/.test(dx)) return ["IgA肾病", "泌尿系结石", "横纹肌溶解所致色素尿", "泌尿系外伤"];
  if (/月经|假性/.test(dx)) return ["真性镜下血尿", "阴道或宫颈出血", "色素尿", "尿路感染"];
  if (/外伤|挫伤/.test(dx)) return ["肾裂伤", "肾血管损伤", "膀胱破裂", "尿道损伤"];
  if (/乳头坏死/.test(dx)) return ["泌尿系结石", "急性肾盂肾炎", "上尿路尿路上皮癌", "肾结核"];
  if (/多囊肾/.test(dx)) return ["囊肿感染", "泌尿系结石", "肾细胞癌", "肾梗死"];
  if (/胡桃夹/.test(dx)) return ["IgA肾病", "泌尿系结石", "子宫内膜异位症", "左肾静脉血栓"];
  if (/高危无症状镜下/.test(dx)) return ["膀胱肿瘤", "上尿路尿路上皮癌", "肾小球性血尿", "泌尿系结石"];
  if (major === "感染") return ["尿路结石", "尿路上皮肿瘤", "肾小球性血尿", "妇科污染"];
  if (major === "结石") return ["尿路感染", "尿路上皮肿瘤", "肾梗死", "肾小球性血尿"];
  return ["泌尿系肿瘤", "泌尿系结石", "尿路感染", "肾小球性血尿"];
}

function managementFor(caseData: MutableCase, major: string) {
  const dx = caseData.diagnosis;
  if (/抗凝/.test(dx)) return {
    immediate: "评估生命体征、血红蛋白、凝血和肾功能；根据出血严重度处理血块尿潴留。核实抗凝指征并与相关专科共同评估停药或调整，不能自行把血尿归因于抗凝药。",
    definitive: "完成风险分层的泌尿系器质性病变评估；治疗明确病因。围操作期抗栓方案由泌尿外科、心内科/神经内科、血液科和麻醉科共同决定。",
    perioperative: "记录末次抗凝用药时间、肾功能、血栓风险和操作出血风险；制定停药、必要时桥接及恢复用药方案，并准备止血和输血预案。",
    followUp: "复查尿常规、血常规和肾功能；按病因随访，教育患者出现大量血尿、血块、尿潴留或头晕乏力时立即就诊。",
    critical: ["将抗凝或抗血小板药作为血尿唯一解释", "未评估血栓风险即自行停药"]
  };
  if (/鹿角形/.test(dx)) return {
    immediate: "留取尿培养和必要时血培养，评估脓毒症、AKI和梗阻；感染合并梗阻时先抗感染并紧急支架或肾造瘘引流。",
    definitive: "感染控制后根据结石负荷和解剖制定分期PCNL等清石方案，争取清除感染性结石并依据培养调整抗菌药。",
    perioperative: "确认尿培养转阴或感染受控，评估肾功能、凝血、贫血和麻醉风险，准备脓毒症监测及引流方案。",
    followUp: "复查尿培养、肾功能和影像；完成结石成分及代谢评估，强化饮水和复发预防。",
    critical: ["感染未控制或未引流即直接碎石", "脓毒症时延误复苏和引流"]
  };
  if (major === "结石") return {
    immediate: "评估生命体征、疼痛、感染、尿量、肾功能和梗阻；给予适当镇痛止吐。合并感染性梗阻、孤立肾或AKI时优先急诊引流。",
    definitive: "根据结石位置、大小、密度、解剖和患者因素选择观察排石、SWL、输尿管镜或PCNL；处理相关梗阻和感染。",
    perioperative: "术前完成尿培养、血常规、肾功能、电解质、凝血和麻醉评估；感染控制后再实施确定性清石。",
    followUp: "影像确认清石和解除梗阻；进行结石成分与代谢评估，制定饮水、饮食和药物预防方案。",
    critical: ["感染性梗阻未引流即碎石", "未评估肾功能和感染"]
  };
  if (major === "感染") return {
    immediate: "评估是否系统性感染或脓毒症；规范留取尿培养，必要时血培养，给予经验性抗感染和支持治疗。若合并梗阻，必须同步紧急引流。",
    definitive: "依据培养和药敏调整抗菌药，处理结石、残余尿、糖尿病、导尿等复杂因素；持续血尿需进入完整血尿评估路径。",
    perioperative: "有操作指征时先控制感染，复核培养、肾功能和凝血；避免感染未控制时进行择期侵入性操作。",
    followUp: "按病情复查症状、尿常规和培养；复发感染需评估解剖和功能因素，血尿不消失时排查肿瘤、结石或肾小球病。",
    critical: ["脓毒症或感染性梗阻未及时识别", "未留取培养即长期盲目用药"]
  };
  if (major === "前列腺疾病") return {
    immediate: "评估尿潴留、血块、感染和肾功能；急性尿潴留时规范导尿，血块堵塞时考虑三腔导尿和膀胱冲洗。",
    definitive: /前列腺癌/.test(dx) ? "结合PSA、直肠指检、前列腺MRI和必要时穿刺病理完成诊断分期，再制定监测、手术、放疗或系统治疗。" : "评估症状、残余尿和前列腺体积，采用药物治疗；反复潴留、出血、感染或肾功能受损时评估手术。",
    perioperative: "评估感染、肾功能、贫血、抗栓用药和麻醉风险；明确PSA受感染、潴留和操作影响，制定导尿与术后尿路管理方案。",
    followUp: "复查下尿路症状、残余尿、尿常规和肾功能；按诊断进行PSA、影像或肿瘤随访。",
    critical: ["尿潴留或血块堵塞未及时解除", "仅凭PSA直接诊断前列腺癌"]
  };
  if (major === "肾小球疾病") return {
    immediate: "评估血压、尿量、水肿、肾功能、电解质和尿蛋白；出现AKI、严重高血压、肺水肿或少尿时紧急肾内科处理。",
    definitive: "由肾内科结合尿沉渣红细胞形态、蛋白定量、免疫学和必要时肾活检明确病理类型，实施支持治疗和病因特异治疗。",
    perioperative: "如需肾活检或其他操作，评估血压、血小板、凝血、肾功能和感染；做好出血监测并调整抗栓药。",
    followUp: "动态复查血压、尿常规、尿蛋白定量、肌酐/eGFR和病因相关指标；教育避免肾毒性药物并识别少尿、水肿和呼吸困难。",
    critical: ["忽略蛋白尿、畸形红细胞或RBC管型", "肾功能恶化时未触发肾内科安全网"]
  };
  if (major === "泌尿系肿瘤") return {
    immediate: "评估出血程度、贫血、血块尿潴留和肾功能；尿潴留时导尿冲洗，持续活动性出血时泌尿外科急诊处理。",
    definitive: "完成膀胱镜/输尿管镜或影像定位并取得病理，结合分期和患者状况制定内镜切除、根治性手术或系统治疗。",
    perioperative: "在病理和分期基础上完成麻醉、心肺、肾功能、感染、营养、贫血、抗栓及VTE风险评估，按手术类型制定ERAS计划。",
    followUp: "按肿瘤类型、分期和治疗方式复查尿检、膀胱镜、影像和肾功能；进行戒烟和职业暴露教育。",
    critical: ["未取得病理和分期即实施确定性肿瘤治疗", "血块尿潴留或严重出血未处理"]
  };
  if (major === "假性血尿") return {
    immediate: "确认尿液中是否存在红细胞，询问月经和阴道出血并规范清洁中段尿留样；有妇科活动性出血时按妇科路径评估。",
    definitive: "经期结束或污染排除后复查尿常规和尿沉渣；仅在证实持续真性血尿后进入泌尿或肾内科血尿评估。",
    perioperative: "通常不涉及围术期；若妇科检查或操作有指征，按相应流程评估。",
    followUp: "复查规范尿标本；若仍有红细胞尿，按年龄和风险因素完成真性血尿分层评估。",
    critical: ["未确认真性血尿即进行侵入性检查", "女性未排除月经或阴道污染"]
  };
  if (major === "外伤") return {
    immediate: "按创伤初评稳定气道、呼吸和循环，监测生命体征、血红蛋白和尿量；血流动力学稳定者行增强CT分级，及时请泌尿外科/创伤外科。",
    definitive: "依据损伤分级和血流动力学选择观察、介入栓塞、内镜引流或手术探查，并同步处理合并伤。",
    perioperative: "完成创伤复苏、备血、凝血和肾功能评估，联合麻醉、介入、ICU制定失血与并发症预案。",
    followUp: "复查血压、血红蛋白、肾功能和必要影像，监测迟发出血、尿外渗、感染及创伤后高血压。",
    critical: ["血流动力学不稳定时延误复苏", "未评估合并伤或贸然进行不合适检查"]
  };
  if (major === "功能性血尿") return {
    immediate: "停止剧烈运动、补液并评估横纹肌溶解、外伤和肾功能风险；确认尿沉渣中是否存在红细胞。",
    definitive: "休息后复查规范尿标本；仅在血尿消失且无危险线索时考虑运动相关，持续或复发者按真性血尿路径评估。",
    perioperative: "通常不涉及围术期管理。",
    followUp: "短期复查尿常规和肾功能；持续血尿、蛋白尿或其他异常时转肾内科/泌尿外科。",
    critical: ["未复查即把血尿归因于运动", "忽略色素尿或肾损伤"]
  };
  if (/乳头坏死/.test(dx)) return {
    immediate: "评估感染、梗阻、AKI、糖尿病、镇痛药暴露和血红蛋白；必要时抗感染、引流和停用相关肾毒性药。",
    definitive: "处理基础病因，使用影像或输尿管镜明确坏死乳头和梗阻；脱落组织致梗阻时由泌尿外科解除。",
    perioperative: "评估肾功能、感染、贫血和凝血，避免肾毒性药物。",
    followUp: "随访肾功能、尿检和感染复发，控制糖尿病并避免滥用镇痛药。",
    critical: ["忽略药物和基础病因", "梗阻感染未引流"]
  };
  if (/多囊肾/.test(dx)) return {
    immediate: "评估血流动力学、血红蛋白、感染、结石和肾功能；稳定者镇痛休息，持续出血或不稳定者请泌尿外科/介入评估。",
    definitive: "排除肿瘤和感染后处理囊肿出血；反复或严重出血可考虑介入栓塞等治疗，并由肾内科管理ADPKD。",
    perioperative: "评估肾功能、血压、贫血、感染和造影风险。",
    followUp: "监测血压、肾功能和囊肿并发症，进行家族遗传咨询和ADPKD规范随访。",
    critical: ["未排除感染或肿瘤", "严重出血未评估血流动力学"]
  };
  return {
    immediate: "评估生命体征、出血程度、尿量、肾功能和急症红旗，按病因路径请相关专科。",
    definitive: "完成针对性检验和影像确认病因后制定个体化治疗。",
    perioperative: "如需操作，评估心肺、麻醉、感染、凝血、抗栓、贫血、肾功能和VTE风险。",
    followUp: "复查尿常规、肾功能和病因相关项目，明确复诊时点和危险症状。",
    critical: ["未确认真性血尿", "忽略急症红旗"]
  };
}

function cleanHistory(caseData: MutableCase) {
  const original = caseData.pastHistory || "";
  const sentences = original.split(/[。\n]/).map((item) => item.trim()).filter(Boolean);
  const familyPattern = /家族|父亲|母亲|父母|兄弟|姐妹|舅舅|子女|类似血尿|遗传/;
  const personalPattern = /吸烟|饮酒|职业|染料|橡胶|皮革|化工|重金属/;
  const reproductivePattern = /未婚|已婚|婚育|妊娠|孕|产|初潮|月经|绝经/;
  const familyText = sentences.filter((item) => familyPattern.test(item)).join("。") || (caseData.riskFactors?.familyHistory && !/需主动询问/.test(caseData.riskFactors.familyHistory) ? caseData.riskFactors.familyHistory : "未诉明确相关家族史。");
  const reproductiveText = sentences.filter((item) => reproductivePattern.test(item)).join("。") || (caseData.sex === "女" ? "未提供（需在问诊中确认）" : "不适用");
  const explicitPast = original.match(/既往史[:：]([^。；]+(?:[。；][^。；]+)*)$/)?.[1]?.trim();
  const cleanedPast = sentences.filter((item) => !familyPattern.test(item) && !personalPattern.test(item) && !reproductivePattern.test(item)).join("。");
  const pastItems = [
    explicitPast || cleanedPast,
    caseData.riskFactors?.stoneHistory && `结石史：${caseData.riskFactors.stoneHistory}`,
    caseData.riskFactors?.infectionHistory && `尿路感染史：${caseData.riskFactors.infectionHistory}`,
    caseData.riskFactors?.trauma && `外伤/泌尿操作史：${caseData.riskFactors.trauma}`,
    caseData.riskFactors?.tumorHistory && `肿瘤史：${caseData.riskFactors.tumorHistory}`
  ].filter(Boolean);
  caseData.pastHistory = pastItems.length ? pastItems.join("；") : "未诉特殊既往史。";
  caseData.personalHistory = [
    `吸烟：${caseData.riskFactors?.smoking || "未提供"}`,
    `饮酒：${caseData.riskFactors?.alcohol || "未提供"}`,
    `职业暴露：${caseData.riskFactors?.occupation || "未提供"}`
  ].join("；");
  caseData.familyHistory = familyText;
  caseData.reproductiveHistory = reproductiveText;
}

function enrichCase(caseData: MutableCase, orderResults: OrderResultItem[], examResults: PhysicalExamResult[], mdt: MdtTrigger[]) {
  Object.assign(caseData, normalizeStringsDeep(caseData));
  const meta = majorCategory(caseData);
  const management = managementFor(caseData, meta.major);
  cleanHistory(caseData);
  caseData.schemaVersion = "2.1.0";
  caseData.caseVersion = caseData.releaseV14?.sourceVersion || (caseData.id.startsWith("HX-ADD") ? "HX-ADD-2.1" : "V2-2.1");
  caseData.languages = caseData.id.startsWith("P") ? ["zh-CN", "en"] : ["zh-CN"];
  caseData.diseaseCategory = meta.major;
  caseData.diseaseSubcategory = meta.sub;
  caseData.difficulty = meta.difficulty;
  caseData.standardChiefComplaint = normalizeTerminology(caseData.chiefComplaint || caseData.studentChiefComplaint);
  caseData.reproductiveHistory = caseData.reproductiveHistory || (caseData.sex === "女" ? caseData.interviewAnswers?.HX029?.patientAnswer || "未提供（需在问诊中确认）" : "不适用");
  caseData.diagnosis = normalizeTerminology(caseData.diagnosis);
  caseData.differentialDiagnosis = differentialFor(caseData, meta.major);
  caseData.patientRole = {
    identity: `${caseData.age}岁${caseData.sex}性教学模拟患者`,
    concerns: caseData.patientPersona?.emotion || "担心尿色变化的原因。",
    affect: caseData.patientPersona?.emotion || "配合，但对病情有担心。",
    communicationStyle: caseData.patientPersona?.communicationNote || "只回答被问到的信息，不使用诊断术语。"
  };
  caseData.questionSlotIds = Object.keys(caseData.interviewAnswers || {}).sort();
  const caseOrders = orderResults.filter((item) => item.caseId === caseData.id);
  caseData.availableOrderIds = [...new Set(caseOrders.map((item) => item.orderId).filter((item): item is string => Boolean(item)))];
  caseData.orderPrerequisites = caseOrders.filter((item) => item.prerequisite).map((item) => ({ orderId: item.orderId || item.orderCategory, prerequisite: item.prerequisite }));
  caseData.physicalExamResultIds = examResults.filter((item) => item.caseId === caseData.id).map((item) => item.examId);
  caseData.emergencyRedFlags = [caseData.clinical?.redFlags || "", ...management.critical].filter(Boolean);
  caseData.criticalErrors = management.critical;
  caseData.mdtTriggerRule = mdt.find((item) => item.caseId === caseData.id) || null;
  caseData.teachingPoints = [
    `先确认真性血尿并完成${meta.major}方向的定位。`,
    "血尿时相是定位线索，不能替代尿沉渣、影像、内镜或病理。",
    management.critical[0]
  ];
  caseData.scoringKey = [
    "问诊、查体、诊断、开单、MDT、治疗、围术期和随访证据均纳入360分评分。",
    `本病例严重错误：${management.critical.join("；")}`
  ];
  caseData.teacherComment = `重点评价学生能否识别${meta.sub}的定位线索、危险信号和正确操作顺序。`;
  caseData.clinical = {
    ...(caseData.clinical || {}),
    diseaseCategory: `${meta.major}/${meta.sub}`,
    immediateTreatment: management.immediate,
    definitiveTreatment: management.definitive,
    followUp: management.followUp,
    commonMisses: management.critical.join("；")
  } as CaseData["clinical"];
  if (caseData.agentProfile) caseData.agentProfile.perioperativePreparation = management.perioperative;
  caseData.standardManagement = management;
  caseData.medicalReview = {
    status: "needs_revision",
    references,
    lastReviewedDate: reviewDate
  };
  return caseData;
}

const orderResults = readJson<OrderResultItem[]>("order_results.json");
const examResults = readJson<PhysicalExamResult[]>("physical_exam_results.json");
const mdt = readJson<MdtTrigger[]>("mdt_triggers.json");
const sourceFiles = ["cases.json", "cases_42.json"];

for (const file of sourceFiles) {
  const cases = readJson<MutableCase[]>(file).map((item) => enrichCase(item, orderResults, examResults, mdt));
  writeJson(file, cases);
}

const activeCases = readJson<MutableCase[]>("cases.json");
const report = validateCaseLibrary(activeCases);
writeJson("case_validation_report.json", report);
writeJson("cases_student.json", activeCases.map((item) => ({
  id: item.id,
  caseVersion: item.caseVersion,
  age: item.age,
  sex: item.sex,
  difficulty: item.difficulty,
  diseaseCategory: item.diseaseCategory,
  diseaseSubcategory: item.diseaseSubcategory,
  studentChiefComplaint: item.studentChiefComplaint
})));

const existingEnglish = readJson<Array<Record<string, unknown>>>("cases_en.json");
const englishById = new Map(existingEnglish.map((item) => [String(item.id), item]));
for (const item of activeCases.filter((caseData) => caseData.id.startsWith("HX-ADD"))) {
  englishById.set(item.id, {
    id: item.id,
    sourcePatientId: item.sourcePatientId || item.id,
    title: supplementTitlesEn[item.id] || item.diagnosis,
    source: "Supplementary teaching case",
    age: item.age,
    sex: item.sex === "女" ? "Female" : "Male",
    difficulty: difficultyEn[item.difficulty || ""] || "Standard",
    diseaseCategory: categoryEn[item.diseaseCategory || ""] || item.diseaseCategory,
    chiefComplaint: simplifiedChiefComplaintEn(item.studentChiefComplaint || item.chiefComplaint),
    studentChiefComplaint: simplifiedChiefComplaintEn(item.studentChiefComplaint || item.chiefComplaint),
    initialDiagnosis: supplementTitlesEn[item.id] || item.diagnosis,
    admissionLabs: "Select laboratory tests according to hematuria localization, severity, infection risk, renal function and bleeding risk.",
    admissionImaging: "Order only the imaging, endoscopy or pathology studies justified by the current differential diagnosis.",
    mdtDepartments: "Choose departments according to the case-specific MDT trigger.",
    mdtQuestion: "Define the focused clinical problem, available evidence and decision required from the consultant.",
    initialTreatmentPlan: "Stabilize emergencies first, then provide cause-directed treatment.",
    definitiveTreatment: "Base definitive treatment on confirmed etiology, pathology and stage where applicable.",
    perioperativePoints: "Assess anesthesia, cardiopulmonary status, infection, renal function, anemia, antithrombotic therapy, VTE risk and ERAS measures.",
    nextManagement: "Specify follow-up tests, timing, escalation criteria and patient education."
  });
}
writeJson("cases_en.json", activeCases.map((item) => englishById.get(item.id)).filter(Boolean));

const agentContracts: Record<number, { reads: string[]; outputs: string[]; forbidden: string[] }> = {
  1: { reads: ["studentVisibleCase", "patientRole", "questionSlotIds", "patient answers for matched slots only"], outputs: ["patient reply", "matched slot IDs", "safety flags"], forbidden: ["diagnosis", "test results", "teacher hints", "treatment"] },
  2: { reads: ["submitted history", "physical exam catalog", "order catalog", "case order results after matching"], outputs: ["exam log", "order status", "released report"], forbidden: ["unopened reports", "final diagnosis", "future-stage answers"] },
  3: { reads: ["submitted history", "exam log", "released reports", "student diagnosis text"], outputs: ["reasoning evaluation after submission"], forbidden: ["standard diagnosis before submission"] },
  4: { reads: ["submitted evidence", "MDT trigger rule", "selected departments", "consult request"], outputs: ["department-scoped opinions"], forbidden: ["opinions outside specialty scope", "final diagnosis on behalf of learner"] },
  5: { reads: ["submitted diagnosis", "released evidence", "RAG guardrails", "student treatment plan"], outputs: ["treatment evaluation after submission"], forbidden: ["standard treatment before submission"] },
  6: { reads: ["planned procedure", "comorbidities", "released tests", "student perioperative plan"], outputs: ["perioperative risk evaluation"], forbidden: ["unreleased test results"] },
  7: { reads: ["complete operation log", "case rubric", "critical error rules"], outputs: ["360 report", "timeline", "evidence", "misses", "improvement plan"], forbidden: ["intermediate OSCE feedback"] }
};
const agents = readJson<Array<Record<string, unknown>>>("agents.json").map((agent) => ({ ...agent, contract: agentContracts[Number(agent.stageNo)] }));
writeJson("agents.json", agents);

if (report.errorCount > 0) {
  console.error(`Case normalization finished with ${report.errorCount} errors and ${report.warningCount} warnings.`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${report.caseCount} cases: 0 errors, ${report.warningCount} review warnings.`);
}

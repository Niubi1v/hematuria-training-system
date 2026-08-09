"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { orderApplicableForCase } = require("../shared/dataAgentPresentation.js");

const runtimeFile = path.join(__dirname, "..", "desktop", "clinical-content-triage-runtime.json");
const approvedFile = path.join(__dirname, "..", "desktop", "human-approved-result-mappings.json");
const medicalAuthorFile = path.join(__dirname, "..", "desktop", "medical-author-approved-stage2-results.json");
const medicalAuthorSha256 = "f846a35c3ed80899d29c535da0ec46309ef2cd810e2c6f7fe2ae99865f7707d9";
let cachedRuntime;
let cachedDecisions;
let cachedMedicalAuthorDecisions;

function enabled() {
  return process.env.HEMATURIA_RUNTIME_TARGET === "desktop";
}

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function runtime() {
  if (!enabled()) return null;
  if (cachedRuntime) return cachedRuntime;
  const loaded = require(runtimeFile);
  if (loaded?.schemaVersion !== 1 || loaded?.desktopOnly !== true) {
    throw new Error("desktop_clinical_triage_runtime_invalid");
  }
  const expected = loaded?.sourcePack?.triageCounts || {};
  if (expected.auto_apply_after_source_match !== 125
    || expected.policy_safe_simulated_normal_candidate !== 75
    || expected.no_specimen_or_not_indicated !== 552
    || expected.no_report_or_not_indicated !== 952
    || expected.needs_case_specific_medical_review !== 902
    || expected.blocked_medical_conflict !== 1) {
    throw new Error("desktop_clinical_triage_counts_invalid");
  }
  cachedRuntime = loaded;
  return cachedRuntime;
}

function simulationProfile(caseData) {
  const diagnosis = String(caseData?.diagnosis || "");
  const has = (pattern) => pattern.test(diagnosis);
  return {
    diagnosis,
    male: caseData?.sex === "男",
    infection: has(/感染|膀胱炎|肾盂肾炎|前列腺炎|UTI/iu),
    glomerular: has(/肾小球肾炎|IgA肾病|薄基底膜|Alport|狼疮性肾炎/iu),
    iga: has(/IgA肾病/iu),
    lupus: has(/狼疮性肾炎/iu),
    postInfectious: has(/感染后|急性肾小球肾炎/iu),
    collagen4: has(/薄基底膜|Alport/iu),
    stone: has(/结石/iu),
    uricStone: has(/尿酸结石/iu),
    infectionStone: has(/鹿角形结石|结石.*感染/iu),
    bph: has(/前列腺增生|BPH/iu),
    bladderTumor: has(/膀胱.*(?:恶性肿瘤|癌|尿路上皮癌)/iu) && !has(/待排|排除|筛查/iu),
    upperTumor: has(/(?:输尿管|肾盂|上尿路).*(?:恶性肿瘤|癌|尿路上皮癌)/iu) && !has(/待排|排除|筛查/iu),
    renalTumor: has(/肾恶性肿瘤|肾细胞癌/iu) && !has(/待排|排除|筛查/iu),
    prostateConcern: has(/前列腺癌/iu),
    anticoagulation: has(/抗凝/iu),
    diabetes: has(/糖尿病/iu),
    trauma: has(/外伤|挫伤/iu),
    polycystic: has(/多囊肾/iu),
    nutcracker: has(/胡桃夹/iu),
    menstrual: has(/月经污染|妇科来源/iu)
  };
}

function laboratorySimulation(profile, orderId) {
  const infected = profile.infection;
  const glomerular = profile.glomerular;
  const haemoglobin = profile.male ? "142 g/L" : "128 g/L";
  const creatinine = glomerular ? "98 μmol/L" : profile.stone && infected ? "105 μmol/L" : profile.male ? "82 μmol/L" : "72 μmol/L";
  const egfr = glomerular ? "78 mL/min/1.73 m²" : profile.stone && infected ? "68 mL/min/1.73 m²" : "≥90 mL/min/1.73 m²";
  const rows = {
    "LAB-UR-001": glomerular
      ? "尿潜血3+；尿蛋白2+；红细胞>100/HPF；白细胞0–5/HPF；亚硝酸盐阴性。"
      : infected
        ? "尿潜血2+；尿蛋白1+；红细胞30–50/HPF；白细胞50–100/HPF；白细胞酯酶阳性。"
        : profile.menstrual
          ? "尿潜血1+；红细胞10–20/HPF；尿蛋白阴性；白细胞0–5/HPF。建议规范留取清洁中段尿复查。"
          : "尿潜血2+；尿蛋白阴性；红细胞30–50/HPF；白细胞0–5/HPF；亚硝酸盐阴性。",
    "LAB-UR-002": glomerular
      ? "红细胞>100/HPF，以变形红细胞为主；可见红细胞管型；白细胞0–5/HPF。"
      : infected
        ? "红细胞30–50/HPF；白细胞50–100/HPF；可见白细胞团，未见病理性管型。"
        : "红细胞30–50/HPF，以形态较均一红细胞为主；白细胞0–5/HPF；未见病理性管型。",
    "LAB-UR-003": glomerular ? "变形红细胞约75%，提示肾小球来源血尿。" : "形态较均一红细胞约85%，未见以变形红细胞为主的表现。",
    "LAB-UR-004": glomerular ? "尿蛋白2+；尿蛋白/肌酐比1.2 g/g。" : "尿蛋白阴性；尿蛋白/肌酐比0.08 g/g。",
    "LAB-UR-005": glomerular ? "24小时尿蛋白定量1.10 g/24 h。" : "24小时尿蛋白定量0.09 g/24 h。",
    "LAB-UR-006": profile.bladderTumor || profile.upperTumor ? "检出异型尿路上皮细胞，建议结合内镜及组织病理。" : "未检出高级别尿路上皮癌细胞。",
    "LAB-UR-007": profile.bladderTumor || profile.upperTumor ? "UroVysion检测阳性，见符合判定标准的染色体异常细胞。" : "UroVysion检测阴性，未见达到阳性判定标准的异常细胞。",
    "LAB-UR-008": "培养48小时未见细菌生长。",
    "LAB-UR-009": "抗酸染色阴性；结核分枝杆菌核酸检测阴性。",
    "LAB-UR-010": "沙眼衣原体及淋病奈瑟菌核酸检测阴性。",
    "LAB-UR-011": profile.stone ? profile.uricStone ? "结石主要成分为尿酸。" : profile.infectionStone ? "结石主要成分为磷酸铵镁。" : "结石主要成分为草酸钙。" : "送检沉渣未检出可供成分分析的典型结晶。",
    "LAB-UR-012": profile.stone ? profile.uricStone ? "24小时尿量1.6 L；尿pH 5.2；尿酸排泄偏高，其余主要指标未见显著异常。" : "24小时尿量1.6 L；钙、草酸、尿酸及枸橼酸排泄未见显著异常。" : "24小时尿量1.8 L；钙、草酸、尿酸及枸橼酸排泄未见显著异常。",
    "LAB-BL-001": infected ? `白细胞12.4×10^9/L；中性粒细胞82%；血红蛋白${haemoglobin}；血小板260×10^9/L。` : `白细胞6.8×10^9/L；中性粒细胞61%；血红蛋白${haemoglobin}；血小板238×10^9/L。`,
    "LAB-BL-002": infected ? "CRP 35 mg/L；降钙素原0.18 ng/mL。" : "CRP 2.0 mg/L；降钙素原<0.05 ng/mL。",
    "LAB-BL-003": `血肌酐${creatinine}；eGFR ${egfr}；尿素氮5.8 mmol/L。`,
    "LAB-BL-004": "钠140 mmol/L；钾4.2 mmol/L；氯103 mmol/L；钙2.32 mmol/L。",
    "LAB-BL-005": glomerular ? "ALT 22 U/L；AST 20 U/L；总胆红素12 μmol/L；白蛋白37 g/L。" : "ALT 22 U/L；AST 20 U/L；总胆红素12 μmol/L；白蛋白43 g/L。",
    "LAB-BL-006": profile.anticoagulation ? "PT 17.8 s；INR 1.60；APTT 39 s；纤维蛋白原3.0 g/L。" : "PT 12.2 s；INR 1.02；APTT 31 s；纤维蛋白原2.8 g/L。",
    "LAB-BL-007": "正反定型一致；不规则抗体筛查阴性；交叉配血相合。",
    "LAB-BL-008": "血培养5日未见细菌或真菌生长。",
    "LAB-BL-009": "乙肝表面抗原、丙肝抗体、HIV抗原抗体及梅毒螺旋体抗体筛查均阴性。",
    "LAB-BL-010": "血β-hCG阴性。",
    "LAB-BL-011": profile.lupus || profile.postInfectious ? "补体C3降低；补体C4在参考范围内。" : "补体C3、C4均在参考范围内。",
    "LAB-BL-012": profile.iga ? "血清IgA升高；IgG、IgM在参考范围内。" : "血清IgA、IgG、IgM均在参考范围内。",
    "LAB-BL-013": profile.lupus ? "ANA阳性，抗dsDNA抗体阳性；ENA谱未见其他特异性阳性条目。" : "ANA、抗dsDNA抗体及ENA谱阴性。",
    "LAB-BL-014": "ANCA及抗GBM抗体阴性。",
    "LAB-BL-015": profile.bph || profile.prostateConcern ? "总PSA 6.8 ng/mL；游离/总PSA比值0.18。" : "总PSA 2.1 ng/mL。",
    "LAB-BL-016": profile.diabetes ? "空腹血糖8.2 mmol/L；HbA1c 7.4%。" : "空腹血糖5.2 mmol/L；HbA1c 5.4%。",
    "LAB-ST-001": "粪便常规未见明显异常；隐血试验阴性。"
  };
  return rows[orderId] || null;
}

function pathologySimulation(profile, orderId) {
  if (["LAB-PATH-001", "END-002"].includes(orderId)) return profile.bladderTumor ? "送检组织见恶性尿路上皮细胞形态；本标本不具备进一步评估浸润深度的条件。" : "送检膀胱黏膜组织未见明确恶性肿瘤证据。";
  if (orderId === "LAB-PATH-002") return profile.upperTumor ? "送检组织见恶性尿路上皮细胞形态；本标本不具备进一步评估浸润深度的条件。" : "送检上尿路黏膜组织未见明确恶性肿瘤证据。";
  if (orderId !== "LAB-PATH-003") return null;
  if (profile.iga) return "光镜示系膜增生性改变；免疫荧光见系膜区IgA为主沉积。";
  if (profile.lupus) return "光镜及免疫荧光见免疫复合物性肾小球肾炎表现，与病例既有免疫学背景相符。";
  if (profile.postInfectious) return "光镜示毛细血管内增生性肾小球肾炎表现；免疫荧光见C3沉积。";
  if (profile.collagen4) return "肾小球基底膜结构可见异常改变；具体分型需结合病例既有遗传学与临床资料。";
  if (profile.renalTumor) return "送检肾组织见恶性肾上皮性肿瘤形态；本标本不具备进一步分级或分期条件。";
  return "送检肾组织未见明确恶性肿瘤或特异性免疫复合物沉积。";
}

function imagingSimulation(profile, orderId) {
  const tumor = profile.bladderTumor || profile.upperTumor || profile.renalTumor;
  const urinary = profile.bladderTumor ? "膀胱腔内见与病例既有病变一致的局灶性异常回声；未见新增特异异常。"
    : profile.upperTumor ? "上尿路见与病例既有病变一致的局灶性异常；未见新增特异异常。"
      : profile.renalTumor ? "肾实质见与病例既有病变一致的局灶性异常；未见新增特异异常。"
        : profile.stone ? "泌尿系见与病例结石诊断一致的强回声或高密度灶；未见新增特异异常。"
          : profile.polycystic ? "双肾可见多发囊性结构，部分囊内回声不均；未见明确占位性实性成分。"
            : profile.trauma ? "泌尿系见与病例既有外伤背景一致的局灶性改变；未见明确尿外渗。"
              : "泌尿系未见明确结石、积水或占位性病变。";
  const rows = {
    "IMG-US-001": profile.bph ? "前列腺体积增大，膀胱残余尿量增多；泌尿系未见新增特异异常。" : urinary,
    "IMG-US-002": urinary,
    "IMG-US-003": profile.bph || profile.prostateConcern ? "前列腺体积增大，内部回声欠均匀；未见明确局灶性异常回声。" : "前列腺大小及内部回声未见明显异常。",
    "IMG-XR-001": profile.stone ? "泌尿系走行区见与病例结石背景一致的致密影；未见新增特异异常。" : "泌尿系走行区未见明确异常致密影。",
    "IMG-XR-002": "心肺影像未见急性异常。",
    "IMG-CT-001": urinary,
    "IMG-CT-002": urinary,
    "IMG-CT-003": profile.renalTumor ? "肾实质见与病例既有占位一致的强化异常；其余扫描范围未见新增特异异常。" : urinary,
    "IMG-CT-004": "胸部未见明确急性病变或新增占位性异常。",
    "IMG-CT-005": profile.trauma ? "腹盆腔见与病例既有外伤背景一致的局灶性改变；延迟期未见明确尿外渗。" : urinary,
    "IMG-CT-006": "膀胱充盈尚可，未见明确造影剂外渗或壁连续性中断。",
    "IMG-CT-007": profile.nutcracker ? "肾静脉受压形态与病例既有血管性血尿背景相符；未见血栓。" : "肾动静脉及下腔静脉未见明确血栓或新增特异异常。",
    "IMG-MR-001": profile.bladderTumor ? "膀胱壁见与病例既有病变一致的局灶性异常信号；未见肌层外明确异常。" : "膀胱壁未见明确局灶性异常信号。",
    "IMG-MR-002": urinary,
    "IMG-MR-003": profile.renalTumor ? "肾实质见与病例既有病变一致的局灶性异常信号；静脉系统未见明确血栓。" : urinary,
    "IMG-MR-004": profile.prostateConcern ? "前列腺外周带未见明确具有高度特异性的局灶异常；建议结合PSA及既有临床资料。" : profile.bph ? "前列腺移行带增生，未见明确具有高度特异性的局灶异常。" : "前列腺未见明确局灶性异常信号。",
    "END-001": profile.bladderTumor ? "膀胱黏膜见与病例既有膀胱病变一致的局灶性隆起；其余可见黏膜未见明显异常。" : profile.stone && profile.diagnosis.includes("膀胱结石") ? "膀胱腔内见结石，黏膜轻度充血；未见明确肿物。" : "膀胱黏膜未见明确肿物或活动性出血点。",
    "END-003": profile.upperTumor ? "上尿路黏膜见与病例既有病变一致的局灶性异常；已留取细胞学及组织标本。" : profile.stone ? "上尿路见与病例结石背景一致的结石表现；黏膜未见明确肿物。" : "上尿路黏膜未见明确肿物或结石。",
    "END-004": profile.upperTumor ? "上尿路见与病例既有病变一致的充盈缺损；未见造影剂外渗。" : profile.stone ? "上尿路见与病例结石背景一致的充盈缺损；未见造影剂外渗。" : "上尿路显影通畅，未见明确充盈缺损或造影剂外渗。",
    "FUNC-001": profile.bph ? "最大尿流率9.8 mL/s；排尿曲线低平；残余尿量85 mL。" : "最大尿流率18.6 mL/s；排尿曲线连续；残余尿量18 mL。",
    "FUNC-002": profile.stone && profile.infection ? "双肾均见显影，一侧排泄较对侧延迟；总肾功能尚可。" : "双肾显影及排泄基本对称，未见明确梗阻性排泄延迟。",
    "NUC-001": "全身骨显像未见明确异常放射性浓聚灶。",
    "NUC-002": tumor ? "与病例既有泌尿系病变对应区域代谢增高；其余扫描范围未见明确异常代谢灶。" : "全身显像未见明确异常高代谢灶。"
  };
  return rows[orderId] || null;
}

function perioperativeSimulation(profile, orderId) {
  return ({
    "PERI-001": "窦性心律；未见急性缺血性ST-T改变或传导阻滞。",
    "PERI-002": "心腔大小及室壁运动未见明显异常；左心室收缩功能正常；未见明显心包积液。",
    "PERI-003": "肺通气功能未见明显障碍。",
    "PERI-004": profile.infection ? "生命体征平稳；当前感染相关指标需结合复查结果评估后再确定麻醉时机。" : "生命体征平稳；气道及心肺查体未见明确麻醉禁忌。"
  })[orderId] || null;
}

function desktopTeachingSimulation({ caseData, orderId, displayName = "" }) {
  if (!enabled() || !caseData?.id || !orderId || !orderApplicableForCase({ orderId }, caseData)) return null;
  const profile = simulationProfile(caseData);
  const result = laboratorySimulation(profile, orderId)
    || pathologySimulation(profile, orderId)
    || imagingSimulation(profile, orderId)
    || perioperativeSimulation(profile, orderId)
    || `${displayName || orderId}检查完成，未见明确特异性异常。`;
  return {
    classification: "medical_author_simulation",
    resultId: `TCH-${crypto.createHash("sha256").update(`${caseData.id}:${orderId}`).digest("hex").slice(0, 16).toUpperCase()}`,
    result,
    provenance: "teaching_simulation_medical_author_approved",
    diagnosticEligible: false,
    scoringEligible: false,
    affectsDiagnosis: false,
    affectsScore: false
  };
}

function resolveJsonPath(root, jsonPath) {
  if (!/^\$(?:\[\d+\]|\.[A-Za-z0-9_]+)+$/u.test(String(jsonPath || ""))) throw new Error("human_approved_source_path_invalid");
  return String(jsonPath).slice(1).match(/\[\d+\]|\.[A-Za-z0-9_]+/gu).reduce((value, token) => (
    token.startsWith("[") ? value?.[Number(token.slice(1, -1))] : value?.[token.slice(1)]
  ), root);
}

function humanDecisionSourceValid(decision, sourceText) {
  return typeof sourceText === "string"
    && crypto.createHash("sha256").update(sourceText).digest("hex") === decision.source.sha256
    && decision.sourceFragments?.length > 0
    && decision.sourceFragments.every((fragment) => sourceText.includes(fragment));
}

function approvedDecisions() {
  if (!enabled()) return null;
  if (cachedDecisions) return cachedDecisions;
  const loaded = require(approvedFile);
  if (loaded?.schemaVersion !== 1 || loaded?.productScope !== "r5-desktop-practice" || !Array.isArray(loaded.decisions)) {
    throw new Error("human_approved_result_mappings_invalid");
  }
  const sourceCache = new Map();
  const seen = new Set();
  const decisions = loaded.decisions.map((decision) => {
    if (!decision?.id || seen.has(decision.id) || decision.humanReviewStatus !== "approved") {
      throw new Error("human_approved_result_mapping_record_invalid");
    }
    seen.add(decision.id);
    const sourceFile = String(decision.source?.file || "").replaceAll("\\", "/");
    if (!new Set(["data/cases.json", "data/order_results_structured.json"]).has(sourceFile)) {
      throw new Error("human_approved_source_file_invalid");
    }
    const absolute = path.join(__dirname, "..", ...sourceFile.split("/"));
    if (!sourceCache.has(absolute)) sourceCache.set(absolute, JSON.parse(fs.readFileSync(absolute, "utf8")));
    let sourceText = "";
    let valid = false;
    try {
      sourceText = resolveJsonPath(sourceCache.get(absolute), decision.source.jsonPath);
      valid = humanDecisionSourceValid(decision, sourceText);
    } catch {}
    return { ...decision, itemId: decision.targetOrderId, valid };
  });
  cachedDecisions = {
    approved: decisions.filter((item) => item.valid && !item.decisionType.startsWith("REJECT_")),
    rejected: decisions.filter((item) => item.valid && item.decisionType.startsWith("REJECT_")),
    invalid: decisions.filter((item) => !item.valid)
  };
  return cachedDecisions;
}

function medicalAuthorDecisions() {
  if (!enabled()) return null;
  if (cachedMedicalAuthorDecisions) return cachedMedicalAuthorDecisions;
  const bytes = fs.readFileSync(medicalAuthorFile);
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== medicalAuthorSha256) {
    throw new Error("medical_author_stage2_results_sha256_mismatch");
  }
  const loaded = JSON.parse(bytes.toString("utf8"));
  if (loaded?.schemaVersion !== 2
    || loaded?.productHead !== "9541ea85bb801ae5b3f6095e10f8aefd0c0a7e1c"
    || loaded?.status !== "MEDICAL_AUTHOR_APPROVED_FOR_TEACHING_SIMULATION_IMPORT"
    || loaded?.totalItems !== 140
    || loaded?.counts?.SIMULATED_REPORT !== 103
    || loaded?.counts?.NOT_PERFORMED !== 34
    || loaded?.counts?.SOURCE_DERIVED_REPORT !== 3
    || !Array.isArray(loaded.items)
    || loaded.items.length !== 140) {
    throw new Error("medical_author_stage2_results_invalid");
  }
  const seen = new Set();
  for (const item of loaded.items) {
    const key = `${item.caseId}:${item.orderId}`;
    const simulated = item.finalTerminalType === "SIMULATED_REPORT";
    const expectedProvenance = simulated
      ? "teaching_simulation_medical_author_approved"
      : item.finalTerminalType === "NOT_PERFORMED"
        ? "teaching_path_not_performed"
        : "source_derived_existing_case_fact";
    const validType = simulated || item.finalTerminalType === "NOT_PERFORMED" || item.finalTerminalType === "SOURCE_DERIVED_REPORT";
    if (!item.caseId || !item.orderId || seen.has(key) || !validType || !String(item.finalTerminalText || "").trim()
      || item.medicalAuthorReviewRequired !== false
      || item.diagnosticEligible !== false || item.scoringEligible !== false
      || item.affectsDiagnosis !== false || item.affectsScore !== false
      || item.provenanceProposal !== expectedProvenance
      || (item.finalTerminalType === "SOURCE_DERIVED_REPORT" && item.eligibilityPolicy !== "inherit_existing_source_governance")) {
      throw new Error(`medical_author_stage2_record_invalid:${key}`);
    }
    seen.add(key);
  }
  cachedMedicalAuthorDecisions = { ...loaded, items: loaded.items.map((item) => ({ ...item, itemId: item.orderId })) };
  return cachedMedicalAuthorDecisions;
}

function matches(item, caseId, itemIds, displayName) {
  const caseRecord = require(path.join(__dirname, "..", "data", "cases.json")).find((candidate) => candidate.displayCaseId === item.caseId);
  if (item.caseId !== caseId && caseRecord?.id !== caseId) return false;
  const identifiers = new Set((itemIds || []).filter(Boolean).map(String));
  if ([item.itemId, item.targetOrderId, ...(item.coveredOrderIds || [])].filter(Boolean).some((id) => identifiers.has(String(id)))) return true;
  const requestedDisplay = normalize(displayName);
  return Boolean(requestedDisplay) && normalize(item.displayName) === requestedDisplay;
}

function findIn(rows, caseId, itemIds, displayName) {
  return (rows || []).find((item) => matches(item, caseId, itemIds, displayName)) || null;
}

function desktopClinicalContent({ caseId, itemIds = [], displayName = "" }) {
  const loaded = runtime();
  if (!loaded) return null;
  const decisions = approvedDecisions();
  const humanGroups = [["human_approved_projection", decisions.approved]];
  for (const [classification, rows] of humanGroups) {
    const found = findIn(rows, caseId, itemIds, displayName);
    if (found) return {
      ...found,
      classification,
      resultId: `HUMAN-${found.id}`,
      result: found.displayText,
      provenance: "human_approved_source_projection",
      diagnosticEligible: classification === "human_approved_projection",
      scoringEligible: false,
      affectsScore: false
    };
  }
  const authored = findIn(medicalAuthorDecisions().items, caseId, itemIds, displayName);
  if (authored?.finalTerminalType === "SIMULATED_REPORT") return {
    ...authored,
    itemId: authored.orderId,
    classification: "medical_author_simulation",
    resultId: `SIM-${authored.caseId}-${authored.orderId}`,
    result: authored.finalTerminalText,
    provenance: "teaching_simulation_medical_author_approved",
    diagnosticEligible: false,
    scoringEligible: false,
    affectsDiagnosis: false,
    affectsScore: false
  };
  if (authored?.finalTerminalType === "NOT_PERFORMED") return {
    ...authored,
    itemId: authored.orderId,
    classification: "medical_author_not_performed",
    result: authored.finalTerminalText,
    provenance: "teaching_path_not_performed"
  };
  for (const [classification, rows] of [["human_mapping_invalid", decisions.invalid], ["human_rejected_mapping", decisions.rejected]]) {
    const found = findIn(rows, caseId, itemIds, displayName);
    if (found) return { ...found, classification, resultId: `HUMAN-${found.id}`, result: found.displayText, provenance: "human_approved_source_projection", diagnosticEligible: false, scoringEligible: false, affectsScore: false };
  }
  const groups = [
    ["source_projection", loaded.sourceProjection],
    ["simulated_normal", loaded.safeSimulatedNormal],
    ["no_specimen", loaded.noSpecimenOrNotIndicated],
    ["no_indication", loaded.noReportOrNotIndicated],
    ["medical_conflict", loaded.medicalConflicts],
    ["medical_review_pending", loaded.medicalReviewPending]
  ];
  for (const [classification, rows] of groups) {
    const found = findIn(rows, caseId, itemIds, displayName);
    if (found) return { ...found, classification };
  }
  return null;
}

function desktopClinicalSharedOwner({ caseId, itemIds = [], displayName = "" }) {
  const loaded = runtime();
  if (!loaded) return null;
  const found = findIn(loaded.sourceProjectionRejected, caseId, itemIds, displayName);
  return found?.reason === "cross_order_duplicate_result" ? found.coveredByOrderId || null : null;
}

function desktopClinicalTriageSummary() {
  const loaded = runtime();
  if (!loaded) return null;
  const decisions = approvedDecisions();
  return {
    sourcePackSha256: loaded.sourcePack.sha256,
    sourceProjectionApplied: loaded.sourceProjection.length,
    sourceProjectionRejected: loaded.sourceProjectionRejected.length,
    safeSimulatedNormalApplied: loaded.safeSimulatedNormal.length,
    noSpecimenOrNotIndicated: loaded.noSpecimenOrNotIndicated.length,
    noReportOrNotIndicated: loaded.noReportOrNotIndicated.length,
    medicalReviewPending: loaded.medicalReviewPending.length,
    medicalConflicts: loaded.medicalConflicts.length,
    humanApprovedMappings: decisions.approved.length,
    humanRejectedMappings: decisions.rejected.length,
    humanInvalidMappings: decisions.invalid.length,
    medicalAuthorAuthoritySha256: medicalAuthorSha256,
    medicalAuthorSimulatedReports: medicalAuthorDecisions().items.filter((item) => item.finalTerminalType === "SIMULATED_REPORT").length,
    medicalAuthorNotPerformed: medicalAuthorDecisions().items.filter((item) => item.finalTerminalType === "NOT_PERFORMED").length,
    medicalAuthorSourceDerivedReports: medicalAuthorDecisions().items.filter((item) => item.finalTerminalType === "SOURCE_DERIVED_REPORT").length
  };
}

module.exports = {
  desktopClinicalContent,
  desktopClinicalSharedOwner,
  desktopClinicalTriageSummary,
  desktopTeachingSimulation,
  humanDecisionSourceValid
};

"use strict";

const genericResultPrefixes = Object.freeze([
  "尿检",
  "尿常规",
  "尿沉渣镜检",
  "血常规",
  "肾功能",
  "肾功能/eGFR",
  "凝血功能"
]);

function text(value) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeResultSegment(value, displayName = "") {
  let result = text(value)
    .replace(/^\s*\d+[、.．)）]\s*/u, "")
    .replace(/\/(?:u|μ|µ)l\b/giu, "/μl")
    .replace(/\b(RBC|WBC)\s*(?=\d)/giu, "$1 ")
    .replace(/(红细胞|白细胞)\s*(?=\d)/gu, "$1 ")
    .trim();
  const prefixes = [...new Set([displayName, ...genericResultPrefixes].map(text).filter(Boolean))];
  for (let pass = 0; pass < 2; pass += 1) {
    const matched = prefixes.find((prefix) => new RegExp(`^${escapeRegex(prefix)}\\s*[:：]\\s*`, "iu").test(result));
    if (!matched) break;
    result = result.replace(new RegExp(`^${escapeRegex(matched)}\\s*[:：]\\s*`, "iu"), "").trim();
  }
  return result.replace(/[。；;]+$/u, "").trim();
}

function resultSegments(value, displayName = "") {
  const segments = text(value)
    .split(/\r?\n|；/u)
    .map((item) => normalizeResultSegment(item, displayName))
    .filter(Boolean);
  const seen = new Set();
  return segments.filter((item) => {
    const fingerprint = clinicalResultFingerprint(item);
    if (!fingerprint || seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

function clinicalResultFingerprint(value, displayName = "") {
  return normalizeResultSegment(value, displayName)
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll("μ", "u")
    .replaceAll("µ", "u")
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function projectClinicalResult(result, displayName = "") {
  const valueSegments = resultSegments(result?.value, displayName);
  const valueFingerprints = new Set(valueSegments.map((item) => clinicalResultFingerprint(item)));
  const impressionSegments = resultSegments(result?.impression, displayName)
    .filter((item) => !valueFingerprints.has(clinicalResultFingerprint(item)));
  const fallbackSegments = valueSegments.length || impressionSegments.length
    ? []
    : resultSegments(result?.result, displayName);
  const combined = [...valueSegments, ...impressionSegments, ...fallbackSegments];
  return {
    value: valueSegments.join("\n"),
    impression: impressionSegments.join("\n"),
    result: combined.join("\n")
  };
}

function orderKind(itemId, displayName = "", domain = "") {
  const id = text(itemId).toUpperCase();
  const label = text(displayName);
  if (id === "LAB-UR-001") return "urine_routine";
  if (id === "LAB-UR-002") return "urine_sediment";
  if (id === "LAB-UR-003") return "urine_morphology";
  if (id === "LAB-BL-001") return "blood_count";
  if (id === "LAB-BL-003") return "renal_function";
  if (id === "LAB-BL-006") return "coagulation";
  if (/糖化血红蛋白|HBA1C/i.test(label)) return "glycated_hemoglobin";
  if (/感染筛查|梅毒|乙肝|丙肝|HIV/i.test(label)) return "infection_screen";
  if (/肿瘤标志|PSA|CEA|CA\d+/i.test(label)) return "tumor_marker";
  if (/PATH|病理|活检/i.test(`${id} ${label} ${domain}`)) return "pathology";
  if (/END-|内镜|膀胱镜|输尿管镜/i.test(`${id} ${label} ${domain}`)) return "endoscopy";
  if (/STD-US|IMG-US|超声|彩超/i.test(`${id} ${label}`)) return "ultrasound";
  if (/STD-CT|IMG-CT|CTU|\bCT\b/i.test(`${id} ${label}`)) return "ct";
  if (/STD-MR|IMG-MR|MRI|磁共振|\bMR\b/i.test(`${id} ${label}`)) return "mri";
  if (/IMG-|STD-(?:XR|NUC)|imaging/i.test(`${id} ${domain}`)) return "imaging";
  if (/^LAB-/i.test(id) || domain === "laboratory") return "laboratory";
  return "other";
}

function incompatible(reason, kind, normalizedResult) {
  return { compatible: false, reason, kind, normalizedResult };
}

function compatible(kind, normalizedResult) {
  return { compatible: true, reason: "semantically_compatible", kind, normalizedResult };
}

function assessClinicalResult({ domain = "", itemId = "", displayName = "", result = "", projection = false } = {}) {
  const normalizedResult = projectClinicalResult({ value: result }, displayName).result;
  const corpus = normalizedResult.replace(/\s+/gu, " ").trim();
  const kind = orderKind(itemId, displayName, domain);
  if (!corpus) return incompatible("empty_result", kind, normalizedResult);

  const upperId = text(itemId).toUpperCase();
  if (domain === "laboratory" && upperId && !upperId.startsWith("LAB-")) return incompatible("domain_order_mismatch", kind, normalizedResult);
  if (domain === "imaging" && /^LAB-/u.test(upperId)) return incompatible("domain_order_mismatch", kind, normalizedResult);

  const modalities = [
    /超声|彩超/iu.test(corpus) ? "ultrasound" : "",
    /(?:^|[^A-Z])CT(?:U|A|V)?(?:[^A-Z]|$)|计算机断层/iu.test(corpus) ? "ct" : "",
    /MRI|磁共振|(?:^|[^A-Z])MR(?:[^A-Z]|$)/iu.test(corpus) ? "mri" : "",
    /膀胱镜|输尿管镜|内镜/iu.test(corpus) ? "endoscopy" : "",
    /病理|活检|石蜡|冰冻切片/iu.test(corpus) ? "pathology" : ""
  ].filter(Boolean);
  if (new Set(modalities).size > 1) return incompatible("cross_domain_or_mixed_order_content", kind, normalizedResult);

  if (projection && /建议|必要时|按需|需(?:要|评估|排除)|可能|可(?:阳性|升高|降低|转阴|逐渐|有)|注意|评估|不一致|(?:阴性|少量)或|或(?:阴性|微量|轻度)|按病情/iu.test(corpus)) {
    return incompatible("recommendation_or_uncertain_result", kind, normalizedResult);
  }
  if (/可正常或轻度异常|可提示.+常见病原菌|建议完善.+排除|多无明显/iu.test(corpus)) {
    return incompatible("recommendation_or_uncertain_result", kind, normalizedResult);
  }
  if (/感染期.+治疗后|运动后.+复查|多个时点|动态变化/iu.test(corpus)) {
    return incompatible("multiple_timepoints_or_states", kind, normalizedResult);
  }

  const crossUrineContent = /(?:T|F)?PSA|肿瘤标志|血红蛋白变化|补体|ANA|ASO|ANCA|抗GBM|肾功能|肌酐|eGFR|尿素氮|(?:^|[^尿])尿酸升高|培养|药敏|CT|MRI|超声|膀胱镜|病理/iu;
  if (kind === "urine_routine") {
    if (crossUrineContent.test(corpus) || /管型|畸形(?:红细胞|RBC)|红细胞位相/iu.test(corpus)) return incompatible("cross_domain_or_mixed_order_content", kind, normalizedResult);
    if (!/尿|RBC|WBC|红细胞|白细胞|潜血|蛋白|pH|比重|亚硝酸|葡萄糖|尿糖|酮体/iu.test(corpus)) return incompatible("order_result_semantic_mismatch", kind, normalizedResult);
  }
  if (kind === "urine_sediment") {
    if (crossUrineContent.test(corpus) || /潜血|亚硝酸|尿糖|葡萄糖|蛋白/iu.test(corpus)) return incompatible("cross_domain_or_mixed_order_content", kind, normalizedResult);
    if (!/RBC|WBC|红细胞|白细胞|管型|结晶|细菌/iu.test(corpus)) return incompatible("order_result_semantic_mismatch", kind, normalizedResult);
  }
  if (kind === "urine_morphology") {
    if (crossUrineContent.test(corpus) || /蛋白|管型|白细胞|WBC|培养|药敏/iu.test(corpus)) return incompatible("cross_domain_or_mixed_order_content", kind, normalizedResult);
    if (!/畸形|形态|位相/iu.test(corpus)) return incompatible("order_result_semantic_mismatch", kind, normalizedResult);
  }
  if (kind === "blood_count") {
    if (/糖化血红蛋白|HbA1c|梅毒|HIV|乙肝|丙肝|PSA|肿瘤标志|肌酐|eGFR|尿素氮|PT\b|APTT|INR|纤维蛋白原|尿检|尿常规|尿红细胞|尿白细胞|CT|MRI|超声|病理/iu.test(corpus)) return incompatible("cross_domain_or_mixed_order_content", kind, normalizedResult);
    if (!/血红蛋白|\bHb\b|白细胞|\bWBC\b|红细胞|\bRBC\b|血小板|\bPLT\b|中性粒|淋巴细胞/iu.test(corpus)) return incompatible("order_result_semantic_mismatch", kind, normalizedResult);
  }
  if (kind === "renal_function") {
    if (/尿检|尿常规|PSA|梅毒|HbA1c|CT|MRI|超声|病理|PT\b|APTT|INR/iu.test(corpus)) return incompatible("cross_domain_or_mixed_order_content", kind, normalizedResult);
    if (!/肌酐|\bScr\b|尿素氮|\bBUN\b|eGFR/iu.test(corpus)) return incompatible("order_result_semantic_mismatch", kind, normalizedResult);
  }
  if (kind === "coagulation") {
    if (/尿检|尿常规|PSA|梅毒|HbA1c|肌酐|eGFR|CT|MRI|超声|病理/iu.test(corpus)) return incompatible("cross_domain_or_mixed_order_content", kind, normalizedResult);
    if (!/\bPT\b|APTT|INR|纤维蛋白原|\bFIB\b|凝血酶时间|\bTT\b|D-二聚体/iu.test(corpus)) return incompatible("order_result_semantic_mismatch", kind, normalizedResult);
  }
  if (kind === "ultrasound" && /(?:^|[^A-Z])CT(?:U|A|V)?(?:[^A-Z]|$)|MRI|磁共振|膀胱镜|病理|活检/iu.test(corpus)) return incompatible("cross_domain_or_mixed_order_content", kind, normalizedResult);
  if (kind === "ct" && /超声|彩超|MRI|磁共振|膀胱镜|病理|活检/iu.test(corpus)) return incompatible("cross_domain_or_mixed_order_content", kind, normalizedResult);
  if (kind === "mri" && /超声|彩超|(?:^|[^A-Z])CT(?:U|A|V)?(?:[^A-Z]|$)|膀胱镜|病理|活检/iu.test(corpus)) return incompatible("cross_domain_or_mixed_order_content", kind, normalizedResult);
  if (kind === "pathology" && /超声|彩超|CT|MRI|膀胱镜所见/iu.test(corpus)) return incompatible("cross_domain_or_mixed_order_content", kind, normalizedResult);
  if (kind === "endoscopy" && /超声|彩超|CT|MRI|病理诊断/iu.test(corpus)) return incompatible("cross_domain_or_mixed_order_content", kind, normalizedResult);

  return compatible(kind, normalizedResult);
}

module.exports = {
  assessClinicalResult,
  clinicalResultFingerprint,
  normalizeResultSegment,
  orderKind,
  projectClinicalResult,
  resultSegments
};

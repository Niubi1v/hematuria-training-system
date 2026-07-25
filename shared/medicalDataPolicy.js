const MEDICAL_DATA_POLICY = Object.freeze({
  version: "medical-data-policy-v1",
  currentMeasurementProvenance: Object.freeze(["source"]),
  simulatedNormal: Object.freeze({
    allowedExamIds: Object.freeze([]),
    approvedTemplates: Object.freeze({}),
    deterministicOnly: true,
    mayExcludeEmergency: false,
    mayAffectDiagnosis: false,
    mayAffectScore: false
  }),
  missing: Object.freeze({
    zh: "当前资料未记录",
    en: "Not recorded in the current data"
  })
});

const VITAL_COMPONENTS = Object.freeze({
  PE001: Object.freeze([
    Object.freeze({ key: "temperature", unit: "℃" })
  ]),
  PE002: Object.freeze([
    Object.freeze({ key: "blood_pressure", unit: "mmHg" })
  ]),
  PE003: Object.freeze([
    Object.freeze({ key: "heart_rate", unit: "次/分" }),
    Object.freeze({ key: "respiratory_rate", unit: "次/分" }),
    Object.freeze({ key: "oxygen_saturation", unit: "%" })
  ])
});

function text(value) {
  return String(value || "").trim();
}

function sourceHistoryText(caseData) {
  const source = caseData?.sourceFacts || {};
  return [
    source.pastHistory,
    source.personalHistory,
    source.medication,
    source.patientFacingProfile?.subjectiveHistory,
    caseData?.presentIllness?.fever,
    caseData?.presentIllness?.voidingDifficulty,
    caseData?.presentIllness?.pain,
    caseData?.presentIllness?.flankPain
  ].map(text).filter(Boolean).join("；");
}

function expressionForMissing(kind, language) {
  const labels = {
    not_measured: {
      zh: "未测量；当前资料未记录本次测量值。",
      en: "Not measured; no current measurement is recorded."
    },
    not_examined: {
      zh: "尚未检查；当前资料未记录该查体结果。",
      en: "Not examined; no current examination finding is recorded."
    },
    awaiting_review: {
      zh: "当前资料未记录；等待审核元数据。",
      en: "Not recorded in the current data; awaiting reviewed metadata."
    },
    blocked: {
      zh: "当前结果存在医学冲突，等待审核。",
      en: "The current result has a medical conflict and is awaiting review."
    }
  };
  return labels[kind]?.[language] || labels.awaiting_review[language];
}

function envelope(input) {
  return {
    value: input.value ?? "",
    status: input.status,
    unit: input.unit ?? "",
    referenceRange: input.referenceRange ?? "",
    timepoint: input.timepoint || "current_encounter",
    provenance: input.provenance,
    reviewerStatus: input.reviewerStatus,
    affectsDiagnosis: input.affectsDiagnosis === true,
    affectsScore: input.affectsScore === true,
    teacherReviewRequired: input.teacherReviewRequired === true,
    expressionZh: input.expressionZh,
    expressionEn: input.expressionEn,
    blockedReason: input.blockedReason || "",
    blockedUnsafeValueCount: Number(input.blockedUnsafeValueCount || 0),
    blockedIncorrectNormalCount: Number(input.blockedIncorrectNormalCount || 0),
    components: input.components || []
  };
}

function isReviewedSource(configured) {
  return configured?.provenance === "source"
    && configured?.teacherReviewRequired !== true
    && !/needs.review|blocked|pending/i.test(text(configured?.reviewerStatus));
}

function isApprovedSimulatedNormal(configured) {
  return configured?.provenance === "simulated_normal"
    && MEDICAL_DATA_POLICY.simulatedNormal.allowedExamIds.includes(configured?.examId)
    && Object.hasOwn(MEDICAL_DATA_POLICY.simulatedNormal.approvedTemplates, configured?.examId)
    && configured?.reviewerStatus === "not_required"
    && configured?.affectsDiagnosis === false
    && configured?.affectsScore === false
    && configured?.teacherReviewRequired === false;
}

function feverState(caseData) {
  const value = text(caseData?.presentIllness?.fever);
  if (!value) return "unknown";
  if (/(?:否认|无|没有|不伴|未见)[^。；,，]*(?:发热|发烧|寒战)|^(?:否|无)$/.test(value)) return false;
  return /发热|发烧|寒战|高热|\d{2}(?:\.\d)?\s*℃/.test(value) ? true : "unknown";
}

function hypertensionState(caseData) {
  const fact = caseData?.structuredHistory?.hypertension;
  if (fact?.teacherReviewRequired === true || fact?.provenance === "author_added_for_simulation") return "needs_review";
  if (fact?.status === "present") return true;
  if (fact?.status === "absent") return false;
  return "unknown";
}

function hypertensionControl(caseData) {
  const source = sourceHistoryText(caseData);
  if (/(?:血压|高血压)[^。；]{0,40}(?:控制良好|控制平稳|总体平稳)|(?:控制良好|控制平稳|总体平稳)[^。；]{0,20}(?:血压|高血压)/.test(source)) return "well_controlled";
  if (/(?:血压|高血压)[^。；]{0,40}(?:未控制|控制不佳|控制差)/.test(source)) return "uncontrolled";
  return "unknown";
}

function parseTemperature(value) {
  return Number.parseFloat(text(value).match(/(\d{2}(?:\.\d)?)/)?.[1] || "");
}

function parseBloodPressure(value) {
  const match = text(value).match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  return match ? { systolic: Number(match[1]), diastolic: Number(match[2]) } : null;
}

function isNormalTemperature(value) {
  const parsed = parseTemperature(value);
  return Number.isFinite(parsed) && parsed < 37.3;
}

function isNormalBloodPressure(value) {
  const parsed = parseBloodPressure(value);
  return Boolean(parsed && parsed.systolic < 140 && parsed.diastolic < 90);
}

function sourceConflict(caseData, configured) {
  const resultText = text(configured?.value || configured?.result);
  if (configured?.examId === "PE001"
      && feverState(caseData) === true
      && isNormalTemperature(resultText)
      && configured?.postAntipyretic !== true
      && !/after.antipyretic|post.antipyretic|退热后/i.test(text(configured?.timepoint))) {
    return "fever_current_temperature_conflict";
  }
  if (configured?.examId === "PE002"
      && hypertensionControl(caseData) === "uncontrolled"
      && isNormalBloodPressure(resultText)) {
    return "uncontrolled_hypertension_normal_pressure_conflict";
  }
  const history = sourceHistoryText(caseData);
  if (configured?.examId === "PE104"
      && /尿潴留|完全排不出尿|尿不出来/.test(history)
      && /无明显膀胱充盈|膀胱未充盈|未见膀胱充盈/.test(resultText)) {
    return "urinary_retention_bladder_exam_conflict";
  }
  if (configured?.examId === "PE102"
      && /肾绞痛|绞痛/.test(history)
      && /无叩击痛|叩击痛阴性/.test(resultText)) {
    return "renal_colic_renal_exam_conflict";
  }
  return "";
}

function missingComponents(examId, reviewerStatus, blockedReason) {
  return (VITAL_COMPONENTS[examId] || []).map((component) => envelope({
    value: "",
    status: "not_measured",
    unit: component.unit,
    referenceRange: "",
    timepoint: "current_encounter",
    provenance: "not_recorded",
    reviewerStatus,
    affectsDiagnosis: false,
    affectsScore: false,
    teacherReviewRequired: reviewerStatus === "needs_review",
    expressionZh: expressionForMissing(reviewerStatus === "needs_review" ? "awaiting_review" : "not_measured", "zh"),
    expressionEn: expressionForMissing(reviewerStatus === "needs_review" ? "awaiting_review" : "not_measured", "en"),
    blockedReason,
    blockedUnsafeValueCount: 1,
    blockedIncorrectNormalCount: 1
  }));
}

function governedSourceExam(configured) {
  const value = text(configured.value || configured.result);
  const expressionZh = text(configured.expressionZh) || value;
  const expressionEn = text(configured.expressionEn) || (/[a-z]/i.test(value) && !/[\u3400-\u9fff]/u.test(value)
    ? value
    : "Awaiting reviewed result translation");
  const components = (configured.components || []).map((component) => envelope({
    ...component,
    status: component.status || "measured",
    provenance: "source",
    reviewerStatus: component.reviewerStatus || "not_required",
    affectsDiagnosis: component.affectsDiagnosis !== false,
    affectsScore: false,
    teacherReviewRequired: false,
    expressionZh: component.expressionZh || text(component.value),
    expressionEn: component.expressionEn || text(component.value)
  }));
  return envelope({
    value,
    status: configured.status || "measured",
    unit: configured.unit,
    referenceRange: configured.referenceRange,
    timepoint: configured.timepoint || "current_encounter",
    provenance: "source",
    reviewerStatus: "not_required",
    affectsDiagnosis: true,
    affectsScore: false,
    teacherReviewRequired: false,
    expressionZh,
    expressionEn,
    components
  });
}

function blockedMedical(configured, reason) {
  const componentCount = (VITAL_COMPONENTS[configured?.examId] || []).length;
  return envelope({
    value: "",
    status: "BLOCKED_MEDICAL",
    unit: configured?.unit || "",
    referenceRange: configured?.referenceRange || "",
    timepoint: configured?.timepoint || "current_encounter",
    provenance: "source_conflict",
    reviewerStatus: "needs_review",
    affectsDiagnosis: false,
    affectsScore: false,
    teacherReviewRequired: true,
    expressionZh: expressionForMissing("blocked", "zh"),
    expressionEn: expressionForMissing("blocked", "en"),
    blockedReason: reason,
    blockedUnsafeValueCount: Math.max(1, componentCount),
    blockedIncorrectNormalCount: configured?.abnormal === false ? Math.max(1, componentCount) : 0,
    components: missingComponents(configured?.examId, "needs_review", reason)
  });
}

function governedBloodPressureControl(caseData, configured) {
  if (hypertensionState(caseData) !== true || hypertensionControl(caseData) !== "well_controlled") return null;
  return envelope({
    value: "controlled",
    status: "controlled",
    unit: "",
    referenceRange: "",
    timepoint: "current_history_control_status",
    provenance: "source",
    reviewerStatus: "not_required",
    affectsDiagnosis: true,
    affectsScore: false,
    teacherReviewRequired: false,
    expressionZh: "目前控制平稳；当前资料未记录本次血压数值。",
    expressionEn: "Currently described as well controlled; no current blood-pressure measurement is recorded.",
    blockedReason: "unsupported_generated_measurement_withheld",
    blockedUnsafeValueCount: 1,
    blockedIncorrectNormalCount: configured?.abnormal === false ? 1 : 0,
    components: [envelope({
      value: "",
      status: "not_measured",
      unit: "mmHg",
      referenceRange: "",
      timepoint: "current_encounter",
      provenance: "not_recorded",
      reviewerStatus: "not_required",
      affectsDiagnosis: false,
      affectsScore: false,
      teacherReviewRequired: false,
      expressionZh: "未测量；当前资料未记录本次血压数值。",
      expressionEn: "Not measured; no current blood-pressure measurement is recorded.",
      blockedReason: "unsupported_generated_measurement_withheld",
      blockedUnsafeValueCount: 1,
      blockedIncorrectNormalCount: configured?.abnormal === false ? 1 : 0
    })]
  });
}

function governedTemperatureHistory(caseData, configured) {
  const state = feverState(caseData);
  const history = sourceHistoryText(caseData);
  const historicalPeak = history.match(/(?:最高|峰值)[^。；\d]{0,8}(\d{2}(?:\.\d)?)\s*℃/)?.[1];
  const expressionZh = state === true
    ? historicalPeak
      ? `当前体温未测量；病史记录既往最高体温${historicalPeak}℃。`
      : "当前体温未测量；病史提示有发热或寒战。"
    : state === false
      ? "当前体温未测量；病史中否认发热。"
      : expressionForMissing("not_measured", "zh");
  const expressionEn = state === true
    ? historicalPeak
      ? `Current temperature has not been measured; the history records a previous peak of ${historicalPeak}°C.`
      : "Current temperature has not been measured; the history records fever or chills."
    : state === false
      ? "Current temperature has not been measured; the history denies fever."
      : expressionForMissing("not_measured", "en");
  return envelope({
    value: "",
    status: "not_measured",
    unit: "℃",
    referenceRange: "",
    timepoint: "current_encounter",
    provenance: state === "unknown" ? "not_recorded" : "source_history",
    reviewerStatus: "needs_review",
    affectsDiagnosis: state !== "unknown",
    affectsScore: false,
    teacherReviewRequired: true,
    expressionZh,
    expressionEn,
    blockedReason: "unsupported_generated_measurement_withheld",
    blockedUnsafeValueCount: 1,
    blockedIncorrectNormalCount: configured?.abnormal === false ? 1 : 0,
    components: [envelope({
      value: "",
      status: "not_measured",
      unit: "℃",
      referenceRange: "",
      timepoint: "current_encounter",
      provenance: state === "unknown" ? "not_recorded" : "source_history",
      reviewerStatus: "needs_review",
      affectsDiagnosis: state !== "unknown",
      affectsScore: false,
      teacherReviewRequired: true,
      expressionZh,
      expressionEn,
      blockedReason: "unsupported_generated_measurement_withheld",
      blockedUnsafeValueCount: 1,
      blockedIncorrectNormalCount: configured?.abnormal === false ? 1 : 0
    })]
  });
}

function governPhysicalExamResult(caseData, item, configured) {
  if (!item) {
    return envelope({
      value: "",
      status: "not_examined",
      provenance: "not_recorded",
      reviewerStatus: "not_required",
      affectsDiagnosis: false,
      affectsScore: false,
      teacherReviewRequired: false,
      expressionZh: expressionForMissing("not_examined", "zh"),
      expressionEn: expressionForMissing("not_examined", "en")
    });
  }
  if (!configured) {
    return envelope({
      value: "",
      status: "not_examined",
      provenance: "not_recorded",
      reviewerStatus: "not_required",
      affectsDiagnosis: false,
      affectsScore: false,
      teacherReviewRequired: false,
      expressionZh: expressionForMissing("not_examined", "zh"),
      expressionEn: expressionForMissing("not_examined", "en")
    });
  }
  if (isReviewedSource(configured)) {
    const conflict = sourceConflict(caseData, configured);
    return conflict ? blockedMedical(configured, conflict) : governedSourceExam(configured);
  }
  if (isApprovedSimulatedNormal(configured)) {
    return envelope({
      ...configured,
      status: configured.status || "simulated_normal",
      provenance: "simulated_normal",
      reviewerStatus: "not_required",
      affectsDiagnosis: false,
      affectsScore: false,
      teacherReviewRequired: false
    });
  }
  if (item.examId === "PE002") {
    const controlled = governedBloodPressureControl(caseData, configured);
    if (controlled) return controlled;
  }
  if (item.examId === "PE001") return governedTemperatureHistory(caseData, configured);

  const componentCount = (VITAL_COMPONENTS[item.examId] || []).length;
  const kind = componentCount ? "not_measured" : "awaiting_review";
  const reviewerStatus = "needs_review";
  return envelope({
    value: "",
    status: componentCount ? "not_measured" : "awaiting_review",
    unit: "",
    referenceRange: "",
    timepoint: "current_encounter",
    provenance: "not_recorded",
    reviewerStatus,
    affectsDiagnosis: false,
    affectsScore: false,
    teacherReviewRequired: true,
    expressionZh: expressionForMissing(kind, "zh"),
    expressionEn: expressionForMissing(kind, "en"),
    blockedReason: configured.provenance === "simulated_normal"
      ? "simulated_normal_not_allowed"
      : "unsupported_generated_value_withheld",
    blockedUnsafeValueCount: Math.max(1, componentCount),
    blockedIncorrectNormalCount: configured.abnormal === false ? Math.max(1, componentCount) : 0,
    components: missingComponents(item.examId, reviewerStatus, "unsupported_generated_value_withheld")
  });
}

function resultText(result) {
  return [result?.value, result?.impression].map(text).filter(Boolean).join("；");
}

function detectCaseMedicalDataConflicts(caseData, results) {
  const sourceResults = (results || []).filter((result) =>
    result?.status === "final" && (!result?.provenance || result.provenance === "source"));
  const conflicts = [];
  const add = (code, rows) => {
    const resultIds = [...new Set(rows.map((row) => row?.resultId).filter(Boolean))];
    if (resultIds.length) conflicts.push({ code, resultIds });
  };
  const caseSignal = `${caseData?.diagnosis || ""} ${caseData?.clinical?.primaryProblem || ""}`;
  if (/感染|膀胱炎|肾盂肾炎|前列腺炎/.test(caseSignal)) {
    const urineNegative = sourceResults.filter((row) => /(?:白细胞|WBC)[^。；]{0,12}(?:阴性|正常|未见)/i.test(resultText(row)));
    const culturePositive = sourceResults.filter((row) => /(?:尿培养|culture)[^。；]{0,30}(?:阳性|生长|cfu|coli|菌)/i.test(resultText(row)));
    if (urineNegative.length && culturePositive.length) add("uti_urinalysis_culture_conflict", [...urineNegative, ...culturePositive]);
  }
  const pairedSignals = [
    ["anemia_panel_conflict", /(?:血红蛋白|Hb)[^。；]{0,12}(?:正常|normal)/i, /贫血|(?:血红蛋白|Hb)[^。；]{0,12}(?:降低|low)/i],
    ["infection_panel_conflict", /(?:白细胞|WBC|CRP|PCT)[^。；]{0,12}(?:正常|阴性|normal|negative)/i, /(?:白细胞|WBC|CRP|PCT)[^。；]{0,12}(?:升高|阳性|high|positive)/i],
    ["renal_function_panel_conflict", /(?:肌酐|eGFR|肾功能)[^。；]{0,12}(?:正常|normal)/i, /(?:肌酐|eGFR|肾功能)[^。；]{0,12}(?:升高|降低|异常|high|low|abnormal)/i]
  ];
  for (const [code, normalPattern, abnormalPattern] of pairedSignals) {
    const normal = sourceResults.filter((row) => normalPattern.test(resultText(row)));
    const abnormal = sourceResults.filter((row) => abnormalPattern.test(resultText(row)));
    const normalOnly = normal.filter((row) => !abnormal.some((candidate) => candidate.resultId === row.resultId));
    const abnormalOnly = abnormal.filter((row) => !normal.some((candidate) => candidate.resultId === row.resultId));
    if (normalOnly.length && abnormalOnly.length) add(code, [...normalOnly, ...abnormalOnly]);
  }
  return conflicts;
}

module.exports = {
  MEDICAL_DATA_POLICY,
  VITAL_COMPONENTS,
  detectCaseMedicalDataConflicts,
  governPhysicalExamResult,
  hypertensionControl,
  hypertensionState,
  sourceConflict
};

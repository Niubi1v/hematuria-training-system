const CJK_PATTERN = /[\u3400-\u9fff]/u;
const ENGLISH_ORDER_PLACEHOLDER = "Awaiting reviewed order-name translation";
const ENGLISH_CATEGORY_PLACEHOLDER = "Awaiting reviewed category translation";
const ENGLISH_RESULT_PLACEHOLDER = "Awaiting reviewed result translation";
const ENGLISH_EXAM_PLACEHOLDER = "Awaiting reviewed examination translation";
const ENGLISH_METADATA_PLACEHOLDER = "Awaiting reviewed metadata";
const PENDING_EXAM_RESULT = Object.freeze({
  zh: "当前查体结果缺少可核对的来源或时间点，暂不能显示为正常或异常。",
  en: "This current examination result is awaiting source and timepoint review."
});

const MEDICAL_DATA_POLICY = Object.freeze({
  physicalExamSourceProvenance: Object.freeze(["source", "observed", "expert_approved"]),
  simulatedNormalExamIds: Object.freeze([]),
  delayedResultRelease: "withhold_until_available",
  missingDataState: "not-available"
});

const primaryCategoryLabels = Object.freeze({
  检验: "Laboratory tests",
  检查: "Investigations",
  "病理/操作": "Procedures and pathology",
  围术期评估: "Perioperative assessment"
});

const statusLabels = Object.freeze({
  final: Object.freeze({ zh: "已出报告", en: "Reported" }),
  not_available: Object.freeze({ zh: "当前病例未提供", en: "Not available in this case" }),
  not_performed: Object.freeze({ zh: "未实施", en: "Not performed" }),
  needs_review: Object.freeze({ zh: "待审核", en: "Awaiting review" })
});

function containsCjk(value) {
  return CJK_PATTERN.test(String(value || ""));
}

function firstEnglishAlias(order) {
  return (order?.synonyms || []).find((value) => {
    const text = String(value || "").trim();
    return text && !containsCjk(text) && /[a-z]/i.test(text) && text.toLowerCase() !== String(order?.orderId || "").toLowerCase();
  }) || "";
}

function safeEnglishText(value, placeholder) {
  const text = String(value || "").trim();
  return text && !containsCjk(text) ? text : placeholder;
}

function presentOrderCatalogItem(order, language = "zh") {
  if (language !== "en") return { ...order, translationAvailable: true };
  const alias = firstEnglishAlias(order);
  return {
    ...order,
    displayName: alias || ENGLISH_ORDER_PLACEHOLDER,
    primaryCategoryLabel: primaryCategoryLabels[order.primaryCategory] || ENGLISH_CATEGORY_PLACEHOLDER,
    secondaryCategoryLabel: safeEnglishText(order.secondaryCategory, ENGLISH_CATEGORY_PLACEHOLDER),
    priorityLabel: safeEnglishText(order.priority, "Awaiting reviewed priority translation"),
    studentDisplayHintLabel: safeEnglishText(order.studentDisplayHint, ENGLISH_CATEGORY_PLACEHOLDER),
    translationAvailable: Boolean(alias)
  };
}

function presentPhysicalExamItem(item, language = "zh") {
  if (language !== "en") return { ...item, translationAvailable: true };
  const alias = (item?.synonyms || []).find((value) => {
    const text = String(value || "").trim();
    return text && !containsCjk(text) && /[a-z]/i.test(text);
  }) || "";
  return {
    ...item,
    displayName: alias || ENGLISH_EXAM_PLACEHOLDER,
    category: safeEnglishText(item.category, "Physical examination"),
    studentHint: safeEnglishText(item.studentHint, ENGLISH_EXAM_PLACEHOLDER),
    translationAvailable: Boolean(alias)
  };
}

function needsReviewedMetadata(order, result) {
  return result?.status === "final"
    && order?.primaryCategory === "检验"
    && /\d/.test(String(result?.value || ""))
    && (!String(result?.unit || "").trim() || !String(result?.referenceRange || "").trim());
}

function presentOrderResult(order, result, language = "zh") {
  const metadataStatus = needsReviewedMetadata(order, result) ? "awaiting_reviewed_metadata" : "complete";
  if (language !== "en") {
    return {
      ...result,
      orderCategory: `${order.primaryCategory}/${order.secondaryCategory}`,
      abnormalLevel: (result.abnormalFlags || []).join("、") || result.status,
      metadataStatus,
      translationStatus: "source_language"
    };
  }

  const catalog = presentOrderCatalogItem(order, language);
  const originalValue = String(result.value || "");
  const originalImpression = String(result.impression || "");
  const value = safeEnglishText(originalValue, originalValue ? ENGLISH_RESULT_PLACEHOLDER : "");
  const impression = safeEnglishText(originalImpression, originalImpression ? ENGLISH_RESULT_PLACEHOLDER : "");
  const translationPending = containsCjk(originalValue) || containsCjk(originalImpression);
  const rawFlags = (result.abnormalFlags || []).map((value) => String(value || ""));
  const abnormalFlags = result.status === "final" && rawFlags.some((value) =>
    !/正常|阴性|\bnormal\b|\bnegative\b/i.test(value)
  ) ? ["abnormal"] : [];
  return {
    ...result,
    orderCategory: `${catalog.primaryCategoryLabel}/${catalog.secondaryCategoryLabel}`,
    value,
    impression,
    result: value || impression || ENGLISH_RESULT_PLACEHOLDER,
    abnormalFlags,
    abnormalLevel: abnormalFlags.length ? "abnormal" : result.status,
    metadataStatus,
    translationStatus: translationPending || !catalog.translationAvailable
      ? "awaiting_reviewed_translation"
      : "source_text_no_cjk"
  };
}

function clinicalResultAvailability(result) {
  const availableAt = String(result?.availableAt || "");
  if (availableAt === "delayed") {
    return {
      release: false,
      status: "pending",
      reason: "result_not_available_at_current_timepoint"
    };
  }
  const caseId = String(result?.caseId || "");
  const orderId = String(result?.orderId || "");
  const resultId = String(result?.resultId || "");
  const sourceVersion = String(result?.sourceVersion || "");
  const exactBinding = Boolean(caseId && orderId && resultId && sourceVersion)
    && resultId.startsWith(`${caseId}:${orderId}:`);
  if (!exactBinding) {
    return {
      release: false,
      status: "needs_review",
      reason: "result_source_binding_missing"
    };
  }
  if (availableAt !== "immediate") {
    return {
      release: false,
      status: "needs_review",
      reason: "result_timepoint_missing"
    };
  }
  return {
    release: true,
    status: String(result?.status || "reported"),
    reason: "source_bound_current_result"
  };
}

function presentMatchedOrder(order, language = "zh") {
  const catalog = presentOrderCatalogItem(order, language);
  return {
    orderId: order.orderId,
    displayName: catalog.displayName,
    translationAvailable: catalog.translationAvailable
  };
}

function presentExamResult(result, language = "zh") {
  if (language !== "en") return { text: String(result || ""), translationStatus: "source_language" };
  const text = safeEnglishText(result, ENGLISH_RESULT_PLACEHOLDER);
  return {
    text,
    translationStatus: containsCjk(result) ? "awaiting_reviewed_translation" : "source_text_no_cjk"
  };
}

function physicalExamAuthority(result) {
  const provenance = String(result?.provenance || "").toLowerCase();
  const sourceRef = String(result?.sourceRef || result?.sourceVersion || result?.sourcePath || "").trim();
  if (provenance === "simulated_normal") {
    const allowed = MEDICAL_DATA_POLICY.simulatedNormalExamIds.includes(String(result?.examId || ""))
      && Boolean(sourceRef);
    return {
      release: allowed,
      authorityStatus: allowed ? "allowed_simulation" : "needs_review",
      provenanceStatus: allowed ? "simulated_normal_allowed" : "simulated_normal_not_allowed"
    };
  }
  const allowedSource = MEDICAL_DATA_POLICY.physicalExamSourceProvenance.includes(provenance);
  if (allowedSource && sourceRef) {
    return {
      release: true,
      authorityStatus: "source_bound",
      provenanceStatus: provenance
    };
  }
  return {
    release: false,
    authorityStatus: "needs_review",
    provenanceStatus: provenance ? "unreviewed" : "missing"
  };
}

function presentPhysicalExamResult(result, language = "zh") {
  const authority = physicalExamAuthority(result);
  if (!authority.release) {
    return {
      text: PENDING_EXAM_RESULT[language],
      translationStatus: "source_review_pending",
      authorityStatus: authority.authorityStatus,
      provenanceStatus: authority.provenanceStatus
    };
  }
  return {
    ...presentExamResult(result?.result || "", language),
    authorityStatus: authority.authorityStatus,
    provenanceStatus: authority.provenanceStatus
  };
}

function reportStatusPresentation(item, language = "zh") {
  const signal = [...(item?.abnormalFlags || []), item?.abnormalLevel || ""].join(" ").toLowerCase();
  const rawStatus = String(item?.status || "").toLowerCase();
  if (/待审核|需审核|needs.review|review/.test(`${signal} ${rawStatus}`)) {
    return { state: "needs-review", label: statusLabels.needs_review[language] };
  }
  if (rawStatus === "not_available") {
    return { state: "not-available", label: statusLabels.not_available[language] };
  }
  if (rawStatus === "not_performed") {
    return { state: "not-performed", label: statusLabels.not_performed[language] };
  }
  const needsReview = false;
  const abnormal = !needsReview && /异常|阳性|升高|降低|abnormal|positive|high|low|critical/.test(signal);
  const normal = !needsReview && !abnormal && /正常|阴性|normal|negative/.test(signal);
  const state = needsReview ? "needs-review" : abnormal ? "abnormal" : normal ? "normal" : "reported";
  const label = needsReview
    ? statusLabels.needs_review[language]
    : abnormal
      ? (language === "en" ? "Abnormal" : "异常")
      : normal
        ? (language === "en" ? "Normal" : "正常")
        : statusLabels[rawStatus]?.[language] || (language === "en" ? "Report status available" : "报告状态已更新");
  return { state, label };
}

function safeStudentFacingText(value, language = "zh", placeholder = ENGLISH_RESULT_PLACEHOLDER) {
  return language === "en" ? safeEnglishText(value, placeholder) : String(value || "");
}

module.exports = {
  ENGLISH_CATEGORY_PLACEHOLDER,
  ENGLISH_EXAM_PLACEHOLDER,
  ENGLISH_METADATA_PLACEHOLDER,
  ENGLISH_ORDER_PLACEHOLDER,
  ENGLISH_RESULT_PLACEHOLDER,
  MEDICAL_DATA_POLICY,
  clinicalResultAvailability,
  containsCjk,
  firstEnglishAlias,
  needsReviewedMetadata,
  presentExamResult,
  presentMatchedOrder,
  presentOrderCatalogItem,
  presentOrderResult,
  presentPhysicalExamItem,
  presentPhysicalExamResult,
  reportStatusPresentation,
  safeStudentFacingText
};

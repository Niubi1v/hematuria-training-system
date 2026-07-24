const CJK_PATTERN = /[\u3400-\u9fff]/u;
const ENGLISH_ORDER_PLACEHOLDER = "Awaiting reviewed order-name translation";
const ENGLISH_CATEGORY_PLACEHOLDER = "Awaiting reviewed category translation";
const ENGLISH_RESULT_PLACEHOLDER = "Awaiting reviewed result translation";
const ENGLISH_EXAM_PLACEHOLDER = "Awaiting reviewed examination translation";
const ENGLISH_METADATA_PLACEHOLDER = "Awaiting reviewed metadata";

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
  const abnormalFlags = (result.abnormalFlags || []).length ? ["abnormal"] : [];
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

function reportStatusPresentation(item, language = "zh") {
  const signal = [...(item?.abnormalFlags || []), item?.abnormalLevel || ""].join(" ").toLowerCase();
  const rawStatus = String(item?.status || "").toLowerCase();
  const needsReview = /待审核|需审核|needs.review|review/.test(`${signal} ${rawStatus}`);
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
  containsCjk,
  firstEnglishAlias,
  needsReviewedMetadata,
  presentExamResult,
  presentMatchedOrder,
  presentOrderCatalogItem,
  presentOrderResult,
  presentPhysicalExamItem,
  reportStatusPresentation,
  safeStudentFacingText
};

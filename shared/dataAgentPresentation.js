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
  not_available: Object.freeze({ zh: "等待医学审核", en: "Awaiting medical review" }),
  not_performed: Object.freeze({ zh: "未实施", en: "Not performed" }),
  needs_review: Object.freeze({ zh: "待审核", en: "Awaiting review" })
});

const simulatedNormalPhysicalExamPolicies = Object.freeze({
  PE202: Object.freeze({
    policyId: "MEDICAL_DATA_POLICY:physical_exam:PE202",
    affectsDiagnosis: false,
    affectsScore: false,
    reviewerStatus: "not_required",
    result: Object.freeze({
      zh: "阴囊、睾丸及附睾未见明显异常。",
      en: "No obvious abnormality was found in the scrotum, testes, or epididymides."
    })
  })
});

const studentCatalogSpecs = Object.freeze([
  { catalogId: "STD-US-001", sourceOrderId: "IMG-US-001", primaryCategory: "检查", secondaryCategory: "超声", displayName: "彩超泌尿系（双肾、输尿管及膀胱）+残余尿", aliases: ["IMG-US-002", "肾脏及输尿管超声", "肾脏超声", "输尿管超声", "肾积水超声"] },
  { catalogId: "STD-US-002", sourceOrderId: "IMG-US-003", primaryCategory: "检查", secondaryCategory: "超声", displayName: "彩超男性生殖系统（阴囊、睾丸、输精管）+精索静脉", applicableSex: ["男"] },
  { catalogId: "STD-US-003", sourceOrderId: "STD-US-003", primaryCategory: "检查", secondaryCategory: "超声", displayName: "彩超女性生殖系统", applicableSex: ["女"], aliases: ["妇科超声", "女性生殖系统超声"] },
  { catalogId: "STD-XR-003", sourceOrderId: "IMG-CT-006", primaryCategory: "检查", secondaryCategory: "X线", displayName: "X光膀胱造影" },
  { catalogId: "STD-CT-001", sourceOrderId: "IMG-CT-001", primaryCategory: "检查", secondaryCategory: "CT", displayName: "双肾+输尿管CT平扫" },
  { catalogId: "STD-CT-002", sourceOrderId: "IMG-CT-003", primaryCategory: "检查", secondaryCategory: "CT", displayName: "双肾+输尿管CT平扫+增强" },
  { catalogId: "STD-CT-003", sourceOrderId: "IMG-CT-007", primaryCategory: "检查", secondaryCategory: "CT", displayName: "双肾+输尿管CT平扫+增强+CTA" },
  { catalogId: "STD-CT-004", sourceOrderId: "IMG-CT-007", primaryCategory: "检查", secondaryCategory: "CT", displayName: "双肾+输尿管CT平扫+增强+CTA+CTV" },
  { catalogId: "STD-CT-005", sourceOrderId: "IMG-CT-005", primaryCategory: "检查", secondaryCategory: "CT", displayName: "盆腔CT平扫" },
  { catalogId: "STD-CT-006", sourceOrderId: "IMG-CT-005", primaryCategory: "检查", secondaryCategory: "CT", displayName: "盆腔CT平扫+增强" },
  { catalogId: "STD-CT-007", sourceOrderId: "IMG-CT-007", primaryCategory: "检查", secondaryCategory: "CT", displayName: "盆腔CT平扫+增强+CTA" },
  { catalogId: "STD-CT-008", sourceOrderId: "IMG-CT-007", primaryCategory: "检查", secondaryCategory: "CT", displayName: "盆腔CT平扫+增强+CTA+CTV" },
  { catalogId: "STD-CT-009", sourceOrderId: "IMG-CT-004", primaryCategory: "检查", secondaryCategory: "CT", displayName: "胸部CT平扫" },
  { catalogId: "STD-CT-010", sourceOrderId: "IMG-CT-004", primaryCategory: "检查", secondaryCategory: "CT", displayName: "胸部CT平扫+增强" },
  { catalogId: "STD-CT-011", sourceOrderId: "IMG-CT-002", primaryCategory: "检查", secondaryCategory: "CT", displayName: "双肾CTU平扫+增强", aliases: ["CTUCT"] },
  { catalogId: "STD-MR-001", sourceOrderId: "IMG-MR-002", primaryCategory: "检查", secondaryCategory: "MRI", displayName: "双肾+输尿管MR平扫" },
  { catalogId: "STD-MR-002", sourceOrderId: "IMG-MR-003", primaryCategory: "检查", secondaryCategory: "MRI", displayName: "双肾+输尿管MR平扫+增强" },
  { catalogId: "STD-MR-003", sourceOrderId: "IMG-MR-001", primaryCategory: "检查", secondaryCategory: "MRI", displayName: "盆腔MR平扫" },
  { catalogId: "STD-MR-004", sourceOrderId: "IMG-MR-001", primaryCategory: "检查", secondaryCategory: "MRI", displayName: "盆腔MR平扫+增强" },
  { catalogId: "STD-MR-005", sourceOrderId: "IMG-MR-004", primaryCategory: "检查", secondaryCategory: "MRI", displayName: "前列腺MR平扫", applicableSex: ["男"] },
  { catalogId: "STD-MR-006", sourceOrderId: "IMG-MR-004", primaryCategory: "检查", secondaryCategory: "MRI", displayName: "前列腺MR平扫+增强", applicableSex: ["男"] },
  { catalogId: "STD-NUC-001", sourceOrderId: "NUC-001", primaryCategory: "检查", secondaryCategory: "核医学", displayName: "全身骨扫描" },
  { catalogId: "STD-NUC-002", sourceOrderId: "NUC-002", primaryCategory: "检查", secondaryCategory: "核医学", displayName: "PET/CT" },
  { catalogId: "STD-NUC-003", sourceOrderId: "FUNC-002", primaryCategory: "检查", secondaryCategory: "核医学", displayName: "核素肾图" },
  { catalogId: "STD-PATH-001", sourceOrderId: "LAB-PATH-001", primaryCategory: "病理/操作", secondaryCategory: "病理", displayName: "常规石蜡病理", aliases: ["组织病理"] },
  { catalogId: "STD-PATH-002", sourceOrderId: "STD-PATH-002", primaryCategory: "病理/操作", secondaryCategory: "病理", displayName: "冰冻病理", aliases: ["术中冰冻", "冰冻切片"] },
  { catalogId: "STD-PATH-003", sourceOrderId: "LAB-UR-006", primaryCategory: "病理/操作", secondaryCategory: "病理", displayName: "尿脱落细胞学" },
  { catalogId: "STD-PATH-004", sourceOrderId: "LAB-PATH-003", primaryCategory: "病理/操作", secondaryCategory: "病理", displayName: "穿刺活检病理", aliases: ["LAB-PATH-002", "活检", "输尿管镜活检病理", "URS活检", "输尿管镜活检", "肾盂活检"] }
]);

const projectedSourceIds = new Set([
  ...studentCatalogSpecs.map((item) => item.sourceOrderId),
  "IMG-US-002",
  "LAB-PATH-002"
]);

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function buildStudentOrderCatalog(catalog) {
  const sourceCatalog = Array.isArray(catalog) ? catalog : [];
  const byId = new Map(sourceCatalog.map((item) => [String(item.orderId), item]));
  const retained = sourceCatalog.filter((item) => !projectedSourceIds.has(String(item.orderId)));
  const projected = studentCatalogSpecs.map((spec) => {
    const source = byId.get(spec.sourceOrderId) || {};
    return {
      scenario: "",
      resultShouldInclude: "",
      priority: "按需",
      studentDisplayHint: "",
      cautions: "",
      sourceUrl: "",
      ...source,
      ...spec,
      orderId: spec.sourceOrderId,
      synonyms: uniqueStrings([
        spec.displayName,
        spec.sourceOrderId,
        source.displayName,
        ...(source.synonyms || []),
        ...(spec.aliases || [])
      ])
    };
  });
  return [...retained, ...projected];
}

function sourceOrderId(order) {
  return String(order?.sourceOrderId || order?.orderId || "");
}

function orderApplicableForSex(order, sex) {
  const applicableSex = order?.applicableSex;
  return !Array.isArray(applicableSex) || !applicableSex.length || applicableSex.includes(sex);
}

function splitOrderInput(value) {
  const text = String(value || "").replace(/\s+and\s+/gi, "；");
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of text) {
    if ("（([".includes(character)) depth += 1;
    if ("）)]".includes(character)) depth = Math.max(0, depth - 1);
    if (depth === 0 && /[；;、,，\n]/.test(character)) {
      if (current.trim()) parts.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return uniqueStrings(parts);
}

function orderResultIsReportable(result) {
  return result?.status === "final";
}

function simulatedPhysicalExamResult(item, language = "zh") {
  const policy = simulatedNormalPhysicalExamPolicies[String(item?.examId || "")];
  if (!policy
    || policy.affectsDiagnosis !== false
    || policy.affectsScore !== false
    || policy.reviewerStatus !== "not_required") return null;
  return {
    result: policy.result[language === "en" ? "en" : "zh"],
    provenance: "simulated_normal",
    affectsDiagnosis: policy.affectsDiagnosis,
    affectsScore: policy.affectsScore,
    reviewerStatus: policy.reviewerStatus,
    simulationPolicyId: policy.policyId
  };
}

function containsCjk(value) {
  return CJK_PATTERN.test(String(value || ""));
}

function firstEnglishAlias(order) {
  return (order?.synonyms || []).find((value) => {
    const text = String(value || "").trim();
    return text
      && !containsCjk(text)
      && /[a-z]/i.test(text)
      && !/^(?:IMG|LAB|END|FUNC|NUC|PERI|STD)-[A-Z0-9-]+$/i.test(text)
      && text.toLowerCase() !== String(order?.orderId || "").toLowerCase();
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
  buildStudentOrderCatalog,
  containsCjk,
  firstEnglishAlias,
  needsReviewedMetadata,
  orderApplicableForSex,
  orderResultIsReportable,
  presentExamResult,
  presentMatchedOrder,
  presentOrderCatalogItem,
  presentOrderResult,
  presentPhysicalExamItem,
  reportStatusPresentation,
  safeStudentFacingText,
  simulatedPhysicalExamResult,
  splitOrderInput,
  sourceOrderId
};

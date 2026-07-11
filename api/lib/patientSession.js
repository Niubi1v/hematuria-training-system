const cases = require("../../data/cases.json");
const { callLLM, getLLMProviderConfig } = require("./llmClient.runtime.js");
const { matchStructuredFacts } = require("./structuredFacts.js");

const sessionCache = globalThis.__hematuriaSessionCache || new Map();
const answerCache = globalThis.__hematuriaAnswerCache || new Map();
globalThis.__hematuriaSessionCache = sessionCache;
globalThis.__hematuriaAnswerCache = answerCache;

const teacherOnlyKeys = [
  "urine_test_result",
  "blood_test_result",
  "imaging_finding",
  "cystoscopy_result",
  "pathology_result",
  "renal_biopsy_result",
  "physical_exam_result",
  "primary_diagnosis",
  "final_diagnosis",
  "differential_diagnosis",
  "treatment_plan",
  "perioperative_plan",
  "mdt_trigger",
  "scoring_points",
  "evaluator_rubric",
  "standard_case_summary"
];

const patientBlockedTerms = [
  "根据原始病史",
  "根据病例资料",
  "病例资料显示",
  "未主动诉",
  "未诉",
  "需追问",
  "CT提示",
  "CTU提示",
  "彩超提示",
  "超声提示",
  "膀胱镜",
  "病理",
  "癌",
  "肿瘤",
  "占位",
  "癌栓",
  "淋巴结",
  "骨转移",
  "诊断",
  "治疗",
  "手术",
  "化疗",
  "放疗",
  "评分",
  "教师提示",
  "标准答案"
];

const reportWords = ["ct", "ctu", "彩超", "超声", "b超", "膀胱镜", "病理", "尿常规", "尿检", "肌酐", "egfr", "psa", "培养", "药敏", "肾活检", "报告", "检查结果", "片子", "影像"];
const diagnosisWords = ["什么病", "诊断", "是不是癌", "癌症", "肿瘤", "严重吗", "能治好吗", "预后"];

function getCaseById(caseId) {
  return cases.find((item) => String(item.id).toLowerCase() === String(caseId).toLowerCase());
}

function normalize(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, "").replace(/[，。！？；：、,.!?;:()[\]{}'"“”‘’]/g, "");
}

function hasAny(text, words) {
  const value = normalize(text);
  return words.some((word) => value.includes(normalize(word)));
}

function blockedHits(text) {
  return patientBlockedTerms.filter((term) => String(text || "").includes(term));
}

function cleanPatientValue(value) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/未主动诉[^，。；;]*[，。；;]?/g, "")
    .replace(/未诉\/?需主动询问/g, "")
    .replace(/未诉\/?/g, "")
    .replace(/需主动询问[^，。；;]*[，。；;]?/g, "")
    .replace(/需追问[^，。；;]*[，。；;]?/g, "")
    .trim();
  if (!text || /未诉\/?需主动询问|需追问|提交前隐藏|评分/.test(text)) return "";
  if (blockedHits(text).length) return "";
  return text;
}

function field(value, fallback = "不太清楚") {
  const clean = cleanPatientValue(value);
  return clean ? { value: clean, source: "case_explicit" } : { value: fallback, source: "unknown" };
}

function completed(value) {
  return { value, source: "ai_completed" };
}

function firstField(...values) {
  for (const value of values) {
    const clean = cleanPatientValue(value);
    if (clean) return { value: clean, source: "case_explicit" };
  }
  return { value: "不太清楚", source: "unknown" };
}

function patientHistoryField(...values) {
  for (const value of values) {
    const clean = String(value || "")
      .replace(/未主动诉[^，。；;]*[，。；;]?/g, "")
      .replace(/需主动询问[^，。；;]*[，。；;]?/g, "")
      .replace(/需追问[^，。；;]*[，。；;]?/g, "")
      .replace(/提交前隐藏|评分点|教师提示/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (clean) return { value: clean, source: "case_explicit" };
  }
  return { value: "这个我不太清楚。", source: "unknown" };
}

function sentenceWith(value, words) {
  return String(value || "")
    .split(/[。；;\n]/)
    .flatMap((line) => line.split(/[，,]/))
    .map((line) => cleanPatientValue(line))
    .find((line) => line && words.some((word) => line.includes(word))) || "";
}

function findDurationNearHematuria(text) {
  const compact = String(text || "").replace(/\s+/g, "");
  const durationPattern = "([半\\d一二两三四五六七八九十]+(?:小时|天|日|周|月|个月|年)(?:余|多|左右)?)";
  const symptomPattern = "(?:小便(?:颜色)?(?:变红|发红)|尿(?:色)?(?:变红|发红)|血尿|尿潜血阳性|尿隐血阳性|肉眼血尿|镜下血尿)";
  const after = new RegExp(`${symptomPattern}[^，。；、,;]*?${durationPattern}`).exec(compact);
  if (after?.[1]) return after[1];
  const before = new RegExp(`${durationPattern}[^，。；、,;]*?${symptomPattern}`).exec(compact);
  if (before?.[1]) return before[1];
  const allDurations = Array.from(compact.matchAll(new RegExp(durationPattern, "g"))).map((match) => match[1]);
  return allDurations[allDurations.length - 1] || "";
}

function simplifiedChiefComplaintZh(raw) {
  const text = String(raw || "").trim();
  const duration = findDurationNearHematuria(text) || "数天";
  if (/小便|尿色|尿液|发红|变红/.test(text) && !/尿潜血|尿隐血|镜下/.test(text)) return `小便颜色变红${duration}`;
  return `血尿${duration}`;
}

function buildRawPatientFacingProfile(caseData) {
  const illness = caseData.presentIllness || {};
  const risk = caseData.riskFactors || {};
  const answers = caseData.patientAnswers || {};
  const pfp = caseData.patientFacingProfile || {};
  const sh = caseData.structuredHistory || {};
  const simplifiedComplaint = simplifiedChiefComplaintZh(pfp.chiefComplaint || caseData.studentChiefComplaint || caseData.chiefComplaint);
  return {
    patient_id: field(caseData.id),
    age: field(pfp.age || caseData.age),
    gender: field(pfp.sex || caseData.sex),
    chief_complaint: field(simplifiedComplaint),
    patient_opening_statement: field(`医生您好，我是因为${simplifiedComplaint || "小便颜色异常"}来看病的。`),
    current_symptoms_patient_safe: field(simplifiedComplaint),
    hematuria_visibility: firstField(pfp.hematuriaType, illness.hematuriaType),
    hematuria_onset_time: firstField(illness.onset, illness.duration),
    hematuria_frequency: firstField(illness.frequency, illness.duration),
    hematuria_phase: firstField(pfp.hematuriaPhase, answers.phase, illness.hematuriaPhase),
    hematuria_color: firstField(pfp.urineColor, answers.color, illness.color),
    clot_status: firstField(pfp.clots, answers.clots, illness.clots),
    pain_status: firstField(answers.pain, illness.pain),
    urinary_frequency_urgency_dysuria: firstField(pfp.luts, answers.irritativeSymptoms, illness.urinaryFrequency, illness.urgency, illness.dysuria),
    voiding_difficulty: firstField(sentenceWith(pfp.luts, ["排尿困难", "尿线", "尿潴留"]), illness.voidingDifficulty),
    flank_pain: firstField(pfp.flankPain, illness.flankPain, answers.stoneClues),
    fever_chills: firstField(pfp.fever, answers.fever, illness.fever),
    nausea_vomiting: firstField(illness.nauseaVomiting),
    foamy_urine: firstField(sentenceWith(pfp.glomerularClues, ["泡沫"]), sentenceWith(answers.glomerularClues, ["泡沫"])),
    edema: firstField(sentenceWith(pfp.glomerularClues, ["水肿", "眼睑", "下肢"]), sentenceWith(answers.glomerularClues, ["水肿", "眼睑", "下肢"])),
    blood_pressure_related_symptoms: firstField(sentenceWith(pfp.knownPastHistory, ["高血压"]), sentenceWith(caseData.pastHistory, ["高血压"])),
    recent_uri_or_sore_throat: firstField(sentenceWith(pfp.glomerularClues, ["感冒", "咽痛", "扁桃体"]), answers.glomerularClues),
    triggers: {
      exercise: firstField(sentenceWith(illness.trigger, ["运动", "劳累"])),
      trauma: firstField(risk.trauma, sentenceWith(illness.trigger, ["外伤"])),
      sex: firstField(sentenceWith(illness.trigger, ["性生活"])),
      catheterization: firstField(sentenceWith(illness.trigger, ["导尿"])),
      cystoscopy: firstField(sentenceWith(illness.trigger, ["膀胱镜"])),
      surgery: firstField(sentenceWith(illness.trigger, ["手术"])),
      menstruation: firstField(sentenceWith(answers.gynecologicClues, ["月经"]), sentenceWith(caseData.personalHistory, ["月经"]))
    },
    past_history_patient_safe: patientHistoryField(pfp.knownPastHistory, caseData.pastHistory),
    medication_patient_safe: firstField(sh.medicationAnswerZh, pfp.knownMedication, risk.anticoagulants, caseData.medication),
    allergy_history: firstField(sh.allergyHistory?.patientAnswerZh, sentenceWith(caseData.pastHistory, ["过敏"]), sentenceWith(caseData.personalHistory, ["过敏"])),
    smoking_history: firstField(sh.smokingHistory?.patientAnswerZh, sentenceWith(pfp.personalAndFamilyRisk, ["吸烟", "抽烟"]), risk.smoking),
    drinking_history: firstField(sh.alcoholHistory?.patientAnswerZh, sentenceWith(pfp.personalAndFamilyRisk, ["饮酒", "喝酒"]), risk.alcohol),
    occupational_exposure: firstField(sh.occupationalExposure?.patientAnswerZh, sentenceWith(pfp.personalAndFamilyRisk, ["职业", "染料", "化工", "橡胶", "皮革", "重金属"]), risk.occupation),
    family_history: firstField(sh.familyHistory?.patientAnswerZh, sentenceWith(pfp.personalAndFamilyRisk, ["家族"]), risk.familyHistory, caseData.familyHistory),
    menstrual_gynecologic_history: firstField(answers.gynecologicClues),
    general_condition: {
      appetite: firstField(sentenceWith(answers.generalCondition, ["食欲", "胃口"])),
      sleep: firstField(sentenceWith(answers.generalCondition, ["睡眠"])),
      stool: firstField(sentenceWith(answers.generalCondition, ["大便"])),
      weight_change: firstField(sentenceWith(answers.generalCondition, ["体重", "消瘦"]))
    },
    patient_persona: {
      emotion: completed("有些担心，但能配合问诊。"),
      health_literacy: completed("医学知识有限，主要按自己的感受回答。"),
      memory_reliability: completed("对明显症状记得较清楚，检查细节说不清。"),
      cooperation_style: completed("医生问到具体问题时再回答。")
    }
  };
}

function validateRequiredProfileFacts(caseData, profile) {
  const structured = caseData.structuredHistory || {};
  const checks = [
    ["past_history_patient_safe", profile.past_history_patient_safe],
    ["smoking_history", structured.smokingHistory ? profile.smoking_history : null],
    ["drinking_history", structured.alcoholHistory ? profile.drinking_history : null],
    ["allergy_history", structured.allergyHistory ? profile.allergy_history : null],
    ["medication_patient_safe", structured.medicationAnswerZh ? profile.medication_patient_safe : null]
  ];
  const missing = checks.filter(([, value]) => value && (value.source === "unknown" || !String(value.value || "").trim())).map(([key]) => key);
  if (missing.length) throw new Error(`Patient-facing profile lost structured facts for ${caseData.id}: ${missing.join(", ")}`);
}

function localCompleteProfile(rawProfile) {
  const clone = JSON.parse(JSON.stringify(rawProfile));
  const fill = (node) => {
    Object.keys(node).forEach((key) => {
      const value = node[key];
      if (value && typeof value === "object" && "value" in value && "source" in value) {
        if (value.source === "unknown" || !String(value.value || "").trim()) {
          node[key] = completed(["nausea_vomiting", "foamy_urine", "edema"].includes(key) ? "我没有特别注意到。" : "这个我不太清楚。");
        }
      } else if (value && typeof value === "object") {
        fill(value);
      }
    });
  };
  fill(clone);
  return clone;
}

function stripCodeFence(text) {
  return String(text || "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

function parseProfileJson(text) {
  const cleaned = stripCodeFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Profile completion did not return JSON");
  }
}

function scrubProfile(profile, fallbackProfile) {
  const allowedSources = new Set(["case_explicit", "ai_completed", "unknown"]);
  const scrub = (node, fallback) => {
    const result = Array.isArray(node) ? [] : {};
    Object.keys(fallback || node || {}).forEach((key) => {
      const value = node?.[key];
      const fallbackValue = fallback?.[key];
      if (value && typeof value === "object" && "value" in value && "source" in value) {
        const clean = cleanPatientValue(value.value);
        result[key] = {
          value: clean || fallbackValue?.value || "不太清楚",
          source: allowedSources.has(value.source) ? value.source : fallbackValue?.source || "unknown"
        };
      } else if (value && typeof value === "object") {
        result[key] = scrub(value, fallbackValue || {});
      } else if (fallbackValue && typeof fallbackValue === "object") {
        result[key] = scrub(fallbackValue, fallbackValue);
      }
    });
    return result;
  };
  return scrub(profile, fallbackProfile);
}

const profilePrompt = `
你是医学教育病例标准化患者档案生成器。你只能补齐患者本人可能知道或感受到的信息，不能补齐检查结果、影像结果、病理、诊断、治疗和评分点。
允许补齐患者说话风格、情绪、健康素养、主观症状、一般情况，以及“不太清楚/没有注意到”。
禁止输出尿常规数值、CT/超声/膀胱镜、病理、肾活检、诊断、治疗、手术、MDT、评分点、教师提示。
每个字段必须是 { "value": "...", "source": "case_explicit|ai_completed|unknown" }；病例明确写了就保留 case_explicit，合理补齐用 ai_completed，不确定用 unknown。
返回完整 JSON，不要解释。
`.trim();

async function completePatientFacingProfile(rawProfile) {
  const localProfile = localCompleteProfile(rawProfile);
  const config = getLLMProviderConfig();
  if (!config.enabled) {
    return { profile: localProfile, rawOutput: "", provider: config.provider, model: config.model, isFallback: true, providerReachable: false, rewriteTriggered: false };
  }
  try {
    const result = await callLLM({
      systemPrompt: profilePrompt,
      userPayload: { rawPatientFacingProfile: rawProfile },
      temperature: 0.2,
      // 该调用需要返回完整结构化档案，不能沿用单轮患者回答的短输出上限。
      maxTokens: Math.max(config.maxTokens || 500, 2200)
    });
    try {
      const parsed = parseProfileJson(result.text);
      const scrubbed = scrubProfile(parsed, localProfile);
      return { profile: scrubbed, rawOutput: result.text, provider: result.provider, model: result.model, isFallback: false, providerReachable: true, rewriteTriggered: false };
    } catch (parseError) {
      return {
        profile: localProfile,
        rawOutput: `Profile JSON parse failed: ${String(parseError?.message || parseError)}`,
        provider: result.provider,
        model: result.model,
        isFallback: true,
        providerReachable: true,
        rewriteTriggered: false
      };
    }
  } catch (error) {
    return { profile: localProfile, rawOutput: String(error?.message || error), provider: config.provider, model: config.model, isFallback: true, providerReachable: false, rewriteTriggered: false };
  }
}

function buildTeacherOnlyData(caseData) {
  return {
    urine_test_result: caseData.urineTestResult,
    blood_test_result: caseData.clinical?.requiredLabs,
    imaging_finding: caseData.investigations || caseData.clinical?.imagingAndProcedures,
    cystoscopy_result: caseData.clinical?.imagingAndProcedures,
    pathology_result: caseData.clinical?.pathology,
    renal_biopsy_result: caseData.clinical?.specialTests,
    physical_exam_result: caseData.clinical?.physicalExamFocus,
    primary_diagnosis: caseData.clinical?.initialDiagnosis,
    final_diagnosis: caseData.diagnosis,
    differential_diagnosis: caseData.differentialDiagnosis,
    treatment_plan: caseData.clinical?.definitiveTreatment,
    perioperative_plan: caseData.clinical?.perioperativePreparation,
    mdt_trigger: caseData.agentProfile?.mdtTrigger,
    scoring_points: caseData.scoringKey,
    evaluator_rubric: caseData.agentProfile?.evaluatorDeductions,
    standard_case_summary: caseData.standardSummary
  };
}

function makeSessionId(caseId, language, mode) {
  return `sess_${caseId}_${language || "zh"}_${mode || "training"}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function initSession({ caseId, mode = "training", language = "zh", debug = false }) {
  const caseData = getCaseById(caseId);
  if (!caseData) throw new Error(`Unknown caseId: ${caseId}`);
  const cacheKey = `${caseData.id}:${language}:${mode}`;
  const cached = sessionCache.get(cacheKey);
  if (cached) {
    const sessionId = makeSessionId(caseData.id, language, mode);
    sessionCache.set(sessionId, cached);
    return {
      sessionId,
      caseId: caseData.id,
      patientOpeningStatement: cached.completedPatientFacingProfile.patient_opening_statement?.value || "医生您好。",
      completedPatientFacingProfile: cached.completedPatientFacingProfile,
      cacheHit: true,
      aiStatus: cached.providerReachable ? "connected" : "fallback",
      ...(debug ? { debug: { ...cached.debug, cacheHit: true } } : {})
    };
  }

  const rawPatientFacingProfile = buildRawPatientFacingProfile(caseData);
  validateRequiredProfileFacts(caseData, rawPatientFacingProfile);
  const completion = await completePatientFacingProfile(rawPatientFacingProfile);
  const teacherOnlyData = buildTeacherOnlyData(caseData);
  const profileRecord = {
    rawPatientFacingProfile,
    completedPatientFacingProfile: completion.profile,
    teacherOnlyFieldList: teacherOnlyKeys.filter((key) => teacherOnlyData[key]),
    teacherOnlyData,
    debug: {
      provider: completion.provider,
      model: completion.model,
      rawDeepSeekOutput: completion.rawOutput,
      responseFilter: { ok: true, hits: [] },
      rewriteTriggered: completion.rewriteTriggered,
      estimatedTokens: Math.ceil(JSON.stringify(rawPatientFacingProfile).length / 4),
      cacheHit: false
    },
    isFallback: completion.isFallback,
    providerReachable: completion.providerReachable
  };
  sessionCache.set(cacheKey, profileRecord);
  const sessionId = makeSessionId(caseData.id, language, mode);
  sessionCache.set(sessionId, profileRecord);
  return {
    sessionId,
    caseId: caseData.id,
    patientOpeningStatement: completion.profile.patient_opening_statement?.value || "医生您好。",
    completedPatientFacingProfile: completion.profile,
    cacheHit: false,
    aiStatus: completion.providerReachable ? "connected" : "fallback",
    ...(debug ? { debug: { ...profileRecord.debug, rawPatientFacingProfile, teacherOnlyFieldList: profileRecord.teacherOnlyFieldList } } : {})
  };
}

function getSession(sessionId, caseId, profile) {
  if (profile) return { completedPatientFacingProfile: profile, debug: { cacheHit: false } };
  return sessionCache.get(sessionId) || sessionCache.get(`${caseId}:zh:training`) || null;
}

function filterPatientOutput(text) {
  const hits = blockedHits(text);
  const lines = String(text || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const hasBulletShape = lines.length > 0 && lines.every((line) => !/^[-•*#]/.test(line));
  const tooLong = lines.some((line) => line.length > 80) || String(text || "").length > 180;
  return { ok: hits.length === 0 && hasBulletShape && !tooLong, hits, hasBulletShape, tooLong };
}

function formatPatientReply(text) {
  const lines = String(text || "")
    .split(/\n|。|；|;/)
    .map((line) => line.replace(/^[-•\s]*/, "").trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((line) => {
      return line.length > 80 ? `${line.slice(0, 80)}。` : line;
    });
  return lines.length ? lines.join("\n") : "";
}

function readProfileField(profile, path) {
  const value = path.split(".").reduce((node, key) => node?.[key], profile);
  return typeof value?.value === "string" ? value.value : "";
}

function oneBullet(value) {
  const clean = cleanPatientValue(value) || "这个我不太清楚。";
  return clean.length > 80 ? `${clean.slice(0, 80)}。` : clean;
}

function profileFallbackForQuestion(question, profile) {
  if (!profile) return "";
  if (hasAny(question, ["哪里不舒服", "怎么不舒服", "怎么回事", "为什么来看", "主要症状", "主诉"])) return readProfileField(profile, "current_symptoms_patient_safe") || readProfileField(profile, "chief_complaint");
  if (hasAny(question, ["吸烟", "抽烟", "烟龄", "几包", "包年"])) return readProfileField(profile, "smoking_history");
  if (hasAny(question, ["喝酒", "饮酒", "白酒", "酒量"])) return readProfileField(profile, "drinking_history");
  if (hasAny(question, ["鲜红", "暗红", "洗肉水", "茶色", "酱油色", "颜色", "红色"])) return readProfileField(profile, "hematuria_color");
  if (hasAny(question, ["血块", "血凝块", "凝血块"])) return readProfileField(profile, "clot_status");
  if (hasAny(question, ["一直红", "全程", "开始红", "终末", "快尿完", "最后才红"])) return readProfileField(profile, "hematuria_phase");
  if (hasAny(question, ["尿痛", "小便疼", "烧灼", "尿道疼"])) return readProfileField(profile, "pain_status") || readProfileField(profile, "urinary_frequency_urgency_dysuria");
  if (hasAny(question, ["尿频", "尿急", "尿不尽", "夜尿"])) return readProfileField(profile, "urinary_frequency_urgency_dysuria");
  if (hasAny(question, ["发热", "发烧", "寒战", "畏寒", "体温"])) return readProfileField(profile, "fever_chills");
  if (hasAny(question, ["腰痛", "肾绞痛", "腹痛", "放射痛"])) return readProfileField(profile, "flank_pain");
  if (hasAny(question, ["泡沫尿"])) return readProfileField(profile, "foamy_urine");
  if (hasAny(question, ["水肿", "眼睑肿", "下肢肿"])) return readProfileField(profile, "edema");
  if (hasAny(question, ["高血压"])) return readProfileField(profile, "blood_pressure_related_symptoms");
  if (hasAny(question, ["感冒", "咽痛", "扁桃体炎"])) return readProfileField(profile, "recent_uri_or_sore_throat");
  if (hasAny(question, ["用药", "阿司匹林", "氯吡格雷", "华法林", "利伐沙班", "抗凝", "抗血小板"])) return readProfileField(profile, "medication_patient_safe");
  if (hasAny(question, ["职业", "工作", "染料", "化工", "橡胶", "皮革", "重金属"])) return readProfileField(profile, "occupational_exposure");
  if (hasAny(question, ["家族", "遗传", "家里"])) return readProfileField(profile, "family_history");
  return "";
}

function safeFallbackForQuestion(question, profile) {
  if (hasAny(question, diagnosisWords)) return { replyText: "这个我不清楚，需要医生判断。", safetyFlags: ["blocked_diagnosis_request"] };
  if (hasAny(question, reportWords)) return { replyText: "我说不清楚，得看检查报告。", safetyFlags: ["blocked_report_request"] };
  return { replyText: oneBullet(profileFallbackForQuestion(question, profile)), safetyFlags: ["llm_error_fallback"] };
}

const patientPrompt = `
你是血尿临床思维训练系统中的标准化病人，不是医生、教师或病历摘要器。
你只能根据 currentAllowedAnswer 回答问题。currentAllowedAnswer 是本轮唯一允许使用的医学事实，必须保持它的肯定、否定、数量和时间含义，不得改成“不清楚”。
绝对规则：
1. 问什么答什么，没问不说。
2. 不主动总结完整病史。
3. 不主动透露多个未被问到的病史点。
4. 不透露检查结果、影像结果、病理结果、诊断、治疗方案、评分点。
5. 不使用“根据原始病史”“病例资料显示”“未主动诉”“需追问”“评分点”等词。
6. 不主动说诊断，不能说癌、肿瘤、结石、肾炎等诊断名。
7. 如果学生问检查结果，回答“我说不清楚，得看检查报告”。
8. 如果学生问诊断，回答“这个我不清楚，需要医生判断”。
9. 如果档案中没有该信息，回答“不太清楚”或“没有注意到”。
10. 第一人称患者口吻。
11. 回答简短，1-2句，不超过80字，不使用Markdown项目符号或“患者：”前缀。
12. 只回答当前问题，不要顺带回答未问内容。
`.trim();

function preservesAllowedAnswer(reply, allowedAnswer) {
  const replyText = normalize(reply);
  const allowedText = normalize(allowedAnswer);
  const allowedIsUnknown = hasAny(allowedText, ["不太清楚", "没有注意", "说不清楚"]);
  if (!allowedIsUnknown && hasAny(replyText, ["不太清楚", "不知道", "没注意", "说不清楚"])) return false;

  const factGroups = [
    ["吸烟", "抽烟", "烟龄", "包年"],
    ["喝酒", "饮酒", "酒量"]
  ];
  for (const words of factGroups) {
    if (!hasAny(allowedText, words)) continue;
    if (!hasAny(replyText, words)) return false;
    const allowedNegative = hasAny(allowedText, ["不吸烟", "不抽烟", "没有吸烟", "不喝酒", "不饮酒", "没有饮酒", "否认"]);
    if (allowedNegative && !hasAny(replyText, ["不", "没", "否认"])) return false;
  }
  return true;
}

async function generatePatientAnswer({ sessionId, caseId, studentInput, conversationHistory = [], language = "zh", completedPatientFacingProfile }) {
  const session = getSession(sessionId, caseId, completedPatientFacingProfile);
  const caseData = getCaseById(caseId);
  const structured = matchStructuredFacts(caseData, studentInput, language);
  const genericFallback = safeFallbackForQuestion(studentInput, session?.completedPatientFacingProfile || completedPatientFacingProfile);
  const fallback = structured ? { ...structured, provider: "rule", model: "local-rule", isFallback: true } : genericFallback;
  if (fallback.safetyFlags[0]?.startsWith("blocked_")) return { ...fallback, provider: "rule", model: "local-rule", isFallback: true, filter: { ok: true, hits: [] } };
  if (!session?.completedPatientFacingProfile) return { ...fallback, provider: "rule", model: "local-rule", isFallback: true, filter: { ok: true, hits: [] } };

  const config = getLLMProviderConfig();
  const normalized = normalize(studentInput);
  const answerKey = `${sessionId || caseId}:${language}:${normalized}`;
  const cached = answerCache.get(answerKey);
  if (cached) return { ...cached, cacheHit: true };

  if (!config.enabled) return { ...fallback, provider: config.provider, model: config.model, isFallback: true, filter: { ok: true, hits: [] } };

  const payload = {
    currentAllowedAnswer: structured?.replyText || fallback.replyText,
    matchedFacts: structured?.matchedFacts || [],
    patientPersona: session.completedPatientFacingProfile.patient_persona,
    studentInput,
    conversationHistory: conversationHistory.slice(-2),
    language
  };
  try {
    const first = await callLLM({ systemPrompt: patientPrompt, userPayload: payload, temperature: 0.3, maxTokens: 300 });
    const firstText = formatPatientReply(first.text);
    let filter = filterPatientOutput(firstText);
    if (filter.ok && preservesAllowedAnswer(firstText, payload.currentAllowedAnswer)) {
      const result = { replyText: firstText, provider: first.provider, model: first.model, isFallback: false, filter, rewriteTriggered: false, safetyFlags: [], matchedSlotIds: structured?.matchedSlotIds || [], matchedFacts: structured?.matchedFacts || [], answerSource: structured?.answerSource || "ai", confidence: structured?.confidence || 0.9, fallbackReason: "" };
      answerCache.set(answerKey, result);
      return result;
    }
    const retry = await callLLM({
      systemPrompt: `${patientPrompt}\n\n上一次回答包含禁止内容、改变了获准事实或格式不合格：${filter.hits.join("、")}。请严格保持 currentAllowedAnswer 的事实含义，只用1-2句且不超过45字。`,
      userPayload: payload,
      temperature: 0.2,
      maxTokens: 220
    });
    const retryText = formatPatientReply(retry.text);
    const retryFilter = filterPatientOutput(retryText);
    if (retryFilter.ok && preservesAllowedAnswer(retryText, payload.currentAllowedAnswer)) {
      const result = { replyText: retryText, provider: retry.provider, model: retry.model, isFallback: false, filter: retryFilter, rewriteTriggered: true, safetyFlags: [], matchedSlotIds: structured?.matchedSlotIds || [], matchedFacts: structured?.matchedFacts || [], answerSource: structured?.answerSource || "ai", confidence: structured?.confidence || 0.9, fallbackReason: "" };
      answerCache.set(answerKey, result);
      return result;
    }
    return { ...fallback, provider: config.provider, model: config.model, isFallback: true, filter: retryFilter, rewriteTriggered: true, safetyFlags: [...fallback.safetyFlags, "ai_response_blocked"] };
  } catch (error) {
    return { ...fallback, provider: config.provider, model: config.model, isFallback: true, filter: { ok: true, hits: [] }, error: String(error?.message || error) };
  }
}

module.exports = {
  initSession,
  generatePatientAnswer,
  buildRawPatientFacingProfile,
  buildTeacherOnlyData,
  filterPatientOutput,
  getSession,
  teacherOnlyKeys
};

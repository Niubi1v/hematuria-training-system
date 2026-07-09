const cases = require("../data/cases.json");

const blockedTerms = [
  "根据原始病史",
  "根据病例资料",
  "根据病史",
  "原始病史",
  "病例显示",
  "病例提示",
  "未主动诉",
  "未诉",
  "需追问",
  "需主动询问",
  "教师提示",
  "评分点",
  "扣分",
  "高危错误",
  "需警惕",
  "CT提示",
  "CTU提示",
  "彩超提示",
  "超声提示",
  "膀胱镜",
  "病理",
  "占位",
  "肿瘤",
  "癌栓",
  "淋巴结",
  "骨转移",
  "骨质破坏",
  "诊断",
  "治疗",
  "手术",
  "化疗",
  "放疗",
  "围术期",
  "TURBT",
  "尿检以",
  "24小时尿蛋白",
  "畸形红细胞",
  "肌酐",
  "eGFR",
  "PSA",
  "尿培养",
  "药敏",
  "肾活检"
];

const reportWords = ["ct", "ctu", "彩超", "超声", "b超", "膀胱镜", "病理", "尿常规", "尿检", "肌酐", "egfr", "psa", "培养", "药敏", "肾活检", "报告", "检查结果", "片子", "影像"];
const diagnosisWords = ["什么病", "诊断", "是不是癌", "癌症", "肿瘤", "严重吗", "能治好吗", "预后"];
const cache = new Map();

function normalize(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "").replace(/[，。！？；：、,.!?;:()[\]{}'"“”‘’]/g, "");
}

function hasAny(text, words) {
  const value = normalize(text);
  return words.some((word) => value.includes(normalize(word)));
}

function cleanValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^根据原始病史[:：]?\s*/g, "")
    .replace(/^根据病例资料[:：]?\s*/g, "")
    .replace(/未主动诉[^，。；;]*[，。；;]?/g, "")
    .replace(/未诉\/?需主动询问/g, "")
    .replace(/需主动询问[^，。；;]*[，。；;]?/g, "")
    .replace(/需追问[^，。；;]*[，。；;]?/g, "")
    .replace(/提交前隐藏[^，。；;]*[，。；;]?/g, "")
    .trim();
}

function splitSentences(value) {
  return cleanValue(value)
    .split(/[。；;\n]/)
    .flatMap((line) => line.split(/[，,]/))
    .map((line) => line.trim())
    .filter(Boolean);
}

function containsBlocked(text) {
  return blockedTerms.filter((term) => String(text || "").includes(term));
}

function stripBlocked(value) {
  return splitSentences(value).filter((line) => !containsBlocked(line).length).join("。").trim();
}

function isNotUsable(value) {
  const clean = cleanValue(value);
  return !clean || /未诉|需追问|需主动询问|不详|提交前隐藏|评分/.test(clean);
}

function firstUsable(...values) {
  for (const value of values) {
    const clean = stripBlocked(value);
    if (clean && !isNotUsable(clean)) return clean;
  }
  return "";
}

function sentenceWith(value, words) {
  return splitSentences(value).find((sentence) => words.some((word) => sentence.includes(word)) && !containsBlocked(sentence).length) || "";
}

function asBullets(lines) {
  const cleaned = lines
    .map(stripBlocked)
    .filter(Boolean)
    .flatMap(splitSentences)
    .filter((line) => !containsBlocked(line).length)
    .slice(0, 2)
    .map((line) => {
      const trimmed = line.replace(/^[-•\s]*/, "").trim();
      return trimmed.length > 80 ? `${trimmed.slice(0, 80).replace(/[，。；;\s]*$/g, "")}。` : trimmed;
    });
  return cleaned.length ? cleaned.map((line) => `- ${line}`).join("\n") : "- 这个我没有特别注意到。";
}

function getCaseById(caseId) {
  return cases.find((item) => String(item.id).toLowerCase() === String(caseId).toLowerCase());
}

function entries(caseData) {
  return Object.values(caseData.interviewAnswers || {});
}

function findSlot(caseData, keywords) {
  return entries(caseData)
    .map((entry) => {
      const haystack = `${entry.slotId} ${entry.label} ${entry.possibleQuestion}`;
      const score = keywords.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.entry;
}

function semantic(question) {
  if (hasAny(question, diagnosisWords)) return "diagnosis";
  if (hasAny(question, reportWords)) return "report";
  if (hasAny(question, ["一直红", "全程", "开始红", "终末", "快尿完", "最后才红", "第一杯", "第三杯", "从头到尾"])) return "phase";
  if (hasAny(question, ["血块", "血凝块", "凝血块", "块状"])) return "clots";
  if (hasAny(question, ["鲜红", "暗红", "洗肉水", "茶色", "酱油色", "颜色", "红色"])) return "color";
  if (hasAny(question, ["肉眼", "镜下", "看得见", "尿潜血", "尿本身红"])) return "visibility";
  if (hasAny(question, ["多久", "什么时候", "几天", "几周", "几个月", "开始", "起病"])) return "onset";
  if (hasAny(question, ["尿痛", "小便疼", "烧灼", "尿道疼"])) return "dysuria";
  if (hasAny(question, ["腰痛", "肾绞痛", "腹痛", "放射痛", "肾区"])) return "flankPain";
  if (hasAny(question, ["尿频", "尿急", "尿不尽", "夜尿"])) return "luts";
  if (hasAny(question, ["排尿困难", "尿线", "尿流中断", "尿不出来", "费力", "尿潴留"])) return "voiding";
  if (hasAny(question, ["发热", "发烧", "寒战", "畏寒", "高热", "体温"])) return "fever";
  if (hasAny(question, ["泡沫尿", "水肿", "眼睑肿", "下肢肿"])) return "glomerular";
  if (hasAny(question, ["感冒", "咽痛", "扁桃体炎", "上呼吸道"])) return "uri";
  if (hasAny(question, ["运动", "劳累", "受凉", "外伤", "性生活", "导尿", "尿路操作"])) return "trigger";
  if (hasAny(question, ["结石史", "以前结石", "肾结石", "输尿管结石"])) return "stone";
  if (hasAny(question, ["感染史", "尿路感染", "膀胱炎", "肾盂肾炎"])) return "infection";
  if (hasAny(question, ["阿司匹林", "氯吡格雷", "华法林", "利伐沙班", "抗凝", "抗血小板", "止痛药", "吃药", "用药"])) return "medication";
  if (hasAny(question, ["吸烟", "抽烟", "烟龄", "几包", "包年"])) return "smoking";
  if (hasAny(question, ["喝酒", "饮酒", "白酒", "酒量"])) return "alcohol";
  if (hasAny(question, ["职业", "工作", "染料", "化工", "橡胶", "皮革", "重金属", "接触"])) return "occupation";
  if (hasAny(question, ["月经", "阴道", "污染", "怀孕", "妊娠", "妇科"])) return "female";
  if (hasAny(question, ["家族", "遗传", "家里", "亲属", "听力异常"])) return "family";
  if (hasAny(question, ["鼻出血", "牙龈出血", "瘀斑", "紫癜", "出血倾向"])) return "bleeding";
  if (hasAny(question, ["看过医生", "吃过什么", "治疗过", "外院"])) return "priorCare";
  if (hasAny(question, ["高血压", "糖尿病", "冠心病", "房颤", "肝炎", "乙肝", "结核", "既往"])) return "past";
  if (hasAny(question, ["哪里不舒服", "为什么来", "主诉", "怎么不舒服", "怎么回事", "详细说说"])) return "chief";
  return "";
}

const slotKeywords = {
  chief: ["主诉", "来诊", "哪里不舒服"],
  visibility: ["肉眼", "镜下", "可见性"],
  onset: ["起病", "持续时间", "病程"],
  phase: ["时相", "全程", "终末", "起始", "一直红"],
  color: ["尿色", "颜色", "鲜红", "暗红", "洗肉水", "茶色", "酱油"],
  clots: ["血块", "凝血块"],
  dysuria: ["尿痛", "疼痛关系", "小便疼"],
  flankPain: ["腰痛", "肾绞痛", "放射痛"],
  luts: ["尿频", "尿急", "尿路刺激"],
  voiding: ["排尿困难", "尿线", "尿潴留"],
  fever: ["发热", "寒战", "畏寒"],
  glomerular: ["泡沫尿", "水肿", "高血压"],
  uri: ["上感", "咽痛", "扁桃体炎", "感冒"],
  trigger: ["诱因", "运动", "外伤", "操作"],
  stone: ["结石史"],
  infection: ["感染史", "尿路感染"],
  past: ["既往病史", "慢性病"],
  medication: ["用药", "抗凝", "抗血小板"],
  smoking: ["吸烟史", "吸烟", "抽烟"],
  alcohol: ["饮酒史", "饮酒", "喝酒"],
  occupation: ["职业暴露", "职业", "工作"],
  female: ["女性", "月经", "阴道", "妊娠"],
  family: ["家族史", "遗传"],
  bleeding: ["出血倾向", "鼻出血", "牙龈出血"],
  priorCare: ["诊治经过", "院前诊治", "看过医生"]
};

function structuredAnswer(caseData, type, question) {
  const pfp = caseData.patientFacingProfile || {};
  const illness = caseData.presentIllness || {};
  const risk = caseData.riskFactors || {};
  if (type === "chief") return firstUsable(pfp.chiefComplaint, caseData.patientAnswers?.opening, caseData.studentChiefComplaint, caseData.chiefComplaint);
  if (type === "visibility") return firstUsable(pfp.hematuriaType, illness.hematuriaType);
  if (type === "phase") return firstUsable(pfp.hematuriaPhase, caseData.patientAnswers?.phase, illness.hematuriaPhase);
  if (type === "color") return firstUsable(pfp.urineColor, caseData.patientAnswers?.color, illness.color);
  if (type === "clots") return firstUsable(pfp.clots, caseData.patientAnswers?.clots, illness.clots);
  if (type === "dysuria") return firstUsable(
    sentenceWith(pfp.luts, ["尿痛", "疼", "痛", "烧灼"]),
    sentenceWith(caseData.patientAnswers?.irritativeSymptoms, ["尿痛", "疼", "痛", "烧灼"]),
    sentenceWith(illness.dysuria, ["尿痛", "疼", "痛", "烧灼"]),
    caseData.patientAnswers?.pain,
    illness.pain
  );
  if (type === "flankPain") return firstUsable(pfp.flankPain, illness.flankPain, caseData.patientAnswers?.stoneClues, illness.pain);
  if (type === "luts") return firstUsable(pfp.luts, caseData.patientAnswers?.irritativeSymptoms, illness.urinaryFrequency, illness.urgency, illness.dysuria);
  if (type === "voiding") return firstUsable(sentenceWith(pfp.luts, ["排尿困难", "尿线", "尿潴留"]), illness.voidingDifficulty);
  if (type === "fever") return firstUsable(pfp.fever, caseData.patientAnswers?.fever, illness.fever);
  if (type === "glomerular") return firstUsable(pfp.glomerularClues, caseData.patientAnswers?.glomerularClues);
  if (type === "stone") return firstUsable(risk.stoneHistory, sentenceWith(pfp.knownPastHistory, ["结石"]));
  if (type === "infection") return firstUsable(risk.infectionHistory, sentenceWith(pfp.knownPastHistory, ["感染"]));
  if (type === "medication") return firstUsable(pfp.knownMedication, risk.anticoagulants, caseData.medication);
  if (type === "smoking") return firstUsable(sentenceWith(pfp.personalAndFamilyRisk, ["吸烟"]), sentenceWith(pfp.knownPastHistory, ["吸烟"]), risk.smoking);
  if (type === "alcohol") return firstUsable(sentenceWith(pfp.personalAndFamilyRisk, ["饮酒", "喝酒"]), sentenceWith(pfp.knownPastHistory, ["饮酒", "喝酒"]), risk.alcohol);
  if (type === "occupation") return firstUsable(sentenceWith(pfp.personalAndFamilyRisk, ["职业", "染料", "化工", "橡胶", "皮革", "重金属"]), risk.occupation);
  if (type === "family") return firstUsable(sentenceWith(pfp.personalAndFamilyRisk, ["家族"]), risk.familyHistory, caseData.familyHistory);
  if (type === "past") {
    if (hasAny(question, ["高血压"])) return firstUsable(sentenceWith(pfp.knownPastHistory, ["高血压"]), sentenceWith(caseData.pastHistory, ["高血压"]));
    if (hasAny(question, ["糖尿病"])) return firstUsable(sentenceWith(pfp.knownPastHistory, ["糖尿病"]), sentenceWith(caseData.pastHistory, ["糖尿病"]));
    if (hasAny(question, ["肝炎", "乙肝"])) return firstUsable(sentenceWith(pfp.knownPastHistory, ["肝炎", "乙肝"]), sentenceWith(caseData.pastHistory, ["肝炎", "乙肝"]));
    if (hasAny(question, ["结核"])) return firstUsable(sentenceWith(pfp.knownPastHistory, ["结核"]), sentenceWith(caseData.pastHistory, ["结核"]));
    return firstUsable(pfp.knownPastHistory, caseData.pastHistory);
  }
  return "";
}

const defaults = {
  chief: "主要是小便颜色不太正常。",
  visibility: "我是自己能看到尿色变红。",
  onset: "已经有一段时间了，具体可以再问我。",
  phase: "我没有特别分清是刚开始红还是最后红。",
  color: "尿液颜色看起来偏红。",
  clots: "我没有注意到明显血块。",
  dysuria: "小便时不疼，也没有明显尿道烧灼感。",
  flankPain: "没有明显腰痛或肚子绞痛。",
  luts: "没有明显尿频、尿急、尿痛。",
  voiding: "排尿没有特别费力。",
  fever: "没有发热，也没有寒战。",
  glomerular: "没有明显泡沫尿或水肿。",
  uri: "最近没有明显感冒、咽痛。",
  trigger: "没有明显外伤、剧烈运动或尿路操作诱因。",
  stone: "以前没有明确结石史。",
  infection: "以前没有反复尿路感染史。",
  past: "以前身体情况没有特别的。",
  medication: "平时没有长期吃特殊药。",
  smoking: "我平时不吸烟。",
  alcohol: "我平时不怎么喝酒。",
  occupation: "工作上没有接触特别的化学东西。",
  female: "这个情况对我不太适用，或没有这方面问题。",
  family: "家里没有听说类似血尿或遗传性肾病。",
  bleeding: "没有鼻出血、牙龈出血或皮肤瘀斑。",
  priorCare: "此前没有系统诊治。"
};

function ruleReply(caseData, question) {
  const type = semantic(question);
  if (type === "diagnosis") {
    return { replyText: "- 这个我不清楚，需要医生判断。", matchedSlotIds: [], revealedFields: [], blockedFields: ["diagnosis"], safetyFlags: ["blocked_diagnosis_request"] };
  }
  if (type === "report") {
    return { replyText: "- 我做过的检查具体结果说不清楚，您需要查看检查报告。", matchedSlotIds: [], revealedFields: [], blockedFields: ["order_results"], safetyFlags: ["blocked_report_request"] };
  }
  if (!type) {
    return { replyText: "- 医生，您能问得再具体一点吗？我不太明白您想问哪方面。", matchedSlotIds: [], revealedFields: [], blockedFields: [], safetyFlags: ["no_slot_match"] };
  }
  const slot = findSlot(caseData, slotKeywords[type] || []);
  const answer = firstUsable(structuredAnswer(caseData, type, question), slot?.patientAnswer, defaults[type] || "这个我不太清楚。");
  return {
    replyText: asBullets([answer]),
    matchedSlotIds: slot ? [slot.slotId] : [],
    revealedFields: slot ? [slot.slotId] : [type],
    blockedFields: containsBlocked(slot?.patientAnswer || ""),
    safetyFlags: []
  };
}

function filterReply(text) {
  const hits = containsBlocked(text);
  const lines = String(text || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const hasBulletShape = lines.length > 0 && lines.every((line) => line.startsWith("- "));
  const tooLong = lines.some((line) => line.replace(/^-\s*/, "").length > 80) || String(text || "").length > 180;
  return { ok: hits.length === 0 && hasBulletShape && !tooLong, hits };
}

function joinUrl(baseUrl) {
  const trimmed = String(baseUrl || "").replace(/\/+$/, "");
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}

async function callLLM(payload) {
  if (process.env.LLM_ENABLE_AI_PATIENT !== "true") throw new Error("AI patient disabled");
  if (!process.env.LLM_API_KEY) throw new Error("Missing LLM_API_KEY");
  if (!process.env.LLM_API_BASE_URL) throw new Error("Missing LLM_API_BASE_URL");
  if (!process.env.LLM_MODEL) throw new Error("Missing LLM_MODEL");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.LLM_REQUEST_TIMEOUT_MS || 15000));
  try {
    const response = await fetch(joinUrl(process.env.LLM_API_BASE_URL), {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.LLM_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.LLM_MODEL,
        temperature: Number(process.env.LLM_TEMPERATURE || 0.2),
        max_tokens: Math.min(Number(process.env.LLM_MAX_TOKENS || 120), 160),
        messages: [
          {
            role: "system",
            content: "你是血尿训练系统中的标准化患者。只根据 currentAllowedAnswer 回答当前问题；不得透露检查、影像、病理、诊断、治疗、评分点；不得说根据病例资料、未主动诉、需追问。输出1-2条中文分点短句，每条不超过80字。"
          },
          { role: "user", content: JSON.stringify(payload) }
        ]
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`LLM provider returned ${response.status}`);
    const json = await response.json();
    const text = json.choices?.[0]?.message?.content || json.choices?.[0]?.text || json.output_text || json.content || "";
    if (!text) throw new Error("Empty LLM response");
    return text.trim();
  } finally {
    clearTimeout(timeout);
  }
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.PATIENT_AGENT_ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const caseData = getCaseById(body.caseId);
    if (!caseData) return res.status(400).json({ error: `Unknown caseId: ${body.caseId}` });
    const question = String(body.studentQuestion || "").trim();
    if (!question) return res.status(400).json({ error: "studentQuestion is required" });

    const fallback = ruleReply(caseData, question);
    const model = process.env.LLM_MODEL || "local-rule";
    const provider = process.env.LLM_PROVIDER || "custom";
    const cacheKey = `${body.caseId}:${fallback.matchedSlotIds.join(",")}:${normalize(question)}:${model}`;
    if (body.mode === "rule" || !fallback.matchedSlotIds.length || fallback.safetyFlags.length) {
      return res.status(200).json({ ...fallback, provider: "rule", model: "local-rule", isFallback: true });
    }
    if (cache.has(cacheKey)) return res.status(200).json(cache.get(cacheKey));

    try {
      const aiText = asBullets([
        await callLLM({
          studentQuestion: question,
          patientFacingProfile: {
            caseId: caseData.id,
            age: caseData.patientFacingProfile?.age || caseData.age,
            sex: caseData.patientFacingProfile?.sex || caseData.sex,
            chiefComplaint: caseData.patientFacingProfile?.chiefComplaint || caseData.studentChiefComplaint || caseData.chiefComplaint,
            persona: caseData.patientFacingProfile?.persona || "配合度较好的普通患者",
            currentAllowedAnswer: fallback.replyText,
            matchedSlotIds: fallback.matchedSlotIds,
            reportBoundary: "可以说做过检查，但不能说出尿检、影像、膀胱镜、病理等报告细节。"
          }
        })
      ]);
      const filter = filterReply(aiText);
      if (!filter.ok) throw new Error(`AI response blocked: ${filter.hits.join(",")}`);
      const result = {
        replyText: aiText,
        matchedSlotIds: fallback.matchedSlotIds,
        revealedFields: fallback.revealedFields,
        blockedFields: fallback.blockedFields,
        safetyFlags: fallback.safetyFlags,
        provider,
        model,
        isFallback: false
      };
      cache.set(cacheKey, result);
      return res.status(200).json(result);
    } catch {
      return res.status(200).json({ ...fallback, provider, model, isFallback: true });
    }
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Patient API failed" });
  }
};

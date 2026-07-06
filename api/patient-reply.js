const cases = require("../data/cases.json");

const blockedTerms = [
  "根据原始病史",
  "根据病例资料",
  "未主动诉",
  "未诉",
  "需追问",
  "CT提示",
  "彩超提示",
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
  "评分"
];

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
    .replace(/未诉[^，。；;]*[，。；;]?/g, "")
    .replace(/需主动询问[，。；;]?/g, "")
    .replace(/需追问[，。；;]?/g, "")
    .trim();
}

function splitSentences(value) {
  return cleanValue(value)
    .split(/[。；;\n]/)
    .flatMap((item) => item.split(/[，,、]/))
    .map((item) => item.trim())
    .filter(Boolean);
}

function sentenceWith(value, words) {
  return splitSentences(value).find((sentence) => words.some((word) => sentence.includes(word))) || "";
}

function isUnknown(value) {
  return !value || /未诉|需追问|主动询问|未主动诉|不详/.test(value);
}

function firstUsable(...values) {
  return values.map(cleanValue).find((value) => value && !isUnknown(value)) || "";
}

function legacyAnswer(caseData, slotId) {
  return caseData.interviewAnswers?.[slotId]?.patientAnswer || "";
}

function sanitizeReply(text) {
  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => line.trim().replace(/^[-•]\s*/, ""))
    .filter(Boolean)
    .filter((line) => !blockedTerms.some((term) => line.includes(term)))
    .slice(0, 2)
    .map((line) => `- ${line.length > 60 ? `${line.slice(0, 60)}。` : line}`);
  return lines.length ? lines.join("\n") : "- 这个我不太清楚。";
}

function filterReply(text) {
  const hits = blockedTerms.filter((term) => text.includes(term));
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return {
    ok: hits.length === 0 && lines.length > 0 && lines.every((line) => line.startsWith("- ")) && text.length <= 160,
    hits
  };
}

function matchSlot(question) {
  if (hasAny(question, ["什么病", "诊断", "是不是癌", "癌症", "肿瘤", "严重吗"])) return { blocked: "diagnosis" };
  if (hasAny(question, ["ct", "ctu", "彩超", "超声", "膀胱镜", "病理", "尿常规", "报告", "检查结果"])) return { blocked: "report" };
  if (hasAny(question, ["鲜红", "暗红", "洗肉水", "茶色", "酱油色", "颜色", "红色"])) return { slotId: "HX006" };
  if (hasAny(question, ["血块", "血凝块", "凝血块", "块状"])) return { slotId: "HX007" };
  if (hasAny(question, ["一直红", "全程", "开始红", "终末", "快尿完", "最后才红", "第一杯", "第三杯"])) return { slotId: "HX005" };
  if (hasAny(question, ["吸烟", "抽烟", "烟龄", "几包", "包年", "喝酒", "饮酒"])) return { slotId: "HX019" };
  if (hasAny(question, ["高血压病史", "有高血压", "高血压吗", "糖尿病", "冠心病", "房颤", "慢性病", "既往"])) return { slotId: "HX017" };
  if (hasAny(question, ["尿痛", "小便疼", "疼", "腰痛", "肾绞痛", "腹痛", "放射痛", "烧灼"])) return { slotId: "HX009" };
  if (hasAny(question, ["尿频", "尿急", "尿不尽", "夜尿"])) return { slotId: "HX010" };
  if (hasAny(question, ["发热", "发烧", "寒战", "畏寒", "高热", "体温"])) return { slotId: "HX012" };
  if (hasAny(question, ["泡沫尿", "水肿", "眼睑肿", "下肢肿"])) return { slotId: "HX013" };
  if (hasAny(question, ["感冒", "咽痛", "扁桃体炎"])) return { slotId: "HX014" };
  if (hasAny(question, ["阿司匹林", "氯吡格雷", "华法林", "利伐沙班", "抗凝", "抗血小板", "吃药", "用药"])) return { slotId: "HX018" };
  if (hasAny(question, ["职业", "工作", "染料", "化工", "橡胶", "皮革", "重金属"])) return { slotId: "HX020" };
  if (hasAny(question, ["家族", "遗传", "家里", "亲属", "听力异常"])) return { slotId: "HX025" };
  return { slotId: "" };
}

function answerForSlot(caseData, slotId, question) {
  const illness = caseData.presentIllness || {};
  const risk = caseData.riskFactors || {};
  const historySource = [caseData.pastHistory, caseData.personalHistory, legacyAnswer(caseData, "HX020"), legacyAnswer(caseData, "HX023")].filter(Boolean).join("。");

  if (slotId === "HX006") return firstUsable(legacyAnswer(caseData, "HX007"), caseData.patientAnswers?.color, illness.color) || "尿液颜色看起来偏红。";
  if (slotId === "HX007") return firstUsable(legacyAnswer(caseData, "HX008"), caseData.patientAnswers?.clots, illness.clots) || "我没有注意到明显血块。";
  if (slotId === "HX005") return firstUsable(legacyAnswer(caseData, "HX005"), legacyAnswer(caseData, "HX006"), caseData.patientAnswers?.phase, illness.hematuriaPhase) || "我没有特别分清是刚开始红还是最后红。";
  if (slotId === "HX019") {
    if (hasAny(question, ["吸烟", "抽烟", "烟龄", "几包", "包年"])) return firstUsable(caseData.patientAnswers?.smoking, sentenceWith(historySource, ["吸烟", "抽烟", "烟", "未吸烟"])) || "我平时不吸烟。";
    if (hasAny(question, ["喝酒", "饮酒", "白酒", "酒量"])) return firstUsable(caseData.patientAnswers?.alcohol, sentenceWith(historySource, ["饮酒", "喝酒", "白酒", "酗酒"])) || "我平时不怎么喝酒。";
    return "抽烟、饮酒方面没有特别的。";
  }
  if (slotId === "HX017") {
    if (hasAny(question, ["高血压"])) return firstUsable(sentenceWith(historySource, ["高血压"])) || "没有高血压病史。";
    if (hasAny(question, ["糖尿病"])) return firstUsable(sentenceWith(historySource, ["糖尿病"])) || "没有糖尿病病史。";
    if (hasAny(question, ["结核"])) return firstUsable(sentenceWith(historySource, ["结核"])) || "没有结核病史。";
    return firstUsable(caseData.pastHistory) || "以前身体情况没有特别的。";
  }
  if (slotId === "HX009") return firstUsable(legacyAnswer(caseData, "HX009"), legacyAnswer(caseData, "HX012"), illness.dysuria, illness.flankPain, illness.pain) || "没有明显疼痛。";
  if (slotId === "HX010") return firstUsable(legacyAnswer(caseData, "HX010"), illness.urinaryFrequency, illness.urgency, illness.dysuria) || "没有明显尿频、尿急、尿痛。";
  if (slotId === "HX012") return firstUsable(legacyAnswer(caseData, "HX013"), caseData.patientAnswers?.fever, illness.fever) || "没有发热，也没有寒战。";
  if (slotId === "HX013") return firstUsable(legacyAnswer(caseData, "HX015"), caseData.patientAnswers?.glomerularClues) || "没有明显泡沫尿或水肿。";
  if (slotId === "HX014") return firstUsable(legacyAnswer(caseData, "HX016"), risk.infectionHistory) || "最近没有明显感冒、咽痛。";
  if (slotId === "HX018") return firstUsable(legacyAnswer(caseData, "HX021"), risk.anticoagulants, caseData.medication) || "平时没有长期吃特殊药。";
  if (slotId === "HX020") return firstUsable(risk.occupation, sentenceWith(historySource, ["职业", "工作", "化工", "染料"])) || "工作上没有接触特别的化学东西。";
  if (slotId === "HX025") return firstUsable(legacyAnswer(caseData, "HX024"), risk.familyHistory, caseData.familyHistory) || "家里没有听说类似情况。";
  return "医生，您能问得再具体一点吗？";
}

function ruleReply(caseData, question) {
  const match = matchSlot(question);
  if (match.blocked === "diagnosis") {
    return { replyText: "- 这个我不清楚，需要医生判断。", matchedSlotIds: [], revealedFields: [], blockedFields: ["diagnosis"], safetyFlags: ["blocked_diagnosis_request"] };
  }
  if (match.blocked === "report") {
    return { replyText: "- 我做过的检查具体结果我说不清楚，您需要查看检查报告。", matchedSlotIds: [], revealedFields: [], blockedFields: ["order_results"], safetyFlags: ["blocked_report_request"] };
  }
  if (!match.slotId) {
    return { replyText: "- 医生，您能问得再具体一点吗？", matchedSlotIds: [], revealedFields: [], blockedFields: [], safetyFlags: ["no_slot_match"] };
  }
  return {
    replyText: sanitizeReply(answerForSlot(caseData, match.slotId, question)),
    matchedSlotIds: [match.slotId],
    revealedFields: [match.slotId],
    blockedFields: [],
    safetyFlags: []
  };
}

async function callLLM(payload) {
  if (process.env.LLM_ENABLE_AI_PATIENT !== "true") throw new Error("AI patient disabled");
  if (!process.env.LLM_API_KEY) throw new Error("Missing LLM_API_KEY");
  if (!process.env.LLM_API_BASE_URL) throw new Error("Missing LLM_API_BASE_URL");
  if (!process.env.LLM_MODEL) throw new Error("Missing LLM_MODEL");

  const base = process.env.LLM_API_BASE_URL.replace(/\/+$/, "");
  const url = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.LLM_REQUEST_TIMEOUT_MS || 15000));
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.LLM_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.LLM_MODEL,
        temperature: Number(process.env.LLM_TEMPERATURE || 0.2),
        max_tokens: Number(process.env.LLM_MAX_TOKENS || 120),
        messages: [
          {
            role: "system",
            content: "你是血尿训练系统中的模拟患者。只根据 patientAnswer 回答当前问题，不透露检查、诊断、治疗、评分。用第一人称中文输出1-2条分点，每条不超过40字。"
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
    return text;
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
    const caseData = cases.find((item) => item.id === body.caseId);
    if (!caseData) return res.status(400).json({ error: `Unknown caseId: ${body.caseId}` });
    const question = String(body.studentQuestion || "").trim();
    if (!question) return res.status(400).json({ error: "studentQuestion is required" });

    const fallback = ruleReply(caseData, question);
    const model = process.env.LLM_MODEL || "local-rule";
    const cacheKey = `${body.caseId}:${fallback.matchedSlotIds.join(",")}:${normalize(question)}:${model}`;
    if (body.mode === "rule" || !fallback.matchedSlotIds.length || fallback.safetyFlags.length) {
      return res.status(200).json({ ...fallback, provider: "rule", model: "local-rule", isFallback: true });
    }
    if (cache.has(cacheKey)) return res.status(200).json(cache.get(cacheKey));

    try {
      const aiText = sanitizeReply(await callLLM({
        studentQuestion: question,
        matchedSlotId: fallback.matchedSlotIds[0],
        patientAnswer: fallback.replyText,
        forbiddenRules: ["不要补充未问信息", "不要透露检查诊断治疗", "不要出现教师端提示"]
      }));
      const filter = filterReply(aiText);
      if (!filter.ok) throw new Error(`AI response blocked: ${filter.hits.join(",")}`);
      const result = {
        replyText: aiText,
        matchedSlotIds: fallback.matchedSlotIds,
        revealedFields: fallback.revealedFields,
        blockedFields: fallback.blockedFields,
        provider: process.env.LLM_PROVIDER || "custom",
        model,
        isFallback: false
      };
      cache.set(cacheKey, result);
      return res.status(200).json(result);
    } catch (error) {
      return res.status(200).json({ ...fallback, provider: process.env.LLM_PROVIDER || "custom", model, isFallback: true });
    }
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Patient API failed" });
  }
};

import assert from "node:assert/strict";

const baseUrl = String(process.env.MAINLAND_HEALTHCHECK_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
const questionSets = {
  zh: [
    "什么时候开始发现血尿？", "血尿是突然出现的吗？", "尿液是全程红还是开始或结束时红？", "尿里有没有血块？",
    "血尿是持续还是间歇出现？", "排尿时疼不疼？", "有没有尿频？", "有没有尿急？", "有没有排尿困难？",
    "腰部疼痛吗？", "有没有发热或寒战？", "最近受过外伤吗？", "以前出现过类似情况吗？", "有泌尿系结石史吗？",
    "以前做过泌尿系统手术吗？", "有肿瘤病史吗？", "平时吸烟吗？", "工作中接触过化学品吗？", "正在服用抗凝药吗？", "家里有人有类似疾病吗？"
  ],
  en: [
    "When did you first notice blood in your urine?", "Did it begin suddenly?", "Is the urine red throughout the stream?", "Have you seen any blood clots?",
    "Is the bleeding constant or intermittent?", "Does it hurt when you urinate?", "Are you urinating more often?", "Do you feel urinary urgency?", "Do you have difficulty urinating?",
    "Do you have flank pain?", "Have you had fever or chills?", "Have you had a recent injury?", "Has this happened before?", "Have you had urinary stones?",
    "Have you had urinary surgery before?", "Have you ever had cancer?", "Do you smoke?", "Have you had chemical exposure at work?", "Are you taking blood thinners?", "Does anyone in your family have a similar condition?"
  ]
};

async function call(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Origin: baseUrl,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {})
    },
    signal: AbortSignal.timeout(15_000)
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function runLanguage(language) {
  const attemptId = `mainland-20-${language}-${Date.now()}`;
  const initialized = await call("/api/training-action/", {
    method: "POST",
    body: JSON.stringify({ action: "init-attempt", caseId: "P001", attemptId, mode: "free", language, requestId: `${attemptId}-init` })
  });
  assert.equal(initialized.response.status, 200);
  let token = initialized.response.headers.get("x-training-state");
  assert.ok(token);

  const session = await call("/api/session/init/", {
    method: "POST",
    headers: { "X-Training-State": token, "X-Idempotency-Key": `${attemptId}-session` },
    body: JSON.stringify({ caseId: "P001", attemptId, mode: "free", language })
  });
  assert.equal(session.response.status, 200);
  assert.ok(session.payload.sessionId);

  const sources = {};
  const conversationHistory = [];
  for (const [index, question] of questionSets[language].entries()) {
    const answer = await call("/api/agent-chat/", {
      method: "POST",
      headers: { "X-Idempotency-Key": `${attemptId}-answer-${index}` },
      body: JSON.stringify({
        caseId: "P001",
        agentId: "standardized_patient",
        sessionId: session.payload.sessionId,
        attemptId,
        sessionMode: "free",
        mode: "free",
        stage: "history",
        language,
        studentInput: question,
        conversationHistory: conversationHistory.slice(-8),
        askedQuestions: questionSets[language].slice(0, index)
      })
    });
    assert.equal(answer.response.status, 200, `answer ${language} ${index + 1}`);
    assert.ok(answer.payload.replyText, `reply ${language} ${index + 1}`);
    const source = String(answer.payload.generationSource || "unknown");
    sources[source] = (sources[source] || 0) + 1;
    conversationHistory.push({ role: "student", text: question }, { role: "patient", text: answer.payload.replyText });

    const history = await call("/api/training-action/", {
      method: "POST",
      headers: { "X-Training-State": token },
      body: JSON.stringify({
        action: "history-log",
        caseId: "P001",
        attemptId,
        mode: "free",
        language,
        question,
        requestId: `${attemptId}-history-${index}`
      })
    });
    assert.equal(history.response.status, 200, `history ${language} ${index + 1}`);
    token = history.response.headers.get("x-training-state");
    assert.ok(token);
  }
  assert.ok((sources.safe_mock || 0) > 0, `${language} must exercise the explicitly labeled safe mock: ${JSON.stringify(sources)}`);
  assert.equal(sources.live_ai || 0, 0, `${language} mock responses must never be labeled live_ai`);
  return { rounds: questionSets[language].length, sources };
}

const zh = await runLanguage("zh");
const en = await runLanguage("en");
process.stdout.write(`${JSON.stringify({ status: "ok", mock: true, zh, en })}\n`);

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { readRuntimeManifest, runtimeRoot, sha256 } from "./desktop-common.mjs";

const realLocal = process.argv.includes("--real-local-ai");
process.env.LLM_PROVIDER = realLocal ? "local" : "none";
process.env.LLM_ENABLE_AI_PATIENT = realLocal ? "true" : "false";
process.env.TRAINING_STATE_SECRET ||= "r5-patient-semantic-coverage-secret-2026";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";

const require = createRequire(import.meta.url);
const cases = require("../data/cases.json");
const { initSession, generatePatientAnswer, filterPatientOutput } = require("../server/patientSession.js");
const { buildPatientKnowableFactIndex } = require("../server/patientKnowableFacts.js");
const { matchPatientFactOntology, patientFactOntology } = require("../src/lib/patientIntentCatalog.js");

const mode = realLocal ? "real_local" : process.argv.includes("--grounding") ? "grounding" : "semantic";
const blackboxIndex = process.argv.indexOf("--blackbox");
const blackboxCount = blackboxIndex >= 0 ? Number(process.argv[blackboxIndex + 1]) : 0;
const genericUnknown = /这个我现在记不清了|这项情况我现在不太清楚|医生，您能问得再具体一点吗|不太明白您想问哪方面/;
const internalLeak = /simulated|provenance|medical_review|eligibility|diagnosticEligible|scoringEligible|sourceSlotId|matchedPatientFactDomain|groundedIntent|teacherOnly|评分点|标准答案/i;
const stage2Detail = /\d+(?:\.\d+)?\s*(?:个\/|HPF|μl|ul|ng\/ml|mm|cm)|PI-?RADS|TURBT|病理分级|TNM/i;
const systemPatientWording = /现有病史|现有记录|病例资料|资料没有写清|不能凭空|\bsource\b|\bfact\b|字段|记录显示/iu;
const knowledgeIntents = [
  "prior_medical_visit",
  "prior_investigations",
  "prior_investigation_results_patient_aware",
  "prior_diagnosis_patient_aware",
  "prior_treatment",
  "prior_medication_for_current_problem",
  "treatment_response"
];

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  assert.ok(port, "real-local port unavailable");
  return port;
}

async function startRealLocalModel() {
  const modelArg = process.argv.indexOf("--model-path");
  const modelPath = path.resolve(modelArg >= 0 ? process.argv[modelArg + 1] : process.env.HEMATURIA_DESKTOP_MODEL_PATH || "");
  assert.ok(modelArg >= 0 || process.env.HEMATURIA_DESKTOP_MODEL_PATH, "--real-local-ai requires --model-path or HEMATURIA_DESKTOP_MODEL_PATH");
  const manifest = await readRuntimeManifest();
  const model = manifest.models.lightweight;
  assert.equal((await fs.promises.stat(modelPath)).size, model.size, "Qwen3-1.7B model size mismatch");
  assert.equal(await sha256(modelPath), model.sha256, "Qwen3-1.7B model SHA mismatch");
  const llamaPath = path.join(runtimeRoot, "llama", manifest.llamaCpp.entryPoint);
  const port = await reservePort();
  const apiKey = crypto.randomBytes(32).toString("base64url");
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(llamaPath, [
    "--model", modelPath, "--alias", model.alias, "--host", "127.0.0.1", "--port", String(port),
    "--ctx-size", "4096", "--threads", String(Math.max(1, os.availableParallelism() - 1)), "--parallel", "1",
    "--jinja", "--reasoning", "off", "--chat-template-kwargs", "{\"enable_thinking\":false}", "--no-webui", "--api-key", apiKey
  ], { cwd: path.dirname(llamaPath), windowsHide: true, stdio: "ignore" });
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("real_local_llama_exited");
    try {
      const response = await fetch(`${origin}/health`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(1500) });
      if (response.ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const ready = await fetch(`${origin}/v1/models`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(3000) });
  assert.equal(ready.ok, true, "real local model did not become ready");
  process.env.LLM_API_BASE_URL = `${origin}/v1`;
  process.env.LLM_API_KEY = apiKey;
  process.env.LLM_MODEL = model.alias;
  process.env.LLM_ENDPOINT_TYPE = "chat_completions";
  process.env.LLM_STREAMING_ENABLED = "false";
  process.env.LLM_REQUEST_TIMEOUT_MS = "90000";
  process.env.HEMATURIA_RUNTIME_TARGET = "desktop";
  return { child, origin, modelPath, modelAlias: model.alias, modelSha256: model.sha256 };
}

async function stopRealLocalModel(runtime) {
  if (!runtime?.child) return;
  if (runtime.child.exitCode === null) {
    runtime.child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => runtime.child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ]);
    if (runtime.child.exitCode === null) runtime.child.kill("SIGKILL");
  }
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try {
      await fetch(`${runtime.origin}/health`, { signal: AbortSignal.timeout(300) });
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch {
      return;
    }
  }
  assert.fail("real local llama port remained open");
}

const existingCoverage = {
  chief_complaint: ["哪里不舒服", "请问哪里不舒服", "今天为什么来", "能说说为什么来吗", "您的主诉是什么", "这次怎么回事", "请讲讲怎么回事", "为什么来医院", "请用自己的话说说为什么来", "能说下主诉吗"],
  gross_hematuria: ["有肉眼血尿吗", "肉眼能看见血吗", "尿是红的吗", "小便是红的吗", "自己看得见尿里有血吗", "属于肉眼血尿吗", "小便变红了吗", "尿变红时自己能看见吗", "是看得见血的那种吗", "肉眼看得到尿血吗"],
  hematuria_onset: ["血尿是什么时候开始的", "什么时候开始出现尿红", "这个情况多久了", "小便变红几天了", "从什么时候有血尿", "尿色异常开始多久了", "血尿有几周了", "血尿起病有多长时间", "几个月前开始的吗", "血尿起病是哪天"],
  urine_color: ["尿液具体是什么颜色", "小便看着什么色", "尿色是什么样", "像茶色还是鲜红", "尿色偏暗红吗", "小便是什么颜色", "看到的是暗红色吗", "尿像洗肉水吗", "尿会像酱油色吗", "排出的尿是什么颜色"],
  blood_clots: ["尿里有没有血块", "小便中见过血凝块吗", "有没有排出小血块", "尿中有凝血块没有", "小便里会有血疙瘩吗", "见到过条状血块吗", "血尿时带不带血块", "尿里有没有成块的血块", "排尿时有小血块吗", "您仔细看过尿中血块吗"],
  dysuria: ["尿痛吗", "小便痛吗", "小便疼吗", "排尿痛吗", "排尿疼吗", "尿的时候痛吗", "尿的时候疼吗", "解小便时痛吗", "撒尿痛吗", "撒尿疼吗"],
  flank_pain: ["腰痛吗", "腰疼吗", "腰部痛吗", "腰部疼吗", "肾区痛吗", "肾区疼吗", "后腰痛吗", "侧腰痛吗", "有没有腰痛", "腰侧疼不疼"],
  fever: ["这几天发烧了吗", "有没有量到体温高", "出现过发热吗", "身体有没有烧起来", "最近体温正常吗", "有没有发烧", "会发热吗", "当时有没有烧", "体温有没有升高", "这次伴不伴发烧"],
  smoking_history: ["平时吸烟吗", "有没有抽烟习惯", "一天抽多少烟", "以前抽烟吗", "您的烟龄多久", "现在还抽烟吗", "吸烟多少年了", "大概有多少包年", "平常抽烟吗", "从什么时候开始吸烟"],
  medication_list: ["平时长期吃什么药", "长期都吃什么药", "平时有没有吃药", "长期用药都有什么", "平时服用哪些药", "长期用药能说一下吗", "您都吃什么药", "有没有长期用药", "您的用药史怎么样", "平时用的药有哪些"],
  family_history: ["家里有人有类似情况吗", "父母兄弟姐妹有血尿吗", "家族史里有肾病吗", "有没有遗传情况的家族史", "父母身体情况怎么样", "家里人健康吗", "兄弟姐妹身体情况如何", "家里人有过同样尿红吗", "家族史中有早发肾衰吗", "能说下家族史吗"]
};

function planFor(answer, intent) {
  return (answer.answerPlans || []).find((plan) => plan.intent === intent);
}

function assertSafe(answer, label) {
  assert.ok(String(answer.replyText || "").trim(), `${label}: empty answer`);
  assert.doesNotMatch(answer.replyText, internalLeak, `${label}: internal field leak`);
  assert.doesNotMatch(answer.replyText, stage2Detail, `${label}: Stage 2/report detail leak`);
  assert.doesNotMatch(answer.replyText, systemPatientWording, `${label}: system or chart wording reached the patient voice`);
}

async function ask(session, caseId, question, language = "zh") {
  return generatePatientAnswer({ sessionId: session.sessionId, caseId, studentInput: question, language });
}

async function semanticCoverage() {
  const semanticCase = cases.find((item) => item.displayCaseId === "P031");
  const session = await initSession({ caseId: semanticCase.id, attemptId: "r5-semantic-18-domains", language: "zh" });
  const matrix = Object.entries(existingCoverage).concat(knowledgeIntents.map((intent) => {
    const definition = patientFactOntology.find((item) => item.key === intent);
    return [intent, definition.aliases.zh.slice(0, 10)];
  }));
  assert.equal(matrix.length, 18, "semantic coverage must own exactly 18 domains");
  let passed = 0;
  for (const [intent, questions] of matrix) {
    assert.ok(questions.length >= 10, `${intent}: fewer than 10 natural rewrites`);
    for (const question of questions.slice(0, 10)) {
      const definition = patientFactOntology.find((item) => item.key === intent);
      assert.ok(
        definition && matchPatientFactOntology(question, "zh", [definition.domain]).some((item) => item.intentKey === intent),
        `${intent}: ontology route missed ${question}`
      );
      const answer = await ask(session, semanticCase.id, question);
      if (!planFor(answer, intent)) {
        assert.equal(intent, "prior_diagnosis_patient_aware", `${intent}: governed route missed ${question}`);
        assert.equal(answer.fallbackReason, "diagnosis_boundary", `${intent}: protected diagnosis wording lost its boundary`);
      }
      assertSafe(answer, `${intent}:${question}`);
      passed += 1;
    }
  }
  return { domains: matrix.length, rewritesPerDomain: 10, passed, total: matrix.length * 10 };
}

async function groundingCoverage() {
  let known = 0;
  let missing = 0;
  let answerableGenericUnknown = 0;
  let hallucination = 0;
  let stage2Leak = 0;
  let internalLeaks = 0;
  const canonicalQuestion = Object.fromEntries(knowledgeIntents.map((intent) => {
    const definition = patientFactOntology.find((item) => item.key === intent);
    return [intent, definition.aliases.zh[0]];
  }));
  for (const [caseIndex, caseData] of cases.entries()) {
    const session = await initSession({ caseId: caseData.id, attemptId: `r5-grounding-${caseIndex}`, language: "zh" });
    const index = buildPatientKnowableFactIndex(caseData, "zh");
    for (const intent of knowledgeIntents) {
      const answer = await ask(session, caseData.id, canonicalQuestion[intent]);
      const plan = planFor(answer, intent);
      assert.ok(plan, `${caseData.displayCaseId || caseData.id}:${intent}: missing grounded plan`);
      const sourceKnown = Boolean(index.facts[intent]);
      if (sourceKnown) {
        known += 1;
        if (genericUnknown.test(answer.replyText)) answerableGenericUnknown += 1;
        if (plan.factState !== "exact_value") hallucination += 1;
      } else {
        missing += 1;
        if (!["missing", "patient_not_aware"].includes(plan.factState)) hallucination += 1;
      }
      if (stage2Detail.test(answer.replyText)) stage2Leak += 1;
      if (internalLeak.test(answer.replyText)) internalLeaks += 1;
      assertSafe(answer, `${caseData.displayCaseId || caseData.id}:${intent}`);
    }
  }
  assert.equal(answerableGenericUnknown, 0, "source-backed facts must not fall through to generic unknown");
  assert.equal(hallucination, 0, "grounded fact states must agree with source presence");
  assert.equal(stage2Leak, 0, "Stage 2/full report details must not leak");
  assert.equal(internalLeaks, 0, "internal governance fields must not leak");

  assert.deepEqual(
    cases
      .filter((caseData) => buildPatientKnowableFactIndex(caseData, "zh").facts.prior_medical_visit)
      .map((caseData) => caseData.displayCaseId),
    ["P001", "P002", "P003", "P004", "P005", "P007", "P026"],
    "current-encounter wording became a prior medical visit"
  );
  const p018 = cases.find((item) => item.displayCaseId === "P018");
  assert.match(
    buildPatientKnowableFactIndex(p018, "zh").facts.treatment_response,
    /多喝水后稍微缓解/,
    "the reviewed patient-known response to drinking water was not projected"
  );
  const p022 = cases.find((item) => item.displayCaseId === "P022");
  const p022Facts = buildPatientKnowableFactIndex(p022, "zh").facts;
  for (const intent of ["prior_treatment", "prior_medication_for_current_problem", "treatment_response"]) {
    assert.match(p022Facts[intent], /抗菌药/);
    assert.doesNotMatch(p022Facts[intent], /尿频|尿急|尿痛|低热/, `${intent} must not recite unasked symptoms`);
  }
  const p039 = cases.find((item) => item.displayCaseId === "P039");
  assert.equal(
    buildPatientKnowableFactIndex(p039, "zh").facts.prior_medication_for_current_problem,
    "",
    "unrelated long-term analgesics became medication for the current problem"
  );
  const p027 = cases.find((item) => item.displayCaseId === "P027");
  assert.equal(
    buildPatientKnowableFactIndex(p027, "zh").facts.prior_treatment,
    "",
    "chronic urate-lowering treatment became treatment for the current problem"
  );
  const plannedOnly = buildPatientKnowableFactIndex({
    presentIllness: { priorCare: "此前医生建议做CT检查，但尚未完成。" }
  }, "zh");
  assert.equal(plannedOnly.facts.prior_investigations, "", "a planned investigation became a completed investigation");
  assert.equal(plannedOnly.facts.prior_investigation_results_patient_aware, "", "a planned investigation became a known result");
  assert.match(
    buildPatientKnowableFactIndex({ presentIllness: { priorCare: "此前做过B超，医生说前列腺未见增大。" } }, "zh")
      .facts.prior_investigation_results_patient_aware,
    /没有看到明显异常/,
    "a negated prostate finding became a positive enlargement"
  );
  for (const [sourceText, forbidden] of [
    ["此前查过尿，医生说尿里未见红细胞，蛋白阴性。", /尿里有血|还有蛋白/],
    ["此前做过CT，医生说未发现结石。", /有个结石/],
    ["此前做过B超，医生说未发现积水。", /有点积水/]
  ]) {
    const summary = buildPatientKnowableFactIndex({ presentIllness: { priorCare: sourceText } }, "zh")
      .facts.prior_investigation_results_patient_aware;
    assert.match(summary, /没有看到明显异常/, `negative patient-aware result lost: ${sourceText}`);
    assert.doesNotMatch(summary, forbidden, `negative patient-aware result flipped polarity: ${sourceText}`);
  }
  for (const [sourceText, expected] of [
    ["此前做过B超，医生说有个结石。", /医生说有个结石/],
    ["之前查过超声，医生说有点积水。", /医生说有点积水/],
    ["以前做过B超，医生说前列腺增大。", /医生说前列腺有点大/]
  ]) {
    const summary = buildPatientKnowableFactIndex({ presentIllness: { priorCare: sourceText } }, "zh").facts.prior_investigation_results_patient_aware;
    assert.match(summary, expected, `patient-aware source was over-generalized: ${sourceText}`);
    assert.doesNotMatch(summary, stage2Detail, `patient-aware coarse result exposed exact report detail: ${sourceText}`);
  }
  const forbiddenOnly = buildPatientKnowableFactIndex({
    id: "BOUNDARY-SENTINEL",
    urineTestResult: "尿RBC+++，蛋白++",
    investigations: [{ type: "影像", result: "CT提示占位" }],
    clinical: { requiredLabs: "尿常规", specialTests: "CT提示占位", imagingAndProcedures: "膀胱镜" },
    teacherOnlyData: { diagnosis: "hidden" },
    diagnosis: "hidden",
    scoringKey: { answer: "hidden" },
    stageTasks: [{ result: "hidden" }]
  }, "zh");
  assert.ok(Object.values(forbiddenOnly.facts).every((value) => value === ""), "root reports, teacher, Stage 2, diagnosis, and scoring fields must remain outside the patient-knowable layer");
  const p031Index = buildPatientKnowableFactIndex(cases.find((item) => item.displayCaseId === "P031"), "zh");
  assert.equal(p031Index.facts.prior_investigations, "", "P031 teacher-only reports became a patient-known prior investigation");
  assert.equal(p031Index.facts.prior_investigation_results_patient_aware, "", "P031 teacher-only reports became a patient-known result");
  const p042Index = buildPatientKnowableFactIndex(cases.find((item) => item.displayCaseId === "P042"), "zh");
  assert.match(p042Index.facts.prior_investigations, /尿检/, "P042 explicit prior urinalyses were not patient-known");
  assert.match(p042Index.facts.prior_investigation_results_patient_aware, /两次尿检都查到过血/, "P042 explicit patient-aware urine result was lost");
  assert.equal(
    filterPatientOutput("我做过尿检，也接受过手术治疗。", ["PATIENT_PRIOR_INVESTIGATIONS"]).ok,
    false,
    "an investigation slot must not grant treatment or surgery vocabulary"
  );
  assert.equal(filterPatientOutput("医生以前给过诊断。", ["PATIENT_PRIOR_DIAGNOSIS"]).ok, true);
  assert.equal(filterPatientOutput("我之前为这个问题接受过治疗。", ["PATIENT_PRIOR_TREATMENT"]).ok, true);
  for (const wording of ["现有病史", "现有记录", "病例资料", "资料没有写清", "不能凭空", "source", "fact", "字段", "记录显示"]) {
    assert.equal(filterPatientOutput(wording, []).ok, false, `patient filter allowed system wording: ${wording}`);
  }

  const case31 = cases.find((item) => item.displayCaseId === "P031");
  assert.ok(case31, "P031 source case missing");
  const session31 = await initSession({ caseId: case31.id, attemptId: "r5-p031-human-replay", language: "zh" });
  const case31Questions = [
    ["有没有做什么检查？", [["prior_investigations", "missing"]]],
    ["做检查了吗？", [["prior_investigations", "missing"]]],
    ["之前去医院查过吗？", [["prior_medical_visit", "missing"], ["prior_investigations", "missing"]]],
    ["查过尿吗？", [["prior_investigations", "patient_not_aware"]]],
    ["做过B超吗？", [["prior_investigations", "patient_not_aware"]]],
    ["做过CT吗？", [["prior_investigations", "patient_not_aware"]]],
    ["检查结果怎么说？", [["prior_investigation_results_patient_aware", "missing"]]],
    ["医生怎么跟你说的？", [["prior_investigation_results_patient_aware", "missing"]]],
    ["之前怎么治疗的？", [["prior_treatment", "missing"]]],
    ["吃过药吗？", [["prior_medication_for_current_problem", "missing"]]],
    ["后来好点了吗？", [["treatment_response", "missing"]]]
  ];
  const case31Results = [];
  for (const [question, expectedPlans] of case31Questions) {
    const answer = await ask(session31, case31.id, question);
    assert.deepEqual(
      (answer.answerPlans || []).map((plan) => [plan.intent, plan.factState]),
      expectedPlans,
      `P031 grounded plans changed: ${question}`
    );
    assert.doesNotMatch(answer.replyText, genericUnknown, `P031 generic unknown: ${question}`);
    assertSafe(answer, `P031:${question}`);
    case31Results.push({ question, replyText: answer.replyText, plans: expectedPlans });
  }
  const diagnosisSession = await initSession({ caseId: case31.id, attemptId: "r5-p031-prior-diagnosis", language: "zh" });
  const priorDiagnosis = await ask(diagnosisSession, case31.id, "以前医生有没有告诉过你是什么病？");
  assert.deepEqual(
    (priorDiagnosis.answerPlans || []).map((plan) => [plan.intent, plan.factState]),
    [["prior_diagnosis_patient_aware", "missing"]],
    "P031 true-missing prior diagnosis did not stay in the patient-knowledge boundary"
  );
  assertSafe(priorDiagnosis, "P031:prior-diagnosis");

  const compound = await ask(session31, case31.id, "做过什么检查，结果怎么样，之前怎么治疗的？");
  for (const intent of ["prior_investigations", "prior_investigation_results_patient_aware", "prior_treatment"]) {
    assert.ok(planFor(compound, intent), `compound clause dropped: ${intent}`);
  }
  const firstContext = await ask(session31, case31.id, "之前做过哪些检查？");
  const resultContext = await ask(session31, case31.id, "结果呢？");
  assert.ok(planFor(firstContext, "prior_investigations"), "context setup route missing");
  assert.ok(planFor(resultContext, "prior_investigation_results_patient_aware"), "result follow-up lost investigation context");

  for (const followup of ["检查怎么说？", "那个检查结果呢？", "医生怎么跟你说的？"]) {
    const contextSession = await initSession({ caseId: case31.id, attemptId: `r5-investigation-context-${followup}`, language: "zh" });
    await ask(contextSession, case31.id, "之前做过哪些检查？");
    const answer = await ask(contextSession, case31.id, followup);
    assert.ok(planFor(answer, "prior_investigation_results_patient_aware"), `investigation result follow-up lost context: ${followup}`);
  }
  for (const followup of ["然后呢？", "后来呢？", "还有吗？"]) {
    const contextSession = await initSession({ caseId: case31.id, attemptId: `r5-investigation-more-${followup}`, language: "zh" });
    await ask(contextSession, case31.id, "之前做过哪些检查？");
    const answer = await ask(contextSession, case31.id, followup);
    assert.ok(planFor(answer, "prior_investigations"), `investigation continuation lost context: ${followup}`);
  }

  const case18 = cases.find((item) => item.displayCaseId === "P018");
  const session18 = await initSession({ caseId: case18.id, attemptId: "r5-treatment-context", language: "zh" });
  await ask(session18, case18.id, "之前怎么治疗的？");
  const responseContext = await ask(session18, case18.id, "后来好点了吗？");
  assert.ok(planFor(responseContext, "treatment_response"), "treatment response follow-up lost context");

  const apiSource = fs.readFileSync(new URL("../api/agent-chat.js", import.meta.url), "utf8");
  for (const field of ["groundedIntent", "matchedPatientFactDomain", "factState", "sourceBacked", "answerPlans", "localMetadata"]) {
    assert.doesNotMatch(apiSource.slice(apiSource.indexOf("payload: {", apiSource.indexOf("const patient ="))), new RegExp(`\\b${field}\\b`), `public patient payload exposes ${field}`);
  }

  return {
    cases: cases.length,
    domains: knowledgeIntents.length,
    assertions: cases.length * knowledgeIntents.length,
    known,
    missing,
    answerableGenericUnknown,
    hallucination,
    stage2Leak,
    internalLeaks,
    systemPatientWording: 0,
    compoundClauseDrop: 0,
    case31Results
  };
}

async function blackbox(count) {
  if (!count) return null;
  const fixtureQuestions = new Set(Object.values(existingCoverage).flat().concat(
    knowledgeIntents.flatMap((intent) => patientFactOntology.find((item) => item.key === intent).aliases.zh)
  ));
  const case31 = cases.find((item) => item.displayCaseId === "P031");
  const case18 = cases.find((item) => item.displayCaseId === "P018");
  const sessions = {
    [case31.id]: await initSession({ caseId: case31.id, attemptId: "r5-blackbox-p031", language: "zh" }),
    [case18.id]: await initSession({ caseId: case18.id, attemptId: "r5-blackbox-p018", language: "zh" })
  };
  const leads = ["我再确认一下，", "想补问一句，", "麻烦您回想一下，", "如果方便请告诉我，", "关于来院前的情况，", "我换个方式问，", "为了把经过弄清楚，", "还有一件事想确认，", "请按您记得的说，", "我接着问一下，"];
  const families = [
    { intent: "prior_medical_visit", caseData: case31, cores: ["之前去过医院吗？", "以前看过医生吗？", "为这个去门诊了吗？", "这次症状看过医生吗？", "之前就诊过吗？", "去医院看了吗？", "找医生看过没有？", "来这里前看过吗？", "有没有去急诊？", "以前为尿血看过吗？"] },
    { intent: "prior_investigations", caseData: case31, cores: ["有没有做什么检查？", "做检查了吗？", "做过哪些检查？", "之前查过什么？", "去医院查什么了？", "都做了什么检查？", "有没有验过？", "以前检查过吗？", "医院给你查了吗？", "为这个做过检查没有？"] },
    { intent: "prior_investigation_results_patient_aware", caseData: case31, cores: ["检查结果怎么样？", "结果出来了吗？", "查出来什么？", "报告怎么说？", "尿检怎么样？", "查尿结果呢？", "B超结果呢？", "医生说检查有什么？", "检查发现什么了？", "前面检查最后怎么说？"] },
    { intent: "prior_treatment", caseData: case18, cores: ["之前怎么治疗的？", "为这个治过吗？", "医院给你处理了吗？", "以前接受过治疗吗？", "这次症状治过没有？", "之前做过什么处理？", "医生给你怎么治？", "去医院后怎么处理？", "有没有输液治疗？", "之前采取过什么办法？"] },
    { intent: "treatment_response", caseData: case18, cores: ["治疗后怎么样？", "吃药后好点了吗？", "用药有效果吗？", "后来缓解了吗？", "处理后有没有好转？", "治了以后还发吗？", "药吃了管用吗？", "输液后怎么样？", "治疗反应如何？", "后来症状有变化吗？"] }
  ];
  let answerableGenericUnknown = 0;
  const generatedQuestions = new Set();
  for (let index = 0; index < count; index += 1) {
    const family = families[index % families.length];
    const variant = Math.floor(index / families.length);
    const question = `${leads[variant % leads.length]}${family.cores[Math.floor(variant / leads.length) % family.cores.length]}`;
    assert.equal(fixtureQuestions.has(question), false, `blackbox question leaked from fixed fixture: ${question}`);
    assert.equal(generatedQuestions.has(question), false, `blackbox question repeated: ${question}`);
    generatedQuestions.add(question);
    const answer = await ask(sessions[family.caseData.id], family.caseData.id, question);
    assert.ok(planFor(answer, family.intent), `blackbox semantic miss: ${family.intent}:${question}`);
    if (planFor(answer, family.intent).factState === "exact_value" && genericUnknown.test(answer.replyText)) answerableGenericUnknown += 1;
    assertSafe(answer, `blackbox:${index}`);
  }
  assert.equal(generatedQuestions.size, count, "blackbox corpus must contain unique natural questions");
  assert.equal(answerableGenericUnknown, 0, "blackbox source-backed questions reached generic unknown");
  return { seed: "r5-patient-blackbox-v1", total: count, passed: count, answerableGenericUnknown };
}

async function realLocalCoverage(runtime) {
  const case31 = cases.find((item) => item.displayCaseId === "P031");
  const session = await initSession({ caseId: case31.id, attemptId: "r5-real-local-p031", language: "zh" });
  const questions = [
    ["有没有做什么检查？", "prior_investigations", "missing"], ["做检查了吗？", "prior_investigations", "missing"],
    ["之前去医院查过吗？", "prior_investigations", "missing"], ["查过尿吗？", "prior_investigations", "patient_not_aware"],
    ["做过B超吗？", "prior_investigations", "patient_not_aware"], ["做过CT吗？", "prior_investigations", "patient_not_aware"],
    ["检查结果怎么说？", "prior_investigation_results_patient_aware", "missing"], ["医生怎么跟你说的？", "prior_investigation_results_patient_aware", "missing"],
    ["之前怎么治疗的？", "prior_treatment", "missing"], ["吃过药吗？", "prior_medication_for_current_problem", "missing"],
    ["后来好点了吗？", "treatment_response", "missing"]
  ];
  let localAccepted = 0;
  let fallback = 0;
  for (const [question, expectedIntent, expectedFactState] of questions) {
    const answer = await ask(session, case31.id, question);
    const actualPlan = planFor(answer, expectedIntent);
    assert.ok(actualPlan, `real local lost grounded plan: ${question}`);
    assert.equal(actualPlan.factState, expectedFactState, `real local changed fact state: ${question}`);
    assertSafe(answer, `real-local:${question}`);
    if (answer.runtimeTrace?.classificationSource === "local_ai" && answer.runtimeTrace?.classifierStatus === "accepted") localAccepted += 1;
    if (answer.isFallback) fallback += 1;
  }
  assert.ok(localAccepted >= 1, "real Qwen3-1.7B did not produce any accepted local semantic metadata");
  return {
    model: runtime.modelAlias,
    modelSha256: runtime.modelSha256,
    questions: questions.length,
    groundedPlanMatches: questions.length,
    localAccepted,
    fallback,
    cloudRequestCount: 0
  };
}

let runtime = null;
const nativeFetch = globalThis.fetch;
let cloudRequestCount = 0;
try {
  if (realLocal) {
    runtime = await startRealLocalModel();
    globalThis.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
        cloudRequestCount += 1;
        throw new Error("real_local_test_blocked_cloud_request");
      }
      return nativeFetch(input, init);
    };
  }
  const result = mode === "semantic"
    ? { semantic: await semanticCoverage() }
    : mode === "real_local"
      ? { realLocal: await realLocalCoverage(runtime) }
      : { grounding: await groundingCoverage(), blackbox: await blackbox(blackboxCount) };
  assert.equal(cloudRequestCount, 0, "real local Patient Agent attempted a cloud request");
  console.log(JSON.stringify({ gate: mode === "semantic" ? "R5-PATIENT-SEMANTIC-COVERAGE" : "R5-PATIENT-KNOWLEDGE-GROUNDING", ...result }, null, 2));
} finally {
  globalThis.fetch = nativeFetch;
  await stopRealLocalModel(runtime);
}

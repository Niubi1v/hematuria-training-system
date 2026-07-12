import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import casesJson from "../data/cases.json";
import cases42Json from "../data/cases_42.json";
import casesEnJson from "../data/cases_en.json";
import slotsJson from "../data/patient_slots_bilingual.json";
import type { CaseData } from "../src/lib/types";

const cases = casesJson as CaseData[];
const cases42 = cases42Json as CaseData[];
const casesEn = casesEnJson as Array<Record<string, unknown>>;
const slots = slotsJson as Record<string, Record<string, { patientAnswerZh: string; patientAnswerEn: string }>>;
const review = JSON.parse(fs.readFileSync("data/medical_review_queue.json", "utf8")) as {
  formalUseAllowed: boolean;
  importedReviewCandidate: {
    sourceWorkbook: string;
    sourceSha256: string;
    userAcceptedForPractice: boolean;
    licensedExpertSignoffCount: number;
    licensedExpertSignoffPending: number;
    sourceVerificationPending: number;
    caseOwnerSignoffPending: number;
    aiModifiedCount: number;
    aiRetainedCount: number;
    formalUseAllowed: boolean;
  };
  systemApplicationPatches: Array<{ appliedToPractice: boolean; humanReviewStatus: string }>;
  queue: Array<Record<string, string | boolean>>;
};

function byDisplay(id: string) {
  const found = cases.find((item) => (item.displayCaseId || item.id) === id);
  assert.ok(found, `${id} missing`);
  return found;
}

assert.equal(cases.length, 42);
assert.equal(cases42.length, 42);
assert.ok(cases.every((item) => item.medicalReview?.status === "needs_revision"));
assert.ok(cases.every((item) => item.medicalReviewImport?.userAcceptedForPractice === true));
assert.ok(cases.every((item) => item.medicalReviewImport?.licensedExpertSignoffPending === true));
assert.ok(cases.every((item) => item.medicalReviewImport?.formalUseAllowed === false));

assert.equal(review.formalUseAllowed, false);
assert.equal(review.importedReviewCandidate.userAcceptedForPractice, true);
assert.equal(review.importedReviewCandidate.licensedExpertSignoffCount, 0);
assert.equal(review.importedReviewCandidate.licensedExpertSignoffPending, 419);
assert.equal(review.importedReviewCandidate.sourceVerificationPending, 153);
assert.equal(review.importedReviewCandidate.caseOwnerSignoffPending, 42);
assert.equal(review.importedReviewCandidate.aiModifiedCount, 179);
assert.equal(review.importedReviewCandidate.aiRetainedCount, 240);
assert.equal(review.importedReviewCandidate.formalUseAllowed, false);
assert.equal(review.systemApplicationPatches.length, 9);
assert.ok(review.systemApplicationPatches.every((item) => item.appliedToPractice && /待.*确认/.test(item.humanReviewStatus)));
assert.ok(review.queue.every((item) => item.decision === "待确认" && item.humanReviewStatus === "pending_licensed_expert"));
assert.ok(review.queue.every((item) => !item.reviewerName && !item.reviewDate));
assert.equal(review.queue.filter((item) => item.aiPreReviewDecision === "修改").length, 179);
assert.equal(review.queue.filter((item) => item.aiPreReviewDecision === "保留").length, 240);
assert.ok(review.queue.every((item) => !/原始病历|原始资料|需追问|需主动询问|未主动诉|教师提示|评分点/.test(String(item.effectivePatientAnswerZh))));
assert.ok(review.queue.every((item) => !/[\u3400-\u9fff]/.test(String(item.effectivePatientAnswerEn))));

assert.match(byDisplay("P001").structuredHistory!.smokingHistory.patientAnswerZh, /记不准确/);
assert.match(slots.P001.smoking.patientAnswerZh, /记不准确/);
assert.equal(byDisplay("P003").structuredHistory!.transfusionHistory.status, "present");
assert.match(byDisplay("P003").structuredHistory!.transfusionHistory.patientAnswerZh, /胆囊切除.*输过血/);
assert.equal(byDisplay("P005").title, "前列腺增生，前列腺癌待排/鉴别");
assert.equal(byDisplay("P005").diagnosis, "前列腺增生");
assert.equal(byDisplay("P005").structuredHistory!.coronaryDisease.status, "present");
assert.match(byDisplay("P005").structuredHistory!.coronaryDisease.patientAnswerZh, /6年前.*冠脉支架/);

const p013 = byDisplay("P013").structuredHistory!;
assert.deepEqual({ status: p013.smokingHistory.status, cigarettesPerDay: p013.smokingHistory.cigarettesPerDay, years: p013.smokingHistory.years, quitYears: p013.smokingHistory.quitYears, packYears: p013.smokingHistory.packYears }, { status: "former", cigarettesPerDay: 20, years: 40, quitYears: 5, packYears: 40 });
assert.deepEqual(p013.medicationList.map((item) => item.name), ["氨氯地平"]);
assert.equal(p013.anticoagulantUse.status, "absent");
assert.equal(p013.antiplateletUse.status, "absent");
assert.doesNotMatch(`${p013.medicationAnswerZh}${p013.medicationAnswerEn}`, /阿司匹林|氯吡格雷|华法林|利伐沙班|aspirin|clopidogrel|warfarin|rivaroxaban/i);
assert.match(slots["HX-ADD-001"].smoking.patientAnswerEn, /20 cigarettes.*40 years.*five years.*40 pack-years/i);

assert.equal(byDisplay("P030").diagnosis, "前列腺癌待排/鉴别");
assert.equal(byDisplay("P033").diagnosis, "COL4相关薄基底膜病待确认");
assert.equal(byDisplay("P034").diagnosis, "疑似Alport综合征（待遗传学/病理证实）");
assert.equal(byDisplay("P042").diagnosis, "高危无症状镜下血尿待查（肿瘤筛查路径）");
assert.match(String(casesEn.find((item) => item.id === "P005")?.title), /Benign prostatic hyperplasia.*prostate cancer to be excluded/i);
assert.match(String(casesEn.find((item) => item.id === "HX-ADD-021")?.title), /COL4-related/i);

const workbookPath = path.join("docs", "medical-review", review.importedReviewCandidate.sourceWorkbook);
assert.ok(fs.existsSync(workbookPath), "Imported medical-review workbook is missing");
const hash = createHash("sha256").update(fs.readFileSync(workbookPath)).digest("hex");
assert.equal(hash, review.importedReviewCandidate.sourceSha256);

console.log("Medical-review candidate import passed: 179 revised answers, 240 retained facts, 9 practice patches, 0 licensed approvals.");

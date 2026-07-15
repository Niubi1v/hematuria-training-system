import fs from "node:fs";
import { createRequire } from "node:module";
import type { CaseData } from "../src/lib/types";

process.env.TRAINING_STATE_SECRET = "unit-test-training-state-secret-with-adequate-length";

const require = createRequire(import.meta.url);
const { initSession, getSession } = require("../server/patientSession.js") as {
  initSession: (input: { caseId: string; language: string; mode: string; debug: boolean }) => Promise<any>;
  getSession: (sessionId: string, caseId: string) => { completedPatientFacingProfile?: Record<string, { value?: string; source?: string }> } | null;
};
const cases = JSON.parse(fs.readFileSync("data/cases.json", "utf8")) as CaseData[];

function assert(condition: unknown, message: string) { if (!condition) throw new Error(message); }

async function main() {
  process.env.LLM_ENABLE_AI_AGENTS = "false";
  const rows: string[] = [];
  for (const caseData of cases) {
    const session = await initSession({ caseId: caseData.id, language: "zh", mode: "qc", debug: true });
    const profile = getSession(session.sessionId, caseData.id)?.completedPatientFacingProfile || {};
    for (const key of ["past_history_patient_safe", "medication_patient_safe", "allergy_history", "smoking_history", "drinking_history"]) {
      const fact = profile[key];
      assert(fact && fact.value && fact.source !== "unknown", `${caseData.id} lost required patient-facing fact ${key}`);
    }
    rows.push(`| ${caseData.id} | 完整 | ${profile.smoking_history.value} | ${profile.medication_patient_safe.value} |`);
  }
  const p001 = await initSession({ caseId: "P001", language: "zh", mode: "p001-qc", debug: true });
  const p001Profile = getSession(p001.sessionId, "P001")?.completedPatientFacingProfile || {};
  assert(/高血压病史10年/.test(p001Profile.past_history_patient_safe?.value || ""), "P001 past history must retain 10-year hypertension history");
  assert(/缬沙坦/.test(p001Profile.medication_patient_safe?.value || "") && /阿司匹林/.test(p001Profile.medication_patient_safe?.value || ""), "P001 medication profile incomplete");
  const hx30 = await initSession({ caseId: "HX-ADD-030", language: "zh", mode: "hx30-qc", debug: true });
  const hx30Profile = getSession(hx30.sessionId, "HX-ADD-030")?.completedPatientFacingProfile || {};
  assert(/45包年/.test(hx30Profile.smoking_history?.value || ""), "HX-ADD-030 must retain 45 pack-years");
  const table = ["| 病例 | 必填事实 | 吸烟史 | 用药史 |", "|---|---|---|---|", ...rows].join("\n");
  const reportPath = "PATIENT_PROFILE_COMPLETENESS_REPORT.md";
  const existing = fs.readFileSync(reportPath, "utf8");
  const existingTable = existing.slice(existing.indexOf("| 病例 |")).trim().replace(/\r\n/g, "\n");
  assert(existingTable === table, "patient-facing profile report table is stale; review differences before using UPDATE_PATIENT_PROFILE_REPORT=1");
  if (process.env.UPDATE_PATIENT_PROFILE_REPORT === "1") {
    const report = ["# 42病例患者可见资料完整性报告", "", `生成时间：${new Date().toISOString()}`, "", table].join("\n");
    fs.writeFileSync(reportPath, `${report}\n`, "utf8");
  }
  console.log("Patient-facing profile completeness passed for 42 cases.");
}

void main();

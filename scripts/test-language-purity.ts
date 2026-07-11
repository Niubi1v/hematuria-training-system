import fs from "node:fs";

const zh = JSON.parse(fs.readFileSync("data/i18n/zh.json", "utf8")) as Record<string, string>;
const agents = JSON.parse(fs.readFileSync("data/agents.json", "utf8")) as Array<{ leftNavLabel: { zh: string }; agentName: { zh: string }; competency: { zh: string } }>;
const component = fs.readFileSync("src/components/ClinicalTrainingClient.tsx", "utf8");
const banned = /\b(?:Agent|Competency|Profile|Guardrails|Response|Source|Voice|Stage|Submit|Order|Fallback|Connected|Unknown|Patient|Debug|Loading|Exam)\b/i;
const allowedAcronyms = /^(?:AI|MDT|OSCE|CT|CTU|MRI|MRU|TURBT|RNU|PSA|BPH|UTUC|RCC|ICU|ERAS|VTE|eGFR|Hb|WBC|RBC|PLT|CRP|PCT|INR|APTT|ECG|ASA|CSV|JSON)$/;

function unwanted(text: string) {
  const visible = text.replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, "");
  return (visible.match(/[A-Za-z][A-Za-z-]*/g) || []).filter((word) => banned.test(word) && !allowedAcronyms.test(word));
}

const issues = Object.entries(zh).flatMap(([key, value]) => unwanted(value).map((word) => `${key}:${word}`));
for (const agent of agents) for (const value of [agent.leftNavLabel.zh, agent.agentName.zh, agent.competency.zh]) issues.push(...unwanted(value));
for (const literal of [">Standardized Patient Agent<", ">Investigation Agent", ">Guardrails<", "能力画像 / Competency Profile", "7-Agent"]) if (component.includes(literal)) issues.push(`component:${literal}`);
if (issues.length) throw new Error(`Chinese UI language purity failed: ${issues.join(", ")}`);
fs.writeFileSync("LANGUAGE_PURITY_REPORT.md", `# 中英文界面语言扫描报告\n\n生成时间：${new Date().toISOString()}\n\n中文词典禁用英文词：0\n中文阶段名称禁用英文词：0\n核心工作台硬编码残留：0\n\n医学缩写按白名单保留。\n`, "utf8");
console.log("Chinese UI language purity checks passed.");

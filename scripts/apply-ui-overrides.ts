import fs from "node:fs";

function read<T>(file: string): T { return JSON.parse(fs.readFileSync(file, "utf8")); }
function write(file: string, value: unknown) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }

for (const language of ["zh", "en"]) {
  const target = `data/i18n/${language}.json`;
  const override = `data/i18n/${language}_overrides.json`;
  write(target, { ...read<Record<string, string>>(target), ...read<Record<string, string>>(override) });
}

const stageZh = [
  ["第1阶段·标准化患者", "标准化患者智能体"],
  ["第2阶段·检查决策", "检查决策智能体"],
  ["第3阶段·诊断推理", "诊断推理智能体"],
  ["第4阶段·多学科协作", "多学科协作智能体"],
  ["第5阶段·治疗决策", "治疗决策智能体"],
  ["第6阶段·围术期管理", "围术期管理智能体"],
  ["第7阶段·评估复盘", "评估复盘智能体"]
];
const agents = read<Array<any>>("data/agents.json").map((agent, index) => ({
  ...agent,
  leftNavLabel: { ...agent.leftNavLabel, zh: stageZh[index][0] },
  agentName: { ...agent.agentName, zh: stageZh[index][1] }
}));
write("data/agents.json", agents);
console.log("Applied stable UI terminology and i18n overrides after Excel conversion.");

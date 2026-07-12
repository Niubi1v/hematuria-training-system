import fs from "node:fs";
import path from "node:path";

const agentDir = path.resolve(".codex/agents");
const files = fs.readdirSync(agentDir).filter((name) => name.endsWith(".toml"));
const sparkFiles = files.filter((name) => /spark/i.test(name));

if (sparkFiles.length !== 3) throw new Error(`Expected 3 Spark agent configs, found ${sparkFiles.length}`);

for (const file of files) {
  const text = fs.readFileSync(path.join(agentDir, file), "utf8");
  const isSpark = /model\s*=\s*"gpt-5\.3-codex-spark"/.test(text);
  if (isSpark) {
    if (!/model_reasoning_effort\s*=\s*"medium"/.test(text)) throw new Error(`${file}: Spark effort must remain medium`);
    if (!/model_supports_reasoning_summaries\s*=\s*false/.test(text)) throw new Error(`${file}: Spark reasoning summaries must be disabled`);
    if (/model_reasoning_summary\s*=\s*"(auto|concise|detailed)"/.test(text) || /reasoning\.summary/.test(text)) {
      throw new Error(`${file}: Spark config would request reasoning.summary`);
    }
  } else if (/model_supports_reasoning_summaries/.test(text)) {
    throw new Error(`${file}: non-Spark agent must not receive the Spark capability override`);
  }
}

console.log("Codex Spark agent config passed: 3 Spark roles use medium effort with reasoning summaries disabled; non-Spark roles unchanged.");

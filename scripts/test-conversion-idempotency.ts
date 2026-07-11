import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const trackedFiles = fs.readdirSync("data").filter((file) => file.endsWith(".json") && !/clinical_contradiction_report/.test(file)).sort();
function hashes() {
  return Object.fromEntries(trackedFiles.map((file) => [file, createHash("sha256").update(fs.readFileSync(path.join("data", file))).digest("hex")]));
}
function convert() {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("npm_execpath is unavailable");
  const result = spawnSync(process.execPath, [npmCli, "run", "convert:excel"], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, CASE_LIBRARY_BUILD_ID: "deterministic" } });
  if (result.status !== 0) throw new Error(`Conversion failed\n${result.stdout}\n${result.stderr}`);
}

convert();
const first = hashes();
convert();
const second = hashes();
const changed = trackedFiles.filter((file) => first[file] !== second[file]);
if (changed.length) throw new Error(`Conversion is not idempotent: ${changed.join(", ")}`);
console.log(`Conversion idempotency passed for ${trackedFiles.length} generated JSON files.`);

import { spawnSync } from "node:child_process";
import path from "node:path";

const executable = path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "eslint.cmd" : "eslint");
const result = spawnSync(executable, [".", "--max-warnings", "0"], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32"
});

process.exit(result.status ?? 1);

import { spawnSync } from "node:child_process";
import path from "node:path";

const executable = path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "eslint.cmd" : "eslint");
const result = spawnSync(executable, [".", "--ext", ".js,.jsx,.ts,.tsx", "--max-warnings", "0"], {
  stdio: "inherit",
  env: { ...process.env, ESLINT_USE_FLAT_CONFIG: "false" },
  shell: process.platform === "win32"
});

process.exit(result.status ?? 1);

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { r4DataDirectory, r5DataDirectory } from "../server/desktopCompatibility.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const r4Head = "fa1d5d05731163697eda0be8efa47c48a673a8cf";
const read = (relative) => fs.readFile(path.join(repoRoot, relative), "utf8");
const current = JSON.parse(await read("src-tauri/tauri.conf.json"));
const r4 = JSON.parse(execFileSync("git", ["show", `${r4Head}:src-tauri/tauri.conf.json`], {
  cwd: repoRoot,
  encoding: "utf8",
  windowsHide: true
}));
const packageJson = JSON.parse(await read("package.json"));
const cargo = await read("src-tauri/Cargo.toml");
const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/mu)?.[1];
const portable = await read("scripts/desktop-package-portable.ps1");
const mentor = await read("scripts/desktop-package-mentor-beta.ps1");
const receipt = await read("scripts/desktop-write-artifact-manifest.mjs");
const mentorLauncher = await read("desktop/mentor/Start-Mentor.ps1");
const clean = await read("scripts/desktop-clean.ps1");
const rust = await read("src-tauri/src/lib.rs");
const sidecar = await read("desktop/sidecar/index.cjs");

assert.notEqual(current.productName, r4.productName, "R5 productName must not collide with frozen R4");
assert.notEqual(current.identifier, r4.identifier, "R5 bundle identifier must not collide with frozen R4");
assert.notEqual(current.version, r4.version, "R5 display version must not collide with frozen R4");
assert.equal(current.version, packageJson.version, "package and Tauri versions must agree");
assert.equal(current.version, cargoVersion, "Cargo and Tauri versions must agree");
assert.equal(current.mainBinaryName, "hematuria-training-r5");
assert.equal(current.bundle.windows.nsis.installMode, "currentUser");
assert.equal(current.bundle.windows.nsis.startMenuFolder, current.productName);

for (const source of [portable, mentor, receipt]) {
  assert.match(source, /hematuria-desktop-r5/u);
  assert.doesNotMatch(source, /Mentor-LocalAI-FinalCandidate/u);
}
assert.doesNotMatch(mentorLauncher, /Mentor-LocalAI-FinalCandidate/u);
assert.match(mentorLauncher, /MentorLocalAI-R5/u);
assert.match(portable, /HematuriaTraining-R5\.exe/u);
assert.match(clean, /hematuria-desktop-r5-portable/u);
assert.match(rust, /product_identity:\s*&'static str/u);
assert.match(rust, /installation_mode:\s*String/u);
assert.match(sidecar, /productIdentity:\s*"hematuria-training-r5"/u);
assert.match(sidecar, /installationMode:/u);

const localAppData = path.join("C:", "Users", "identity-test", "AppData", "Local");
assert.notEqual(r5DataDirectory(localAppData), r4DataDirectory(localAppData));
assert.match(r5DataDirectory(localAppData), /MentorLocalAI-R5$/u);
assert.match(r4DataDirectory(localAppData), /MentorLocalAI-FinalCandidate$/u);

console.log(JSON.stringify({
  status: "passed",
  r4: { productName: r4.productName, identifier: r4.identifier, version: r4.version },
  r5: {
    productName: current.productName,
    identifier: current.identifier,
    version: current.version,
    mainBinaryName: current.mainBinaryName,
    installDirectoryName: current.productName,
    uninstallKeyIdentity: current.identifier,
    shortcutName: current.productName,
    startMenuFolder: current.bundle.windows.nsis.startMenuFolder,
    installMode: current.bundle.windows.nsis.installMode,
    dataDirectoryName: path.basename(r5DataDirectory(localAppData))
  }
}));

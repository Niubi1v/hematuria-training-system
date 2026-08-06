import fs from "node:fs/promises";
import path from "node:path";
import {
  readRuntimeManifest,
  repoRoot,
  sha256,
  tauriResourcesRoot,
  walkFiles
} from "./desktop-common.mjs";

async function treeMetrics(root) {
  const files = await walkFiles(root);
  let bytes = 0;
  for (const file of files) bytes += (await fs.stat(file)).size;
  return { files: files.length, bytes };
}

async function fileRecord(filePath) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error(`desktop_artifact_missing:${filePath}`);
  return {
    fileName: path.basename(filePath),
    bytes: stat.size,
    sha256: await sha256(filePath)
  };
}

const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
const runtimeManifest = await readRuntimeManifest();
const artifactRoot = process.env.HEMATURIA_DESKTOP_ARTIFACTS?.trim()
  ? path.resolve(process.env.HEMATURIA_DESKTOP_ARTIFACTS.trim())
  : "D:\\HematuriaDesktopArtifacts";
const version = String(packageJson.version);
const portablePath = path.join(
  artifactRoot,
  `hematuria-desktop-r5-portable-${version}-windows-x64.zip`
);
const installerPath = path.join(
  artifactRoot,
  `hematuria-desktop-r5-setup-${version}-windows-x64.exe`
);
const shellPath = path.join(repoRoot, "src-tauri", "target", "release", "hematuria-training-r5.exe");
const portableStage = path.join(
  repoRoot,
  ".desktop-cache",
  "portable",
  `HematuriaTraining-R5-${version}-windows-x64`
);

const receipt = {
  schemaVersion: 1,
  product: "hematuria-training-r5",
  version,
  platform: "windows-x86_64",
  artifacts: {
    portable: await fileRecord(portablePath),
    installer: await fileRecord(installerPath)
  },
  components: {
    tauriShell: await fileRecord(shellPath),
    frontend: await treeMetrics(path.join(repoRoot, "out")),
    businessSidecar: await treeMetrics(path.join(tauriResourcesRoot, "app")),
    nodeRuntime: await treeMetrics(path.join(tauriResourcesRoot, "runtime", "node")),
    llamaRuntime: await treeMetrics(path.join(tauriResourcesRoot, "runtime", "llama")),
    portableUncompressed: await treeMetrics(portableStage)
  },
  runtimeManifest: {
    schemaVersion: runtimeManifest.schemaVersion,
    nodeVersion: runtimeManifest.node.version,
    llamaCppVersion: runtimeManifest.llamaCpp.version,
    pinnedLlamaFiles: runtimeManifest.llamaCpp.files.length
  },
  model: {
    fileName: runtimeManifest.model.fileName,
    bytes: runtimeManifest.model.size,
    sha256: runtimeManifest.model.sha256,
    bundledInInstaller: false
  },
  models: Object.fromEntries(Object.entries(runtimeManifest.models).map(([mode, model]) => [mode, {
    fileName: model.fileName,
    alias: model.alias,
    bytes: model.size,
    sha256: model.sha256,
    bundledInInstaller: false
  }]))
};

await fs.mkdir(artifactRoot, { recursive: true });
const destination = path.join(
  artifactRoot,
  `hematuria-desktop-artifacts-${version}.json`
);
const temporary = `${destination}.partial-${process.pid}`;
await fs.writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
await fs.rename(temporary, destination);
console.log(`Desktop artifact manifest: ${destination}`);

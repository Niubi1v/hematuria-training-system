"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DESKTOP_ERROR_CATEGORIES = Object.freeze([
  "runtime_resources_missing",
  "node_spawn_failed",
  "job_object_failed",
  "sidecar_handshake_timeout",
  "sidecar_exited",
  "data_directory_unwritable",
  "sqlite_open_failed",
  "sqlite_locked_or_corrupt",
  "loopback_unavailable",
  "model_missing_or_invalid",
  "llama_dependency_missing",
  "llama_cpu_incompatible",
  "llama_memory_insufficient",
  "llama_start_failed",
  "security_software_suspected",
  "unknown_runtime_failure"
]);

const ERROR_MESSAGES = Object.freeze({
  runtime_resources_missing: [
    "本地运行组件缺失，请重新安装完整版本。",
    "Local runtime resources are missing. Reinstall the complete application."
  ],
  node_spawn_failed: [
    "本地运行服务无法启动，请重新安装完整版本。",
    "The local runtime service could not start. Reinstall the complete application."
  ],
  job_object_failed: [
    "Windows 未能管理本地运行进程，请导出诊断报告后重试。",
    "Windows could not manage the local runtime processes. Export a diagnostic report and retry."
  ],
  sidecar_handshake_timeout: [
    "本地运行服务响应超时，请导出诊断报告后重新准备。",
    "The local runtime service timed out during startup. Export a diagnostic report and prepare again."
  ],
  sidecar_exited: [
    "本地运行服务提前退出，请导出诊断报告后重新准备。",
    "The local runtime service exited during startup. Export a diagnostic report and prepare again."
  ],
  data_directory_unwritable: [
    "训练记录目录无法写入；已有记录已保留。请导出诊断报告后重试。",
    "The training record directory cannot be written. Existing records were kept; export a diagnostic report and retry."
  ],
  sqlite_open_failed: [
    "训练记录数据库无法打开；已有记录未被删除。请导出诊断报告后重试。",
    "The training record database could not be opened. Existing records were not deleted; export a diagnostic report and retry."
  ],
  sqlite_locked_or_corrupt: [
    "训练记录数据库被占用或需要修复；已有记录已保留。请导出诊断报告。",
    "The training record database is locked or needs repair. Existing records were kept; export a diagnostic report."
  ],
  loopback_unavailable: [
    "本机运行服务端口不可用，请导出诊断报告后重新准备。",
    "The local service port is unavailable. Export a diagnostic report and prepare again."
  ],
  model_missing_or_invalid: [
    "本地问诊模型缺失或校验失败；训练记录已保留。请检查资源后重试。",
    "The local interview model is missing or failed integrity verification. Training records were kept; check the resource and retry."
  ],
  llama_dependency_missing: [
    "本地问诊运行组件缺失；训练记录已保留。请重新安装完整版本。",
    "The local interview runtime is missing. Training records were kept; reinstall the complete application."
  ],
  llama_cpu_incompatible: [
    "当前设备无法运行本地问诊组件；训练记录已保留。请导出诊断报告。",
    "This device cannot run the local interview component. Training records were kept; export a diagnostic report."
  ],
  llama_memory_insufficient: [
    "设备可用内存不足以启动本地问诊组件；训练记录已保留。请导出诊断报告。",
    "There is not enough available memory to start the local interview component. Training records were kept; export a diagnostic report."
  ],
  llama_start_failed: [
    "本地问诊模型未能启动；训练记录已保留。请导出诊断报告后重新准备。",
    "The local interview model could not start. Training records were kept; export a diagnostic report and prepare again."
  ],
  security_software_suspected: [
    "Windows 可能阻止了运行组件；请导出诊断报告并按提示检查。",
    "Windows may have blocked a runtime component. Export a diagnostic report and follow its recovery guidance."
  ],
  unknown_runtime_failure: [
    "本地运行服务出现未分类故障；训练记录已保留。请导出诊断报告后重试。",
    "The local runtime reported an unknown failure. Training records were kept; export a diagnostic report and retry."
  ]
});

const SAFE_CODE = /^[A-Za-z0-9_.:-]{1,120}$/;

function errorText(value) {
  if (value instanceof Error) return value.message;
  if (value && typeof value === "object") {
    return [value.code, value.message, value.name].filter(Boolean).join(" ") || "unknown_runtime_failure";
  }
  return String(value || "unknown_runtime_failure");
}

function normalizeRuntimeErrorCode(value) {
  const raw = errorText(value).trim();
  if (SAFE_CODE.test(raw) && !/[A-Za-z]:[\\/]/.test(raw)) return raw;
  const normalized = raw.toLowerCase();
  if (/eacces|eperm|access.denied|blocked|quarantine/.test(normalized)) return "runtime_access_denied";
  if (/enoent|not.found|missing/.test(normalized)) return "runtime_resource_missing";
  if (/eaddrinuse|eaddrnotavail|loopback|api_bind|port.*bind/.test(normalized)) return "loopback_unavailable";
  if (/database(?: (?:table|schema))? is (?:locked|busy)|sqlite_busy|database disk image is malformed|file is not a database/.test(normalized)) {
    return "sqlite_locked_or_corrupt";
  }
  if (/sqlite|database/.test(normalized)) return "sqlite_runtime_error";
  if (/timeout|timed.out/.test(normalized)) return "runtime_timeout";
  return "unknown_runtime_failure";
}

function classifyRuntimeError(value) {
  const code = normalizeRuntimeErrorCode(value).toLowerCase();
  if (/r4_data_directory|data_directory|log_open|directory.*(?:write|create)|permission/.test(code)) {
    return "data_directory_unwritable";
  }
  if (/job[_-]?object/.test(code)) return "job_object_failed";
  if (/llama.*(?:exited|start|spawn)/.test(code)) return "llama_start_failed";
  if (/exited|exit.*startup|sidecar.*closed|process.*exit/.test(code)) return "sidecar_exited";
  if (/handshake.*(?:timeout|timed)|startup_timeout|start_gate_timeout/.test(code)) {
    return "sidecar_handshake_timeout";
  }
  if (/node_runtime_missing/.test(code)) return "runtime_resources_missing";
  if (/sidecar.*spawn|node.*spawn|node.*start|node_runtime/.test(code)) return "node_spawn_failed";
  if (/resource|manifest|app_root|runtime_layout|node.*missing|runtime.*missing/.test(code)) {
    return "runtime_resources_missing";
  }
  if (/sqlite.*(?:lock|corrupt)|database.*(?:lock|corrupt)|schema_(?:invalid|too_new|unsupported)/.test(code)) {
    return "sqlite_locked_or_corrupt";
  }
  if (/sqlite|database.*open/.test(code)) return "sqlite_open_failed";
  if (/loopback|health_probe|port|api_bind|connection_refused/.test(code)) return "loopback_unavailable";
  if (/model.*(?:missing|invalid|checksum|integrity)|checksum_mismatch/.test(code)) {
    return "model_missing_or_invalid";
  }
  if (/access_denied|security|quarantine|blocked|runtime_access_denied/.test(code)) return "security_software_suspected";
  if (/llama.*(?:dependency|missing)|dll|runtime_access_denied/.test(code)) return "llama_dependency_missing";
  if (/cpu|instruction|illegal_instruction/.test(code)) return "llama_cpu_incompatible";
  if (/memory|out.of.memory|allocation/.test(code)) return "llama_memory_insufficient";
  if (/llama|model.*start|startup_failed/.test(code)) return "llama_start_failed";
  return "unknown_runtime_failure";
}

function studentFacingRuntimeMessage(category, language = "zh") {
  const message = ERROR_MESSAGES[DESKTOP_ERROR_CATEGORIES.includes(category) ? category : "unknown_runtime_failure"];
  return message[language === "en" ? 1 : 0];
}

function redactedPath(input, roots = {}) {
  const value = String(input || "");
  if (!value) return "";
  const normalized = path.normalize(value);
  const rootEntries = [
    ["%LOCALAPPDATA%", roots.localAppData],
    ["%USERPROFILE%", roots.userProfile],
    ["%TEMP%", roots.temp]
  ];
  for (const [label, root] of rootEntries) {
    if (!root) continue;
    const normalizedRoot = path.normalize(String(root));
    const relative = path.relative(normalizedRoot, normalized);
    if (relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative))) {
      return relative ? `${label}${path.sep}${relative}` : label;
    }
  }
  const parsed = path.parse(normalized);
  const name = parsed.base || "item";
  return parsed.root ? `${parsed.root}<redacted>${path.sep}${name}` : `<redacted>${path.sep}${name}`;
}

function directoryWritable(directory) {
  try {
    if (!fs.statSync(directory).isDirectory()) return false;
    const probe = path.join(directory, `.hematuria-diagnostic-${process.pid}-${Date.now()}.tmp`);
    const handle = fs.openSync(probe, "wx");
    fs.writeSync(handle, "ok");
    fs.closeSync(handle);
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function fileState(filePath, expectedSize) {
  const normalized = path.normalize(String(filePath || ""));
  try {
    const stat = fs.statSync(normalized);
    const isFile = stat.isFile();
    return {
      present: isFile,
      size: isFile ? stat.size : null,
      sizeMatches: isFile && (expectedSize === undefined || expectedSize === null || stat.size === expectedSize),
      sha256Status: isFile ? "not_checked" : "missing"
    };
  } catch {
    return { present: false, size: null, sizeMatches: false, sha256Status: "missing" };
  }
}

function r4DataDirectory(localAppData) {
  return localAppData
    ? path.join(String(localAppData), "HematuriaTraining", "MentorLocalAI-FinalCandidate")
    : "";
}

function r5DataDirectory(localAppData) {
  return localAppData
    ? path.join(String(localAppData), "HematuriaTraining", "MentorLocalAI-R5")
    : "";
}

function isLegacyR4DataDirectory(candidate, localAppData) {
  if (!candidate || !localAppData) return false;
  return path.normalize(String(candidate)).toLowerCase() === path.normalize(r4DataDirectory(localAppData)).toLowerCase();
}

function recoveriesFor(category, language = "zh") {
  const normalized = DESKTOP_ERROR_CATEGORIES.includes(category) ? category : "unknown_runtime_failure";
  const zh = {
    runtime_resources_missing: ["重新安装完整版本，确保程序旁的 resources 目录未被移除。"],
    node_spawn_failed: ["重新解压或安装完整版本；不要只复制 exe 文件。"],
    job_object_failed: ["保持应用关闭后重新准备；若仍失败，导出诊断报告交给维护人员。"],
    sidecar_handshake_timeout: ["关闭重复启动的应用实例后重新准备，并检查安全软件记录。"],
    sidecar_exited: ["导出诊断报告，检查运行组件是否被隔离或缺少 DLL。"],
    data_directory_unwritable: ["选择可写的用户数据目录，避免使用需要管理员权限的目录。"],
    sqlite_open_failed: ["关闭正在使用该训练目录的旧版本；不要删除数据库。"],
    sqlite_locked_or_corrupt: ["先导出诊断报告；如需修复，先备份数据库再执行明确的恢复动作。"],
    loopback_unavailable: ["重新准备并检查本机安全软件是否阻止 127.0.0.1 连接。"],
    model_missing_or_invalid: ["检查模型文件是否完整且与安装说明中的版本一致。"],
    llama_dependency_missing: ["重新安装完整版本，不要只复制 llama-server.exe。"],
    llama_cpu_incompatible: ["导出诊断报告；改用设备支持的轻量配置或更换设备。"],
    llama_memory_insufficient: ["关闭占用内存的程序后重试轻量配置；不要删除训练记录。"],
    llama_start_failed: ["导出诊断报告并重新准备；不要重复启动多个实例。"],
    security_software_suspected: ["查看 Windows 安全记录并将报告交给维护人员，不要关闭安全软件。"],
    unknown_runtime_failure: ["导出诊断报告后重新准备；已有训练记录不会被静默删除。"]
  };
  const en = {
    runtime_resources_missing: ["Reinstall the complete application and keep the resources directory beside the program."],
    node_spawn_failed: ["Reinstall or fully extract the application; do not copy only the exe."],
    job_object_failed: ["Close duplicate app instances and prepare again; export a diagnostic report if it persists."],
    sidecar_handshake_timeout: ["Close duplicate app instances, prepare again, and check security-software history."],
    sidecar_exited: ["Export a diagnostic report and check whether a runtime or DLL was quarantined."],
    data_directory_unwritable: ["Use a writable user data directory instead of an administrator-only directory."],
    sqlite_open_failed: ["Close older app instances using this training directory; do not delete the database."],
    sqlite_locked_or_corrupt: ["Export a diagnostic report first; back up the database before any explicit repair."],
    loopback_unavailable: ["Prepare again and check whether security software blocked the 127.0.0.1 connection."],
    model_missing_or_invalid: ["Check that the model file is complete and matches the installation guide."],
    llama_dependency_missing: ["Reinstall the complete application; do not copy only llama-server.exe."],
    llama_cpu_incompatible: ["Export a diagnostic report; use a supported lightweight profile or another device."],
    llama_memory_insufficient: ["Close memory-intensive programs and retry the lightweight profile; keep training records."],
    llama_start_failed: ["Export a diagnostic report and prepare again; do not start duplicate instances."],
    security_software_suspected: ["Check Windows security history and share the report; do not disable security software."],
    unknown_runtime_failure: ["Export a diagnostic report and prepare again; existing training records are not silently deleted."]
  };
  return (language === "en" ? en : zh)[normalized];
}

module.exports = {
  DESKTOP_ERROR_CATEGORIES,
  classifyRuntimeError,
  directoryWritable,
  fileState,
  isLegacyR4DataDirectory,
  normalizeRuntimeErrorCode,
  r4DataDirectory,
  r5DataDirectory,
  redactedPath,
  recoveriesFor,
  studentFacingRuntimeMessage
};

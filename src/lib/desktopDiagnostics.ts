export type DesktopRuntimeConfigPayload = {
  runtimeTarget: "desktop";
  apiBaseUrl: string;
  authToken: string;
  debugRuntime: boolean;
};

export type DesktopDiagnosticReport = {
  schemaVersion: number;
  productVersion: string;
  productHead: string;
  runtimeTarget: "desktop";
  installationMode: string;
  operatingSystem: { platform: string; version: string; architecture: string; nodeVersion?: string };
  standardUser: boolean | null;
  paths: {
    program: string;
    applicationRoot: string;
    data: string;
    dataAccessible: boolean;
    dataWritable: boolean;
    logs: string;
    database: string;
    model: string;
    temporary: string;
  };
  resources: Array<{ name: string; path: string; present: boolean; size: number | null; sizeMatches: boolean; sha256Status: string }>;
  processes: Record<string, unknown>;
  jobObject: Record<string, unknown>;
  sidecar: Record<string, unknown>;
  sqlite: Record<string, unknown>;
  loopback: Record<string, unknown>;
  localAi: Record<string, unknown>;
  lastFailure: { category: string; code: string; phase: string } | null;
  stableFailureCodes: string[];
  dataIsolation: Record<string, unknown>;
  recoverySuggestions: string[];
  generatedAt: string;
};

export const DESKTOP_RUNTIME_ERROR_CATEGORIES = [
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
] as const;

export type DesktopRuntimeErrorCategory = typeof DESKTOP_RUNTIME_ERROR_CATEGORIES[number];

type TauriInternals = {
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
};

declare global {
  var __HEMATURIA_DESKTOP_DIAGNOSTIC__: DesktopDiagnosticReport | undefined;
  var __TAURI_INTERNALS__: TauriInternals | undefined;
  var isTauri: boolean | undefined;
}

function bridge() {
  return typeof globalThis === "undefined" ? undefined : globalThis.__TAURI_INTERNALS__;
}

export function desktopShellAvailable() {
  return Boolean(globalThis.__HEMATURIA_DESKTOP_DIAGNOSTIC__ || globalThis.isTauri === true);
}

export function desktopDiagnosticSnapshot() {
  return globalThis.__HEMATURIA_DESKTOP_DIAGNOSTIC__ || null;
}

export async function invokeDesktop<T>(command: string) {
  const runtimeBridge = bridge();
  if (!runtimeBridge) throw new Error("tauri_bridge_unavailable");
  return runtimeBridge.invoke(command) as Promise<T>;
}

export async function refreshDesktopDiagnosticSnapshot() {
  const report = await invokeDesktop<DesktopDiagnosticReport>("desktop_diagnostic_snapshot");
  globalThis.__HEMATURIA_DESKTOP_DIAGNOSTIC__ = report;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("hematuria-desktop-runtime-change"));
  return report;
}

export function applyDesktopRuntime(
  runtime: DesktopRuntimeConfigPayload | null,
  diagnostic: DesktopDiagnosticReport
) {
  globalThis.__HEMATURIA_DESKTOP_RUNTIME__ = runtime || undefined;
  globalThis.__HEMATURIA_DESKTOP_DIAGNOSTIC__ = diagnostic;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("hematuria-desktop-runtime-change"));
  }
}

export async function restartDesktopRuntime() {
  const result = await invokeDesktop<{
    prepared: boolean;
    runtime: DesktopRuntimeConfigPayload | null;
    diagnostic: DesktopDiagnosticReport;
  }>("desktop_restart_runtime");
  applyDesktopRuntime(result.runtime, result.diagnostic);
  return result;
}

export function exportDesktopDiagnostic() {
  return invokeDesktop<{
    exported: boolean;
    path: string;
    size: number;
    sha256Status: string;
  }>("desktop_diagnostic_export");
}

export function openDesktopLogsDirectory() {
  return invokeDesktop<string>("desktop_open_logs_directory");
}

export function isDesktopRuntimeFailureCode(value: unknown): value is DesktopRuntimeErrorCategory {
  return typeof value === "string" && DESKTOP_RUNTIME_ERROR_CATEGORIES.includes(value as DesktopRuntimeErrorCategory);
}

const runtimeFailureMessages: Record<DesktopRuntimeErrorCategory, { zh: string; en: string }> = {
  runtime_resources_missing: { zh: "桌面运行资源不完整，请导出诊断并重新准备。", en: "Desktop runtime resources are incomplete. Export diagnostics and prepare again." },
  node_spawn_failed: { zh: "桌面运行组件未能启动，请导出诊断并重新准备。", en: "The desktop runtime could not start. Export diagnostics and prepare again." },
  job_object_failed: { zh: "桌面进程托管未能建立，请导出诊断并重新准备。", en: "Desktop process management could not be established. Export diagnostics and prepare again." },
  sidecar_handshake_timeout: { zh: "桌面服务响应超时，请导出诊断并重新准备。", en: "The desktop service did not respond in time. Export diagnostics and prepare again." },
  sidecar_exited: { zh: "桌面服务意外退出，请导出诊断并重新准备。", en: "The desktop service exited unexpectedly. Export diagnostics and prepare again." },
  data_directory_unwritable: { zh: "桌面数据目录不可写，请导出诊断并重新准备。", en: "The desktop data directory is not writable. Export diagnostics and prepare again." },
  sqlite_open_failed: { zh: "本地训练记录库无法打开，请导出诊断并重新准备。", en: "The local training store could not be opened. Export diagnostics and prepare again." },
  sqlite_locked_or_corrupt: { zh: "本地训练记录库被占用或损坏，请导出诊断并重新准备。", en: "The local training store is locked or corrupt. Export diagnostics and prepare again." },
  loopback_unavailable: { zh: "本机服务端口不可用，请导出诊断并重新准备。", en: "The local service port is unavailable. Export diagnostics and prepare again." },
  model_missing_or_invalid: { zh: "本地资源文件缺失或校验失败，问诊训练仍可继续。", en: "The local resource is missing or invalid. Interview practice remains available." },
  llama_dependency_missing: { zh: "本地问诊辅助依赖不完整，问诊训练仍可继续。", en: "Local interview assistance dependencies are missing. Interview practice remains available." },
  llama_cpu_incompatible: { zh: "当前设备不支持所需本地资源，问诊训练仍可继续。", en: "This device cannot run the selected local resource. Interview practice remains available." },
  llama_memory_insufficient: { zh: "当前设备内存不足以启动本地资源，问诊训练仍可继续。", en: "This device does not have enough memory for the local resource. Interview practice remains available." },
  llama_start_failed: { zh: "本地问诊辅助启动失败，问诊训练仍可继续。", en: "Local interview assistance failed to start. Interview practice remains available." },
  security_software_suspected: { zh: "系统安全策略可能阻止了桌面组件，请导出诊断后联系支持。", en: "A system security policy may be blocking the desktop component. Export diagnostics and contact support." },
  unknown_runtime_failure: { zh: "桌面运行环境暂不可用，请导出诊断并重新准备。", en: "The desktop runtime is unavailable. Export diagnostics and prepare again." }
};

export function desktopRuntimeFailureMessage(category: string, language: "zh" | "en") {
  const message = runtimeFailureMessages[category as DesktopRuntimeErrorCategory] || runtimeFailureMessages.unknown_runtime_failure;
  return message[language];
}

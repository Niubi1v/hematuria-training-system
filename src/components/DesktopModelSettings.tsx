"use client";

import { Copy, Download, FolderCog, LoaderCircle, Power, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { requestJson } from "@/src/lib/apiClient";
import { desktopRuntimeConfig, publicApiConfig } from "@/src/lib/apiConfig";
import { desktopDiagnosticSnapshot, desktopRuntimeFailureMessage, desktopShellAvailable, exportDesktopDiagnostic, openDesktopLogsDirectory, refreshDesktopDiagnosticSnapshot, restartDesktopRuntime } from "@/src/lib/desktopDiagnostics";
import type { DesktopDiagnosticReport } from "@/src/lib/desktopDiagnostics";
import { readStringStorage } from "@/src/lib/safeStorage";

type DesktopSettings = {
  modelMode: "lightweight" | "standard";
  modelAlias: "Qwen3-1.7B" | "Qwen3-4B";
  configuredMode: "lightweight" | "standard" | null;
  effectiveMode: "lightweight" | "standard";
  effectiveModel: "Qwen3-1.7B" | "Qwen3-4B";
  overrideSource: "mentor_package" | "packaged_model_fallback" | "configured_preference" | "runtime_default";
  modelDirectory: string;
  modelFilePath: string;
  modelPresent: boolean;
  modelAvailability: { lightweight: boolean; standard: boolean };
  localAiEnabled: boolean;
  llamaStatus:
    | "initializing"
    | "disabled"
    | "model_missing"
    | "model_invalid"
    | "runtime_missing"
    | "starting"
    | "ready"
    | "startup_failed"
    | "stopped";
  modelValidation: "pending" | "verified" | "checksum_mismatch" | "not_checked";
  version: number;
};

type DesktopRuntimeSummary = {
  schemaVersion: 1;
  sessionStartedAt: string;
  runtimeTarget: "desktop";
  model: "Qwen3-1.7B" | "Qwen3-4B";
  modelProfile: "lightweight" | "standard";
  configuredMode: "lightweight" | "standard" | null;
  effectiveMode: "lightweight" | "standard";
  effectiveModel: "Qwen3-1.7B" | "Qwen3-4B";
  overrideSource: "mentor_package" | "packaged_model_fallback" | "configured_preference" | "runtime_default";
  productHead: string;
  llamaServerReady: boolean;
  localModelReady: boolean;
  localAiAcceptedCount: number;
  ruleFallbackCount: number;
  eventWriteFailureCount: number;
  runtimeAuditHealthy: boolean;
  cloudRequestCount: number;
  generatedAt: string;
};

type DesktopCopyResult = { copied: true; sha256: string };
type DesktopExportResult = { exported: true; path: string; size: number; sha256: string };
type DesktopDiagnostics = DesktopRuntimeSummary | DesktopDiagnosticReport;

function isRuntimeDiagnostic(value: DesktopDiagnostics): value is DesktopDiagnosticReport {
  return "paths" in value && "recoverySuggestions" in value;
}

const emptySettings: DesktopSettings = {
  modelMode: "lightweight",
  modelAlias: "Qwen3-1.7B",
  configuredMode: null,
  effectiveMode: "lightweight",
  effectiveModel: "Qwen3-1.7B",
  overrideSource: "runtime_default",
  modelDirectory: "",
  modelFilePath: "",
  modelPresent: false,
  modelAvailability: { lightweight: false, standard: false },
  localAiEnabled: false,
  llamaStatus: "stopped",
  modelValidation: "not_checked",
  version: 0
};

export default function DesktopModelSettings() {
  const desktopRuntime = desktopRuntimeConfig();
  const [shellAvailable, setShellAvailable] = useState(() => desktopShellAvailable());
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const [settings, setSettings] = useState<DesktopSettings>(emptySettings);
  const [draftDirectory, setDraftDirectory] = useState("");
  const [draftModelMode, setDraftModelMode] = useState<DesktopSettings["modelMode"]>("lightweight");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [diagnostics, setDiagnostics] = useState<DesktopDiagnostics | null>(() => desktopDiagnosticSnapshot());

  useEffect(() => {
    if (readStringStorage("hematuria-language").value === "en") setLang("en");
    const listener = (event: Event) => setLang((event as CustomEvent<"zh" | "en">).detail);
    window.addEventListener("hematuria-language-change", listener);
    return () => window.removeEventListener("hematuria-language-change", listener);
  }, []);

  useEffect(() => {
    const listener = () => setShellAvailable(desktopShellAvailable());
    window.addEventListener("hematuria-desktop-runtime-change", listener);
    return () => window.removeEventListener("hematuria-desktop-runtime-change", listener);
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  if (!shellAvailable && !desktopRuntime) return null;
  const endpoint = `${publicApiConfig.baseUrl}/api/desktop/settings`;

  async function loadSettings() {
    setLoading(true);
    setMessage("");
    try {
      if (!desktopRuntimeConfig()) {
        const report = desktopDiagnosticSnapshot() || await refreshDesktopDiagnosticSnapshot();
        setDiagnostics(report);
        const category = report.lastFailure?.category || "unknown_runtime_failure";
        setMessage(desktopRuntimeFailureMessage(category, lang));
        return;
      }
      const next = await requestJson<DesktopSettings>(endpoint, undefined, {
        method: "GET",
        timeoutMs: 10_000,
        retries: 1,
        endpointName: "desktop-settings"
      });
      setSettings(next);
      setDraftDirectory(next.modelDirectory);
      setDraftModelMode(next.modelMode);
      const evidence = await requestJson<DesktopRuntimeSummary>(`${publicApiConfig.baseUrl}/api/desktop/evidence?source=settings-refresh`, undefined, {
        method: "GET",
        timeoutMs: 10_000,
        retries: 0,
        endpointName: "desktop-runtime-summary"
      });
      setDiagnostics(evidence);
    } catch {
      setMessage(lang === "en" ? "Settings are temporarily unavailable." : "设置暂时不可用。");
    } finally {
      setLoading(false);
    }
  }

  async function copyDiagnostics() {
    if (!diagnostics) return;
    try {
      const result = await requestJson<DesktopCopyResult>(`${publicApiConfig.baseUrl}/api/desktop/evidence/copy`, {}, {
        method: "POST",
        timeoutMs: 10_000,
        retries: 0,
        endpointName: "desktop-runtime-copy"
      });
      if (!result.copied) throw new Error("desktop_clipboard_write_failed");
      setMessage(lang === "en" ? "Local verification summary copied." : "本机运行验证摘要已复制。");
    } catch {
      setMessage(lang === "en" ? "Copy is unavailable on this device." : "当前设备无法复制摘要。");
    }
  }

  async function exportDiagnostics() {
    try {
      if (desktopShellAvailable()) {
        const result = await exportDesktopDiagnostic();
        if (!result.exported || !result.path) throw new Error("desktop_diagnostic_export_failed");
        setMessage(lang === "en" ? `Diagnostics exported to ${result.path}` : `诊断已导出至 ${result.path}`);
        return;
      }
      if (!diagnostics) return;
      const result = await requestJson<DesktopExportResult>(`${publicApiConfig.baseUrl}/api/desktop/evidence/export`, {}, {
        method: "POST",
        timeoutMs: 10_000,
        retries: 0,
        endpointName: "desktop-runtime-export"
      });
      if (!result.exported || !result.path) throw new Error("desktop_evidence_export_failed");
      setMessage(lang === "en" ? `Exported to ${result.path}` : `已导出至 ${result.path}`);
    } catch {
      setMessage(lang === "en" ? "Export failed." : "导出失败。");
    }
  }

  async function prepareRuntime() {
    setLoading(true);
    setMessage("");
    try {
      const result = await restartDesktopRuntime();
      setDiagnostics(result.diagnostic);
      if (!result.prepared) {
        const category = result.diagnostic.lastFailure?.category || "unknown_runtime_failure";
        setMessage(desktopRuntimeFailureMessage(category, lang));
        return;
      }
      setMessage(lang === "en" ? "Desktop runtime prepared." : "桌面运行环境已重新准备。" );
      await loadSettings();
    } catch {
      setMessage(lang === "en" ? "Runtime preparation failed. Export diagnostics and retry." : "运行环境准备失败，请导出诊断后重试。" );
    } finally {
      setLoading(false);
    }
  }

  async function openLogs() {
    try {
      await openDesktopLogsDirectory();
      setMessage(lang === "en" ? "Logs folder opened." : "日志文件夹已打开。" );
    } catch {
      setMessage(lang === "en" ? "Logs folder could not be opened." : "无法打开日志文件夹。" );
    }
  }

  async function saveSettings(localAiEnabled = settings.localAiEnabled) {
    setLoading(true);
    setMessage("");
    try {
      const next = await requestJson<DesktopSettings>(endpoint, {
        modelDirectory: draftDirectory.trim(),
        modelMode: draftModelMode,
        localAiEnabled
      }, {
        method: "POST",
        timeoutMs: 120_000,
        retries: 0,
        endpointName: "desktop-settings"
      });
      setSettings(next);
      setDraftDirectory(next.modelDirectory);
      setDraftModelMode(next.modelMode);
      setMessage(next.llamaStatus === "model_invalid" || next.modelValidation === "checksum_mismatch"
        ? (lang === "en" ? "The selected resource failed integrity verification. Reinstall that resource file before retrying." : "所选资源完整性校验失败，请重新安装该资源文件后再试。")
        : next.localAiEnabled && !next.modelPresent
        ? (lang === "en" ? "The required file was not found. Interview practice remains available." : "未找到所需文件，仍可继续问诊训练。")
        : (lang === "en" ? "Settings saved." : "设置已保存。"));
    } catch {
      setMessage(lang === "en" ? "Settings could not be saved. Interview practice remains available." : "设置保存失败，仍可继续问诊训练。");
    } finally {
      setLoading(false);
    }
  }

  const ready = settings.localAiEnabled && settings.modelPresent && settings.llamaStatus === "ready";
  return (
    <>
      <button
        type="button"
        className="ui-button-secondary min-h-10 px-3"
        onClick={() => {
          setOpen(true);
          void loadSettings();
        }}
        aria-label={lang === "en" ? "Interview assistance settings" : "问诊辅助设置"}
      >
        <SlidersHorizontal size={16} aria-hidden="true" />
        <span className="hidden lg:inline">{lang === "en" ? "Assistance settings" : "辅助设置"}</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-3 sm:p-6">
          <div className="flex min-h-full items-start justify-center sm:items-center">
          <section role="dialog" aria-modal="true" aria-label={lang === "en" ? "Interview assistance settings" : "问诊辅助设置"} className="max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-xl border border-clinic-line bg-white p-5 shadow-raised sm:max-h-[calc(100dvh-3rem)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="home-eyebrow">{lang === "en" ? "INTERVIEW ASSISTANCE" : "问诊辅助"}</p>
                <h2 className="mt-2 text-xl font-semibold">{lang === "en" ? "Assistance settings" : "辅助设置"}</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="ui-button-quiet min-w-11 px-0" aria-label={lang === "en" ? "Close" : "关闭"}><X size={18} aria-hidden="true" /></button>
            </div>

            <div className="mt-5 rounded-lg bg-clinic-paper p-4 text-sm leading-6">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{lang === "en" ? "Assistance" : "辅助功能"}</span>
                <span className={`ui-status ${ready ? "ui-status-success" : "ui-status-info"}`}>
                  {ready
                    ? (lang === "en" ? "Available" : "可用")
                    : settings.llamaStatus === "starting"
                      ? (lang === "en" ? "Preparing interview assistance…" : "正在准备问诊辅助……")
                      : (lang === "en" ? "Not ready" : "未就绪")}
                </span>
              </div>
              <p className="mt-2 text-xs text-clinic-muted">
                {lang === "en"
                  ? "Interview practice remains available when this assistance is turned off or not ready."
                  : "辅助功能关闭或未就绪时，仍可继续问诊训练。"}
              </p>
            </div>

            <label className="mt-5 block text-sm">
              <span className="inline-flex items-center gap-2 font-medium"><FolderCog size={16} />{lang === "en" ? "File directory" : "文件目录"}</span>
              <input className="ui-input mt-2 w-full" value={draftDirectory} onChange={(event) => setDraftDirectory(event.target.value)} placeholder="C:\...\files" spellCheck={false} />
            </label>
            <p className="mt-2 text-xs text-clinic-muted">{lang === "en" ? "Choose the directory described in the installation guide." : "请选择安装说明中指定的文件目录。"}</p>

            <label className="mt-5 block text-sm">
              <span className="font-medium">{lang === "en" ? "Local resource profile" : "本地资源方案"}</span>
              <select
                className="ui-input mt-2 w-full"
                value={draftModelMode}
                onChange={(event) => setDraftModelMode(event.target.value as DesktopSettings["modelMode"])}
              >
                <option value="lightweight">{lang === "en" ? "Lightweight (recommended)" : "轻量（推荐）"}</option>
                <option value="standard" disabled={!settings.modelAvailability.standard}>{lang === "en" ? "Standard (higher resource use)" : "标准（占用更多资源）"}</option>
              </select>
            </label>
            {!settings.modelAvailability.standard && <p className="mt-2 text-xs text-clinic-muted">{lang === "en" ? "Standard is unavailable because its model is not installed; lightweight remains active." : "标准模型未安装，当前自动使用轻量方案。"}</p>}
            <p className="mt-2 text-xs text-clinic-muted">{lang === "en" ? "Use the lightweight profile first; choose standard only when the device has sufficient resources." : "建议先使用轻量方案；设备资源充足时再选择标准方案。"}</p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button type="button" disabled={loading || !draftDirectory.trim()} onClick={() => void saveSettings(settings.localAiEnabled)} className="ui-button-primary">
                {loading ? <LoaderCircle size={16} className="animate-spin" /> : <FolderCog size={16} />}
                {lang === "en" ? "Save directory" : "保存目录"}
              </button>
              <button type="button" disabled={loading} onClick={() => void saveSettings(!settings.localAiEnabled)} className="ui-button-secondary">
                <Power size={16} />{settings.localAiEnabled ? (lang === "en" ? "Turn off assistance" : "关闭辅助") : (lang === "en" ? "Turn on assistance" : "开启辅助")}
              </button>
              {loading && <span role="status" className="text-xs text-clinic-muted">{lang === "en" ? "Applying settings..." : "正在应用设置……"}</span>}
            </div>
            <details className="mt-5 rounded-lg border border-clinic-line bg-clinic-paper p-4">
              <summary className="cursor-pointer font-medium">{lang === "en" ? "Local runtime verification" : "本机运行验证"}</summary>
              <p className="mt-2 text-xs leading-5 text-clinic-muted">
                {lang === "en" ? "Runtime statistics only; no patient questions or answers are included." : "仅显示运行统计，不包含患者问答内容。"}
              </p>
              {diagnostics ? (
                isRuntimeDiagnostic(diagnostics) ? (
                  <>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <dt>{lang === "en" ? "Last failure" : "最近失败"}</dt><dd className="break-all">{diagnostics.lastFailure?.category || (lang === "en" ? "None" : "无")}</dd>
                      <dt>{lang === "en" ? "Failure phase" : "失败阶段"}</dt><dd>{diagnostics.lastFailure?.phase || "—"}</dd>
                      <dt>{lang === "en" ? "Data directory" : "数据目录"}</dt><dd className="break-all">{diagnostics.paths.data}</dd>
                      <dt>{lang === "en" ? "Data writable" : "数据目录可写"}</dt><dd>{diagnostics.paths.dataWritable ? (lang === "en" ? "Yes" : "是") : (lang === "en" ? "No" : "否")}</dd>
                      <dt>{lang === "en" ? "Sidecar" : "本地服务"}</dt><dd>{String(diagnostics.sidecar.status || "unknown")}</dd>
                      <dt>{lang === "en" ? "SQLite" : "SQLite"}</dt><dd>{String(diagnostics.sqlite.status || "unknown")}</dd>
                      <dt>{lang === "en" ? "Local assistance" : "本地辅助"}</dt><dd>{String(diagnostics.localAi.status || "unknown")}</dd>
                      <dt>{lang === "en" ? "Product version" : "产品版本"}</dt><dd className="break-all">{diagnostics.productHead}</dd>
                    </dl>
                    {diagnostics.recoverySuggestions.length > 0 && <p className="mt-3 text-xs leading-5 text-clinic-muted">{diagnostics.recoverySuggestions[0]}</p>}
                  </>
                ) : (
                <>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <dt>{lang === "en" ? "Local interview service" : "本地问诊服务"}</dt><dd>{diagnostics.llamaServerReady && diagnostics.localModelReady ? (lang === "en" ? "Ready" : "已就绪") : (lang === "en" ? "Not ready" : "未就绪")}</dd>
                    <dt>{lang === "en" ? "Local resource profile" : "本地资源方案"}</dt><dd>{diagnostics.modelProfile === "lightweight" ? (lang === "en" ? "Lightweight" : "轻量") : (lang === "en" ? "Standard" : "标准")}</dd>
                    <dt>{lang === "en" ? "Effective local model" : "当前有效模型"}</dt><dd>{diagnostics.model}</dd>
                    <dt>{lang === "en" ? "Accepted local answers this start" : "本次启动已接受的本地回答"}</dt><dd>{diagnostics.localAiAcceptedCount}</dd>
                    <dt>{lang === "en" ? "Safe fallback answers this start" : "本次启动安全降级回答"}</dt><dd>{diagnostics.ruleFallbackCount}</dd>
                    <dt>{lang === "en" ? "Runtime audit" : "运行审计"}</dt><dd>{diagnostics.runtimeAuditHealthy ? (lang === "en" ? "Healthy" : "正常") : (lang === "en" ? `Unavailable (${diagnostics.eventWriteFailureCount} write failures)` : `不可用（${diagnostics.eventWriteFailureCount} 次写入失败）`)}</dd>
                    <dt>{lang === "en" ? "Cloud requests" : "云端请求"}</dt><dd>{diagnostics.cloudRequestCount}</dd>
                    <dt>{lang === "en" ? "Session started" : "本次启动时间"}</dt><dd>{diagnostics.sessionStartedAt}</dd>
                    <dt>{lang === "en" ? "Product version" : "产品版本"}</dt><dd className="break-all">{diagnostics.productHead}</dd>
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" className="ui-button-secondary" onClick={() => void copyDiagnostics()}><Copy size={15} />{lang === "en" ? "Copy summary" : "复制摘要"}</button>
                  </div>
                </>
                )
              ) : <p className="mt-3 text-xs text-clinic-muted">{lang === "en" ? "Verification summary is not available yet." : "运行验证摘要尚未就绪。"}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={loading} className="ui-button-primary" onClick={() => void prepareRuntime()}>
                  {loading ? <LoaderCircle size={15} className="animate-spin" /> : <Power size={15} />}
                  {lang === "en" ? "Prepare again" : "重新准备"}
                </button>
                <button type="button" className="ui-button-secondary" onClick={() => void exportDiagnostics()}><Download size={15} />{lang === "en" ? "Export diagnostics" : "导出诊断"}</button>
                <button type="button" className="ui-button-secondary" onClick={() => void openLogs()}><FolderCog size={15} />{lang === "en" ? "Open logs folder" : "打开日志文件夹"}</button>
              </div>
            </details>
            {message && <p role="status" className="mt-4 rounded-lg bg-clinic-paper px-3 py-2 text-sm text-clinic-muted">{message}</p>}
          </section>
          </div>
        </div>
      )}
    </>
  );
}

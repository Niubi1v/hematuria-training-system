"use client";

import { Bot, FolderCog, LoaderCircle, Power, X } from "lucide-react";
import { useEffect, useState } from "react";
import { requestJson } from "@/src/lib/apiClient";
import { desktopRuntimeConfig, publicApiConfig } from "@/src/lib/apiConfig";
import { readStringStorage } from "@/src/lib/safeStorage";

type DesktopSettings = {
  modelMode: "lightweight" | "standard";
  modelAlias: "Qwen3-1.7B" | "Qwen3-4B";
  modelDirectory: string;
  modelFilePath: string;
  modelPresent: boolean;
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

type DesktopEvidence = {
  answerSource: "local_ai" | "rule_fallback" | null;
  llamaServerReady: boolean;
  localModelReady: boolean;
  model: "Qwen3-1.7B" | "Qwen3-4B";
  cloudRequestCount: number;
  fallbackReason: string | null;
  intent: string | null;
  requestedSlot: string | null;
  factState: string | null;
  unknown: string | null;
  latency: number;
  responseErrors: Array<"tangential" | "oversharing" | "role_breaking" | "off_script" | "wrong_unknown" | "context_lost" | "polarity_error">;
};

const emptySettings: DesktopSettings = {
  modelMode: "lightweight",
  modelAlias: "Qwen3-1.7B",
  modelDirectory: "",
  modelFilePath: "",
  modelPresent: false,
  localAiEnabled: false,
  llamaStatus: "stopped",
  modelValidation: "not_checked",
  version: 0
};

export default function DesktopModelSettings() {
  const desktopRuntime = desktopRuntimeConfig();
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const [settings, setSettings] = useState<DesktopSettings>(emptySettings);
  const [draftDirectory, setDraftDirectory] = useState("");
  const [draftModelMode, setDraftModelMode] = useState<DesktopSettings["modelMode"]>("lightweight");
  const [evidence, setEvidence] = useState<DesktopEvidence | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (readStringStorage("hematuria-language").value === "en") setLang("en");
    const listener = (event: Event) => setLang((event as CustomEvent<"zh" | "en">).detail);
    window.addEventListener("hematuria-language-change", listener);
    return () => window.removeEventListener("hematuria-language-change", listener);
  }, []);

  useEffect(() => {
    if (!open || !desktopRuntime?.debugRuntime) return;
    let active = true;
    const refresh = async () => {
      try {
        const snapshot = await requestJson<DesktopEvidence>(`${desktopRuntime.apiBaseUrl}/api/desktop/evidence`, undefined, {
          method: "GET",
          timeoutMs: 5_000,
          retries: 0,
          endpointName: "desktop-evidence"
        });
        if (active) setEvidence(snapshot);
      } catch {
        if (active) setEvidence(null);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [desktopRuntime?.apiBaseUrl, desktopRuntime?.debugRuntime, open]);

  if (!desktopRuntime) return null;
  const endpoint = `${publicApiConfig.baseUrl}/api/desktop/settings`;

  async function loadSettings() {
    setLoading(true);
    setMessage("");
    try {
      const next = await requestJson<DesktopSettings>(endpoint, undefined, {
        method: "GET",
        timeoutMs: 10_000,
        retries: 1,
        endpointName: "desktop-settings"
      });
      setSettings(next);
      setDraftDirectory(next.modelDirectory);
      setDraftModelMode(next.modelMode);
    } catch {
      setMessage(lang === "en" ? "Settings are temporarily unavailable." : "设置暂时不可用。");
    } finally {
      setLoading(false);
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
        ? (lang === "en" ? "The selected model failed integrity verification. Reinstall that model file before retrying." : "所选模型完整性校验失败，请重新安装该模型文件后再试。")
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
        <Bot size={16} />
        <span className="hidden lg:inline">{lang === "en" ? "Assistance settings" : "辅助设置"}</span>
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={lang === "en" ? "Interview assistance settings" : "问诊辅助设置"} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <section className="w-full max-w-xl rounded-xl border border-clinic-line bg-white p-5 shadow-raised">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="home-eyebrow">{lang === "en" ? "INTERVIEW ASSISTANCE" : "问诊辅助"}</p>
                <h2 className="mt-2 text-xl font-semibold">{lang === "en" ? "Assistance settings" : "辅助设置"}</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md hover:bg-clinic-paper" aria-label={lang === "en" ? "Close" : "关闭"}><X size={18} /></button>
            </div>

            <div className="mt-5 rounded-lg bg-clinic-paper p-4 text-sm leading-6">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{lang === "en" ? "Assistance" : "辅助功能"}</span>
                <span className={`ui-status ${ready ? "ui-status-success" : "ui-status-info"}`}>
                  {ready
                    ? (lang === "en" ? "Available" : "可用")
                    : settings.llamaStatus === "starting"
                      ? (lang === "en" ? "Starting local patient service…" : "正在启动本地患者服务……")
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
              <span className="font-medium">{lang === "en" ? "Local model" : "本地模型"}</span>
              <select
                className="ui-input mt-2 w-full"
                value={draftModelMode}
                onChange={(event) => setDraftModelMode(event.target.value as DesktopSettings["modelMode"])}
              >
                <option value="lightweight">{lang === "en" ? "Lightweight · Qwen3 1.7B (recommended first)" : "轻量 · Qwen3 1.7B（建议先用）"}</option>
                <option value="standard">{lang === "en" ? "Standard · Qwen3 4B (higher resource use)" : "标准 · Qwen3 4B（占用更多资源）"}</option>
              </select>
            </label>
            <p className="mt-2 text-xs text-clinic-muted">
              {lang === "en"
                ? `Selected runtime alias: ${settings.modelAlias}`
                : `当前运行时别名：${settings.modelAlias}`}
            </p>

            {desktopRuntime.debugRuntime && (
              <section className="mt-5 rounded-lg border border-clinic-line p-4" aria-label={lang === "en" ? "Development diagnostics" : "开发诊断"}>
                <h3 className="text-sm font-semibold">{lang === "en" ? "Development diagnostics" : "开发诊断"}</h3>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {([
                    ["answerSource", evidence?.answerSource],
                    ["llamaServerReady", evidence?.llamaServerReady],
                    ["localModelReady", evidence?.localModelReady],
                    ["model", evidence?.model],
                    ["cloudRequestCount", evidence?.cloudRequestCount],
                    ["fallbackReason", evidence?.fallbackReason],
                    ["intent", evidence?.intent],
                    ["requestedSlot", evidence?.requestedSlot],
                    ["factState", evidence?.factState],
                    ["unknown", evidence?.unknown],
                    ["latency", evidence ? `${evidence.latency} ms` : null],
                    ["responseErrors", evidence?.responseErrors.join(",") || "none"]
                  ] as Array<[string, string | number | boolean | null | undefined]>).map(([key, value]) => (
                    <div key={key} className="contents">
                      <dt className="text-clinic-muted">{key}</dt>
                      <dd className="break-all font-mono text-clinic-ink">{value === null || value === undefined ? "—" : String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

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
            {message && <p role="status" className="mt-4 text-sm text-clinic-muted">{message}</p>}
          </section>
        </div>
      )}
    </>
  );
}

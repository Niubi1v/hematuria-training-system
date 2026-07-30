"use client";

import { Bot, FolderCog, LoaderCircle, Power, X } from "lucide-react";
import { useEffect, useState } from "react";
import { requestJson } from "@/src/lib/apiClient";
import { desktopRuntimeConfig, publicApiConfig } from "@/src/lib/apiConfig";
import { readStringStorage } from "@/src/lib/safeStorage";

type DesktopSettings = {
  modelDirectory: string;
  modelFilePath: string;
  modelPresent: boolean;
  localAiEnabled: boolean;
  llamaStatus:
    | "initializing"
    | "disabled"
    | "model_missing"
    | "runtime_missing"
    | "starting"
    | "ready"
    | "startup_failed"
    | "stopped";
  version: number;
};

const emptySettings: DesktopSettings = {
  modelDirectory: "",
  modelFilePath: "",
  modelPresent: false,
  localAiEnabled: false,
  llamaStatus: "stopped",
  version: 0
};

function statusLabel(status: DesktopSettings["llamaStatus"], lang: "zh" | "en") {
  const labels: Record<DesktopSettings["llamaStatus"], readonly [string, string]> = {
    initializing: ["正在初始化", "Initializing"],
    disabled: ["已关闭", "Disabled"],
    model_missing: ["模型未放置", "Model not installed"],
    runtime_missing: ["运行时缺失", "Runtime missing"],
    starting: ["正在启动", "Starting"],
    ready: ["本地 AI 就绪", "Local AI ready"],
    startup_failed: ["启动失败", "Startup failed"],
    stopped: ["已停止", "Stopped"]
  };
  return labels[status]?.[lang === "en" ? 1 : 0] || (lang === "en" ? "Unavailable" : "不可用");
}

export default function DesktopModelSettings() {
  const desktopRuntime = desktopRuntimeConfig();
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const [settings, setSettings] = useState<DesktopSettings>(emptySettings);
  const [draftDirectory, setDraftDirectory] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (readStringStorage("hematuria-language").value === "en") setLang("en");
    const listener = (event: Event) => setLang((event as CustomEvent<"zh" | "en">).detail);
    window.addEventListener("hematuria-language-change", listener);
    return () => window.removeEventListener("hematuria-language-change", listener);
  }, []);

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
    } catch {
      setMessage(lang === "en" ? "Local model settings are temporarily unavailable." : "本地模型设置暂时不可用。");
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
        localAiEnabled
      }, {
        method: "POST",
        timeoutMs: 120_000,
        retries: 0,
        endpointName: "desktop-settings"
      });
      setSettings(next);
      setDraftDirectory(next.modelDirectory);
      setMessage(next.localAiEnabled && !next.modelPresent
        ? (lang === "en" ? "Model file was not found; safe rules remain active." : "未找到模型文件，当前继续使用安全规则。")
        : (lang === "en" ? "Settings saved." : "设置已保存。"));
    } catch {
      setMessage(lang === "en" ? "Settings could not be saved; safe rules remain active." : "设置保存失败，当前仍可使用安全规则。");
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
        aria-label={lang === "en" ? "Local model settings" : "本地模型设置"}
      >
        <Bot size={16} />
        <span className="hidden lg:inline">{lang === "en" ? "Local AI" : "本地 AI"}</span>
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={lang === "en" ? "Local model settings" : "本地模型设置"} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <section className="w-full max-w-xl rounded-xl border border-clinic-line bg-white p-5 shadow-raised">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="home-eyebrow">{lang === "en" ? "LOCAL MODEL" : "本地模型"}</p>
                <h2 className="mt-2 text-xl font-semibold">Qwen3-1.7B Q4_K_M</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md hover:bg-clinic-paper" aria-label={lang === "en" ? "Close" : "关闭"}><X size={18} /></button>
            </div>

            <div className="mt-5 rounded-lg bg-clinic-paper p-4 text-sm leading-6">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{lang === "en" ? "Runtime status" : "运行状态"}</span>
                <span className={`ui-status ${ready ? "ui-status-success" : settings.llamaStatus === "startup_failed" || settings.llamaStatus === "runtime_missing" ? "ui-status-danger" : "ui-status-info"}`}>
                  {statusLabel(settings.llamaStatus, lang)}
                </span>
              </div>
              <p className="mt-2 text-xs text-clinic-muted">
                {lang === "en"
                  ? "When unavailable or disabled, the governed Patient Agent automatically uses rule_fallback."
                  : "本地模型不可用或关闭时，受治理的 Patient Agent 会自动使用 rule_fallback。"}
              </p>
            </div>

            <label className="mt-5 block text-sm">
              <span className="inline-flex items-center gap-2 font-medium"><FolderCog size={16} />{lang === "en" ? "Model directory" : "模型目录"}</span>
              <input className="ui-input mt-2 w-full" value={draftDirectory} onChange={(event) => setDraftDirectory(event.target.value)} placeholder="C:\...\models" spellCheck={false} />
            </label>
            <p className="mt-2 break-all text-xs text-clinic-muted">
              {lang === "en" ? "Expected file: " : "需要文件："}Qwen3-1.7B-Q4_K_M.gguf
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button type="button" disabled={loading || !draftDirectory.trim()} onClick={() => void saveSettings(settings.localAiEnabled)} className="ui-button-primary">
                {loading ? <LoaderCircle size={16} className="animate-spin" /> : <FolderCog size={16} />}
                {lang === "en" ? "Save directory" : "保存目录"}
              </button>
              <button type="button" disabled={loading} onClick={() => void saveSettings(!settings.localAiEnabled)} className="ui-button-secondary">
                <Power size={16} />{settings.localAiEnabled ? (lang === "en" ? "Disable local AI" : "关闭本地 AI") : (lang === "en" ? "Enable local AI" : "启用本地 AI")}
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

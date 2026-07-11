"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Send, TimerReset, Volume2, VolumeX } from "lucide-react";
import { askPatient, createEmptyCollected, mergeCollected } from "@/src/lib/patientEngine";
import type { CaseData, ChatMessage, CollectedMap } from "@/src/lib/types";

type SpeechRecognitionResultLike = {
  transcript: string;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function sessionKey(caseId: string) {
  return `hematuria-training-${caseId}`;
}

export default function TrainingClient({ caseData }: { caseData: CaseData }) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "patient", text: "医生您好。" }
  ]);
  const [collected, setCollected] = useState<CollectedMap>(createEmptyCollected());
  const [speechInputSupported, setSpeechInputSupported] = useState(false);
  const [speechOutputSupported, setSpeechOutputSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState("");

  useEffect(() => {
    setSpeechInputSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
    setSpeechOutputSupported("speechSynthesis" in window);
  }, []);

  function speak(text: string) {
    if (!speechOutputSupported || !autoSpeak) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }

  function submitQuestion(textOverride?: string) {
    const text = (textOverride ?? question).trim();
    if (!text) return;

    // 真实训练模式下不在页面提示采集点，但仍在后台记录，用于结束后的评分反馈。
    const result = askPatient(caseData, text, "zh");
    const nextCollected = mergeCollected(collected, result.matchedKeys);
    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "student", text },
      { role: "patient", text: result.answer, matchedKeys: result.matchedKeys }
    ];

    setMessages(nextMessages);
    setCollected(nextCollected);
    setQuestion("");
    setVoiceNotice("");
    speak(result.answer);
    localStorage.setItem(sessionKey(caseData.id), JSON.stringify({ caseId: caseData.id, messages: nextMessages, collected: nextCollected }));
  }

  function startVoiceInput() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceNotice("当前浏览器不支持语音识别，建议使用最新版 Chrome 或 Edge。");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => {
      setListening(true);
      setVoiceNotice("正在听，请直接说出你的问诊问题。");
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      setVoiceNotice("没有识别清楚，可以再试一次或改用键盘输入。");
    };
    recognition.onresult = (event) => {
      const text = event.results?.[0]?.[0]?.transcript?.trim();
      if (text) {
        setQuestion(text);
        submitQuestion(text);
      }
    };
    recognition.start();
  }

  function finishTraining() {
    if (speechOutputSupported) window.speechSynthesis.cancel();
    localStorage.setItem(sessionKey(caseData.id), JSON.stringify({ caseId: caseData.id, messages, collected }));
    localStorage.setItem("hematuria-current-case", caseData.id);
    router.push(`/summary?case=${caseData.id}`);
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">模拟问诊训练</h1>
          <p className="mt-1 text-sm text-clinic-muted">请根据主诉独立完成问诊，系统不会在问诊过程中提示关键采集项目。</p>
        </div>
        <button onClick={finishTraining} className="rounded-md bg-clinic-blue px-4 py-2 font-medium text-white hover:bg-clinic-teal">
          结束问诊并填写总结
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-lg border border-clinic-line bg-white p-5">
          <h2 className="font-semibold">病例基本信息</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="text-clinic-muted">病例编号</dt>
              <dd className="font-medium">{caseData.id.toUpperCase()}</dd>
            </div>
            <div>
              <dt className="text-clinic-muted">年龄</dt>
              <dd>{caseData.age}岁</dd>
            </div>
            <div>
              <dt className="text-clinic-muted">性别</dt>
              <dd>{caseData.sex}</dd>
            </div>
            <div>
              <dt className="text-clinic-muted">主诉</dt>
              <dd className="leading-6">{caseData.studentChiefComplaint || caseData.chiefComplaint}</dd>
            </div>
          </dl>
          <div className="mt-5 flex items-center gap-2 rounded-md bg-clinic-paper px-3 py-2 text-sm text-clinic-muted">
            <TimerReset size={16} /> 建议训练时长 8-12 分钟
          </div>
        </aside>

        <section className="flex min-h-[620px] flex-col rounded-lg border border-clinic-line bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-clinic-line px-5 py-4">
            <h2 className="font-semibold">模拟患者对话</h2>
            <button
              type="button"
              onClick={() => setAutoSpeak((value) => !value)}
              disabled={!speechOutputSupported}
              className="inline-flex items-center gap-2 rounded-md border border-clinic-line px-3 py-2 text-sm text-clinic-muted hover:border-clinic-blue disabled:cursor-not-allowed disabled:opacity-50"
            >
              {autoSpeak ? <Volume2 size={16} /> : <VolumeX size={16} />}
              {autoSpeak ? "患者朗读已开" : "患者朗读"}
            </button>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex ${message.role === "student" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] rounded-lg px-4 py-3 text-sm leading-6 ${message.role === "student" ? "bg-clinic-blue text-white" : "bg-clinic-paper text-clinic-ink"}`}>
                  {message.text}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-clinic-line p-4">
            {voiceNotice && <p className="mb-2 text-sm text-clinic-muted">{voiceNotice}</p>}
            <div className="flex flex-wrap gap-2">
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitQuestion();
                }}
                className="min-w-[220px] flex-1 rounded-md border border-clinic-line px-3 py-2 outline-none focus:border-clinic-blue"
                placeholder="请输入或说出你的问诊问题"
              />
              <button
                type="button"
                onClick={startVoiceInput}
                disabled={!speechInputSupported || listening}
                className="inline-flex items-center gap-2 rounded-md border border-clinic-line px-4 py-2 font-medium text-clinic-ink hover:border-clinic-blue disabled:cursor-not-allowed disabled:opacity-50"
              >
                {listening ? <MicOff size={16} /> : <Mic size={16} />}
                {listening ? "聆听中" : "语音提问"}
              </button>
              <button onClick={() => submitQuestion()} className="inline-flex items-center gap-2 rounded-md bg-clinic-teal px-4 py-2 font-medium text-white hover:bg-clinic-blue">
                <Send size={16} /> 发送
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export type VoiceProfile = {
  locale: "zh-CN" | "en-US";
  gender: "female" | "male";
  ageGroup?: "child" | "young" | "adult" | "older";
  style?: "neutral" | "chat" | "fearful" | "sad";
};

export type VoiceLike = {
  name: string;
  voiceURI: string;
  lang: string;
  localService: boolean;
  default?: boolean;
};

export type ManualVoiceOverride = { voiceURI: string; name?: string };

export type TtsPlaybackState = "idle" | "loading" | "playing" | "paused" | "failed" | "fallback-local" | "fallback-text";
export type TtsProviderPreference = "auto" | "browser" | "disabled";

export const AZURE_VOICE_BY_PROFILE: Record<`${VoiceProfile["locale"]}:${VoiceProfile["gender"]}`, string> = {
  "zh-CN:female": "zh-CN-XiaoxiaoNeural",
  "zh-CN:male": "zh-CN-YunxiNeural",
  "en-US:female": "en-US-JennyNeural",
  "en-US:male": "en-US-GuyNeural"
};

const femaleHints = ["xiaoxiao", "xiaoyi", "jenny", "aria", "samantha", "tingting", "female", "woman"];
const maleHints = ["yunxi", "yunyang", "guy", "david", "daniel", "alex", "male", "man"];
const qualityHints = ["natural", "online", "microsoft", "google", "apple", "neural"];

function normalizedLocale(value: string) {
  return value.toLowerCase().replace("_", "-");
}

function localeMatches(voice: VoiceLike, locale: VoiceProfile["locale"]) {
  const lang = normalizedLocale(voice.lang);
  const target = normalizedLocale(locale);
  return lang === target || lang.startsWith(`${target.split("-")[0]}-`);
}

function genderScore(voice: VoiceLike, gender: VoiceProfile["gender"]) {
  const haystack = `${voice.name} ${voice.voiceURI}`.toLowerCase();
  const expected = gender === "female" ? femaleHints : maleHints;
  const opposite = gender === "female" ? maleHints : femaleHints;
  if (expected.some((hint) => haystack.includes(hint))) return 3;
  if (opposite.some((hint) => haystack.includes(hint))) return -2;
  return 0;
}

/** 浏览器Voice对象没有可靠gender字段，因此仅使用已知音色名提示并保留同语言兜底。 */
export function selectBestVoice<T extends VoiceLike>(voices: T[], options: {
  locale: VoiceProfile["locale"];
  gender: VoiceProfile["gender"];
  manualOverride?: ManualVoiceOverride | null;
}): T | null {
  const sameLanguage = voices.filter((voice) => localeMatches(voice, options.locale));
  if (!sameLanguage.length) return null;

  if (options.manualOverride?.voiceURI) {
    const manual = sameLanguage.find((voice) => voice.voiceURI === options.manualOverride?.voiceURI);
    if (manual) return manual;
  }

  const scored = sameLanguage.map((voice, index) => {
    const exactLocale = normalizedLocale(voice.lang) === normalizedLocale(options.locale) ? 100 : 70;
    const online = voice.localService === false ? 25 : 0;
    const knownGender = genderScore(voice, options.gender) * 12;
    const quality = qualityHints.some((hint) => `${voice.name} ${voice.voiceURI}`.toLowerCase().includes(hint)) ? 8 : 0;
    const isDefault = voice.default ? 2 : 0;
    return { voice, score: exactLocale + online + knownGender + quality + isDefault, index };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0]?.voice ?? null;
}

export function profileForCase(language: "zh" | "en", sex: string): VoiceProfile {
  return {
    locale: language === "en" ? "en-US" : "zh-CN",
    gender: /女|female|woman/i.test(sex) ? "female" : "male",
    ageGroup: "adult",
    style: "chat"
  };
}

export function voicePreferenceKey(profile: Pick<VoiceProfile, "locale" | "gender">) {
  return `${profile.locale}:${profile.gender}` as const;
}

export function detectReplyLocale(text: string, fallback: VoiceProfile["locale"]): VoiceProfile["locale"] {
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const han = (text.match(/[\u3400-\u9fff]/g) || []).length;
  if (latin >= 4 && latin > han * 2) return "en-US";
  if (han > 0) return "zh-CN";
  return fallback;
}

export function cleanSpeechText(text: string, maxLength = 500) {
  return text
    .replace(/^患者[:：]\s*/i, "")
    .replace(/^[-•*#]\s*/gm, "")
    .replace(/[`*_>#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

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

export type TtsPlaybackState = "idle" | "loading" | "playing" | "paused" | "failed" | "fallback-browser" | "fallback-text";
export type TtsProviderPreference = "auto" | "browser" | "disabled";

export const AZURE_VOICE_BY_PROFILE: Record<`${VoiceProfile["locale"]}:${VoiceProfile["gender"]}`, string> = {
  "zh-CN:female": "zh-CN-XiaoxiaoNeural",
  "zh-CN:male": "zh-CN-YunxiNeural",
  "en-US:female": "en-US-JennyNeural",
  "en-US:male": "en-US-GuyNeural"
};

const knownFemaleVoices = ["xiaoxiao", "xiaoyi", "jenny", "aria", "samantha", "sonia", "ava", "tingting"];
const knownMaleVoices = ["yunxi", "yunyang", "guy", "david", "daniel", "alex", "ryan"];
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
  const tokens = new Set(haystack.split(/[^a-z]+/).filter(Boolean));
  const knownFemale = knownFemaleVoices.some((name) => haystack.includes(name));
  const knownMale = knownMaleVoices.some((name) => haystack.includes(name));
  const explicitFemale = tokens.has("female") || tokens.has("woman");
  const explicitMale = tokens.has("male") || tokens.has("man");
  const inferred = knownFemale || explicitFemale ? "female" : knownMale || explicitMale ? "male" : null;
  if (inferred === gender) return 3;
  if (inferred && inferred !== gender) return -2;
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

export function profileForCase(language: "zh" | "en", sex: string, age?: string | number): VoiceProfile {
  const numericAge = Number.parseInt(String(age ?? ""), 10);
  const ageGroup: VoiceProfile["ageGroup"] = Number.isFinite(numericAge)
    ? numericAge < 18 ? "child" : numericAge >= 65 ? "older" : numericAge < 35 ? "young" : "adult"
    : "adult";
  return {
    locale: language === "en" ? "en-US" : "zh-CN",
    gender: /女|female|woman/i.test(sex) ? "female" : "male",
    ageGroup,
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

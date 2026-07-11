import {
  AZURE_VOICE_BY_PROFILE,
  detectReplyLocale,
  profileForCase,
  selectBestVoice,
  voicePreferenceKey,
  type VoiceLike
} from "@/src/lib/tts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const voices: VoiceLike[] = [
  { name: "Microsoft Xiaoxiao Online (Natural)", voiceURI: "xiaoxiao", lang: "zh-CN", localService: false },
  { name: "Microsoft Yunxi Online (Natural)", voiceURI: "yunxi", lang: "zh-CN", localService: false },
  { name: "Microsoft Jenny Online (Natural)", voiceURI: "jenny", lang: "en-US", localService: false },
  { name: "Microsoft Guy Online (Natural)", voiceURI: "guy", lang: "en-US", localService: false },
  { name: "Local Mandarin", voiceURI: "local-zh", lang: "zh-CN", localService: true },
  { name: "Local English", voiceURI: "local-en", lang: "en-US", localService: true }
];

const matrix = [
  ["zh", "女", "xiaoxiao", "zh-CN-XiaoxiaoNeural"],
  ["zh", "男", "yunxi", "zh-CN-YunxiNeural"],
  ["en", "女", "jenny", "en-US-JennyNeural"],
  ["en", "男", "guy", "en-US-GuyNeural"]
] as const;

for (const [language, sex, expectedBrowser, expectedAzure] of matrix) {
  const profile = profileForCase(language, sex);
  assert(selectBestVoice(voices, { ...profile })?.voiceURI === expectedBrowser, `${language}/${sex} browser voice mismatch`);
  assert(AZURE_VOICE_BY_PROFILE[voicePreferenceKey(profile)] === expectedAzure, `${language}/${sex} Azure voice mismatch`);
}

const male = selectBestVoice(voices, { ...profileForCase("zh", "男") });
const female = selectBestVoice(voices, { ...profileForCase("zh", "女") });
assert(male?.voiceURI !== female?.voiceURI, "same-language male to female case switch must change voice");
assert(detectReplyLocale("I have no pain or fever.", "zh-CN") === "en-US", "English reply locale detection failed");
assert(detectReplyLocale("我没有发热。", "en-US") === "zh-CN", "Chinese reply locale detection failed");

const manual = selectBestVoice(voices, { ...profileForCase("en", "男"), manualOverride: { voiceURI: "local-en" } });
assert(manual?.voiceURI === "local-en", "manual override should be scoped and preferred by voiceURI");

const adversarialVoices: VoiceLike[] = [
  { name: "Samantha", voiceURI: "apple-samantha", lang: "en-US", localService: true },
  { name: "Sonia Online Natural", voiceURI: "sonia", lang: "en-US", localService: false },
  { name: "Ava Female", voiceURI: "ava-female", lang: "en-US", localService: false },
  { name: "Ryan Online Natural", voiceURI: "ryan", lang: "en-US", localService: false },
  { name: "Studio Male", voiceURI: "studio-male", lang: "en-US", localService: false }
];
assert(selectBestVoice(adversarialVoices, { ...profileForCase("en", "女", 32) })?.voiceURI !== "studio-male", "female must not be misclassified by the substring 'male'");
assert(selectBestVoice(adversarialVoices, { ...profileForCase("en", "男", 32) })?.voiceURI === "ryan", "known male Ryan voice should be selected");
assert(profileForCase("zh", "女", 12).ageGroup === "child", "age 12 should select child profile");
assert(profileForCase("zh", "男", 45).ageGroup === "adult", "age 45 should select adult profile");
assert(profileForCase("en", "Female", 72).ageGroup === "older", "age 72 should select older profile");

console.log("TTS voice selection tests passed for language, sex, adversarial names, and age profiles.");

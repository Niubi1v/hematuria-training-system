type Lang = "zh" | "en";

const cnDigits: Record<string, number> = {
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10
};

function normalizeChineseNumber(value: string) {
  if (/^\d+$/.test(value)) return value;
  if (value === "半") return "半";
  if (value === "十") return "10";
  if (value.startsWith("十")) return String(10 + (cnDigits[value.slice(1)] || 0));
  if (value.endsWith("十")) return String((cnDigits[value.slice(0, 1)] || 1) * 10);
  if (value.includes("十")) {
    const [left, right] = value.split("十");
    return String((cnDigits[left] || 1) * 10 + (cnDigits[right] || 0));
  }
  return String(cnDigits[value] || value);
}

function findDurationNearHematuria(text: string) {
  const compact = text.replace(/\s+/g, "");
  const durationPattern = "([半\\d一二两三四五六七八九十]+(?:小时|天|日|周|月|个月|年)(?:余|多|左右)?)";
  const symptomPattern = "(?:小便(?:颜色)?(?:变红|发红)|尿(?:色)?(?:变红|发红)|血尿|尿潜血阳性|尿隐血阳性|肉眼血尿|镜下血尿)";
  const after = new RegExp(`${symptomPattern}[^，。；、,;]*?${durationPattern}`).exec(compact);
  if (after?.[1]) return after[1];
  const before = new RegExp(`${durationPattern}[^，。；、,;]*?${symptomPattern}`).exec(compact);
  if (before?.[1]) return before[1];
  const allDurations = Array.from(compact.matchAll(new RegExp(durationPattern, "g"))).map((match) => match[1]);
  return allDurations.at(-1) || "";
}

function durationToEnglish(duration: string) {
  if (duration === "数天") return "several days";
  const match = /^([半\d一二两三四五六七八九十]+)(小时|天|日|周|个月|月|年)(余|多|左右)?$/.exec(duration);
  if (!match) return duration || "an unclear duration";
  const rawAmount = normalizeChineseNumber(match[1]);
  const approx = match[3] ? "more than " : "";
  if (rawAmount === "半") {
    if (match[2] === "天" || match[2] === "日") return "half a day";
    if (match[2] === "月" || match[2] === "个月") return "half a month";
    if (match[2] === "年") return "half a year";
  }
  const amount = rawAmount;
  const unit = match[2];
  const unitEn =
    unit === "小时" ? "hour" :
    unit === "天" || unit === "日" ? "day" :
    unit === "周" ? "week" :
    unit === "月" || unit === "个月" ? "month" :
    "year";
  const plural = amount === "1" ? unitEn : `${unitEn}s`;
  return `${approx}${amount} ${plural}`;
}

export function simplifiedChiefComplaintZh(raw?: string) {
  const text = String(raw || "").trim();
  const duration = findDurationNearHematuria(text) || "数天";
  if (/小便|尿色|尿液|发红|变红/.test(text) && !/尿潜血|尿隐血|镜下/.test(text)) {
    return `小便颜色变红${duration}`;
  }
  return `血尿${duration}`;
}

export function simplifiedChiefComplaintEn(rawZh?: string, fallbackEn?: string) {
  const text = String(rawZh || "").trim();
  const duration = findDurationNearHematuria(text) || "数天";
  if (duration) {
    const label = /小便|尿色|尿液|发红|变红/.test(text) && !/尿潜血|尿隐血|镜下/.test(text) ? "Red urine" : "Hematuria";
    return `${label} for ${durationToEnglish(duration)}`;
  }
  if (fallbackEn) return fallbackEn.replace(/\.$/, "");
  return "Hematuria";
}

export function simplifiedChiefComplaint(rawZh: string | undefined, lang: Lang, fallbackEn?: string) {
  return lang === "en" ? simplifiedChiefComplaintEn(rawZh, fallbackEn) : simplifiedChiefComplaintZh(rawZh);
}

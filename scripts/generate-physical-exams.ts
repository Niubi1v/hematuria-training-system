import fs from "node:fs";
import path from "node:path";
import type { CaseData, PhysicalExamResult } from "../src/lib/types";

const dataDir = path.join(process.cwd(), "data");
const cases = JSON.parse(fs.readFileSync(path.join(dataDir, "cases.json"), "utf8")) as CaseData[];

function ageOf(caseData: CaseData) { return Number.parseInt(caseData.age, 10) || 0; }
function categoryOf(caseData: CaseData) { return `${caseData.diseaseCategory || ""}/${caseData.diseaseSubcategory || ""}/${caseData.diagnosis || ""}`; }
function has(caseData: CaseData, pattern: RegExp) { return pattern.test(categoryOf(caseData)); }
function side(caseData: CaseData) { const text = `${caseData.presentIllness?.flankPain || ""}${caseData.diagnosis || ""}`; return text.includes("左") ? "左侧" : text.includes("右") ? "右侧" : "双侧"; }

function row(caseData: CaseData, examId: string, displayName: string, category: string, result: string, abnormal: boolean, rationale: string, applicableSex: Array<"男" | "女"> = ["男", "女"], minimumAge = 0, maximumAge = 120): PhysicalExamResult {
  return {
    caseId: caseData.id,
    examId,
    displayName,
    category,
    applicableSex,
    minimumAge,
    maximumAge,
    applicableDiseaseCategories: [caseData.diseaseCategory || "血尿"],
    result,
    abnormal,
    teachingNote: "学生选择该查体项目后显示客观结果。",
    studentVisibleAfterSelection: true,
    teacherOnlyRationale: rationale
  };
}

function build(caseData: CaseData) {
  const rows: PhysicalExamResult[] = [];
  const age = ageOf(caseData);
  const infection = has(caseData, /感染|膀胱炎|肾盂肾炎|尿道炎/);
  const stone = has(caseData, /结石/);
  const glomerular = has(caseData, /肾小球|IgA|肾炎|紫癜/);
  const trauma = has(caseData, /外伤|挫伤|裂伤/);
  const bph = has(caseData, /前列腺增生|BPH|尿潴留/);
  const pseudo = has(caseData, /假性|月经|阴道/);
  const febrile = infection && !/(否认|无)发热/.test(caseData.presentIllness?.fever || "");
  const severe = /脓毒|休克|感染性梗阻|AKI/.test(`${caseData.clinical?.redFlags || ""}${caseData.diagnosis || ""}`);

  const temperature = febrile ? ((caseData.presentIllness?.fever || "").match(/\d{2}(?:\.\d)?℃/)?.[0] || "38.6℃") : "36.8℃";
  const bloodPressure = glomerular ? (age < 18 ? "138/88 mmHg" : "148/92 mmHg") : trauma ? "104/68 mmHg" : caseData.structuredHistory?.hypertension?.status === "present" ? "148/86 mmHg" : "128/76 mmHg";
  const vitals = severe ? "心率108次/分，呼吸22次/分，血氧饱和度96%（空气）" : trauma ? "心率102次/分，呼吸20次/分，血氧饱和度98%（空气）" : "心率78次/分，呼吸18次/分，血氧饱和度98%（空气）";
  rows.push(row(caseData, "PE001", "体温", "一般情况与生命体征", `体温${temperature}。`, febrile, "感染病例关注发热，其他病例提供确定体温。"));
  rows.push(row(caseData, "PE002", "血压", "一般情况与生命体征", `血压${bloodPressure}。`, glomerular || caseData.structuredHistory?.hypertension?.status === "present", "肾小球疾病及高血压患者需记录确定血压。"));
  rows.push(row(caseData, "PE003", "心率/呼吸/血氧", "一般情况与生命体征", `${vitals}。`, severe || trauma, "用于识别脓毒症、休克、严重出血和外伤风险。"));
  rows.push(row(caseData, "PE004", "一般情况/意识", "一般情况与生命体征", severe ? "精神稍差，意识清楚，对答切题。" : "一般情况尚可，意识清楚，对答切题。", severe, "客观描述一般状态，不混入病史。"));

  const abdominal = infection && /膀胱炎/.test(caseData.diagnosis || "") ? "腹部柔软，耻骨上区轻压痛，无反跳痛。" : trauma ? "腹部柔软，患侧腰腹部轻压痛，无反跳痛。" : "腹部柔软，无明显压痛、反跳痛。";
  rows.push(row(caseData, "PE101", "腹部查体", "腹部与泌尿系统", abdominal, infection || trauma, "按疾病方向给出确定腹部体征。"));
  const percussionPositive = (infection && /肾盂|上尿路|梗阻/.test(categoryOf(caseData))) || stone || trauma;
  rows.push(row(caseData, "PE102", "肾区叩击痛", "腹部与泌尿系统", percussionPositive ? `${side(caseData)}肾区叩击痛阳性。` : "双肾区无叩击痛。", percussionPositive, "感染、结石和外伤按病例侧别返回。"));
  if (stone) rows.push(row(caseData, "PE103", "输尿管走行区压痛", "腹部与泌尿系统", `${side(caseData)}输尿管走行区压痛。`, true, "仅结石方向作为核心项目显示。"));
  if (bph || /膀胱结石|血块尿潴留/.test(categoryOf(caseData))) rows.push(row(caseData, "PE104", "耻骨上膀胱充盈", "腹部与泌尿系统", bph ? "耻骨上区可触及充盈膀胱，叩诊呈浊音。" : "耻骨上区无明显膀胱充盈。", bph, "BPH和尿潴留方向优先。"));
  if (/肾癌|肾肿瘤|肾盂癌/.test(categoryOf(caseData))) rows.push(row(caseData, "PE105", "腰腹部包块", "腹部与泌尿系统", "双侧腰腹部未触及明确包块。", false, "肾脏肿瘤病例可选择，但结果不泄露诊断。"));

  if (caseData.sex === "男" && age >= 18 && (bph || trauma || /前列腺|尿道/.test(categoryOf(caseData)))) {
    rows.push(row(caseData, "PE201", "外生殖器/尿道口", "男性泌尿生殖", trauma ? "尿道口可见少量血迹，外生殖器未见明显畸形。" : "外生殖器发育正常，尿道口无血迹或异常分泌物。", trauma, "男性相关病例或外伤扩展查体。", ["男"], 18));
  }
  if (caseData.sex === "男" && age >= 18 && /前列腺/.test(categoryOf(caseData))) {
    rows.push(row(caseData, "PE203", "直肠指检/前列腺", "男性泌尿生殖", bph ? "前列腺Ⅱ度增大，表面光滑，中央沟变浅，无明显压痛。" : "前列腺质地偏硬，可触及不规则结节。", true, "前列腺疾病核心查体。", ["男"], 18));
  }
  if (caseData.sex === "女" && pseudo) rows.push(row(caseData, "PE301", "妇科/阴道检查", "女性相关", "外阴及阴道可见少量血性分泌物，尿道口无活动性出血。", true, "仅女性假性血尿或阴道出血方向显示。", ["女"], 12));

  if (glomerular) {
    rows.push(row(caseData, "PE401", "水肿", "全身系统", caseData.id === "P011" ? "双眼睑轻度水肿，双下肢无明显凹陷性水肿。" : "眼睑及双下肢无明显水肿。", caseData.id === "P011", "肾小球疾病核心查体。"));
    rows.push(row(caseData, "PE402", "皮疹紫癜/关节", "全身系统", /紫癜/.test(categoryOf(caseData)) ? "双下肢可见对称性紫癜，关节无明显肿胀。" : "全身未见皮疹或紫癜，关节无红肿压痛。", /紫癜/.test(categoryOf(caseData)), "肾小球及系统性疾病安全网。"));
  } else {
    rows.push(row(caseData, "PE401", "水肿", "全身系统", "眼睑及双下肢无明显水肿。", false, "血尿常规全身查体。"));
  }
  rows.push(row(caseData, "PE403", "心肺听诊", "全身系统", "双肺呼吸音清，未闻及明显干湿啰音；心律齐，未闻及明显杂音。", false, "生命体征异常、容量负荷或围术期风险的基础查体。"));
  return rows;
}

const results = cases.flatMap(build);
fs.writeFileSync(path.join(dataDir, "physical_exam_results.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8");
for (const file of ["cases.json", "cases_42.json"]) {
  const library = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8")) as CaseData[];
  library.forEach((item) => { item.physicalExamResultIds = results.filter((row) => row.caseId === item.id).map((row) => row.examId); });
  fs.writeFileSync(path.join(dataDir, file), `${JSON.stringify(library, null, 2)}\n`, "utf8");
}
console.log(`Generated ${results.length} objective physical examination results for ${cases.length} cases.`);

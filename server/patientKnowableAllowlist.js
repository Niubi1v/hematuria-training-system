const SOURCE_FILE = "data/cases.json";

function approved(caseId, intent, sourcePath, sourceExcerpt, patientAwareZh, options = {}) {
  return Object.freeze({
    caseId,
    intent,
    domain: "patient_knowledge",
    sourceFile: SOURCE_FILE,
    sourcePath,
    sourceExcerpt,
    patientAwareZh,
    allowedIntents: Object.freeze([intent]),
    modalities: Object.freeze(options.modalities || []),
    noPriorInvestigations: Boolean(options.noPriorInvestigations)
  });
}

const patientKnowableAllowlist = Object.freeze([
  approved("P001", "prior_medical_visit", "raw.symptomsDetail", "当时到当地社区医院看了", "我之前为这个问题去医院看过。"),
  approved("P002", "prior_medical_visit", "raw.symptomsDetail", "当时到当地社区医院看了", "我之前为这个问题去医院看过。"),
  approved("P003", "prior_medical_visit", "raw.symptomsDetail", "当地医院就诊", "我之前为这个问题去医院看过。"),
  approved("P004", "prior_medical_visit", "raw.symptomsDetail", "当地医院就诊", "我之前为这个问题去医院看过。"),
  approved("P005", "prior_medical_visit", "raw.symptomsDetail", "前往当地医院就诊", "我之前为这个问题去医院看过。"),
  approved("P007", "prior_medical_visit", "raw.symptomsDetail", "前往当地医院就诊", "我之前为这个问题去医院看过。"),
  approved("P026", "prior_medical_visit", "presentIllness.onset", "曾多次自行或门诊使用抗菌药", "我之前为这个问题去门诊看过。"),

  approved("P001", "prior_investigations", "raw.symptomsDetail", "没做什么检查", "之前去医院看过，但没做检查。", { noPriorInvestigations: true }),
  approved("P002", "prior_investigations", "raw.symptomsDetail", "没做什么检查", "之前去医院看过，但没做检查。", { noPriorInvestigations: true }),
  approved("P003", "prior_investigations", "raw.symptomsDetail", "做泌尿系彩超", "我记得做过B超。", { modalities: ["B超"] }),
  approved("P004", "prior_investigations", "raw.symptomsDetail", "中腹部CT提示", "我记得做过CT。", { modalities: ["CT"] }),
  approved("P012", "prior_investigations", "raw.symptomsDetail", "查24小时尿蛋白定量", "我记得查过尿蛋白。", { modalities: ["尿检"] }),
  approved("P022", "prior_investigations", "presentIllness.onset", "多次尿检提示镜下血尿", "我记得做过尿检。", { modalities: ["尿检"] }),
  approved("P030", "prior_investigations", "presentIllness.onset", "复查尿检发现持续镜下血尿", "我记得做过尿检。", { modalities: ["尿检"] }),
  approved("P033", "prior_investigations", "presentIllness.onset", "体检首次发现镜下血尿", "我记得做过尿检。", { modalities: ["尿检"] }),
  approved("P035", "prior_investigations", "presentIllness.onset", "尿检提示镜下血尿", "我记得做过尿检。", { modalities: ["尿检"] }),
  approved("P037", "prior_investigations", "presentIllness.onset", "尿潜血阳性", "我记得做过尿检。", { modalities: ["尿检"] }),
  approved("P040", "prior_investigations", "presentIllness.onset", "既往影像发现双肾多发囊肿", "我以前做过肾脏影像检查。", { modalities: ["影像检查"] }),
  approved("P041", "prior_investigations", "presentIllness.onset", "多次尿检发现镜下血尿", "我记得做过尿检。", { modalities: ["尿检"] }),
  approved("P042", "prior_investigations", "presentIllness.onset", "体检发现镜下血尿，复查仍有红细胞", "我记得做过尿检。", { modalities: ["尿检"] }),

  approved("P001", "prior_investigation_results_patient_aware", "raw.symptomsDetail", "没做什么检查", "之前没做检查，所以没有检查结果。", { noPriorInvestigations: true }),
  approved("P002", "prior_investigation_results_patient_aware", "raw.symptomsDetail", "没做什么检查", "之前没做检查，所以没有检查结果。", { noPriorInvestigations: true }),
  approved("P003", "prior_investigation_results_patient_aware", "raw.symptomsDetail", "右肾盂内占位，可见血流，建议进一步检查", "B超说右肾那边有个地方需要再查。", { modalities: ["B超"] }),
  approved("P004", "prior_investigation_results_patient_aware", "raw.symptomsDetail", "右肾巨大占位并腔静脉可疑癌栓", "CT说右肾有异常，需要继续检查。", { modalities: ["CT"] }),
  approved("P012", "prior_investigation_results_patient_aware", "raw.symptomsDetail", "24小时尿蛋白定量2.4g", "以前查尿时，医生说尿里蛋白比较多。", { modalities: ["尿检"] }),
  approved("P022", "prior_investigation_results_patient_aware", "presentIllness.onset", "多次尿检提示镜下血尿", "以前的尿检总能查到血。", { modalities: ["尿检"] }),
  approved("P030", "prior_investigation_results_patient_aware", "presentIllness.onset", "持续镜下血尿", "以前尿检查到过血。", { modalities: ["尿检"] }),
  approved("P033", "prior_investigation_results_patient_aware", "presentIllness.onset", "多次复查仍有红细胞", "以前尿检反复查到血。", { modalities: ["尿检"] }),
  approved("P035", "prior_investigation_results_patient_aware", "presentIllness.onset", "尿检提示镜下血尿", "以前尿检查到过血。", { modalities: ["尿检"] }),
  approved("P037", "prior_investigation_results_patient_aware", "presentIllness.onset", "月经期，未采用规范清洁中段尿，尿潜血阳性", "经期那次尿检潜血阳性，医生说月经后要规范复查。", { modalities: ["尿检"] }),
  approved("P040", "prior_investigation_results_patient_aware", "presentIllness.onset", "既往影像发现双肾多发囊肿", "以前的片子说两边肾都有囊肿。", { modalities: ["影像检查"] }),
  approved("P041", "prior_investigation_results_patient_aware", "presentIllness.onset", "多次尿检发现镜下血尿", "以前尿检反复查到血。", { modalities: ["尿检"] }),
  approved("P042", "prior_investigation_results_patient_aware", "presentIllness.onset", "复查仍有红细胞", "两次尿检都查到过血。", { modalities: ["尿检"] }),

  approved("P001", "prior_diagnosis_patient_aware", "raw.symptomsDetail", "当时考虑是上火", "那时医生说可能是上火。"),
  approved("P002", "prior_diagnosis_patient_aware", "raw.symptomsDetail", "当时考虑是上火", "那时医生说可能是上火。"),
  approved("P005", "prior_diagnosis_patient_aware", "raw.symptomsDetail", "考虑：前列腺肥大", "以前医生说是前列腺有点大。"),
  approved("P007", "prior_diagnosis_patient_aware", "raw.symptomsDetail", "考虑：前列腺肥大", "以前医生说是前列腺有点大。"),
  approved("P014", "prior_diagnosis_patient_aware", "presentIllness.onset", "每次被当作“尿路感染”", "以前医生说可能是尿路感染。"),
  approved("P019", "prior_diagnosis_patient_aware", "patientFacingProfile.knownPastHistory", "既往有膀胱炎", "我以前得过膀胱炎。"),
  approved("P021", "prior_diagnosis_patient_aware", "patientFacingProfile.knownPastHistory", "感染史：反复UTI", "我以前有过反复尿路感染。"),
  approved("P022", "prior_diagnosis_patient_aware", "patientFacingProfile.knownPastHistory", "感染史：反复UTI", "我以前有过反复尿路感染。"),
  approved("P023", "prior_diagnosis_patient_aware", "patientFacingProfile.knownPastHistory", "既往小结石1次", "我以前有过一次小结石。"),
  approved("P024", "prior_diagnosis_patient_aware", "patientFacingProfile.knownPastHistory", "有肾结石史", "我以前有过肾结石。"),
  approved("P025", "prior_diagnosis_patient_aware", "patientFacingProfile.knownPastHistory", "BPH多年", "以前医生说我有前列腺增生。"),
  approved("P026", "prior_diagnosis_patient_aware", "patientFacingProfile.knownPastHistory", "反复尿感", "我以前有过反复尿路感染。"),
  approved("P027", "prior_diagnosis_patient_aware", "patientFacingProfile.knownPastHistory", "痛风/既往小结石", "我以前有过痛风和小结石。"),
  approved("P028", "prior_diagnosis_patient_aware", "patientFacingProfile.knownPastHistory", "BPH多年", "以前医生说我有前列腺增生。"),
  approved("P029", "prior_diagnosis_patient_aware", "patientFacingProfile.knownPastHistory", "既往史：BPH", "以前医生说我有前列腺增生。"),
  approved("P040", "prior_diagnosis_patient_aware", "patientFacingProfile.knownPastHistory", "既往史：多囊肾", "我以前就知道自己有多囊肾。"),

  approved("P001", "prior_treatment", "raw.symptomsDetail", "吃了点消炎药", "以前吃过一点消炎药。"),
  approved("P002", "prior_treatment", "raw.symptomsDetail", "吃了点消炎药", "以前吃过一点消炎药。"),
  approved("P005", "prior_treatment", "raw.symptomsDetail", "间断吃坦索罗辛胶囊、非那雄胺片", "以前间断吃过坦索罗辛和非那雄胺。"),
  approved("P006", "prior_treatment", "raw.symptomsDetail", "购买“三金片”服用", "我自己买过三金片吃。"),
  approved("P007", "prior_treatment", "raw.symptomsDetail", "间断吃前列疏通胶囊", "以前间断吃过前列疏通胶囊。"),
  approved("P012", "prior_treatment", "raw.symptomsDetail", "口服“黄葵胶囊”", "我吃过黄葵胶囊。"),
  approved("P014", "prior_treatment", "presentIllness.onset", "口服抗菌药", "以前口服过抗菌药。"),
  approved("P016", "prior_treatment", "presentIllness.onset", "休息和饮水后可变淡", "我试过休息和多喝水。"),
  approved("P018", "prior_treatment", "presentIllness.onset", "饮水后症状稍缓解", "我试过多喝水，还没自己吃抗菌药。"),
  approved("P019", "prior_treatment", "presentIllness.onset", "服用退热药", "我吃过退热药。"),
  approved("P021", "prior_treatment", "presentIllness.onset", "自行服过少量旧抗菌药", "我自己吃过一点以前剩的抗菌药。"),
  approved("P022", "prior_treatment", "presentIllness.onset", "口服抗菌药", "以前口服过抗菌药。"),
  approved("P025", "prior_treatment", "presentIllness.onset", "间断服用坦索罗辛", "我间断吃过坦索罗辛。"),
  approved("P026", "prior_treatment", "presentIllness.onset", "曾多次自行或门诊使用抗菌药", "我以前多次用过抗菌药。"),
  approved("P028", "prior_treatment", "presentIllness.onset", "间断服用坦索罗辛和非那雄胺", "我间断吃过坦索罗辛和非那雄胺。"),
  approved("P029", "prior_treatment", "presentIllness.onset", "急诊导尿后尿潴留缓解", "急诊给我导过尿。"),
  approved("P036", "prior_treatment", "presentIllness.onset", "停止运动、休息及补液", "我停下运动，休息并补了水。"),

  approved("P001", "prior_medication_for_current_problem", "raw.symptomsDetail", "吃了点消炎药", "这次以前吃过一点消炎药。"),
  approved("P002", "prior_medication_for_current_problem", "raw.symptomsDetail", "吃了点消炎药", "这次以前吃过一点消炎药。"),
  approved("P005", "prior_medication_for_current_problem", "raw.symptomsDetail", "间断吃坦索罗辛胶囊、非那雄胺片", "为排尿问题间断吃过坦索罗辛和非那雄胺。"),
  approved("P006", "prior_medication_for_current_problem", "raw.symptomsDetail", "购买“三金片”服用", "这次我自己买过三金片吃。"),
  approved("P007", "prior_medication_for_current_problem", "raw.symptomsDetail", "间断吃前列疏通胶囊", "为排尿问题间断吃过前列疏通胶囊。"),
  approved("P012", "prior_medication_for_current_problem", "raw.symptomsDetail", "口服“黄葵胶囊”", "这次我吃过黄葵胶囊。"),
  approved("P014", "prior_medication_for_current_problem", "presentIllness.onset", "口服抗菌药", "为这次症状口服过抗菌药。"),
  approved("P019", "prior_medication_for_current_problem", "presentIllness.onset", "服用退热药", "这次我吃过退热药。"),
  approved("P021", "prior_medication_for_current_problem", "presentIllness.onset", "自行服过少量旧抗菌药", "这次我自己吃过一点以前剩的抗菌药。"),
  approved("P022", "prior_medication_for_current_problem", "presentIllness.onset", "口服抗菌药", "为这些症状口服过抗菌药。"),
  approved("P025", "prior_medication_for_current_problem", "presentIllness.onset", "间断服用坦索罗辛", "为排尿问题间断吃过坦索罗辛。"),
  approved("P026", "prior_medication_for_current_problem", "presentIllness.onset", "曾多次自行或门诊使用抗菌药", "为这些症状用过抗菌药。"),
  approved("P028", "prior_medication_for_current_problem", "presentIllness.onset", "间断服用坦索罗辛和非那雄胺", "为排尿问题间断吃过坦索罗辛和非那雄胺。"),
  approved("P029", "prior_medication_for_current_problem", "patientFacingProfile.knownMedication", "阿司匹林、坦索罗辛", "我平时在吃坦索罗辛。"),

  approved("P001", "treatment_response", "raw.symptomsDetail", "吃了点消炎药后就好转了", "吃了以后当时好转了。"),
  approved("P002", "treatment_response", "raw.symptomsDetail", "吃了点消炎药后就好转了", "吃了以后当时好转了。"),
  approved("P005", "treatment_response", "raw.symptomsDetail", "症状改善", "吃药后症状有改善。"),
  approved("P006", "treatment_response", "raw.symptomsDetail", "症状无明显缓解", "吃了以后没有明显缓解。"),
  approved("P007", "treatment_response", "raw.symptomsDetail", "症状改善", "吃药后症状有改善。"),
  approved("P012", "treatment_response", "raw.symptomsDetail", "症状无缓解", "吃了以后症状没有缓解。"),
  approved("P014", "treatment_response", "presentIllness.onset", "症状可暂时减轻，但停药后数周再次出现，血尿并未完全消失", "吃药后尿频尿急能暂时减轻，但后来又会发作，血尿也没完全消失。"),
  approved("P016", "treatment_response", "presentIllness.onset", "可变淡但未完全消失", "休息和喝水后尿色能变淡，但没有完全消失。"),
  approved("P018", "treatment_response", "presentIllness.onset", "饮水后症状稍缓解", "多喝水后稍微缓解了一点。"),
  approved("P019", "treatment_response", "presentIllness.onset", "体温可短暂下降，但数小时后再次升高", "吃退热药后体温能短暂下降，但过几个小时又会升高。"),
  approved("P021", "treatment_response", "presentIllness.onset", "效果不明显", "吃了以后效果不明显。"),
  approved("P022", "treatment_response", "presentIllness.onset", "口服抗菌药后症状可缓解", "口服抗菌药后症状能缓解，但尿检还是会查到血。"),
  approved("P025", "treatment_response", "presentIllness.onset", "改善不明显", "吃坦索罗辛后改善不明显。"),
  approved("P026", "treatment_response", "presentIllness.onset", "症状可短暂缓解但很快复发", "用药后能短暂缓解，但很快又会发作。"),
  approved("P029", "treatment_response", "presentIllness.onset", "急诊导尿后尿潴留缓解", "导尿后下腹胀痛和尿不出来缓解了。"),
  approved("P036", "treatment_response", "presentIllness.onset", "休息及补液后尿色逐渐恢复", "休息和补水后尿色逐渐恢复了。")
]);

function sourceValue(caseData, sourcePath) {
  return {
    "raw.symptomsDetail": caseData?.raw?.symptomsDetail,
    "presentIllness.onset": caseData?.presentIllness?.onset,
    "patientFacingProfile.knownPastHistory": caseData?.patientFacingProfile?.knownPastHistory,
    "patientFacingProfile.knownMedication": caseData?.patientFacingProfile?.knownMedication
  }[sourcePath];
}

function verifiedPatientKnowableRecords(caseData) {
  const caseId = String(caseData?.displayCaseId || caseData?.id || "");
  return patientKnowableAllowlist.filter((entry) => entry.caseId === caseId
    && String(sourceValue(caseData, entry.sourcePath) || "").includes(entry.sourceExcerpt));
}

module.exports = { patientKnowableAllowlist, sourceValue, verifiedPatientKnowableRecords };

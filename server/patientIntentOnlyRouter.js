const { patientFactOntology } = require("../src/lib/patientIntentCatalog.js");

const slotByIntent = new Map(patientFactOntology.map((definition) => [definition.key, definition.sourceSlotId || null]));

const typoReplacements = Object.freeze([
  [/木有|没得/g, "没有"], [/医声/g, "医生"], [/医远/g, "医院"], [/大扶/g, "大夫"], [/门珍/g, "门诊"],
  [/检察/g, "检查"], [/片子怎么硕/g, "片子怎么说"], [/查处/g, "查出"], [/啥并/g, "啥病"], [/诊段/g, "诊断"],
  [/说发/g, "说法"], [/(?:咋冶|治辽)/g, "治疗"], [/处里/g, "处理"], [/管亊/g, "管事"], [/好砖/g, "好转"],
  [/反付/g, "反复"], [/见校/g, "见效"], [/颜涩/g, "颜色"], [/(?:血快|凝血快)/g, "血块"], [/疙达/g, "疙瘩"],
  [/腰藤不藤/g, "腰疼不疼"], [/发稍/g, "发烧"], [/抽言/g, "抽烟"], [/多少跟/g, "多少根"], [/长其/g, "长期"],
  [/哪写/g, "哪些"], [/家簇/g, "家族"], [/肾并/g, "肾病"], [/前头作过/g, "前头做过"], [/时侯/g, "时候"],
  [/啥会/g, "啥时候"], [/多久久/g, "多久"], [/(?:啥要|开要)/g, (value) => value.replace("要", "药")], [/药药/g, "药"]
]);

function normalizeClause(value) {
  let text = String(value || "").normalize("NFKC").toLowerCase();
  for (const [pattern, replacement] of typoReplacements) text = text.replace(pattern, replacement);
  return text.replace(/\s+/g, "").replace(/[“”‘’'"()（）]/g, "");
}

const has = (text, pattern) => pattern.test(text);
const responseWords = /管用|管事|见效|效果|好转|好些|好点|缓解|松快|改善|变化|区别|维持|复发|反复|还犯|还在|照旧|减少|恢复|有效|有没有用|症状变/;
const resultWords = /结果|结论|报告|查出|发现|显示|提示|大意|解释|怎么说|咋讲|说啥|说出|什么说法|啥说法|发现异常/;
const priorDiagnosisContext = /以前|之前|此前|前头|先前|当时|那会儿|外院|给过诊断|病名.{0,4}记得|医生.{0,8}(?:说|讲|告诉|定性)|大夫.{0,8}(?:说|讲|告诉)|人家.{0,4}说|有人.{0,8}解释过|去看过/;

const rules = Object.freeze([
  ["chief_complaint", (text) => has(text, /(?:主要|最难受|最不舒服|最困扰|最想解决|先说|先讲|开头|眼下|这回|这次|此次|今儿|今个儿|这趟|就医).{0,14}(?:哪儿|哪里|哪点|哪块|不舒服|不适|难受|不得劲|不舒坦|不对劲|症状|问题|原因|为啥|为什么|咋回事|起因|困扰|了解什么)|(?:带到|折腾).{0,8}(?:医院|来)|用自己的话.{0,10}(?:不适|不舒服)|身上哪块.{0,8}受不了|身体不对劲.{0,8}具体.{0,2}哪|哪儿不舒服|最不舒服|最先想.{0,8}讲|挑一个最难受|让您来医院的事|最希望医生.{0,8}了解什么/) && !has(text, /药|治疗|处理|检查|化验|片子|医院以前|看病.*之前|因为这次的问题|针对这次症状|为这次症状/)],
  ["gross_hematuria", (text) => has(text, /肉眼|亲眼|一眼|眼睛.{0,4}瞧见|自己.{0,4}(?:看到|看见)|直接.{0,4}(?:看见|瞅)|不用(?:显微镜|化验)|不拿化验单.{0,8}看见|外观.{0,8}(?:红|血)|外表.{0,8}(?:红|血)|看着就发红|尿(?:盆|杯).{0,8}(?:能|会|看|瞅|显).{0,5}(?:红|血)|尿液外观.{0,8}发红|红尿|尿真红|(?:尿|小便).{0,8}(?:看起来红|红出来)/)],
  ["hematuria_onset", (text) => has(text, /啥时候|什么时候|何时|哪天|哪会儿|哪阵|头回|第一次|首次|最早|最先.{0,8}时间|起病|打哪天|从哪一天|有多久|拖了多久|症状多久|到今儿.{0,6}(?:多久|多长)|多长(?:时间|日子|时候)|几天还是几月|病程/) && !has(text, /烟龄|抽烟|吸烟|医生|大夫|医院|看病|就诊/)],
  ["urine_color", (text) => has(text, /颜色|尿色|什么色|啥色|哪种红|鲜红|暗红|红还是|红或|茶色|茶水|酱油|洗肉水|偏红|偏褐|褐色|偏鲜|偏暗|发暗|深浅|呈的是|看上去深|尿液外观更接近/) && !has(text, /开始多久|什么时候开始|何时开始|起病/)],
  ["blood_clots", (text) => has(text, /血块|凝块|凝成块|血疙瘩|血团|小血团|成团的血|成块|结成块|块状物|块状的血|胶冻|小肉条|一坨坨|条状或团状|尿里带块/)],
  ["dysuria", (text) => has(text, /烧灼感|尿痛|排尿痛|小便痛|撒尿痛|解小便痛|(?:尿|小便|排尿|撒尿|解手|上厕所).{0,12}(?:疼|痛|刺|烧|灼|火辣|难受|不适)|(?:疼|痛|刺|烧|灼|不适).{0,10}(?:尿|小便|排尿)|不适.{0,8}排尿/)],
  ["flank_pain", (text) => has(text, /腰疼|腰痛|腰藤|肾区痛|侧腰呢|侧腰有没有份|后腰难受|(?:腰|肾那|肾区|腰窝|侧腰|后腰|腰背|肋骨下面靠后).{0,12}(?:疼|痛|酸|胀|绞|难受)|(?:疼|痛|酸|绞).{0,10}(?:腰|肾区|腰窝|侧腰|后腰|腰背)/)],
  ["fever", (text) => has(text, /发热|发烧|高热|高烧|体温|寒战|烧起来|烧得慌|身上烧|身上烫|额头烫|一阵冷一阵热|先冷后热|人发不发热|有烧不|当时烧吗/)],
  ["smoking_amount", (text) => has(text, /一天.{0,8}(?:烟|支|根|包)|每天.{0,8}(?:烟|支|根|包)|(?:烟|支|根|包).{0,8}(?:一天|每天|多少)/) && !has(text, /多少年|几年|烟龄|多久/)],
  ["smoking_duration", (text) => has(text, /烟龄|抽烟.{0,8}(?:多久|多少年|几年)|吸烟.{0,8}(?:多久|多少年|几年)/)],
  ["smoking_history", (text) => has(text, /抽烟|吸烟|抽上|抽过烟|现在不抽|以前抽过|烟瘾|烟这方面|烟这个东西|戒烟|戒了没有|长期吸烟/) && !has(text, /一天|每天|多少|几年|多久|烟龄|包年/)],
  ["alcohol_amount", (text) => has(text, /喝多少|酒量|一次.{0,6}喝|白酒.{0,6}(?:多少|几两)|啤酒.{0,6}(?:多少|几瓶)/)],
  ["alcohol_frequency", (text) => has(text, /多久喝一次|每天喝|一周喝几次|喝得勤|多常喝/)],
  ["alcohol_history", (text) => has(text, /喝酒|饮酒|白酒|啤酒|平常喝点酒/) && !has(text, /多少|酒量|多久|每天|一周|几次|频率/)],
  ["medication_use", (text) => has(text, /(?:平时|平常|长期|现在).{0,8}(?:有没(?:有)?|是否).{0,5}(?:吃|服|用)?药|有没(?:有)?长期用药|有没有常吃的药|现在吃药吗/) && !has(text, /什么|哪些|药名|怎么吃|几次|剂量/)],
  ["medication_list", (text) => has(text, /(?:平时|平常|长期|常年|每天|固定|常规|规律|常用|常备|早晚|天天|一直备着).{0,14}(?:药|服用|服药|吃|用药)|(?:药|药物|服药|用药).{0,12}(?:平时|平常|长期|常年|每天|固定|常规|规律|常用|天天)|(?:吃|服|用)(?:的)?什么药|现在在吃哪些药|用药史|处方药|药物方面|列一张单子|慢性病.{0,8}吃什么药/) && !has(text, /药物?名称|具体药名|药名叫什么|过敏|allerg|怎么吃|几次|剂量|这回|这次|此次|当前|为这事|为这个|症状|发作|来前|来院前|医院|医生|大夫/) && !has(text, /^(?:平时)?有没(?:有)?(?:长期)?(?:吃|服|用)?药(?:吗)?[？?]?$/)],
  ["family_history", (text) => has(text, /家里.{0,4}人|家人|父母|爹妈|兄弟|姐妹|兄妹|同胞|亲戚|亲属|家族|直系|家属|遗传|一家几个人/)],
  ["prior_medical_visit", (text) => has(text, /(?:以前|之前|此前|前头|先前|早先|来这儿前|来这里前|来院前|这回来之前|在别处|外院|既往).{0,20}(?:看过|看医生|找医生|找.{0,4}大夫|门诊|就诊|就医|求医|挂过?号|咨询|看病|跑过医院|上医院看)|(?:看过|看医生|找医生|找.{0,4}大夫|就医|就诊|求医|挂过?号|去过医院|外院就诊).{0,12}(?:以前|之前|此前|前头|先前|这事|这个|吗|没|没有|不|呢|经历|问题)|(?:期间|中间).{0,8}(?:找医生|看病)|(?:曾在外院|外院).{0,8}处理过这个问题|后头一站去哪看|这回来之前求过医|医院以前去过|找人看病.{0,8}之前|先去门诊|先前去医院|之前去医院.{0,6}查过/)],
  ["prior_investigation_results_patient_aware", (text) => !has(text, /诊断|病名/) && ((has(text, resultWords) && has(text, /检查|化验|片子|报告|项目|尿一验|查完|查到|做完|外院|此前|以前|既往|那张|那份|最终/)) || has(text, /结果(?:咋样|怎么样|大概啥样)|(?:尿检|检查|化验|片子|报告).{0,8}怎么样|片子说啥|片子怎么讲|化验结论|查出什么|查到的是什么情况|医生.{0,8}检查.{0,8}有什么|项目结束后.{0,10}告诉|检查有没有说出|做完以后得到的说法|那堆结果|那个结果|片子怎么说|尿一验/))],
  ["prior_diagnosis_patient_aware", (text) => has(text, priorDiagnosisContext) && has(text, /诊断|病名|医生|大夫|外院|说(?:您得的是啥|啥病)|起过名|明确叫过什么|解释过病因|有人.{0,8}解释/) && has(text, /诊断|病名|啥病|什么病|疾病名称|病因|怎么定性|认为是什么|什么问题|啥毛病|起过名|明确叫过什么|说您得的是啥|医生.{0,12}(?:下个说法|啥说法|说啥病|怎么说的|咋跟你讲|告诉)|大夫.{0,12}(?:说法|讲|告诉)|外院.{0,12}(?:说法|结论)/) && !has(text, /检查|化验|片子|报告|结果|结论|尿一验/)],
  ["prior_investigations", (text) => has(text, /(?:以前|之前|此前|前头|先前|早先|来这前|来院前|外院|医院|过去|既往|别处|那次就诊).{0,20}(?:检查|查看|化验|查过|查了|查什么|验过|抽血|拍片|片子|项目|检测|尿检|影像|检验)|(?:检查|查看|化验|查过|验过|抽血|拍过?片|片子|项目|检测|尿检|影像|检验).{0,16}(?:以前|之前|此前|前头|先前|完成|哪些|什么|啥|哪几样|哪种|经历|包括|安排|做过|了吗|没|没有)|(?:有没(?:有)?|是否)?(?:做|查|验)(?:了|过)?(?:尿|血|CTU?|MRI|磁共振|B超|彩超|超声)|还有没有做其他检查|前面查了啥|做过项目没|验过哪些|片子拍了吗|那医院查了啥|医院给查哪些|去医院查什么|做过哪些项目|做过什么检查/) && !has(text, new RegExp(`${resultWords.source}|告诉|结束后|怎么讲|检查以后|查到`))],
  ["prior_medication_for_current_problem", (text) => has(text, /(?:这回|这次|此次|当前|为这事|为这个|为当前|为这症状|针对这次|针对刚才|症状起来后|发作以后|尿红后|来前|来院前|来这里前|此次发作前后|前头|先前).{0,20}(?:吃药|服药|用药|用过.{0,5}药|用.{0,4}药|开药|给药|找药|药片|处方|吞过|服用|药物|打针|吃|服过)|(?:吃药|服药|用药|开药|给药|找药|药片|处方|吞过|服用|药物).{0,16}(?:这回|这次|此次|当前|为这事|为这个|症状|发作以后|来前)|(?:医院|医生|大夫).{0,8}(?:让|给|开).{0,8}药|医生有没有.{0,8}开处方|当时.{0,6}给药|开了啥药/) && !has(text, responseWords)],
  ["treatment_response", (text) => has(text, /治疗反应|管用|管事|见效|效果|好转|好些|好点|缓解|松快|改善|维持|复发|还犯|照旧|减少|恢复|有效|有没有用|还在吗|治后怎样|之后怎么样|以后怎么样|药物带来的变化|治疗.{0,8}怎么样|处理.{0,8}怎么样|吃药.{0,8}怎么样|用药.{0,8}怎么样|输液.{0,8}怎么样|(?:处理|治疗|治(?:了|完|过)?|吃药|用药|用完药|输液|办法).{0,12}(?:变化|区别|复发|反复|还犯)|症状变/) && !has(text, /用药史|有没有用药|剂量|频次|频率|药名|其他用药/)],
  ["prior_treatment", (text) => has(text, /(?:以前|之前|此前|前头|先前|早先|来这里前|来院前|外院|医院|曾经|既往|后来).{0,20}(?:治疗|处理|处置|怎么弄|怎么治|收拾|办法|措施|输液|打针|治过|给弄)|(?:治疗|处理|处置|怎么弄|怎么治|办法|措施|输液|打针|治过|给弄).{0,16}(?:以前|之前|此前|前头|先前|曾经|什么|啥|吗|没|没有|接受|包括)|做了啥处置|输液了吗|采取了哪种处理|后续处置|发作以后采取|当时怎么治疗/) && !has(text, responseWords) && !has(text, /药|服用|吃|曾在外院处理过这个问题/)]
]);

function routePatientIntents(question, language = "zh", contextIntent = "") {
  if (language !== "zh") return [];
  const source = String(question || "").trim();
  const contextualIntent = String(contextIntent || "");
  if (["prior_investigations", "prior_investigation_results_patient_aware"].includes(contextualIntent)
    && /医生咋解释|那张片子怎么讲|当时检查是怎么说|那个结果大概/.test(normalizeClause(source))) {
    return [{ intent: "prior_investigation_results_patient_aware", requestedSlot: slotByIntent.get("prior_investigation_results_patient_aware"), matchIndex: 0, text: source }];
  }
  if (contextualIntent === "prior_medical_visit" && /他当时怎么说/.test(normalizeClause(source))) {
    return [{ intent: "prior_diagnosis_patient_aware", requestedSlot: slotByIntent.get("prior_diagnosis_patient_aware"), matchIndex: 0, text: source }];
  }
  if (["prior_treatment", "prior_medication_for_current_problem", "treatment_response"].includes(contextualIntent)
    && /之后怎么样|后来好些|后来还犯|那药有效/.test(normalizeClause(source))) {
    return [{ intent: "treatment_response", requestedSlot: slotByIntent.get("treatment_response"), matchIndex: 0, text: source }];
  }
  const clauses = [source, ...source.split(/[，,；;。！？!?]+/).map((part) => part.trim()).filter(Boolean)];
  const routes = [];
  for (const [clauseIndex, clause] of clauses.entries()) {
    const text = normalizeClause(clause);
    const matches = rules.filter(([, matchesClause]) => matchesClause(text));
    const intents = matches.map(([intent]) => intent);
    const visitAndInvestigation = intents.length === 2
      && intents.includes("prior_medical_visit")
      && intents.includes("prior_investigations")
      && /(?:去|到|上).{0,4}(?:医院|门诊).{0,8}(?:查过|检查过|化验过)/.test(text);
    if (matches.length !== 1 && !visitAndInvestigation) continue;
    for (const intent of intents) {
      routes.push({ intent, requestedSlot: slotByIntent.get(intent) || null, matchIndex: clauseIndex * 1000, text: clause });
    }
  }
  const seen = new Set();
  return routes.filter((route) => !seen.has(route.intent) && seen.add(route.intent));
}

module.exports = { routePatientIntents };

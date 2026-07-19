# Patient Intent Normalization Audit

审计日期：2026-07-17（Asia/Shanghai）
起始HEAD：`8014045d92ae310250baa5299bc424147263a012`

## 当前真实运行链

Preview/Vercel的标准化患者请求实际经过：

`用户问题 → NFKC/大小写/标点归一化 → structuredFacts → canonicalFacts → source slot读取 → HEM-P0-023隔离 → deterministic safety filter → compound保真 → DeepSeek润色或rule fallback`

另有一条主要用于本地规则与旧服务的TypeScript链：

`用户问题 → patientEngine structured matcher → canonicalSlots → semantic matcher → case slot/安全fallback`

两条链此前各自维护正则，形成同义词覆盖漂移。本轮新增无Node依赖的共享`patientIntentCatalog.js`，真实server matcher和TypeScript matcher均先读取同一优先级catalog；病例事实仍只从现有`patient_slots_bilingual.json`及安全投影读取。

## 错误“不清楚”的直接来源

1. `dysuria`只覆盖“尿痛/小便疼/排尿痛/烧灼”等少量字面，缺少“痛不痛、排尿疼、撒尿痛、sting、pain passing urine”等口语。
2. `hematuria_phase`把全程/起始/终末合在一个slot，旧matcher只返回`hematuria_phase`，没有问题级canonical fact或true/false/unknown。
3. 中文未命中会走有限的profile关键词fallback；英文profile fallback被明确关闭，未命中直接得到unknown。
4. 旧时相答案返回病例原句，不能针对“是起始吗/是终末吗/是全程吗”先回答是或不是。
5. 否定问句里的“不/没有”没有改变病例值，这一点安全；问题在于alias未命中或答案没有query-relative极性。
6. 复合问题原有多slot机制基本正确；首轮回归曾发现新`dysuria`优先级会误删独立的general pain，已用共享“独立一般疼痛”检测修正。

## 失败基线

修复前聚合运行74个dysuria及全程/起始/终末中英文问法：

- canonical命中：8/74（10.81%）；
- 明确事实错误unknown：37/74（50.00%）；
- 回答极性错误：67/74（90.54%）；
- 复合“尿频尿急尿痛”三事实：完整；
- P001中文“痛不痛”错误路由到宽泛`pain`，没有稳定命中`dysuria`。

## 第一批实现范围

第一阶段先启用4个核心问题级canonical intent：

- `dysuria` → source slot `dysuria`；
- `whole_stream_hematuria` → source slot `hematuria_phase`；
- `initial_hematuria` → source slot `hematuria_phase`；
- `terminal_hematuria` → source slot `hematuria_phase`。

第二阶段按同一治理模型扩展11个intent：`urinary_frequency`、`urinary_urgency`、`blood_clots`、`flank_pain`、`fever`、`foamy_urine`、`edema`、`weak_stream`、`incomplete_emptying`、`urinary_retention`和`nocturia`。当前合计15个intent、190个显式中英文alias，另有受限语义单元pattern；没有加入整句白名单或全局LLM猜测。

事实值由现有中英文答案分别分类，只有两种语言分类一致才输出true/false；任一语言含“需追问、非典型、不按起始/终末、可表现、多为、可伴”或双语分类不一致时输出unknown。没有修改或反转原始值。

## 安全顺序

canonical匹配只决定“问的是哪个事实”，不决定绕过治理：

1. source slot仍进入`quarantineForMatchedSlots`；
2. HEM-P0-023仍返回`medical_bilingual_conflict_pending_review`、0 matched slots、0 matched facts；
3. 未裁决或双语无法一致分类时返回自然unknown；
4. deterministic filter继续拦截教师/报告/诊断词；
5. compound answer继续用规则路径保留全部已匹配事实；
6. 未改`data/**`、事实极性、reviewerStatus、teacherReviewRequired、`needs_revision`或评分。

扩展批还明确分离`governanceSlotIds`与`collectableSlotIds`：已识别但双语不一致、原文不详或患者未观察的事实继续进入治理/冲突检查，但不会进入评分收集；只有true/false已由双语source一致确认的canonical事实才可收集。Patient Session优先执行canonical投影，旧structured matcher只处理未命中的其他slot，避免宽泛slot抢答并泄露整段内容。

## 当前结论

首批15 intent已完成可扩展catalog、双语source分类、自然true/false/unknown回复和42例矩阵。该结论只覆盖这15项和当前固定改写集，不等于全部37个历史slot、真实DeepSeek自然度或人工医学审核完成；HEM-P0-001/023、161个来源问题、419条模拟事实和42例`needs_revision`继续冻结。

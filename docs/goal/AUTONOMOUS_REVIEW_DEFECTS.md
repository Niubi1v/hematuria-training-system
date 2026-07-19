# 自主审阅缺陷台账

## 记录规范

每个缺陷必须包含：缺陷 ID、P0/P1/P2、页面/病例 ID、语言、步骤、预期、实际、复现次数、根因、截图/trace/日志、自动修复能力、医学专家需求、修改与回归范围。

## HEM-AUTO-P1-001：缺失病程被展示层杜撰为“数天”

- 级别：P1
- 页面和病例：训练页患者开场白/可见主诉；P034（内部 ID `HX-ADD-022`），并影响所有无可解析病程的输入。
- 语言：中文与英文。
- 操作步骤：调用 `simplifiedChiefComplaint("反复镜下血尿伴听力下降", "zh"/"en")`，或打开 P034 训练页。
- 预期结果：保留来源中“未提供病程”的状态，不新增时间；镜下血尿不得机械展示为肉眼所见。
- 实际结果：中文生成“血尿数天”，英文生成“`Hematuria for several days`”。
- 复现次数：静态调用 2/2；浏览器回归待补。
- 根因：`src/lib/chiefComplaint.ts` 对未匹配时长使用固定 `数天` fallback，且测试强制每例必须存在时长。
- 证据：`scripts/test-chief-complaint.ts` 现有断言与 `src/lib/chiefComplaint.ts` fallback；失败测试待记录。
- 是否能自动修复：是，展示层最小修复，不触碰病例事实。
- 是否需要医学专家：否；仅阻止新增不存在的病程并保留来源类别。
- 修改和回归范围：主诉格式化器、42 例中英文主诉测试、训练页开场白与病例摘要。

## 待分类发现

## HEM-AUTO-P1-002：持久化英文首次加载时患者开场白串入中文

- 级别：P1
- 页面和病例：`/cases/P034/` 第一阶段；预计影响所有病例首次从持久化英文状态进入。
- 语言：英文界面混入中文。
- 操作步骤：将 `hematuria-language` 保持为 `en`；在 360×800 视口直开 P034；等待 hydration 完成；检查界面、`html[lang]` 与首条患者消息。
- 预期结果：英文界面、`lang=en` 与英文患者开场白一致。
- 实际结果：标题、按钮和 `lang=en` 均为英文，但患者消息为“医生您好，我是因为反复尿检发现潜血伴听力下降来看病的。”。
- 复现次数：1/1；桌面/另一病例回归待补。
- 根因：待 UI Agent 完成；初步证据指向默认中文消息先初始化、持久化语言随后 hydration，初始消息未随该路径重建。
- 截图、trace或日志：2026-07-20 in-app Browser DOM snapshot，360×800，P034；同时记录 `Response source: Fallback rule library`。
- 是否能自动修复：是，非医学状态同步缺陷。
- 是否需要医学专家：否。
- 修改和回归范围：`ClinicalTrainingClient` 初始语言/消息同步；P001、P034 中英文直达、手动切换、刷新与恢复；桌面和移动模拟。

## HEM-AUTO-P1-005：优先自然问法矩阵大面积漏路由为 unknown/fallback

- 级别：P1
- 页面和病例：Patient Agent 第一阶段；P001–P042 全部病例。
- 语言：中文与英文。
- 操作步骤：对 42 例运行 24 个优先自然问法，包括“最近总跑厕所吗？”、“尿来了会等不了吗？”、“尿完总觉得膀胱没排空吗？”、“吃过让血变稀的药吗？”、`Do you have to rush to the bathroom?`、`Any lumps of blood in your pee?`、`Do you take blood thinners?`。
- 预期结果：映射到既有 canonical/structured slot，并读取病例事实；否定问句不改变事实；缺失和冲突保持 unknown。
- 实际结果：修复前 1008 次仅 42 次命中，966 次漏路由，命中率 4.17%。
- 复现次数：42 例 × 24 问法 = 1008/1008 次完成；966 次稳定漏路由。
- 根因：意图目录与 legacy/structured 正则偏正式术语，缺少口语词序、英文常用表达、DOAC 药名和受限职业暴露表达。
- 截图、trace或日志：失败证据 `PATIENT_PRIORITY_PARAPHRASE_EVIDENCE {"cases":42,"probes":24,"total":1008,"hits":42,"hitRate":0.0417,"failures":966}`；修复后 1008/1008。
- 是否能自动修复：是，已仅扩展路由词法。
- 是否需要医学专家：否；事实读取、冲突隔离与 unknown 治理保持不变。
- 修改和回归范围：`patientIntentCatalog`、canonical/structured matcher；3150 问法大矩阵、history routing、safe projection、Patient Agent。

## HEM-AUTO-P1-003：P019/P020 双语患者可见主诉存在来源冲突

- 级别：P1（医学内容治理阻塞）
- 页面和病例：病例库与训练页；P019、P020。
- 语言：中文/英文。
- 操作步骤：病例库切换英文；对照 `data/cases_public.json` 的 `studentChiefComplaint` 与 `chiefComplaintEn`。
- 预期结果：双语主诉表达同一来源事实；没有证据时不新增血尿。
- 实际结果：P019 中文“发热腰痛伴尿频尿痛3天”、英文“Hematuria for 3 days”；P020 中文“发热、尿痛伴会阴胀痛2天”、英文“Hematuria for 2 days”。中文原文无血尿标记，英文新增 hematuria。
- 复现次数：病例数据与 390×844 浏览器卡片各 1/1。
- 根因：补充病例双语患者可见主诉来源不一致；不能由展示层推定哪一侧为医学真值。
- 截图、trace或日志：2026-07-20 in-app Browser 病例库 DOM snapshot；42 例静态数据核对日志。
- 是否能自动修复：否，标记 `BLOCKED_MEDICAL`。
- 是否需要医学专家：是，需对 P019/P020 的主诉来源裁决；本任务不修改 `data/**`。
- 修改和回归范围：裁决后需回归病例目录、开场白、Patient Agent 症状事实与中英文一致性；当前仅保证格式化器不会从无标记中文原文自行新增血尿。

## HEM-AUTO-P2-004：session 初始化静默接受越界控制字段并截断幂等键

- 级别：P2
- 页面和病例：`POST /api/session/init`；任意病例（P001 复现）。
- 语言：中文与英文均受影响。
- 操作步骤：取得合法 training state 后，分别附加 `model`、`systemPrompt`、`tools`、`apiKey`；再以不支持语言及 201 字符 `X-Idempotency-Key` 请求。
- 预期结果：公共接口仅接受声明字段；高风险控制字段与不支持语言明确 400；超长幂等键拒绝而非转换成另一个键；provider 不被调用。
- 实际结果：修复前额外字段被静默忽略，不支持语言被归一化，幂等键由 `.slice(0, 200)` 静默截断。
- 复现次数：4 个高风险字段、不支持语言、超长幂等键各 1 次。
- 根因：session init 缺少公共请求字段白名单和严格语言/类型验证，并在校验前截断幂等键。
- 截图、trace或日志：`scripts/test-agent-api-security.ts::verifySessionRequestBoundary`；API 缺陷不生成含敏感内容的 UI trace。
- 是否能自动修复：是，已修复。
- 是否需要医学专家：否。
- 修改和回归范围：`api/session/init.js`、Agent API 安全、session/attempt claim、CORS、限流、幂等与 provider 前拒绝；安全拒绝 `providerCalls=0` 门禁保持通过。

## HEM-AUTO-P1-006：病例库绕过患者化主诉与冲突展示治理

- 级别：P1
- 页面和病例：`/cases/`；P013、P019、P020，根因覆盖 P001–P042。
- 语言：中文与英文。
- 操作步骤：打开病例库并切换 English；查看 P013、P019、P020 卡片。
- 预期结果：P013 显示 `Intermittent red urine for 2 months`；P019/P020 的双语来源冲突不得显示为已确认 hematuria。
- 实际结果：P013 为机械 `Hematuria for 2 months`；P019/P020 分别显示 `Hematuria for 3 days` / `Hematuria for 2 days`。
- 复现次数：桌面、移动模拟各 1/1。
- 根因：`CaseCatalogClient` 直接读双语字段，未复用训练页的患者化/冲突格式化器。
- 截图、trace或日志：`tests/e2e/practice.spec.mjs` 目录断言；四视口截图位于 `docs/goal/evidence/autonomous-review/`。
- 是否能自动修复：是，已接入共享格式化器；P019/P020 内容冲突仍为 `BLOCKED_MEDICAL`。
- 是否需要医学专家：P013 否；P019/P020 是。
- 修改和回归范围：病例库中英文卡片、搜索、训练页主诉和开场白；桌面/移动 E2E 4/4。

## HEM-AUTO-P2-007：患者资料报告门禁对 CRLF/LF 敏感且更新开关无法执行

- 级别：P2
- 页面和病例：工程门禁；P001–P042 患者可见资料完整性报告。
- 语言：不适用。
- 操作步骤：在 Windows CRLF checkout 运行 `test-patient-facing-profile.ts`；报告表内容相同但行尾不同。
- 预期结果：语义相同的报告表通过；显式 `UPDATE_PATIENT_PROFILE_REPORT=1` 可先更新再验证。
- 实际结果：误报 stale；且旧代码在写入分支之前先 assert，更新开关无法修复 stale 报告。
- 复现次数：1/1；修复后普通验证 2/2。
- 根因：直接比较 CRLF 文本与 LF 生成串，并将 update 分支放在 stale assert 之后。
- 截图、trace或日志：初次门禁错误 `patient-facing profile report table is stale`；修复后 `Patient-facing profile completeness passed for 42 cases.`。
- 是否能自动修复：是，已规范化行尾并修正 update/verify 顺序；未改表内容。
- 是否需要医学专家：否。
- 修改和回归范围：仅测试/报告生成门禁；42 例必填患者资料重新验证。

## 待分类发现

并行审阅结果返回后按上述字段补齐，不能以“体验不好”替代原文与证据。

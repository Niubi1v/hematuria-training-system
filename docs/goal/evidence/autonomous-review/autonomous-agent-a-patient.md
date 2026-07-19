# Agent A — Patient Agent 与同义问法专项

## 审阅范围

- 病例：42/42（`P001–P012` 与 `HX-ADD-001–HX-ADD-030`，患者显示 ID 对应 P001–P042）。
- 语言：中文、英文。
- 路径：priority canonical intent、legacy canonical slot、structured history fact、Patient Agent rule fallback、双语冲突隔离。
- 医学边界：未修改 `data/**`、症状极性、病程、诊断、检查结果、评分或审核状态。

## 发现

### AR-PA-001（P1）自然问法大面积落入 unknown/fallback

- 页面和病例：患者问诊页，全部 42 例。
- 中文/英文：双语。
- 操作步骤：在问诊输入框依次输入下列自然表达，或运行 `scripts/test-patient-priority-paraphrases.ts`。
- 代表性原文：
  - 中文：`最近总跑厕所小便吗？`、`尿来了会等不了吗？`、`夜里要尿几回？`、`排尿费不费劲？`、`尿完总觉得膀胱没排空吗？`、`有没有憋得难受却尿不出？`、`小便看起来是什么色的？`、`一天抽多少根？`、`工作中接触过染发剂吗？`、`吃过让血变稀的药吗？`
  - 英文：`Do you have to rush to the bathroom?`、`How many times do you wake to pee overnight?`、`Any lumps of blood in your pee?`、`Does your pee look bubbly?`、`Any puffiness around your eyes?`、`Is the flow of urine weaker?`、`Do you take blood thinners?`、`Are you taking apixaban?`
- 预期结果：映射到既有 canonical/structured slot，并严格读取该病例已有事实；用户问句中的否定不得成为答案；缺失或待审事实保持 unknown。
- 实际结果（修复前）：24 个探针 × 42 例共 1008 次，仅 42 次命中，966 次未命中；命中率 4.17%。
- 复现次数：1008/1008 次执行完成；966 次稳定复现路由缺失。
- 根因：意图目录和 legacy/structured 正则只覆盖正式术语及少量固定搭配，缺少口语词序、英文常用表达、DOAC 药名和职业暴露表达。
- 证据：失败测试输出 `PATIENT_PRIORITY_PARAPHRASE_EVIDENCE {"cases":42,"probes":24,"total":1008,"hits":42,"hitRate":0.0417,"failures":966}`；修复后同一测试为 1008/1008。
- 是否能自动修复：是。仅扩展问句识别，不改变任何病例事实或回答极性。
- 是否需要医学专家：否（词法路由工程缺陷）；匹配后的事实仍受原有审核与双语冲突隔离治理。
- 修改和回归范围：`src/lib/patientIntentCatalog.js`、`server/canonicalFacts.js`、`server/structuredFacts.js`；回归 canonical intent、42 例双语矩阵、history routing、safe projection、Patient Agent。

## 最小修复

- priority intent 增加尿频、尿急、夜尿、尿潴留、尿不尽、血块、泡沫尿、水肿、尿线弱的自然中英文词序。
- legacy canonical slot 增加尿液颜色、一般排尿困难和发热口语表达。
- structured fact 增加吸烟量、职业、职业暴露、`blood thinner` 及常见 DOAC 通用名映射。
- 职业暴露英文词限制为与 `work/job/occupation/exposure` 同现，避免把普通 `rubber/paint` 对话误路由为职业史。
- 新增 42 例 × 24 问法路由矩阵；不写入或推断病例事实。

## 指标与测试

| 命令 | 退出码 | 结果 |
|---|---:|---|
| `tsx scripts/test-patient-priority-paraphrases.ts`（修复前） | 1 | 42/1008 命中，966 缺失 |
| `tsx scripts/test-patient-priority-paraphrases.ts`（修复后） | 0 | 1008/1008，命中率 100% |
| `pnpm test:patient-intents` | 0 | 3150/3150 canonical 命中；known=1370；correct unknown=1715；错误 unknown=0（0%）；极性错误=0（0%）；双语 fact value 一致；双语冲突隔离 65 次 |
| `pnpm test:patient-history-routing` | 0 | 42 例 × 7 问法及 4 个安全边界通过 |
| `pnpm test:patient-safe-projection` | 0 | 114 个批准路由回复、12 个 governed unknown 通过 |
| `pnpm test:patient` | 0 | Patient Agent 测试通过 |
| `pnpm typecheck` | 2 | 环境/依赖阻塞：`xlsx` 模块未解析，随后产生工作簿脚本隐式 any；与本专项改动文件无关 |
| `git diff --check` | 0 | 无空白错误 |

补充专项证据：`PATIENT_INTENT_NORMALIZATION_EVIDENCE` 为 86/86 命中，错误 unknown 0，极性错误 0，三项复合问句完整；P001 的尿痛中英事实冲突仍返回 `medical_bilingual_conflict_pending_review`，未确定性回答、未收集该 slot。

## 变更文件与提交建议

- `src/lib/patientIntentCatalog.js`
- `server/canonicalFacts.js`
- `server/structuredFacts.js`
- `scripts/test-patient-priority-paraphrases.ts`
- `work/autonomous-agent-a-patient.md`

建议单独提交：`fix(patient): recognize natural bilingual history paraphrases`。本 Agent 未提交、未 push。

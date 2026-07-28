# Patient Agent 全局对话智能化审计

## 审计基线与边界

- 基线分支：`origin/codex/hematuria-production-goal`
- 基线绿色提交：`0d50a79f858dc15819458dc1a267f8d02323a61c`
- 基线 Actions：run `30195326982`，结论 `success`
- 不变边界：不修改 `data/**`、病例医学事实、审核状态、`needs_revision` 或 360 分规则。
- 复用边界：沿用原有 canonical intent、alias、`patientIntentCatalog`、compound 路由、history reconciliation、上下文追问、Patient 模板、3150 问、786 复合场景和 Preview 门禁。

## 完整运行链路

```text
用户输入
→ patientIntentCatalog 文本归一化
→ canonical/structured compound 分句与语义单元匹配
→ resolveContextualPatientQuestion 上下文补全
→ patientFactOntology intent 识别
→ canonicalFacts / structuredFacts canonical fact 投影
→ bilingualConflictQuarantine + review governance 医学治理
→ patientFactState 事实状态判定
→ answer plan 结构化答案规划
→ 确定性模板或受控 AI 自然语言生成
→ filterPatientOutput 输出过滤
→ 白名单 semantic classifier（仅确定性层完全未命中）
→ 带 reason code 的澄清或安全 fallback
```

AI 只允许润色已经确定的 answer plan；不得决定事实、极性、诊断、审核状态或评分答案。上下文只确定本轮询问的 fact，不补造病例答案。

## 根因聚类

| 根因 | 原链路风险 | 统一修复位置 |
| --- | --- | --- |
| 同义词缺失 | 不同 matcher 各自维护词表 | `patientFactOntology` 单一词汇本体 |
| 口语或方言表达 | 只能命中医学术语或完整句 | 本体内医学、患者、地区表达语义单元 |
| 否定问句 | 问句极性被误当患者事实极性 | intent 匹配与 fact projection 分离 |
| 省略主语或上下文追问 | “多少天/那疼吗”丢失主题 | `resolveContextualPatientQuestion` |
| 复合问题丢子句 | canonical/structured 层互相覆盖 | 双层结果合并、按源顺序 answer plan |
| 精确信息缺失但粗粒度已知 | 模糊时间降级为完全 unknown | `approximate_value` / `partially_known` |
| structured history 未命中 | history 模块独立关键词漂移 | structured matcher 消费统一本体 |
| diagnosis boundary 误判 | 既往肿瘤史被当诊断请求 | 命中 history 后再做边界判定 |
| 输出过滤误拦截 | 合法病史词被全局拦截 | 按已治理 slot 放行合法术语 |
| 已知事实错误降级 unknown | boolean/value 二分不足 | 九态 fact state + unknown 质量门禁 |
| `needs_review` 被确定化 | 待审核事实进入确定回答 | `needs_review` / `medical_conflict` 隔离 |
| 中英文路由不一致 | 两种语言落入不同 fact | bilingual projection 与冲突 quarantine |

## 事实状态与答案计划

统一状态为：

- `known_true`
- `known_false`
- `exact_value`
- `approximate_value`
- `partially_known`
- `patient_not_aware`
- `missing`
- `needs_review`
- `medical_conflict`

所有不确定输出记录以下内部 reason code 之一：

- `fact_missing`
- `partial_fact`
- `patient_not_aware`
- `needs_review`
- `medical_conflict`
- `intent_ambiguous`
- `classifier_unavailable`

确定事实先形成 `intent / factState / directAnswer / detail / unknownReason` answer plan。布尔事实的 `directAnswer` 必须先给出明确肯定或否定；粗粒度或模糊值保留原始不确定程度。

## 复合问题与 fallback

每个识别出的子句均生成以下 outcome 之一：

- `matched`
- `blocked_medical`
- `needs_clarification`
- `safe_unknown`
- `rejected_boundary`

医学冲突只隔离冲突子句，不静默丢弃同一问题中的安全子句。semantic classifier 仅在 deterministic matcher 完全未命中时启用，只能返回统一本体标记的白名单 intent、confidence 和 `needsClarification`；低置信度只提澄清问题。

## 证据口径

- 改造前：现有 3150 问错误 unknown `0`、极性错误 `0`；786 复合场景通过。
- 改造后：保留原 3150 问，并由统一本体动态扩展医学、患者口语、地区表达、否定、选择、错别字和中英文变体。
- 已知事实错误 unknown、极性错误、子句丢失、上下文丢失、边界误判、过滤误拦截必须分别为 `0`。
- `needs_review` 与中英文医学冲突不得计入“错误 unknown”，但必须保持隔离且不得确定化。

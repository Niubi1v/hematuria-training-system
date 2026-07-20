# Patient Intent 决策追踪

## 结构化字段

本地审计事件 `patient_prompt_audit` 只记录：templateVersion、caseId、language、canonicalIntents、matchedAliases、matcherLayer、matcherConfidence、factFields、provenance、reviewerStatus、providerInvoked、historyCount、estimatedInputTokens、maxTokens、temperature、provider、outputFilter、fallbackReason。

## matcherLayer

| 值 | 含义 | 是否允许改变事实 |
|---|---|---|
| `canonical_alias` | alias / 自然 pattern / 否定与选择识别 | 否 |
| `structured_fact` | 现有非首批槽位确定性匹配 | 否 |
| `semantic_classifier` | 白名单受限分类 | 否，只选 intent |
| `unknown` | 无法安全映射 | 否，返回自然不确定表达 |

## 典型决策

| 问句 | intent | 路径 | 答案来源 |
|---|---|---|---|
| 小便痛不痛？ | dysuria | canonical_alias | 病例 `dysuria` 双语槽位 |
| 没有尿痛吧？ | dysuria | negation-aware canonical | 问句中的“没有”不决定答案 |
| 是刚开始红、最后红还是全程红？ | initial + terminal + whole_stream | compound canonical | 同一 `hematuria_phase` 分类后逐 intent 投影 |
| 排泄尿液时会产生灼热样感觉吗？（若前3层未命中） | dysuria 或澄清 | semantic_classifier | 仅在 >=0.92 后读取 canonical 槽位 |
| 低置信度或 provider 失败 | 无 | unknown | 自然澄清/安全 unknown |

任何 Production/Preview 运行都不会生成该调试事件；要进行本地人工审计，须显式启用后使用合成或已获授权的测试输入。

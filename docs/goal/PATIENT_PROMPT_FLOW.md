# Patient Agent 问题到回答流程

```text
用户问题
  -> NFKC/大小写/标点标准化
  -> 第1层：canonical alias + 自然口语 pattern
  -> 第2层：negation-aware 问句识别（否定词不作为病例答案）
  -> 第3层：选择题/复合问题拆分为多个 canonical facts
  -> 旧 structured fact matcher（非首批 canonical 槽位）
  -> 诊断/报告安全边界
  -> 第4层：可选的受限语义分类（仅前述完全未命中）
       - 只允许服务端 canonical 白名单
       - strict JSON，仅 intent/confidence/needsClarification
       - confidence >= 0.92 且无需澄清才接受
       - 2.5 秒、0 retry、缓存、singleflight、每分钟有界限流
       - provider 失败/非法 JSON/低置信度 -> 安全 unknown
  -> canonical fact 投影（事实值只读既有双语病例槽位）
  -> HEM-P0-023 / reviewer 隔离
  -> 确定性自然回答
  -> 可选 LLM 语言润色（只能改写 currentAllowedAnswer，不能决定事实）
  -> 输出过滤与安全 fallback
```

## 不变量

- `patientHasAny()` 和每个 alias 检查不调用网络。
- 语义分类器不接收 caseId、病例答案、诊断、评分或审核资料，不生成患者答案。
- 最终 true/false/unknown 始终由既有 canonical fact 和治理状态决定。
- missing 不变成 false；needs_review 和双语冲突不变成确定答案。
- 复合问题的多个明确事实使用规则回答，避免 LLM 丢项。
- 分类与答案润色是不同步骤；分类 provider 失败时不继续用自由生成猜答案。

## 当前启用策略

确定性 3150 问与优先自然问法 1008 问已经全部命中，因此语义分类不是常规路径。只有服务端明确配置 `PATIENT_SEMANTIC_CLASSIFIER_ENABLED=true` 且 LLM 服务完整配置时，第4层才可用；默认、GitHub Pages bundle 和未配置环境均关闭。

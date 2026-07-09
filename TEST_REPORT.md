# TEST_REPORT

测试日期：2026-07-09

## 本次升级目标

基于《血尿补充30病例_按V2导师模板完善_AI接入版.xlsx》完成：

- 恢复并补全 30 个补充病例，正式编号为 `HX-ADD-001` 至 `HX-ADD-030`
- 与 V2 12 例合并，默认病例库为 42 例
- 保留 `CASE_SET=v2_only` / `CASE_SET=v2_plus_30` 切换能力
- 重构 Standardized Patient Agent 的规则回复与 AI 后端安全边界
- 保留现有 7-Agent UI、开单返回、MDT 和中英切换框架

## 数据导入结果

命令：

```bash
tsx scripts/convert-supplement-30-ai.ts work/source/supplement_30_ai.xlsx data
```

结果：

```text
Generated v2_plus_30: V2=12, supplement=30, active=42
```

生成/更新：

```text
data/cases.json
data/cases_42.json
data/cases_v2.json
data/case_cards.json
data/case_cards_42.json
data/question_answers.json
data/question_answers_42.json
data/interview_answers.json
data/interview_answers_42.json
data/order_results.json
data/order_results_42.json
data/mdt_triggers.json
data/mdt_triggers_42.json
data/case_set_config.json
data/supplement-30-import-report.json
```

验收：

- 默认病例数：42
- V2 病例：P001-P012
- 补充病例：HX-ADD-001-HX-ADD-030
- 不使用 HM-SUP 作为正式补充病例编号

## Patient Agent 测试

命令：

```bash
tsx scripts/test-patient-agent.ts
```

结果：

```text
Patient Agent tests passed.
```

覆盖：

- 问“尿是鲜红色吗”只回答颜色，不返回 CT、占位、癌栓、诊断
- 问“有血块吗”只回答血块，不出现“未主动诉”“需追问”，不顺带回答颜色/时相/无痛
- 问“全程都红还是终末红”只回答血尿时相
- 问“吸烟吗”只回答吸烟，不顺带乙肝、高血压、糖尿病、饮酒、输血、子女
- 问“喝酒吗”只回答饮酒，不顺带吸烟
- 问“有高血压吗”只回答高血压，不顺带糖尿病、乙肝、结核、吸烟、饮酒
- 问“小便疼吗”只回答尿痛/疼痛，不返回完整病史
- 问“做过CT吗，结果怎么样”不返回 CT 报告细节，提示查看检查报告
- 问“这是什么病”不输出诊断

## LLM/API 安全测试

命令：

```bash
tsx scripts/test-llm-adapter.ts
```

结果：

```text
LLM adapter and API safety tests passed.
```

覆盖：

- `responseFilter` 能拦截“根据原始病史”“CT提示”“占位”“肿瘤”等泄露词
- 后端 rule 模式只返回当前 slot 答案
- 源码和 `.env.example` 不包含真实 API Key
- API 请求失败或 LLM 输出不合格时回退规则模式

## 统一 Agent Chat API 测试

命令：

```bash
tsx scripts/test-agent-chat.ts
```

结果：

```text
Agent Chat API tests passed.
```

覆盖：

- `/api/agent-chat` 请求结构支持 `caseId + agentId + stage + studentInput`
- Standardized Patient Agent 问“抽烟吗”只回答吸烟，不顺带饮酒、乙肝、糖尿病、输血、子女
- 问“尿是鲜红色吗”只回答尿色，不返回 CT、占位、癌栓、淋巴结、诊断或治疗
- 问“做过CT吗，结果怎么样”不由 Patient Agent 返回 CT 报告细节
- 非患者 Agent 只使用 `unlockedData`，保持 `teacherOnlyData` 阻断
- 源码和前端构建变量不包含真实 DeepSeek API Key

## 构建测试

命令：

```bash
npm run build
```

结果：通过。

构建摘要：

```text
Next.js 15.5.19
Compiled successfully
Generated static pages: 52
/cases/[id]: P001-P012 + HX-ADD-001-HX-ADD-030
```

## 部署

前端 GitHub Pages：

```text
https://niubi1v.github.io/hematuria-training-system/
```

Patient Agent 后端 API：

```text
https://hematuria-training-system.vercel.app/api/patient-reply
```

部署说明：

- GitHub Pages 前端不保存 API Key
- DeepSeek/第三方大模型 Key 只配置在 Vercel 环境变量中
- 前端请求后端 API；后端只传当前 slot 的患者可见答案给 LLM

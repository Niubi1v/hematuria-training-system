# Acceptance Matrix

基线：`codex/hematuria-production-goal`，起点 `5a3ad11`。本文件将主工作树中未跟踪的交接矩阵纳入版本控制，并按当前可重复证据校正状态。状态仅使用：

- **PASS**：当前专项分支已有可重复的本地或远程证据。
- **PENDING**：实现存在，但当前提交缺少所要求的远程、生产或 CI 证据。
- **HUMAN**：必须由具名专家或负责人完成。
- **BLOCKED**：当前架构或权限不满足正式使用条件。

## 强制工程验收

| 领域 | 强制标准 | 当前状态 | 当前证据 |
|---|---|---|---|
| API health | HTTP 200；仅布尔配置、版本和短SHA；CORS受控 | PENDING | `test:health`本地通过；生产`/api/health/`尚无当次证据 |
| 会话初始化 | 本地初始化不等待LLM；生产连续10次成功 | PENDING | `test:session`通过；生产10/10尚无当次证据 |
| 最小化会话 | 不返回完整patient profile或teacher data | PASS | `test:session`、`test:llm` |
| 重连与部署失效 | 单次forceRefresh；保留attempt；不重复evidence；SHA变化丢弃旧session | PASS | `test:ai-recovery`、Playwright 22/22 |
| 超时与错误恢复 | AbortController；404/429/502/503/504有限重试或明确降级 | PASS | `test:api-recovery`、`test:ai-recovery` |
| 离线恢复 | 记录保留，恢复在线后可继续 | PASS | Playwright desktop/mobile 22/22 |
| CORS与限流 | 仅允许配置Origin；公开Agent/session有界限流 | PASS | `test:health`、`test:agent-api-security` |
| 正式模式防绕过 | 客户端改mode不能解锁；独立签名secret；病例必须formalUseAllowed | PASS | `test:training-api` |
| PR CI | PR运行完整质量门禁且不部署Pages | PASS | PR #1 run #42 build全绿；Pages artifact/deploy均按设计跳过 |

## Patient Agent与双语

| 强制标准 | 当前状态 | 当前证据 |
|---|---|---|
| 42例中文结构化问诊覆盖 | PASS | `test:history-matrix`：42×17 |
| 42例英文核心问题覆盖且不返回中文 | PASS | `test:bilingual`：42×6 |
| 复合问题逐项回答、单slot边界、无匹配安全降级 | PASS | `test:patient`、`test:bilingual` |
| 不泄露JSON、prompt、教师字段、诊断、检查、病理、治疗或完整病史 | PASS | `test:patient`、`test:llm`、`test:agent`、bundle scan |
| 每问LLM仅接收当前允许答案，不接收完整profile | PASS | `test:llm` |
| DeepSeek真实中文5次、英文5次 | PENDING | 生产smoke此前`fetch failed`，不得用规则fixture替代 |
| 中英文患者事实语义一致 | BLOCKED/HUMAN | HEM-P0-023：严格确认18条相反陈述，涉及11例；全部待具名医学/双语负责人裁决 |

## 临床数据Agent

| Agent/契约 | 强制标准 | 当前状态 | 当前证据 |
|---|---|---|---|
| Physical Exam | 仅返回选择的examId | PASS | `test:exam-qc`：42例、376项 |
| Laboratory | 按orderId精确返回，不串报告 | PASS | `test:orders` |
| Examination/Imaging/Endoscopy/Pathology | 前置条件、精确映射、去重、未开立不释放 | PASS | `test:orders`、`test:e2e-contract` |
| Diagnostic Reasoning | 仅使用已解锁资料，teacherOnlyData保持阻断 | PASS | `test:agent`、`test:training-api` |
| MDT/Treatment/Perioperative | 阶段边界和独立提交 | PASS/HUMAN | `test:stage-flow`工程通过；医学内容仍待终签 |

## 评分与OSCE

| 强制标准 | 当前状态 | 当前证据 |
|---|---|---|
| 唯一总分为八维360分，版本`360-event-v1`/`reportVersion: 3` | PASS | `test:product`、`test:scoring-v3`、`test:training-api` |
| 标准轨迹360、空轨迹0、正确证据单调、同义表达等价 | PASS | `test:scoring-v3` |
| 小结刷分、无关文本、错误诊断、危险治疗、过度检查和客户端伪造受阻 | PASS | `test:adversarial`、`test:training-api` |
| OSCE中途不显示分数、标准答案或病例特异漏项 | PASS | Playwright与bundle scan |

## TTS

| 强制标准 | 当前状态 | 当前证据 |
|---|---|---|
| 中/英、男/女、年龄与对抗名称选声正确 | PASS | `test:tts` |
| 云TTS失败后同语言浏览器语音；无语音时文本不阻断 | PASS | `test:tts-api`与Playwright |
| Azure四音色真实返回`audio/mpeg` | PENDING | Azure未配置，按目标要求明确SKIP；不得冒充通过 |

## 医学治理

| 强制标准 | 当前状态 | 当前证据 |
|---|---|---|
| 42例、P001–P042及运行映射保持 | PASS | `test:product`、`test:release-v14` |
| 572=153来源追踪+419模拟补充 | PASS/HUMAN | 数量合同通过；153来源核对与419持证终签仍需人工 |
| P0/P1/P2=191/148/80 | PASS | medical review queue合同 |
| 419条不得自动approved | PASS/HUMAN | 当前专家终签0；仍需逐条人工终签 |
| 42例保持needs_revision、formalUseAllowed=false | PASS/HUMAN | 当前42/42保持；病例负责人签署0/42 |
| P003.transfusionHistory、P005.coronaryDisease旧标记修正 | PASS/HUMAN | 导入合同通过；仍待具名来源核对 |
| 151条source辅助标记语义冲突 | HUMAN | `HEM-P0-001`；阻止合并、正式模式和生产发布 |
| 医学隐私 | PASS | schema、repository secret/PII规则扫描 |

## 构建、供应链与远程验收

| 强制标准 | 当前状态 | 当前证据 |
|---|---|---|
| TypeScript、ESLint、完整行为链 | PASS | 当前分支本地通过；`test`已纳入`test:llm`与`test:agent` |
| 69 JSON幂等、生成数据无漂移 | PASS | `test:idempotency`及`git diff -- data` |
| 52页生产构建 | PASS | clean build |
| 静态答案/密钥扫描 | PASS | 24 JS bundle；235仓库文件 |
| Playwright桌面/移动 | PASS | 本地22/22；PR #1 run #42 Playwright E2E success |
| 专项分支普通push | PASS | `origin/codex/hematuria-production-goal` |
| draft PR与GitHub Actions | PASS | PR #1保持Draft；run #42 completed/success |
| Pages/Vercel SHA与live alias | PASS/PENDING | `3190b27` Vercel Preview success；PR Pages部署按设计跳过，正式live alias仍未验证 |
| 生产health、10次session、中文5次、英文5次 | PENDING | 当前环境生产smoke为`fetch failed` |
| 正式教师鉴权、RCT数据库、正式OSCE | BLOCKED/HUMAN | 需要安全后端、approved病例及具名医学签署 |

## 当前结论

工程本地专项回归已覆盖矩阵核心路径，但强制验收尚未完成：`HEM-P0-001`需要医学裁决；PR/CI、当前SHA预览/部署状态和生产10+5+5真实冒烟缺少证据；Azure按未配置状态为SKIP。任何这些项目不得被登记为PASS或据此宣称生产验收完成。

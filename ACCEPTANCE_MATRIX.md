# Acceptance Matrix

基线：`codex/hematuria-production-goal`，起点 `5a3ad11`。本文件将主工作树中未跟踪的交接矩阵纳入版本控制，并按当前可重复证据校正状态。状态仅使用：

- **PASS**：当前专项分支已有可重复的本地或远程证据。
- **PENDING**：实现存在，但当前提交缺少所要求的远程、生产或 CI 证据。
- **HUMAN**：必须由具名专家或负责人完成。
- **BLOCKED**：当前架构或权限不满足正式使用条件。

## 强制工程验收

| 领域 | 强制标准 | 当前状态 | 当前证据 |
|---|---|---|---|
| API health | HTTP 200；仅布尔配置、版本和短SHA；CORS受控 | PENDING | `test:health`本地通过；`10fe60d` Preview匿名health返回Vercel保护HTML而非应用JSON；生产`/api/health/`尚无当次证据 |
| 会话初始化 | 本地初始化不等待LLM；生产连续10次成功 | PENDING | `test:session`通过；`10fe60d` Preview页面进入降级模式，真实Preview/生产10/10尚无当次证据 |
| 最小化会话 | 不返回完整patient profile或teacher data | PASS | `test:session`、`test:llm` |
| 重连与部署失效 | 单次forceRefresh；保留attempt；不重复evidence；SHA变化丢弃旧session | PASS | `test:ai-recovery`、Playwright 22/22 |
| 超时与错误恢复 | AbortController；404/429/502/503/504有限重试或明确降级 | PASS | `test:api-recovery`、`test:ai-recovery` |
| 初始化失败提示收敛 | 同时最多一个主要连接提示；保留明确重连操作 | PASS | HEM-P1-024；run `29225349342`的desktop/mobile Playwright与完整build success |
| 离线恢复 | 记录保留，恢复在线后可继续 | PASS | Playwright desktop/mobile 22/22 |
| CORS与限流 | 仅允许配置Origin；公开Agent/session有界限流 | PASS | `test:health`、`test:agent-api-security` |
| 正式模式防绕过 | 客户端改mode不能解锁；独立签名secret；病例必须formalUseAllowed | PASS | `test:training-api` |
| PR CI | PR运行完整质量门禁且不部署Pages | PASS | 证据提交`30b0d45`：run `29289645684` build全绿；Pages deploy按PR规则跳过 |

## Patient Agent与双语

| 强制标准 | 当前状态 | 当前证据 |
|---|---|---|
| 42例中文结构化问诊覆盖 | PASS | `test:history-matrix`：42×17 |
| 42例英文核心问题覆盖且不返回中文 | PASS | `test:bilingual`：42×6 |
| 复合问题逐项回答、单slot边界、无匹配安全降级 | PASS | `test:patient`、`test:bilingual` |
| 不泄露JSON、prompt、教师字段、诊断、检查、病理、治疗或完整病史 | PASS | `test:patient`、`test:llm`、`test:agent`、bundle scan |
| 每问LLM仅接收当前允许答案，不接收完整profile | PASS | `test:llm` |
| DeepSeek真实中文5次、英文5次 | PENDING | 生产smoke此前`fetch failed`，不得用规则fixture替代 |
| 中英文患者事实语义一致 | BLOCKED/HUMAN | HEM-P0-023：18条已做运行时/评分隔离并生成裁决包；医学真值全部待具名医学/双语负责人裁决 |

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
| 云音频缓存不串文本/Origin/音色/语速/音调，且有TTL和容量上限 | PASS | `96fcf80`：固定旧FNV碰撞先失败；run `29291035332` Node 22专项、Playwright和build全绿 |
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
| TypeScript、ESLint、完整行为链 | PASS | 证据提交`30b0d45`：run `29289645684` Unit/behavior、Typecheck、Lint均success |
| 69 JSON幂等、生成数据无漂移 | PASS | run `29289645684`验证69 JSON、75个受控输出幂等及最终clean gate；`data/**`零差异 |
| 52页生产构建 | PASS | run `29289645684`静态生成52/52 |
| 静态答案/密钥扫描 | PASS | run `29289645684`：294文件repository scan、25个JS bundle scan success |
| 当前文本、Office归档、二进制可见元数据与Git文本历史密钥扫描 | PASS | `04c2a0b` / run `29294906265`以`fetch-depth: 0`执行scanner专项和仓库扫描并success；浅仓库fixture fail-closed；历史压缩二进制/OCR仍按已知限制保留 |
| Playwright桌面/移动 | LOCAL PASS / CI PENDING | HEM-P1-027结构修复后本地desktop/mobile 46/46（69.3秒），含axe critical/serious=0；最新远程Node22仍待push后CI |
| 专项分支普通push | PASS | `origin/codex/hematuria-production-goal` |
| draft PR与GitHub Actions | PASS（当前工程候选） | PR #1保持Draft；HEAD `04c2a0b`的run `29294906265` completed/success，Vercel Deployment与Preview Comments success，Pages deploy按PR策略skipped；不代表真实AI或生产发布通过 |
| Pages/Vercel SHA与live alias | PASS/PENDING | `30b0d45` Vercel Deployment与Preview Comments success；PR Pages部署按设计跳过，正式live alias仍未验证 |
| 生产health、10次session、中文5次、英文5次 | PENDING | 当前环境生产smoke为`fetch failed` |
| 正式教师鉴权、RCT数据库、正式OSCE | BLOCKED/HUMAN | 需要安全后端、approved病例及具名医学签署 |

## 当前结论

工程本地专项回归、当前SHA PR Actions与Vercel Preview均已通过，但强制验收尚未完成：`HEM-P0-001`及`HEM-P0-023`需要医学裁决；受保护Preview真实AI/日志/自然度/P95、生产10+5+5、正式live alias仍缺证据；Azure按未配置状态为SKIP。任何这些项目不得被登记为PASS或据此宣称生产验收完成。

## UI集成增量（远程已确认）

| 强制标准 | 当前状态 | 当前证据 |
|---|---|---|
| UI提交不覆盖Production后续安全修复 | PASS | merge-base=`74c140f`，三提交逐项cherry-pick且关键安全文件hash不变 |
| 1280桌面、360/390移动布局 | LOCAL PASS / CI PENDING | HEM-P1-027失败基线为360×800中文遮挡7px；结构修复后360×800、390×844、1280×720、1440×900中英文矩阵2/2通过，既有多行输入2/2及20轮滚动2/2通过；待远程CI/独立QA |
| Enter/Shift+Enter、滚动保持、单一状态提示 | PASS | run `29232093193`集成后Playwright通过 |
| 日志失败后的幂等手动同步 | PASS | HEM-P1-025；run `29232093193` desktop/mobile通过 |
| TypeScript、ESLint、行为、构建、扫描 | PASS | 本地32/32、52/52、25 JS、281文件；退出码均0 |
| 69 JSON幂等与desktop/mobile Playwright | PASS | run `29232093193`：69 JSON与Playwright 40/40；本机环境限制已由Linux CI补证 |

## 性能遥测增量（工程门禁已远程确认）

| 强制标准 | 当前状态 | 当前证据 |
|---|---|---|
| session/provider/history/score分段计时 | LOCAL PASS | 白名单`Server-Timing`合同与API集成测试通过；响应不含内容、签名、token或密钥 |
| 完整回答耗时 | LOCAL PASS | production smoke已采集端到端与服务端app/provider指标 |
| 首Token耗时 | LOCAL PASS | DeepSeek兼容SSE聚合、首个非空token计时、非流式显式兼容及非泄露API合同通过；真实Preview样本仍归下一行BLOCKED |
| Preview真实P95 | BLOCKED | 当前`10fe60d`页面可达但初始化后为降级模式；匿名health由Vercel保护页截获，真实AI/签名/P95仍无可审计样本 |
| TypeScript、行为、构建、扫描 | LOCAL PASS | 当前33项、52/52、25 JS、284文件，均exit 0 |
| ESLint | PASS | run `29234298382`的Node 22 Lint步骤success；本机Node 24不兼容不再是证据缺口 |

- SSE工程增量：失败基线证明旧实现会把`text/event-stream`误交给JSON解析；修复HEAD `d2c2eb0`的run `29236606930`最终success，含33项行为、TypeScript、Lint、Playwright 40/40、52页构建和扫描；Vercel两项通过。真实Preview延迟样本仍按表保持BLOCKED。

- 首轮远程补证：run `29234298382`的TypeScript与ESLint均PASS；Playwright mobile英文切换竞态导致39/40，当时保持PENDING直到下一轮确认。
- 最终远程补证：修复HEAD `f052d7e`的run `29235062395` build PASS、Playwright 40/40；Vercel Deployment与Preview Comments PASS。真实Preview P95与首Token仍按上表保持BLOCKED。

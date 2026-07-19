# Acceptance Matrix

基线：`codex/hematuria-production-goal`，起点`5a3ad11`；最新完整远程工程门禁HEAD `3a16f9314d1b3cf50e30bc41dcfeaf19f4fa77a8`，已验收应用树`51f9c6fc8543ac0b6a5907fc65974cd72027f67b`。本文件按当前可重复证据校正状态；后续纯文档提交不冒充新的应用验收。状态仅使用：

- **PASS**：当前专项分支已有可重复的本地或远程证据。
- **PENDING**：实现存在，但当前提交缺少所要求的远程、生产或 CI 证据。
- **HUMAN**：必须由具名专家或负责人完成。
- **BLOCKED**：当前架构或权限不满足正式使用条件。

## 强制工程验收

| 领域 | 强制标准 | 当前状态 | 当前证据 |
|---|---|---|---|
| API health | HTTP 200；仅非敏感配置状态/命名类型、版本和SHA；CORS受控 | PASS（Preview）/PENDING（Production） | `51f9c6f` Preview health HTTP 200并回报完整deployment SHA；训练签名与durable store均为true，凭据仅显示`vercel_kv_rest`类型；生产health仍无当次证据 |
| 会话初始化 | 初始化不等待LLM；连续10次成功；P95≤3秒 | PASS（Preview）/PENDING（Production） | `51f9c6f` Preview P001–P010一次性10/10，端到端P95=1304ms、服务端session P95=9ms；Production仍待授权后验收 |
| 最小化会话 | 不返回完整patient profile或teacher data | PASS | `test:session`、`test:llm` |
| 重连与部署失效 | 单次forceRefresh；保留attempt；不重复evidence；SHA变化丢弃旧session | PASS | `test:ai-recovery`、Playwright 22/22 |
| 超时与错误恢复 | AbortController；404/429/502/503/504有限重试或明确降级 | PASS | `test:api-recovery`、`test:ai-recovery` |
| 初始化失败提示收敛 | 同时最多一个主要连接提示；保留明确重连操作 | PASS | HEM-P1-024；run `29225349342`的desktop/mobile Playwright与完整build success |
| 离线恢复 | 记录保留，恢复在线后可继续 | PASS | Playwright desktop/mobile 22/22 |
| CORS与限流 | 仅允许配置Origin；公开Agent/session有界限流 | PASS | `test:health`、`test:agent-api-security` |
| 正式模式防绕过 | 客户端改mode不能解锁；独立签名secret；病例必须formalUseAllowed | PASS | `test:training-api` |
| PR CI | PR运行完整质量门禁且不部署Pages | PASS | 最终文档HEAD `3a16f93`的run `29547532678` completed/success；Playwright、82页build、bundle、secret和clean gate通过，Pages deploy按PR规则跳过 |

## Patient Agent与双语

| 强制标准 | 当前状态 | 当前证据 |
|---|---|---|
| 42例中文结构化问诊覆盖 | PASS | `test:history-matrix`：42×17 |
| 42例英文核心问题覆盖且不返回中文 | PASS | `test:bilingual`：42×6 |
| 复合问题逐项回答、单slot边界、无匹配安全降级 | PASS | `test:patient`、`test:bilingual` |
| 不泄露JSON、prompt、教师字段、诊断、检查、病理、治疗或完整病史 | PASS | `test:patient`、`test:llm`、`test:agent`、bundle scan |
| 每问LLM仅接收当前允许答案，不接收完整profile | PASS | `test:llm` |
| DeepSeek真实中文5次、英文5次 | PASS（Preview）/PENDING（Production） | `51f9c6f`受保护Preview：中文5/5、英文5/5均`live_ai`/DeepSeek/非fallback，history-log各5/5；Production仍待授权后验收 |
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
| TypeScript、ESLint、完整行为链 | PASS | run `29547532678`在Node 22.14下Unit/behavior、Typecheck、Lint均success |
| 69 JSON幂等、生成数据无漂移 | PASS | run `29547532678`验证幂等生成、提交基线及最终clean gate；`data/**`零差异 |
| 82页生产构建 | PASS | HEAD `3a16f93` / run `29547532678`静态生成82/82 |
| 静态答案/密钥扫描 | PASS | run `29547532678`的repository与bundle扫描success；本地323个tracked/candidate文件扫描exit 0 |
| 当前文本、Office归档、二进制可见元数据与Git文本历史密钥扫描 | PASS | `04c2a0b` / run `29294906265`以`fetch-depth: 0`执行scanner专项和仓库扫描并success；浅仓库fixture fail-closed；历史压缩二进制/OCR仍按已知限制保留 |
| Playwright桌面/移动 | PASS | run `29547532678`在Node 22.14、2 workers下完整72项Playwright步骤8分06秒success；本地明细为70 passed、2个按项目隔离的skip、0 failed；四视口axe继续要求critical/serious=0 |
| 42例中英文完整七阶段工程流程 | PASS | 服务端真实签名/阶段锁矩阵84条旅程、588次阶段提交、84份360分报告；桌面浏览器42例×中英文84条完整旅程和移动端P001完整旅程已纳入最终Node 22 Playwright门禁并通过。该项不替代医学正确性或专家审核 |
| 静态病例路由与无效ID | PASS | 当前`out`在root及`/hematuria-training-system` basePath下P001/P013/P042均HTTP 200、P999均404；basePath外路径404。公共路由合同仍覆盖42个display ID |
| 专项分支普通push | PASS | `origin/codex/hematuria-production-goal` |
| draft PR与GitHub Actions | PASS | PR #1保持Open/Draft；HEAD `3a16f93`的run `29547532678` completed/success，Vercel deployment与Preview Comments success，Pages deploy按PR策略skipped |
| Pages/Vercel SHA与live alias | PASS（Preview branch alias）/PENDING（正式live alias） | Preview health精确回报应用SHA `51f9c6fc8543ac0b6a5907fc65974cd72027f67b`，末端文档HEAD `3a16f93`的Vercel状态success；公开Pages仍为`main@5a3ad119`，正式Production alias未部署、未验证 |
| 生产health、10次session、中文5次、英文5次 | PENDING | Preview已补齐10+5+5；Production需生产权限和正式部署，当前不得以Preview替代 |
| 正式教师鉴权、RCT数据库、正式OSCE | BLOCKED/HUMAN | 需要安全后端、approved病例及具名医学签署 |

## 当前结论

当前工程专项、42例双语完整七阶段、最终Draft PR Node 22 Actions与受保护Vercel Preview的health、10次session、中文5次、英文5次、日志同步和P95均已有真实证据；不存在仍待push或待CI的P0/P1工程候选。强制生产验收仍未完成：`HEM-P0-001`及`HEM-P0-023`需要具名医学裁决；Production 10+5+5、正式live alias、合并后Pages新部署、真实设备软键盘/safe-area和人工自然度终验仍缺证据；Azure按未配置状态为SKIP。

## UI集成增量（远程已确认）

| 强制标准 | 当前状态 | 当前证据 |
|---|---|---|
| UI提交不覆盖Production后续安全修复 | PASS | merge-base=`74c140f`，三提交逐项cherry-pick且关键安全文件hash不变 |
| 1280桌面、360/390移动布局 | PASS / INDEPENDENT QA PENDING | HEM-P1-027失败基线为360×800中文遮挡7px；结构修复后四视口中英文矩阵、既有多行输入及20轮滚动通过，HEAD `4fed076`的run `29309939497`远程Node22门禁success；真实360/390设备软键盘与safe-area仍待长期QA独立复测 |
| Enter/Shift+Enter、滚动保持、单一状态提示 | PASS | run `29232093193`集成后Playwright通过 |
| 日志失败后的幂等手动同步 | PASS | HEM-P1-025；run `29232093193` desktop/mobile通过 |
| TypeScript、ESLint、行为、构建、扫描 | PASS | 本地32/32、52/52、25 JS、281文件；退出码均0 |
| 69 JSON幂等与desktop/mobile Playwright | PASS | run `29232093193`：69 JSON与Playwright 40/40；本机环境限制已由Linux CI补证 |

## 性能遥测增量（工程门禁已远程确认）

| 强制标准 | 当前状态 | 当前证据 |
|---|---|---|
| session/provider/history/score分段计时 | LOCAL PASS | 白名单`Server-Timing`合同与API集成测试通过；响应不含内容、签名、token或密钥 |
| 完整回答耗时 | LOCAL PASS | production smoke已采集端到端与服务端app/provider指标 |
| 首Token耗时 | PASS（Preview） | `51f9c6f` Preview中文5次P95=976ms、英文5次P95=1028ms；标准`Server-Timing`本地保留，Vercel通过同值白名单`X-Hematuria-Timing`补证 |
| Preview真实P95 | PASS（10+5+5专项）/P2网络观察 | session端到端P95=1304ms；中文回答/provider P95=1560/1191ms；英文回答/provider P95=1662/1279ms；另有历史Preview导航间歇断连观察项，不伪写为Production网络稳定性通过 |
| TypeScript、行为、构建、扫描 | LOCAL PASS | 当前33项、52/52、25 JS、284文件，均exit 0 |
| ESLint | PASS | run `29234298382`的Node 22 Lint步骤success；本机Node 24不兼容不再是证据缺口 |

- SSE工程增量：失败基线证明旧实现会把`text/event-stream`误交给JSON解析；修复HEAD `d2c2eb0`的run `29236606930`最终success，含33项行为、TypeScript、Lint、Playwright 40/40、52页构建和扫描；Vercel两项通过。真实Preview延迟样本仍按表保持BLOCKED。

- 首轮远程补证：run `29234298382`的TypeScript与ESLint均PASS；Playwright mobile英文切换竞态导致39/40，当时保持PENDING直到下一轮确认。
- 最终远程补证：修复HEAD `f052d7e`的run `29235062395` build PASS、Playwright 40/40；Vercel Deployment与Preview Comments PASS。真实Preview P95与首Token仍按上表保持BLOCKED。

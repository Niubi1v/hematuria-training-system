# 探索式 QA 缺陷记录

状态：持续更新。已有主 Goal 缺陷沿用原 ID，不重复宣称通过。

## 外部/医学阻塞

| 缺陷 ID | 级别 | 状态 | 范围 | 所需动作 |
| --- | --- | --- | --- | --- |
| HEM-P0-001 | P0 | BLOCKED | 151 条 source 辅助来源语义 | 具名医学负责人裁决与受控迁移 |
| HEM-P0-023 | P0 | BLOCKED | 18 条双语医学极性冲突 | 具名医学/双语专家逐条裁决 |
| HEM-P0-018 | P0 | RESOLVED_PREVIEW_QA | Preview AI、日志同步与来源体验 | `3a16f931` 上中英各 10/10、单 session 20/20 与 history-log 200 已验证；完整问答不落盘 |
| HEM-P1-019 | P1 | RESOLVED_PREVIEW_QA | Preview 变量作用域 | health 仅以非敏感布尔状态确认 Training State / Durable Store 均配置；未读取值 |
| HEM-P1-020 | P1 | RESOLVED_PREVIEW_QA | 受保护 Preview API 可审计性 | fail-closed runner 15/15；同源注入、脱敏摘要及凭据字节扫描通过，专用输出安全删除 |
| HEM-P1-021 | P1 | BLOCKED_MEASUREMENT（DOM子项已测） | 非流式provider真正首Token | 精确Preview 5/5已得到完整患者回答DOM首现P50/P95，但该指标不是provider TTFT；真正首Token继续阻塞，不以DOM计时关闭 |

## 新发现缺陷模板

每个新问题必须记录：缺陷 ID、P0/P1/P2、页面/路径、病例、语言、viewport、操作步骤、预期、实际、复现次数、AI 来源、状态时间线、HTTP 状态/耗时、console/network 摘要、截图/trace/录像、建议方向和医学裁决需求。首轮执行前不预造缺陷或状态。

## HEM-P1-027：360×800 sticky 问诊输入遮挡患者开场白

- 级别/状态：P1，RESOLVED_ENGINEERING / PASS_EMULATION；Production `ff1a932` 的自动浏览器回归已消除遮挡。真实手机软键盘与 safe-area 仍为 `BLOCKED_REAL_DEVICE`，不得据此宣称真机通过。
- 页面/路径：训练工作台 `/cases/P001/`；病例 P001；中文；viewport `360×800`。
- 操作步骤：清空浏览器上下文 → 打开 P001 → 选择中文 → 保持页面首屏且不滚动 → 比较患者开场文字与 sticky 输入面板的几何边界。
- 预期：输入面板顶边不早于开场文字底边，患者开场白完整可见。
- 实际：输入面板顶边 `y=654`；稳定复跑时开场文字底边 `y=673`，重叠 19px；截图中末行被输入面板覆盖。`390×844` 同断言通过。
- 复现：`360×800` 自动化 6/6；其中 `--repeat-each=3` 为 3/3。未在 390×844 复现。
- AI 来源：N/A；页面初始公开开场白，静态同 SHA 构建；不涉及真实 AI、fallback 或医学裁决。
- 时间线：document 200 → 客户端渲染 → 中文状态 → 几何断言失败；没有状态闪烁依赖。
- HTTP/console/network：页面 200；console error 0。静态服务下 `/api/health/` 不可用属于已知本地 API 边界，与遮挡无因果关系。
- 最小提交证据：`screenshots/training-p001-zh-viewport-360x800.png`、`screenshots/mobile-opening-composer-no-overlap-390x844.png`、`traces/mobile-opening-composer-overlap-360x800.zip`。自动 full-page 失败截图、录像与 HTML 报告仅本机保留，详见 `artifacts/exploratory-qa/EVIDENCE_INDEX.md`。
- 建议方向：为移动 chat scroller 增加与 sticky composer 高度一致的底部安全区，或在 360px 宽度降低 composer/标题占高；保留输入首屏可见与 44px 触控目标，并用 360/390 几何断言回归。
- 医学专家裁决：否。
- `96fcf80` 受影响回归：`360×800` 当前 `opening bottom=661`、`composer y=654`，仍遮挡 7px（1/1）；`390×844` 1/1 通过。旧基线的 19px、6/6 及代表截图继续保留，说明新基线缩小了遮挡但没有满足断言，状态不变。
- `ff1a932` 修复回归：中文/英文 × `360×800`、`390×844`、`1280×720`、`1440×900` 共 16/16 `PASS_EMULATION`。开场白完整可见；输入区聚焦后仍在视口内；8 轮后手动上翻，再到达第 9 条消息时未被强制拉到底部，“有新消息”入口出现并可回到底部；最后一条答复底边不超过 composer 顶边；无横向滚动或异常移动端底部 spacer。旧 19px/6 次失败证据保留为历史复现，不删除也不改写。

## HEM-P2-028：阶段提交按钮快速双击产生两次独立反馈请求与重复时间线

- 级别/状态：P2，RESOLVED_LOCAL_QA；Production `8e7d148` 的本地 desktop/mobile 与探索断言均稳定为单请求、单 request ID、单时间线事件。当前 SHA 的真实 Preview provider call 仍因 `SECURITY_BLOCKED` 未复测。
- 页面/路径：训练工作台 `/cases/P001/`；病例 P001；中文；viewport `1440×900`。
- 操作步骤：全新浏览器上下文 → 打开 P001 → 选择中文 → 填写脱敏 fixture 病史小结 → 在阶段反馈响应延迟 150ms 时，以同一事件循环连续调用两次“提交本阶段”按钮 → 等待请求队列和本地自动保存完成 → 比较反馈请求数、request ID 去重数和 `timeline[type=submit]` 数量。
- 预期：一次用户双击最多形成 1 个阶段反馈请求、1 个稳定幂等 request ID 和 1 条提交时间线；按钮在请求进行中不可重复触发。
- 实际：稳定得到 2 个 `stage-feedback` 请求、2 个不同 request ID 和 2 条内容相同的提交时间线。失败截图右侧时间线显示两条同阶段“提交阶段：30/50”。
- 复现：自动化 6/6；包含一次首次发现、`--repeat-each=3` 的 3/3，以及两次最小证据复跑。每次观测均为 `2 requests / 2 unique IDs / 2 submit events`。
- AI 来源：N/A；`training-action` 为 `deterministic_fixture_not_real_ai`，不调用患者 AI，不判断医学内容或评分正确性。
- 状态变化时间线：document 200 → fixture attempt 初始化 → 同一按钮同步触发两次 → 客户端队列串行发送两个不同 request ID → 两次 200 响应 → 两次 `addTimeline("submit")` → 几何与内容稳定的重复记录。
- HTTP/耗时：页面 200（3ms）；两次被测 `POST /api/training-action/` 均为 200，在 150ms fixture 延迟下各约 155ms。network 摘要只保留方法、pathname、状态、资源类型和耗时。
- console/network：console 仅 2 条 `ai_connection_transition` info，0 warning/error；network 未保存 header、query 或 body。服务端源码审计确认同阶段重提交会删除并重建该阶段验证事件，故当前没有分数翻倍证据，但客户端使用两个不同 request ID，未利用幂等键合并同一用户动作。
- 最小提交证据：`screenshots/stage-submit-double-click-1440x900-failure.png`（159,310 字节）与 `traces/stage-submit-double-click-1440x900.zip`（12,363 字节，关闭截图帧和源码嵌入）。失败视频、HTML、console/network JSON 和重复 test-results 仅本机保留。
- 建议方向：增加阶段提交 in-flight 状态并在请求完成前禁用按钮；一次用户动作生成并复用稳定 request ID；状态层按 stage/request ID 去重提交时间线。回归应覆盖阶段 1–6、终末报告按钮、桌面/移动端、双击/Enter 和失败重试，且不得删除或放宽当前断言。
- 医学专家裁决：否。
- `96fcf80` 受影响回归：`1440×900` 1/1 仍为 `2 feedback requests / 2 unique request IDs / 2 submit events`，失败帧和关闭截图/源码嵌入的最小 trace 已刷新。
- `ff1a932` 继续回归：`1440×900` 1/1 仍为 `2 feedback requests / 2 unique request IDs / 2 submit events`；失败断言保持期望 `1/1/1`，没有删除或放宽。最小截图与 trace 已刷新到本轮基线。
- `8e7d148` 修复回归：完整 Playwright desktop/mobile 的快速阶段双击均通过；探索套件 `1440×900` 1/1 精确观测 `1 feedback request / 1 unique request ID / 1 submit event`。旧失败截图与最小 trace 保留，不用新 PASS trace 覆盖历史证据。

## HEM-P1-029：英文 Patient Session 开场白仍为中文

- 级别/状态：P1，RESOLVED_LOCAL_QA；Production `ff1a932` 的规则链路与四视口页面回归均不再复现。真实 DeepSeek 仍未验证。
- 页面/路径：公开 `POST /api/session/init/` 与训练工作台 `/cases/P001/`；全 42 例；英文；viewport `1440×900`、`1280×720`、`390×844`、`360×800`。
- 操作步骤：全新浏览器上下文打开病例 → 等待 health/session 初始化 → 点击 `English` → 等待请求体 `language=en` 的 session 响应 → 比较响应开场白与页面首条患者消息的语言。
- 预期：英文 session 开场白不含 CJK，页面首条患者消息为英文。
- 实际：session 响应和页面均显示中文患者开场白；页面其余标题、按钮与可见病例信息已经切为英文，语言错配清晰可见。
- 复现：42 例规则链路矩阵在两次逐字同构结果中均为 42/42；公开 handler 烟测 2/2；四固定 viewport 浏览器 4/4，1440×900 另有重复复跑。
- AI 来源：`local-simulation`/本地 rule；AI 开关在测试进程中关闭，`providerCalls=0`，不得记作真实 DeepSeek。
- 状态变化时间线：document 200 → health 200 → 中文 session 200 → 点击 English → 英文 session 200 → `idle → initializing → degraded` → 中文开场覆盖英文本地占位。
- HTTP/console/network：页面与静态资源 200；英文 `POST /api/session/init/` 200，代表性本地耗时约 15ms；console 仅 `ai_connection_transition` info，0 warning/error；network 不含 header/query/body。
- 证据：`screenshots/live-english-opening-language-1440x900-failure.png`（最小代表帧）；其余三 viewport 截图、四份 trace、console/network 与 HTML 报告本机保留；聚合矩阵见 `reports/patient-session-matrix-summary.json`。
- 建议方向：按 `language` 构造并缓存开场白，英文使用 patient-facing English chief complaint；对 session cache 的 `caseId/language/mode` 继续保持隔离，并用 42 例双语初始化矩阵回归。
- 医学专家裁决：否；仅判断输出语言，不裁决开场内容的医学真值。
- `96fcf80` 受影响回归：为避免 HEM-P1-034 遮蔽本缺陷，浏览器先保存英文偏好再直接进入 P001；有效英文 attempt/session 均为 200，但开场仍含 CJK，四 viewport 4/4。中文中途切换英文的 401 单独登记 HEM-P1-034。
- `ff1a932` 修复回归：42/42 英文 session 开场均不含 CJK；四固定 viewport 的英文开场 4/4 `PASS_EMULATION`；`providerCalls=0`。该结论只关闭本地确定性语言回落，不代表真实 provider 的英文自然度通过。

## HEM-P1-030：Patient Session 病史路由不完整或错配

- 级别/状态：P1，REGRESSED_LOCAL_QA；Production `8e7d148` 曾关闭，但 `3a16f931` 的严格 v2 矩阵发现 1 个工程路由失败组；不安全来源仍独立 `BLOCKED_SOURCE_REVISION`。
- 页面/路径：`server/patientSession.js` 生产规则链路及公开 `POST /api/agent-chat/`；42 例；中英文；N/A（API/契约）。
- 操作步骤：每例初始化中英文 session → 对 37 canonical slot 各发送 2 条固定自然问法 → 要求单项问题仅命中预期逻辑 slot → 对同一请求立即重放 → 用公开 handler 对代表性 `prior_care`、中文肿瘤史和中文膀胱镜史复核。
- 预期：37 个 slot 的主问法和固定改写均能到达相应病史事实；询问“既往肿瘤史/做过膀胱镜”不应被当成当前诊断或检查结果请求。
- 实际：本缺陷族共 378/6,216 个路由探针不匹配：`prior_care` 168/168 走通用 fallback；中文肿瘤史 42 次被 `diagnosis_boundary` 拦截，英文 `previous cancer` 改写 42 次不可达；中文膀胱镜史 42 次被 `report_boundary` 拦截、中文“导过尿”改写 42 次不可达；英文 `unable to pass urine` 42 次未匹配 retention。84 个错误边界实例是路由失败的子集，不重复计为 462。
- 复现：完整矩阵最终配置连续 2/2 得到相同 127 个失败分组和相同计数；公开 handler 代表性烟测连续 2/2，均为 HTTP 200 但 `matchedSlotIds=[]`。
- AI 来源：本地 rule，无 provider 调用；fallback/mock 不记作真实 AI。
- 状态变化时间线：session 初始化 → history 问题进入 diagnosis/report 边界或无 matcher → 固定安全/通用 fallback → API 200 → 该病史 slot 未收集。
- HTTP/console/network：handler 层 13 项烟测均完成，四组病例/语言各用独立 session，`providerCalls=0`；公开响应未暴露 profile/teacherOnlyData，`revealedDataKeys=[]` 与 blockedDataKeys envelope 正常，问题仅在路由/边界。
- 证据：`reports/patient-session-matrix-summary.json`、`reports/patient-api-adapter-smoke-summary.json`；复现脚本 `tests/exploratory/patient-session-matrix.mjs` 与 `patient-api-adapter-smoke.mjs`。
- 建议方向：使 `server/canonicalFacts.js`/`structuredFacts.js` 与 37-slot 前端定义同源；先识别明确的“既往史/做过”上下文，再应用当前诊断/报告边界；补齐 `prior_care` 与常见中英文改写的精确回归。
- 医学专家裁决：否；只判断路由可达性和边界分类，不判断病例是否实际存在相关病史。
- `8e7d148` 修复回归：6,216/6,216 路由、6,216/6,216 重放与 168/168 边界通过；公开 adapter 17/17。P001 三个不安全来源继续精确 fail-closed、空 facts/slots，不把来源修订阻塞误报为路由失败。
- `3a16f931` 回归：v2 矩阵明确接受 711 个严格 governed unknown 与 18 个 unsafe governed unknown，144/144 冲突隔离一致；6,216 路由与 6,216 重放只剩 42 个失败、1 个失败组。英文 `Have you had a urinary procedure?` 在全 42 例实际匹配 `triggers`，预期为 `PAST_URINARY_PROCEDURE`；同组公开 adapter 17/17 仍通过，`providerCalls=0`。
- 复现/证据：42/42；`reports/patient-session-matrix-summary.json` 与 QA-only `tests/exploratory/patient-session-matrix.mjs`。聚合文件不含回答正文、session 或凭据。
- 建议方向：收紧 `triggers` 英文同义词的泛化边界，并为完整短语 `urinary procedure` 增加泌尿操作史优先级；保留 governed unknown、来源阻断与冲突 quarantine 强断言。医学专家裁决：否。
- `657ba5d` 状态审计差异：Production `DEFECT_LOG.md` 权威索引依据15-intent/190-alias矩阵将 HEM-P1-030列为关闭，但该提交没有运行时代码变化，也未覆盖上述37-slot最小问法。独立QA失败证据优先保持 `REGRESSED_LOCAL_QA`，请求主 Goal 重新打开该工程项；不得用纯文档状态覆盖42/42复现。

## HEM-P1-031：英文特异疼痛问法额外命中通用 pain 并扩大医学冲突隔离

- 级别/状态：P1，RESOLVED_LOCAL_QA；Production `8e7d148` 的特异疼痛问法不再扩大通用 pain 或冲突隔离范围。
- 页面/路径：`server/canonicalFacts.js`/`patientSession.js` 与公开 `POST /api/agent-chat/`；42 例；以英文为主；N/A（API/契约）。
- 操作步骤：逐例发送 flank pain、radiating pain 和 colicky pain 的固定原子问法及改写 → 将实际 `matchedSlotIds` 与唯一允许 slot 集合比较 → 对 HEM-P0-023 中 5 个 pain 冲突病例单独核对 quarantine 原因。
- 预期：特异疼痛问法只命中特异 slot；冲突隔离只作用于实际被问到的冲突 fact。
- 实际：本缺陷族共 252 个路由错配实例（英文 flank 84、英文 radiating 84、中文放射痛改写 42、英文 colicky pain 改写 42）。非冲突病例返回额外 `pain`；冲突病例因额外命中 `pain` 而把整个特异问题隔离。当前重复矩阵中直接 18 条冲突应产生 144 次 quarantine 日志，实际为 204，额外 60 次全部来自这些过匹配问法。
- 复现：完整矩阵最终配置连续 2/2 计数一致；公开 handler 对 P002 英文 `flank pain` 连续 2/2 返回 `flank_pain + pain` 和 `compound_question_preserves_all_facts`。
- AI 来源：本地 rule，`providerCalls=0`；未裁决 18 条冲突的医学内容。
- 状态变化时间线：特异问句 → 多个正则同时命中 → 非冲突时 compound fallback，冲突时 pain quarantine → 原问题无法按最小披露作答。
- HTTP/console/network：代表 handler 返回 HTTP 200；公开安全 envelope 正常；问题体现在 slot 集合和错误扩大的 quarantine。
- 证据：同 HEM-P1-030 的两个聚合 JSON 和矩阵脚本；报告不保存完整回答。
- 建议方向：按特异性/最长匹配确定 slot，命中 `flank_pain`、`radiating_pain`、`renal_colic` 后抑制通用 `pain`；quarantine 应只由最终允许 slot 集合触发。
- 医学专家裁决：否；HEM-P0-023 仍保持 BLOCKED，本缺陷只修复匹配范围。
- `8e7d148` 修复回归：完整矩阵零路由失败，直接冲突隔离期望/观察均为 144/144，未再出现旧 204 次扩大隔离；HEM-P0-023 医学真值仍不裁决。

## HEM-P1-032：非空已匹配事实被长度保护直接降级为通用“不清楚”

- 级别/状态：P1，RESOLVED_LOCAL_QA；Production `8e7d148` 的 42 例双语规则矩阵不再发现非空已匹配事实被错误压为通用 unknown。
- 页面/路径：`server/patientSession.js`、公开 `POST /api/agent-chat/`；42 例；中英文；N/A（API/契约）。
- 操作步骤：逐例逐 slot 提问 → 仅在来源双语字段非空且本身不是“不清楚/unknown”时检查结果 → 若路由精确命中但回复等于固定通用 unknown，则记录技术性传输丢失；不比较来源句子的医学正确性。
- 预期：格式/长度保护应安全压缩已匹配事实，不能无条件抹成未知。
- 实际：191 个唯一 `case × slot × language` 单元被压成通用 unknown，共 365 个固定改写探针实例；涉及英文 glomerular features 41 例、occupation exposure 40 例、triggers 40 例及另外 10 个 slot-language 组。公开 handler 中 P001 英文泡沫尿代表项稳定复现。
- 复现：完整矩阵最终配置连续 2/2 计数和分组完全一致；公开 handler 代表项连续 2/2。
- AI 来源：本地 rule；无 provider 调用，不评价真实 AI 的改写能力。
- 状态变化时间线：事实精确命中 → `conciseDeterministicReply` 检测长度/摘要标记 → 返回固定 unknown → API 200，仍携带 matched slot/source。
- HTTP/console/network：公开 handler 状态 200，安全 envelope 正常；失败判定只使用长度、固定 unknown 集合、slot/source 元数据和来源非空状态，报告不保存完整医学回答。
- 证据：`reports/patient-session-matrix-summary.json`、`reports/patient-api-adapter-smoke-summary.json`。
- 建议方向：对获准的当前 slot 做句级/字段级安全投影，保留否定、数字、单位和时间含义；无法安全压缩时明确标记需审核，不应在仍计入 slot coverage 的同时伪装成患者未知。
- 医学专家裁决：不需要判断该工程缺陷；具体 191 条内容仍保留 `teacherReviewRequired`，医学真值不得由 QA 批准。
- `8e7d148` 修复回归：6,216 路由与 6,216 重放中 `failureInstances=0`；Patient-facing profile 42 例完整性合同通过。295 次 source-cell 安全阻断观测对应既有 161 个来源修订项，单独记 `BLOCKED_SOURCE_REVISION`，不纳入本工程缺陷关闭计数。

## HEM-P1-033：确定性 canonical 回答绕过输出过滤并把教师提示送到公开 API

- 级别/状态：P1，RESOLVED_LOCAL_QA；Production `ff1a932` 不再把教师元语言送入患者回复，确定性不安全来源改为 fail-closed。相关医学来源修订仍保持阻塞。
- 页面/路径：公开 `POST /api/agent-chat/`；浏览器 `/cases/P004/`；P004 血块、P005/P006 血尿时相；中文；四固定 viewport。
- 操作步骤：本地 rule session 对 P004 问“有血块吗”，对 P005/P006 问血尿时相 → 检查 API 回复中教师元语言 → 在浏览器提交 P004 问题，观察前端安全替换、收集状态、console/network。
- 预期：公开患者 API 不返回“未主动诉/需追问”等后台提示；若安全过滤拒绝回答，不应把未实际告知学生的 fact 计为已收集。
- 实际：3 个唯一病例-slot 的 API 回复含教师元语言，2 条固定问法形成 6 个矩阵实例；P004 还顺带包含未问疼痛/时相。前端检测为 unsafe 后显示“请问具体一点”的通用答复，但保留 API 的 `matchedSlotIds=[clots]`，因此可见回答与计分/收集状态不一致。
- 复现：直接链路连续 2/2；公开 handler P004 连续 2/2；浏览器四固定 viewport 4/4，且 1440×900 有额外重复复跑。
- AI 来源：本地 deterministic rule，`providerCalls=0`；不涉及真实 DeepSeek。
- 状态变化时间线：document/health/session 200 → 学生提交血块问题 → agent-chat 200 返回 canonical 文本 → 前端 `isUnsafePatientReply` 拒绝 → 显示通用澄清句 → timeline/history-log 仍记录 matched slot。
- HTTP/console/network：P004 代表 `POST /api/agent-chat/` 200，约 10ms；两个 training-action fixture 200；清理语音设置后的 console 仅正常 `ai_connection_transition` info，0 warning/error；network 仅方法、path、状态和耗时。
- 证据：`screenshots/live-p004-clots-teacher-meta-390x844-failure.png`（代表帧）；四 viewport 截图/trace/console/network 本机保留；聚合 JSON 同上。
- 建议方向：所有 canonical/structured deterministic 返回在 API 层统一执行 patient output 过滤；将“元语言清洗失败”和“事实未回答”明确返回，前端仅在安全答复实际展示后更新 collected/asked slots。
- 医学专家裁决：否；只移除教师元语言和修复收集状态，不修改 P004/P005/P006 的医学事实。相关内容本身仍需既有医学审核。
- `96fcf80` 受影响回归：公开训练状态和 session capability 均经真实签名校验后，P004 场景仍在四 viewport 4/4 失败；因此不是旧 stub 绕过鉴权造成的假阳性。
- `ff1a932` 修复回归：原 6 个教师元语言实例降为 0，P004 四固定 viewport 4/4 `PASS_EMULATION`。另有 161 个来源因 `unsafe_deterministic_answer` 被 API 明确 fail-closed，空 facts/slots，未再误记为匹配；这些项目记为 `BLOCKED_SOURCE_REVISION`，不构成医学事实通过，也不解除 HEM-P0-001/023。

## HEM-P1-034：中文尝试切换英文时复用旧训练状态导致 session 401

- 级别/状态：P1，RESOLVED_LOCAL_QA；Production `ff1a932` 的中英切换、刷新和快速切换回归未再出现 401 / `invalid_attempt_token`。
- 页面/路径：训练工作台 `/cases/P001/` 与公开 `POST /api/session/init/`；病例 P001；中文切换英文；viewport `1440×900`、`1280×720`、`390×844`、`360×800`。
- 操作步骤：全新上下文打开 P001 → 等待中文 `init-attempt` 与 session 均 200 → 点击 English → 捕获请求体为 `caseId=P001/language=en/mode=free` 的 session 初始化 → 检查状态、错误码和页面连接状态。
- 预期：语言切换创建独立英文 attempt，先取得与新 attempt/language 绑定的训练状态，再以该状态初始化英文 session；HTTP 200。
- 实际：页面已生成新的英文 attempt，但 auto session effect 在清空旧 `trainingStateTokenRef` 的 effect 之前调用 `ensureTrainingStateToken()`，把旧中文 attempt token 发给英文 session；服务端正确返回 HTTP 401 / `invalid_attempt_token`。这是客户端 effect 顺序竞态，不是服务端能力校验失败。
- 复现：四固定 viewport 4/4；1440×900 另有两次定向复跑，均为同一 401/错误码。公开 handler 的独立跨语言负例正确返回 409，证明安全门禁本身按合同工作。
- AI 来源：本地 rule / `providerCalls=0`；请求在 session 建立前失败，不涉及真实 DeepSeek 或医学回答。
- 状态变化时间线：document 200 → 中文 `init-attempt` 200 → 中文 session 200 → 点击 English → 新 attempt/lang state render → 英文 session 401 `invalid_attempt_token` → `degraded/initializing/failed`；页面训练记录仍在本地。
- HTTP/耗时：代表 network 为中文 training/session 200，随后英文 session 401；本地约 14ms。network 只记录 action、caseId、language、mode、状态与错误码，不含 attemptId、header、token、sessionId 或问答正文。
- console/network：console 仅记录连接状态变化、401 资源错误及已脱敏 `api_request_failed`；Authorization/Cookie/签名均未保存。浏览器看到的训练状态和 session ID 是固定 `qa-redacted-*` 占位符，真实能力只存在于 adapter 内存。
- 证据：`screenshots/live-language-switch-authorization-1440x900-failure.png`（Git 代表帧）；其余三 viewport 截图、四份 trace、失败录像、console/network、HTML/JUnit 仅本机保留。
- 建议方向：语言/attempt 改变时在同一同步状态转换中清空 token/promise/queue 和旧 session，再允许 auto session effect 运行；或把 token 明确按 `attemptId` 键控而不是单一 ref。补充中文→英文、英文→中文、快速往返、刷新和并发 health/session 回归。
- 医学专家裁决：否；仅为客户端授权状态和 effect 时序问题。
- `ff1a932` 修复回归：四固定 viewport 中文→英文 4/4 `PASS_EMULATION`；Production 定向 E2E 另覆盖英文→中文、刷新后切换与快速往返。能力矩阵 19/19 通过，非法、篡改、过期、跨病例、跨语言、跨 mode/attempt session 仍被拒绝；`providerCalls=0`。

## HEM-P1-045：刷新后对话可见但 session capability 未恢复，继续提问返回 401

- 级别/状态：P1，OPEN / FAIL_PREVIEW；精确 Production/Preview `657ba5da8fc6460ad7d0deea882a010c40938b40`。
- 页面/路径：受保护 Vercel Preview `/cases/P037/`；病例 P037；中文、英文；Playwright Desktop Chrome `1280×720`。
- 操作步骤：全新上下文打开 P037 → 等待 attempt/session 200 → 连续发送2个问题并确认各自 agent/history 200 → 记录对话DOM为6项 → 刷新页面并确认DOM仍为6项 → 不切病例/语言，发送第3个问题 → 捕获 agent、history、attempt/session初始化和401计数。
- 预期：刷新恢复既有对话与可继续使用的当前session能力；下一次发送为1个agent请求、HTTP 200、1个history-log，不重新使用缺失能力，也不出现401。
- 实际：中英文DOM均6→6恢复，但刷新后首个agent请求均在约302/344ms返回HTTP 401 / `session_capability_required`；没有history-log。刷新期间attempt/session重初始化均为0，页面仍显示输入框，因此“可见恢复”和“可继续会话”状态不一致。
- 复现：3批有效独立运行×中英文，共6/6。诊断期间3次长超时来自QA有限等待补丁误命中相邻helper，另1次英文回退来自QA在每次导航清理语言偏好；均已修正且不计产品复现。
- AI来源：最终批刷新前3次DeepSeek `live_ai`、1次明确`safety_boundary`；刷新后401响应无`generationSource`，未产生患者回答。安全边界不计为真实AI通过。
- 状态变化时间线：document/attempt/session 200 → 两轮agent/history 200 → DOM 6 → reload document 200 → DOM仍6、attempt/session初始化0/0 → 第3个agent请求 → 401 `session_capability_required` → history缺失。
- HTTP/console/network：最终批两种语言各3个agent请求、2个history-log、1个API 401；跨源保护头请求0。wrapper对每批输出执行凭据扫描并删除专用目录；未保存Authorization、Cookie、签名、session ID、环境变量值或回答正文。
- 最小证据：`tests/preview/preview-stability.spec.mjs` 中 `@preview-refresh-followup` 失败断言；`artifacts/exploratory-qa/reports/657ba5d-navigation-summary.json` 中仅状态、计数、错误码和耗时聚合。原始失败附件、error context与回答正文不提交Git。
- 建议方向：刷新恢复消息时同步恢复/重新签发与attempt绑定的session capability，或在启用发送前重新执行安全的session初始化；必须继续拒绝伪造、过期、跨病例/语言/mode/attempt能力，不能通过放宽服务端401门禁修复。补充中英文“2轮→刷新→继续发送→history幂等”的门禁。
- 医学专家裁决：否；纯客户端会话能力恢复与日志完整性缺陷，不修改病例事实。

## HEM-P1-046：含数值检验结果缺少结构化单位与参考范围

- 级别/状态：P1，OPEN / FAIL_LOCAL_QA；Production文档基线`657ba5da8fc6460ad7d0deea882a010c40938b40`，运行时代码等价基线`3a16f9314d1b3cf50e30bc41dcfeaf19f4fa77a8`。
- 页面/路径：训练工作台`/cases/P001/`第2阶段“查体、检验、影像、内镜、病理及围术期评估”；代表病例P001、中文、viewport `1440×900`。全量结构审计另覆盖P001–P042。
- 前置条件：本地Next与脱敏training/session fixture用于进入第2阶段；返回的代表结果直接取自Production `order_results_structured.json`，报告卡使用Production渲染器。该浏览器证据为fixture/local，不记作Preview或真实设备通过/失败。
- 操作步骤：运行`data-agent-structured-audit.mjs`读取42例、60个医嘱和257条结构化结果 → 筛选`status=final`、`orderId=LAB-*`且value含数值的结果 → 检查`unit/referenceRange` → 打开P001 → 提交脱敏病史小结进入第2阶段 → 开立代表检验 → 等待报告卡 → 读取“单位/参考范围”。
- 预期：含数值的final检验结果必须提供可解释的结构化单位与参考范围，或使用逐分析物结构明确表达；生产UI不应把两项都显示为“—”。
- 实际：基础结构合同为0失败（case/order归属、resultId唯一性、前置医嘱、结果非空、非终态显式内容均完整）；但28/28条含数值final检验结果的`unit`和`referenceRange`均为空，涉及13例：P001–P012、P019。P001报告卡实际显示“单位—/参考范围—”。
- 复现：结构审计正式脚本2/2；代表浏览器有效运行7/7均得到相同断言差异。若Playwright CLI在本桌面沙箱完成报告后保留开放句柄，外层命令需终止；截图、trace和失败摘要均已在终止前完整落盘，该QA基础设施现象不计入产品复现。
- AI来源：数据Agent本地确定性结构结果，`providerCalls=0`；没有真实DeepSeek、fallback或mock回答被记为真实AI。
- 状态变化时间线：document/session/attempt fixture 200 → 第1阶段提交200 → 进入第2阶段 → 开立代表检验200 → 报告卡`status=final`可见 → 单位/参考范围均渲染“—” → 失败断言触发。
- HTTP/console/network：最终代表运行3个`POST /api/training-action/`均200，耗时约17/2/2ms；console仅3条info、0 warning/error。network摘要不保存body/header/request ID/token/session或医学值。
- 最小证据：`reports/data-agent-structured-audit.json`（仅病例/医嘱ID和缺失字段）、`screenshots/hem-p1-046-data-agent-metadata-1440x900.png`、`traces/hem-p1-046-data-agent-metadata-1440x900.zip`；失败全页截图、console/network、录像、test-results与重复trace仅本机保留。
- 建议方向：把多分析物检验结果拆成逐项`value/unit/referenceRange`，或为当前结构提供可验证的显式元数据；在全42例结构审计与代表UI中要求0缺口。不得由QA猜测、补写或统一套用医学参考范围。
- 医学专家裁决：缺陷是否存在不需要医学裁决；实际单位、参考范围和数值语义必须依据权威来源或具名医学专家审核，且不得解除HEM-P0-001/023或来源修订阻塞。

## HEM-P1-047：结构化检查状态裸显内部枚举且遮蔽异常标志

- 级别/状态：P1，OPEN / FAIL_LOCAL_QA；Production文档基线`657ba5da8fc6460ad7d0deea882a010c40938b40`，运行时代码等价基线`3a16f9314d1b3cf50e30bc41dcfeaf19f4fa77a8`。
- 页面/路径：训练工作台`/cases/P001/`第2阶段的Production报告卡；结构化输入审计覆盖P001–P042。中文用于`1440×900`、`390×844`，英文用于`1280×720`、`360×800`。
- 前置条件：本地Next与脱敏training/session fixture只用于进入第2阶段；QA用非医学文本构造三个报告卡，但状态值取自Production数据实际使用的`final/not_available/not_performed`集合，渲染器为Production组件。该证据不记作Preview或真机通过/失败。
- 操作步骤：读取257条Production结构化结果并统计状态 → 打开P001、提交脱敏病史小结并进入第2阶段 → 返回三个不含医学值的QA报告卡 → 第一张同时设置`status=final`与`abnormalLevel=positive` → 读取可见状态文案和卡片`data-status`。
- 预期：内部枚举不直接暴露给学生，应按当前语言显示可理解状态；既有受控异常标志不应被`final`覆盖，第一张卡片应呈现异常状态。QA不指定具体翻译，也不判断异常标志的医学正确性。
- 实际：四个viewport均裸显`final`、`not_available`、`not_performed`，中文页面也显示英文snake_case；12/12状态文案观测失败。三张卡片在每个viewport均为`data-status=reported`，带异常标志的`final`卡片4/4没有异常呈现。Production数据中三状态分别为74、182、1条，覆盖42例；另有1条真实`final`结果携带非空`abnormalFlags`，受相同优先级路径影响。
- 复现：有效浏览器运行4/4（四固定viewport、中文/英文均覆盖）。首轮4次失败来自QA误点“返回已选项目结果”而没有发出order请求，已更正并不计产品复现；最终聚合均在断言前落盘。Playwright CLI完成证据后保留开放句柄由外层终止，列为QA runner行为，不计入产品缺陷。
- AI来源：`deterministic_fixture_not_real_ai`，`providerCalls=0`；没有真实DeepSeek、fallback或医学回答。
- 状态变化时间线：document/session/attempt 200 → 第1阶段反馈200 → 进入第2阶段 → order 200 → 三张Production报告卡出现 → raw状态与普通`reported`属性被读取 → 失败断言触发。
- HTTP/console/network：四次运行合计12个`POST /api/training-action/`均200，最大脱敏摘要耗时15ms；console共12条info、0 warning/error。network不保存body/header/request ID/token/session或医学值。
- 最小证据：`reports/hem-p1-047-data-agent-status-1440x900.json`、`screenshots/hem-p1-047-data-agent-status-zh-1440x900.png`、`traces/hem-p1-047-data-agent-status-1440x900.zip`；其余viewport聚合、截图、trace、失败全页图、录像、console/network与test-results仅本机保留。
- 建议方向：把结构状态映射为中英文学生文案；计算展示状态时让受治理异常/阳性/高低/危急标志优先于`final`完成态，同时为`not_available/not_performed/needs_review`保留明确且可访问的视觉语义。增加三状态×中英文×四viewport报告卡门禁，不要放宽当前失败断言。
- 医学专家裁决：确认本工程呈现缺陷不需要医学裁决；具体异常标志、结果内容和医学值是否正确仍遵循既有来源/医学审批，不由QA修改或批准。

## HEM-P1-048：英文数据Agent目录与报告仍大量显示中文

- 级别/状态：P1，OPEN / FAIL_LOCAL_QA；Production文档基线`657ba5da8fc6460ad7d0deea882a010c40938b40`，运行时代码等价基线`3a16f9314d1b3cf50e30bc41dcfeaf19f4fa77a8`。
- 页面/路径：训练工作台`/cases/P008/`英文第2阶段；浏览器覆盖`1440×900`、`1280×720`、`390×844`、`360×800`，Production handler只读审计覆盖P001–P042。
- 前置条件：本地Next；脱敏session/stage fixture只负责进入第2阶段，浏览器order payload来自Production本地`training-action`的英文P008 `CBC`真实响应。全量脚本以英文attempt逐例开立全部配置医嘱及其前置医嘱，只保存CJK计数与病例ID，不保存请求/响应正文或医学值。
- 操作步骤：运行`data-agent-bilingual-audit.mjs`对42例依次init英文attempt → 提交history进入第2阶段 → 一次开立该例全部配置医嘱与prerequisite → 对学生可见字段做CJK计数；浏览器打开P008英文页 → 进入第2阶段 → 输入`CBC` → 使用同一Production handler响应渲染报告卡 → 读取控件和报告卡语言。
- 预期：英文工作台的查体/医嘱目录、已识别医嘱、分类、结果与印象应使用经审核的英文内容；无英文安全内容时应明确受控阻塞，不能把中文或内部ID当作英文通过。结果仍须精确绑定当前病例/医嘱且不得因翻译重复或丢失。
- 实际：全量审计42/42病例受影响、257/257结果返回且handler失败0；共1,285个CJK信号：目录displayName 57/60、主分类60/60、次分类49/60、handler matched displayName 274次、结果orderCategory/result/impression各257/257、value 74次。23/60医嘱连无CJK别名也没有。浏览器每个viewport均测得44个中文button/label，真实报告卡含中文，matched order名含中文且该返回结果有3个学生可见字段含CJK。
- 复现：全量审计有效配置连续2/2；四viewport浏览器4/4。开发首轮审计漏开前置医嘱只返回240/257，修正后257/257，不计产品失败；浏览器首轮单开有prerequisite的CTU正确返回0条，改为可直接开立的CBC后形成有效4/4，不把前置条件正确拒绝计入缺陷。
- AI来源：`production_training_action_local_contract`，`providerCalls=0`；不是真实DeepSeek、fallback或mock患者回答。
- 状态变化时间线：英文attempt init 200 → history反馈200 → 第2阶段 → 英文别名开单200 → 当前病例结构结果返回 → Production英文工作台目录与报告卡出现CJK → 失败断言触发。
- HTTP/console/network：四个有效浏览器运行中本地handler `init/history/order`为12/12 200；浏览器fixture的12个training-action也均200、最大脱敏摘要耗时16ms；console共12条info、0 warning/error。network不保存header、body、request ID、token、session或医学值。
- 最小证据：`reports/data-agent-bilingual-audit.json`、`screenshots/hem-p1-048-data-agent-english-1280x720.png`、`traces/hem-p1-048-data-agent-english-1280x720.zip`；其余viewport聚合/截图/trace、失败全页图、录像、console/network与test-results仅本机保留。
- 建议方向：为医嘱目录、查体项、结果分类及结构化结果增加显式受控`zh/en`字段并按attempt language选择；英文缺失时fail closed或显示明确“awaiting reviewed translation”，不要运行时猜译。回归需覆盖42例257条结果、60医嘱、前置条件、四viewport和切换/刷新，保持case/order/stage绑定及结果数量不变。
- 医学专家裁决：确认中文串线工程缺陷不需要医学裁决；具体医学结果、单位、参考范围与英文译文必须由权威双语来源或具名医学专家审核，QA不翻译、不修改`data/**`、不解除HEM-P0-023或来源修订状态。

## HEM-P2-043：本地 Next 开发环境病例目录链接对 42 个 `.html` 路由全部返回 404

- 级别/状态：P2，RESOLVED_ENGINEERING_PREVIEW / PAGES_DEPLOYMENT_PENDING；本地 Next、root build、GitHub Pages basePath 仿真与当前 Vercel Preview 已通过，真实 Pages 仍部署不匹配。
- 页面/路径：本地 Next 开发服务 `/cases/` → `/cases/P001/index.html` 至 `/cases/P042/index.html`；全 42 例；中英文目录；viewport `1440×900`。
- 操作步骤：启动 Production `ff1a932` 本地 Next 服务与脱敏 API adapter → 打开病例目录 → 逐一读取并点击真实病例卡片 anchor → 记录 document 状态 → 对同病例再直接打开 `/cases/Pxxx/`、刷新、切换英文并刷新回中文。
- 预期：目录点击、直接 URL、刷新以及中英文显示均进入有效病例，不能 404。
- 实际：目录 42 个 anchor 均指向 `/cases/Pxxx/index.html`，本地 Next 开发服务点击后 42/42 返回 404；同一服务的 `/cases/Pxxx/` 直接 URL 42/42 为 200，刷新 42/42 为 200，中英文 UI 42/42 可见，因此问题限定为目录 href 与本地路由解析不兼容。
- 复现：42/42 病例目录点击稳定失败；42/42 直接 URL、42/42 刷新、42/42 中文、42/42 英文对照通过。
- AI 来源：N/A；路由/页面壳测试，`providerCalls=0`，不涉及医学裁决。
- 状态变化时间线：`/cases/` 200 → 读取病例卡片 href → 点击 `.html` URL → document 404；对照直接目录 URL 200 → 英文 UI 可见 → 刷新 200 → 中文 UI 可见。
- HTTP/console/network：只保存 document pathname、状态与耗时；失败为 42 个 `.html` document 404。未保存 header、query、Cookie、Authorization、签名或正文。
- 证据：本机 `reports/local-p001-p042-route-matrix.json`、`screenshots/local-p001-p042-display-route-matrix-1440x900-failure.png`、`traces/local-p001-p042-display-route-matrix-1440x900.zip`；聚合结论见 Git 中 `reports/ff1a932-priority-regression-summary.json`。大 trace 与逐例明细不提交 Git。
- 建议方向：目录 href 按运行环境生成 Next 可解析的 `/cases/Pxxx/`，或为 `.html` 路由提供等价 rewrite；同时保留静态托管产物的路径合同。回归需分别覆盖 Next dev、静态 GitHub Pages 和 Vercel，不能用单一环境替代。
- 医学专家裁决：否。

- `8e7d148` 回归：本地 public route 合同为 42/42，desktop/mobile 目录 portable route 通过；真实 GitHub Pages 在 `1440×900` 与 `390×844` 均为 42 张卡片但只有 12 个 `Pxxx` 显示路由，另 30 个仍为旧内部 ID。由于公开站点不是当前 route 产物，标记 `BLOCKED_DEPLOYMENT_MISMATCH`，不重新打开源码修复状态。
- `3a16f931` 回归：Vercel Preview 的病例目录、直接 URL 与刷新对 P001–P042 为 42/42，中英文入口保持 caseId，P999 为真实受控 404；状态 `PASS_PREVIEW`。真实 GitHub Pages 仍为 42 卡片 / 12 显示路由 / 30 旧内部路由，继续 `BLOCKED_DEPLOYMENT_MISMATCH`，不能用 Preview 成功替代。

## HEM-P2-044：移动端语音设置触控目标小于 44×44 CSS px

- 级别/状态：P2，OPEN / FAIL_EMULATION；真实设备仍为 `BLOCKED_REAL_DEVICE`。
- 页面/路径：训练工作台 `/cases/P001/` → “语音设置”；病例 P001；中文；viewport `390×844`、`360×800`。
- 前置与步骤：全新浏览器上下文 → 安装脱敏本地 API fixture → 打开 P001 中文训练页 → 打开语音设置 → 读取可交互目标 `getBoundingClientRect()` → 与最小 44×44 CSS px 比较。
- 预期：移动端所有主要触控目标的宽和高均不小于 44 CSS px，不依赖精确点按。
- 实际：两个 viewport 的数值一致：语音设置入口 `106×38`、对话框关闭 `26×28`、试听 `75×38`、停止 `34×38`；四项均至少一维不足 44px。
- 复现：2/2（两个固定移动 viewport 均失败）；浏览器语音播放、暂停、继续、停止、重播、快速重复、切病例和刷新合同另为 4/4 通过。
- AI 来源：本地确定性 fixture，`providerCalls=0`；不宣称 Azure/云 TTS 成功。真实手机软键盘、地址栏和 safe-area 未测试。
- HTTP/console/network：页面及脱敏 fixture 请求 200；该缺陷为纯几何测量，无 Authorization、Cookie、签名、session 或问答正文记录。
- 最小证据：`screenshots/hem-p2-044-touch-targets-390x844-failure.png`、`reports/hem-p2-044-touch-targets-summary.json`；360 截图和逐 viewport 原始 JSON 仅本机保留。
- 建议方向：为语音入口、关闭、试听、停止采用共享 `min-h-11 min-w-11`（或等价 44px）触控容器，并保留视觉图标大小；在 360/390 自动几何断言中回归。医学专家裁决：否。

## QA-SEC-P1-001：Preview runner 失败输出可能回显受保护请求头

- 级别/状态：QA 基础设施 P1，RESOLVED_QA_INFRA；不是业务产品缺陷。
- 页面/路径：`scripts/run-preview-blackbox.mjs`、`tests/preview/preview-blackbox.spec.mjs`；受保护 Preview；N/A viewport。
- 操作步骤：在 42 例 Preview 路由用例中以 APIRequestContext 显式附加保护 header → 请求超时 → Playwright 失败 call log 写入请求 header → runner 原先 `stdio=inherit` 直接把日志送入 stdout。
- 预期：任何失败日志、trace、截图和报告都不能包含 bypass、Authorization、Cookie、签名或环境变量值；命中时必须删除输出并 fail closed。
- 实际：runner 的 artifact 扫描发现运行时 secret bytes 后删除专用输出，但 stdout 已在扫描前由 Playwright 直接输出。未提交或保留该批次 artifact；报告不复述任何值。
- 复现：1/1；事件发生后立即停止真实 Preview 扩展测试。本机 `test-results/preview-blackbox` 已删除，证据根与剩余 test-results 的运行时精确值扫描均为 0 命中。
- 修正：runner 改为 pipe 捕获 stdout/stderr，先扫描实际 secret bytes 和敏感 header 名，再决定是否打印；命中则只输出通用 `SECURITY_BLOCKED` 并删除目录。路由用例不再显式把保护 header 交给 APIRequestContext；安全单元契约已通过。
- 历史门禁：事件发生时要求先独立复核 runner fail-closed 行为，再恢复真实 Preview 长跑；任何本地/fixture PASS 均不得替代。
- `3a16f931` 复核：10 条失败路径与 5 类产物通道安全 canary 15/15；真实 Preview health、9 项黑盒、两批中英稳定性及20轮长会话均经 wrapper 执行，扫描后专用输出删除，未发现运行时凭据字节或敏感 header 名。该 QA 基础设施事件关闭，不改变业务缺陷状态。
- 医学专家裁决：否。

基线说明（历史第7轮）：Production 文档基线为 `657ba5da8fc6460ad7d0deea882a010c40938b40`，运行时与黑盒证据基线为代码等价的 `3a16f9314d1b3cf50e30bc41dcfeaf19f4fa77a8`；QA 普通 merge HEAD 为 `bd08566ddb91806abc9c1cc2123138b0ac29a2b4`。Vercel Preview 精确运行时 SHA 为 `PASS_PREVIEW`；GitHub Pages 公开产物仍有 30 个旧内部路由，标记 `BLOCKED_DEPLOYMENT_MISMATCH`；两者分别记录，不互相替代。

## HEM-P1-050：用户指定自然问法未稳定路由到 canonical 病史且英文复合问句扩张通用 pain

- 级别/状态：P1，OPEN / FAIL_LOCAL_QA；Production `70ea9b3c7b31e11a84878de5c277cac60f35481c`。
- 页面/路径：Patient Agent 问诊链路 `/cases/P001/`–`/cases/P042/` / `/api/agent-chat/`；中文和英文；无 viewport 依赖的本地 deterministic handler 审计。
- 操作步骤：对每例依次发送用户指定的 10 类问法及英文等价问法，包括尿痛四种表达、全程/分段/终末否定、尿频尿急尿痛复合问法及腰痛/发热/血块复合问法；记录 canonical intent、known/unknown、极性、冲突隔离、双语等义和额外 slot，只保存计数与 case ID。
- 预期：已知 true/false 保持病例极性；否定词不反转事实；复合/选择问题逐项路由；missing 可自然不确定；needs_review/冲突继续隔离；中英文医学含义一致；不扩张未问病史。
- 实际：840 场景中 canonical 完整命中 630（75.00%），intent 命中 1,134/1,428（79.41%）；错误 unknown 4/914（0.44%）；可评价极性错误 0/439；正确 unknown 436/436；42/42 冲突场景、13 个唯一冲突项均隔离。双语工程等义 247/420，额外病史 slot 42/840。六个稳定失败组分别为英文全程、中文时相选择、英文时相选择、英文终末否定、英文尿频/尿急/尿痛复合，以及英文腰痛/发热/血块额外命中通用 pain；后者使 P004 发热及 P013/P017/P028 血块四个已知事实走 unknown 路径。
- 复现次数：全量 deterministic 矩阵 1/1；每个失败组跨 42 例稳定出现，失败断言保留。既有较窄 intent/paraphrase 门禁仍通过，说明这是未覆盖自然问法缺口，不是全局 Patient Agent 崩溃。
- AI来源：Production Patient Session 本地规则/安全路由；`providerCalls=0`，不是 DeepSeek 或 Preview，不保存回复正文。
- 状态变化时间线：加载 governed profile → 规范化自然问法 → canonical matcher/复合拆分 → 生成安全答复元数据 → 聚合 canonical/unknown/极性/泄露计数 → 252 个场景失败断言触发。
- HTTP/console/network：直接调用本地 handler，无浏览器 HTTP；没有 401/403/429/5xx。报告不含 request body、回答、token、session、签名或医学值。
- 最小证据：`tests/exploratory/patient-natural-phrasing-audit.mjs`、`reports/70ea9b3-patient-natural-phrasing-audit.json`、`reports/70ea9b3-priority-qa-summary.json`。逐问答正文未生成或保留。
- 建议方向：扩展 canonical alias/复合拆分，优先覆盖全程与初始/终末选择、否定终末问法、尿频尿急尿痛三联和腰痛/发热/血块；特异 `flank_pain` 不应同时扩张通用 `pain`。将本 840 场景矩阵作为 fail-closed 门禁，不得放宽 unknown、冲突或额外病史断言。
- 医学专家裁决：确认路由、极性和额外披露工程缺陷不需要医学裁决；事实值、needs_review 与双语医学表述最终批准仍依赖现有来源治理和 HEM-P0-001/023。

## HEM-P1-051：Preview 自然纠错、澄清和多轮复合追问被 rule fallback 接管

- 级别/状态：P1，OPEN / FAIL_PREVIEW；精确部署 `70ea9b3c7b31e11a84878de5c277cac60f35481c`。
- 页面/路径：受保护 Vercel Preview 的 P001 英文错误总结/模糊澄清、P038 中英文五轮追问、P037 刷新后中英文追问；桌面 Chromium。
- 操作步骤：使用安全 Automation Bypass wrapper 创建新 attempt/session → P001 英文确认后给出错误总结或无指代问题 → P038 中英文各连续 5 轮复合/重复追问 → P037 每语言 2 轮后刷新并继续 2 轮 → 逐操作核对 generation source、agent request、history-log、401 与泄露布尔值。
- 预期：合法自然追问继续 `live_ai`，医学冲突可明确 `safety_boundary`；不能因为 matcher 未命中就用通用 `rule_fallback` 替代本应理解上下文的纠错/澄清，刷新后事实连续性应保持。
- 实际：P001 两个英文场景在全套及隔离复跑均为 `rule_fallback`（4/4 场景运行失败 source contract）。P038 独立复跑 10/10 agent/history、0 unauthorized，但只有 4 live_ai、2 safety boundary、4 rule fallback，中英文 source contract 均失败。P037 独立复跑 DOM 6→6、8/8 agent/history、0 unauthorized；中文为 2 live_ai+2 safety boundary，英文为 3 live_ai+1 rule fallback，英文时长连续性随 source 路径失败。
- 复现次数：P001 纠错/澄清两轮批次 2/2；P038 全套与隔离 2/2；P037 全套与隔离 2/2。最初全套的 history wait timeout 在隔离复跑中未复现，故不登记日志丢失；稳定失败限定为 source/fact continuity。
- AI来源：真实 Preview；成功样本 provider=`deepseek`、`generationSource=live_ai`，受治理样本=`safety_boundary`，失败样本=`rule_fallback`。不把 fallback/safety boundary 记为真实 AI 通过。
- 状态变化时间线：session/attempt 200 → 合法 agent request 200 → 部分自然问题 semantic matcher 未进入 provider → rule fallback 200 → history-log 200 → source/连续性断言失败；刷新恢复本身保持通过。
- HTTP/console/network：P038 agent/history 10/10，P037 8/8，P001 隔离场景均为成功 HTTP；unexpected 401/403/5xx 为0。批量 session-abuse 尾部曾有2个429，低频隔离11/11通过，判为批量干扰而非本缺陷。专用输出扫描通过后删除。
- 最小证据：`reports/70ea9b3-priority-qa-summary.json` 与本文脱敏计数；出于凭据边界不提交 Preview trace、截图、完整问答或原始 test-results。
- 建议方向：把未命中的合法上下文纠错/澄清/复合追问送入受能力约束的 patient provider，只有可安全确定的 canonical 问法使用 deterministic reply；保持医学冲突的 safety boundary 和全部 capability/history 幂等门禁。新增 P001纠错/澄清、P037刷新、P038多轮 source contract 回归。
- 医学专家裁决：确认 source 路由和刷新连续性工程缺陷不需要医学裁决；患者自然语言质量与医学回答内容仍需教师/医学专家后续人工审阅。

当前基线说明：Production 与 Preview 均为 `70ea9b3c7b31e11a84878de5c277cac60f35481c`，QA 合入基线的 merge 为 `b94d7803507df3da52379f83ab05fef2afc45c87`。本地、Preview、GitHub Pages 与真机状态分别记录，互不替代。

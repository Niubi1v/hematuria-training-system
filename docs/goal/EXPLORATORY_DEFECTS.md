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

- 级别/状态：P2，RESOLVED_LOCAL_QA / PASS_EMULATION；Production `9b7fcd0` 两个移动viewport均达到44px；真实设备仍为 `BLOCKED_REAL_DEVICE`。
- 页面/路径：训练工作台 `/cases/P001/` → “语音设置”；病例 P001；中文；viewport `390×844`、`360×800`。
- 前置与步骤：全新浏览器上下文 → 安装脱敏本地 API fixture → 打开 P001 中文训练页 → 打开语音设置 → 读取可交互目标 `getBoundingClientRect()` → 与最小 44×44 CSS px 比较。
- 预期：移动端所有主要触控目标的宽和高均不小于 44 CSS px，不依赖精确点按。
- 实际：两个 viewport 的数值一致：语音设置入口 `106×38`、对话框关闭 `26×28`、试听 `75×38`、停止 `34×38`；四项均至少一维不足 44px。
- 复现：2/2（两个固定移动 viewport 均失败）；浏览器语音播放、暂停、继续、停止、重播、快速重复、切病例和刷新合同另为 4/4 通过。
- AI 来源：本地确定性 fixture，`providerCalls=0`；不宣称 Azure/云 TTS 成功。真实手机软键盘、地址栏和 safe-area 未测试。
- HTTP/console/network：页面及脱敏 fixture 请求 200；该缺陷为纯几何测量，无 Authorization、Cookie、签名、session 或问答正文记录。
- 最小证据：`screenshots/hem-p2-044-touch-targets-390x844-failure.png`、`reports/hem-p2-044-touch-targets-summary.json`；360 截图和逐 viewport 原始 JSON 仅本机保留。
- 建议方向：为语音入口、关闭、试听、停止采用共享 `min-h-11 min-w-11`（或等价 44px）触控容器，并保留视觉图标大小；在 360/390 自动几何断言中回归。医学专家裁决：否。

- `9b7fcd0`回归：`390×844/360×800`最终2/2通过；两个viewport的语音入口`106×44`、关闭`44×44`、试听`75×44`、停止`44×44`，不足项0。键盘焦点、Escape和reduced-motion邻接合同也通过。自动几何关闭本地工程缺陷，但没有真实手指、系统缩放、动态地址栏或safe-area证据，故真机仍阻塞。

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

## `c4ac9b5` 既有缺陷复测状态

- HEM-P1-050：`RESOLVED_LOCAL_QA`。840/840自然场景、1,428/1,428 canonical checks、3,150/3,150扩展问法；错误unknown 0、极性错误0、generic pain额外扩张0。
- HEM-P1-051：`RESOLVED_PREVIEW`。P001英文纠错/澄清3/3、P037英文上下文2/2、P038英文上下文2/2均`live_ai/deepseek/non-fallback`，history7/7，rule fallback 0。
- HEM-P1-046：工程呈现更新为安全文案，但28项真实单位/参考范围仍为 `BLOCKED_MEDICAL`，不得写成医学元数据通过。
- HEM-P1-047：`RESOLVED_LOCAL_QA`。desktop/mobile状态本地化和异常优先2/2项目、4次实际执行全部通过。
- HEM-P1-048：CJK呈现风险 `RESOLVED_LOCAL_QA`，但23个审核英文名称保持 `BLOCKED_SOURCE_REVISION`；新增评分隔离缺口转为HEM-P1-052。

## HEM-P1-052：未审核英文医嘱可通过内部ID释放结果并进入确定性360分评分

- 级别/状态：P1，首次为`OPEN / FAIL`；当前`RESOLVED_LOCAL_QA / PREVIEW_RETEST_NOT_RUN`，复测Production基线`9b7fcd0d975533c7c6eda5614ca3b2978c9dce55`。
- 页面/路径：英文训练工作台第2阶段与公开 `POST /api/training-action/`；42例评分规则；无viewport依赖的本地公开handler黑盒。
- 前置条件：合法free-mode英文attempt、有效签名training state、当前阶段已推进到orders。探针只使用Production中已有的内部order ID，不修改目录、医学结果、审核状态或环境值。
- 操作步骤：读取60项目录并用Production呈现器筛出23个`translationAvailable=false`项目 → 每项建立独立英文attempt并提交第一阶段 → 以内部ID调用order → 记录是否matched/返回result → 对与评分rubric相交的4项遍历29条病例-医嘱规则链 → 完成其余六阶段 → 请求360分报告 → 检查对应rubric item是否earned。
- 预期：缺审核英文名称的23项必须在服务端fail closed；内部ID不得绕过UI禁用形成validated order/result事件，更不得进入确定性评分。可返回明确“等待审核名称”错误，但不得猜译或修改医学数据。
- 实际：23/23均被公开handler匹配，6项返回确定性结果；4个评分相关医嘱覆盖29条规则链，29/29对应rubric item均为earned，累计641分。
- 复现：独立Node进程2/2，计数完全一致；首轮开发探针因错误假设“23项均有配置结果”在准备断言处停止，未计产品复现，修正为无结果项目只测API匹配后得到正式2/2。
- 当前复测：双跑逐字节一致；英文23/23内部ID匹配0、结果0，29/29评分链得分0；中文23/23仍可匹配，其中6项无前置配置结果返回。没有当前SHA的问题级Preview证据。
- AI来源：`public_training_handler_local_blackbox`，providerCalls=0；不是DeepSeek、fallback或fixture评分。
- 状态变化时间线：init-attempt 200 → history stage-feedback 200 → order内部ID 200且matched → 部分项目返回result → orders至debrief六次stage-feedback均200 → score 200 → 对应未审核医嘱rubric item=`earned`。
- HTTP/console/network：每个正式进程共执行23个目录探针与29条完整评分链，handler操作均为本机内存调用；request ID逐次唯一。报告不保存token、签名、内部医嘱名、结果正文或医学值。
- 最小证据：`tests/exploratory/data-agent-scoring-isolation.mjs`、`artifacts/exploratory-qa/reports/c4ac9b5-data-agent-scoring-isolation.json`和本缺陷记录；第二份同内容原始JSON仅本机保留。
- 建议方向：在服务端order验证和事件写入前检查当前语言的审核名称可用性；英文`translationAvailable=false`时返回安全阻塞，不释放结果、不追加`validated=true`订单/结果事件。评分器继续只信服务端事件，不在客户端伪造过滤；增加23项内部ID、4项/29规则链和中文不受影响的回归。
- 医学专家裁决：确认绕过与得分缺陷不需要医学裁决；23个英文名称的实际译文仍需来源/具名专家审核，QA不得自行补写或解除 `BLOCKED_SOURCE_REVISION`。

当前基线说明：Production与Preview均精确为 `c4ac9b5a59021bed10dc2d94c4ebf4d8f97badd2`，QA合入基线merge为`706a758`。本地、Preview、Pages仿真、真实Pages与真机状态继续分别记录。

## `c4ac9b5` 第 10 轮开放缺陷复测

- HEM-P1-045：`RESOLVED_PREVIEW`。P037中文/英文共8/8 live_ai、8/8 history；刷新后401、缺history、attempt/session重初始化均为0，病程连续性2/2。安全wrapper扫描1个生成文件后删除原始输出。
- HEM-P1-030：继续`REGRESSED_LOCAL_QA / OPEN`。完整矩阵连续2/2均为42个失败实例/1组；公开agent-chat合法路径2/2同样把英文泌尿操作史问法命中`triggers`而非`PAST_URINARY_PROCEDURE`，每轮其余17项通过，providerCalls=0。
- HEM-P2-028：继续`RESOLVED_LOCAL_QA`。当前SHA桌面重复6/6及桌面/移动代表2/2均为`1 request / 1 unique request ID / 1 timeline event`。
- HEM-P2-044：继续`OPEN / FAIL_EMULATION`。两个移动viewport 2/2仍为四个相同不足44px目标；没有真机证据。
- HEM-P1-052：继续`OPEN / FAIL`。扩展2/2除原英文23/23绕过、29/29得分外，证明同一23项中文路径23/23可用且相同前置状态返回6项结果；建议修复必须以attempt language和审核状态为边界，不得全局拒绝医嘱。
- 本续轮没有新增P0/P1/P2；最小聚合证据为`reports/c4ac9b5-open-defect-regression-summary.json`。原始矩阵、公开handler、Playwright和Preview回答均不进入Git。

## HEM-P1-053：P001–P042 英文自然开放式主诉被规则fallback，11例canonical回答被输出过滤

- 级别/状态：P1，OPEN / FAIL_PREVIEW；Production与精确Preview基线 `c4ac9b5a59021bed10dc2d94c4ebf4d8f97badd2`。
- 页面/路径：真实Vercel Preview `/cases/P001/`–`/cases/P042/`，英文与中文对照；桌面Chromium自动黑盒。
- 操作步骤：逐例建立全新合法session并等待capability → 中文询问自然开放式主诉 → 英文询问语义等价但不照抄canonical的开放式主诉 → 记录公开source/provider/fallback、单次request/history和安全泄露布尔值 → 在同一英文session追加本地canonical matcher可识别的控制问法，并启用只返回布尔值的安全debug。
- 预期：中英文合法开放式主诉都由已配置的DeepSeek `live_ai`回答；自然改写不应因semantic classifier关闭而直接进入rule fallback；provider成功生成时，患者化安全过滤应保留合规回答或产生可诊断的受控结果，不应对11例稳定覆盖为fallback。
- 实际路径A：全42例诊断批的自然英文42/42为`generationSource=rule_fallback`、`provider=rule`、`fallbackReason=classifier_disabled`；同轮中文42/42为DeepSeek `live_ai`。P006–P012另有两轮相同自然问法，因此累计自然中文56/56 live_ai、自然英文56/56规则fallback。本地只读canonical matcher对自然英文问法返回0个slot，而对控制问法命中`chief_complaint`。
- 实际路径B：英文canonical控制42次均进入`provider=deepseek`；31/42为`live_ai`，11/42为`safety_boundary`。过滤失败病例为P001–P003、P005–P012，均`responseAccepted=false`、`rewriteTriggered=true`；公开fallback原因是泛化值`ai_unavailable_or_rule_mode`，不能据此归因于未调用provider。
- 复现次数：P001–P042全量诊断批1/1；其中自然英文42/42失败。P006–P012自然双语另重复2轮，每例累计3/3，故自然英文总计56/56失败、中文56/56成功。canonical控制各例1次，31/42 live_ai、11/42过滤失败。
- AI来源：路径A为`rule_fallback/rule`且provider未进入；路径B全部由DeepSeek处理，其中31次`live_ai`、11次`safety_boundary/deepseek`且发生重写过滤。不得把42次自然英文fallback或11次安全边界计为`live_ai`。
- 状态变化时间线：session/capability ready → 单次agent-chat 200 → 单次history-log 200 → 自然英文返回classifier-disabled规则fallback；控制英文进入DeepSeek后31例live_ai，另11例首答未接受、触发重写并最终进入安全边界。
- HTTP/console/network：154/154 agent request、154/154 history-log；HTTP、请求/日志倍增、401/403/429/5xx、语言串线、教师/结构化泄露和跨origin保护头请求均为0。一次未授权沙箱导航在到达应用前被`ERR_NETWORK_ACCESS_DENIED`阻止，经授权重跑成功，未计产品结果。未保存完整问答、request body、token、Cookie、Authorization、签名或环境值。
- 最小证据：`tests/preview/preview-stability.spec.mjs`中的7个`@preview-unsampled-chief-complaint-batch-*`用例、`artifacts/exploratory-qa/reports/c4ac9b5-preview-chief-complaint-p001-p042-summary.json`和首批复现摘要。原始Playwright输出经安全wrapper扫描后删除，不提交trace、截图或完整回答。
- 建议方向：为合法英文开放主诉补充不依赖semantic classifier的canonical/alias路由；分别保留“未命中”“provider失败”“首答被拒”“重写被拒”的安全枚举诊断；检查P001–P003、P005–P012为何在canonical控制下首答和重写均被拒绝，并以其余31例live_ai作为非回归对照。修复不得放宽教师元语言、结构化泄露或事实保持边界。
- 医学专家裁决：确认路由和过滤接管的工程失败不需要医学裁决；修复后患者化措辞和医学含义仍需教师/医学专家人工审阅，QA不修改slot事实或审核状态。

## `c4ac9b5` 第 12 轮 HEM-P2-028 阶段 7 Preview 回归

- 级别/状态：P2，`OPEN / FAIL_PREVIEW_STAGE_7`。阶段1–6在本地延迟双击场景仍为`RESOLVED_LOCAL_QA`，但真实Preview终末按钮不满足同一幂等合同。
- 页面/路径：受保护Vercel Preview `/cases/P003/`；中文；桌面Chromium `1440×900`。
- 操作步骤：建立全新合法attempt并零轮提交第一阶段 → 依次完成orders、diagnosis、consult、treatment、perioperative、debrief输入 → 对“完成训练并生成最终报告”在同一事件循环同步调用两次click → 记录终末training-action → 等待360报告 → 刷新并复核报告与新增评分请求。
- 预期：单次用户动作只产生1个debrief request、1个request ID、1个score request；成功评分后不得显示失败提示；刷新不得重复评分。
- 实际：3/3完整旅程均产生2个不同request ID的debrief请求，状态依次为200与409 `stage_not_unlocked`，随后1个score请求为200。最新带UI诊断的2/2均显示“终末评分服务暂时不可用”，但最终报告实际可见；刷新后报告2/2保持且新增评分请求为0。
- 复现：完整七阶段3/3；错误终末提示2/2带诊断运行；最终报告3/3；刷新恢复2/2。
- AI来源：N/A；training-action与确定性评分流程，不调用Patient Agent或裁决医学内容。
- 状态变化时间线：七个阶段反馈200 → 首个debrief完成并解锁评分 → 第二个并发debrief以409拒绝 → score 200 → 最终报告可见，同时第二条异常路径写入失败提示 → 刷新以完成态恢复。
- HTTP/耗时：终末每轮固定3个请求，`stage-feedback/debrief`为200+409、`score`为200；刷新验证为401 `attempt_already_completed`且未破坏完成态。原始耗时与请求标识不保留。
- console/network：安全聚合仅保留pathname、action、stageKey、状态、request ID存在性布尔值和公开错误枚举；不保存header、body、Cookie、Authorization、session/attempt token或完整签名。
- 最小证据：`tests/preview/preview-blackbox.spec.mjs`中的`@preview-seven-stage`强断言，以及`artifacts/exploratory-qa/reports/c4ac9b5-preview-seven-stage-summary.json`。安全wrapper扫描并删除原始Playwright输出和失败上下文，不提交真实Preview trace、截图、录像或回答。
- 建议方向：把终末完成动作纳入与阶段1–6相同的同步in-flight锁；一个UI动作生成并复用稳定幂等键；只由当前动作的主请求决定失败提示，已成功score/完成态不得被并发409覆盖。增加阶段7同步双击、score一次性、错误提示与刷新完成态回归。
- 医学专家裁决：否；这是并发、幂等和UI状态归并问题。

## HEM-P1-054：跨 canonical/structured 的复合病史问句静默丢失子句并误触诊断边界

- 级别/状态：P1，首次为`OPEN / FAIL_LOCAL_QA / FAIL_PREVIEW`；当前`RESOLVED_LOCAL_QA / PARTIAL_PASS_PREVIEW_COLLECTABLE_COMPLETENESS`，复测Production与精确Preview基线`9b7fcd0d975533c7c6eda5614ca3b2978c9dce55`。
- 页面/路径：本地Patient Session生产规则链与受保护Preview `/cases/P001/`–`/cases/P007/`；本地中文/英文，Preview中文；桌面Chromium`1440×900`。
- 操作步骤：对42例分别初始化中英文合法session → 发送同时包含症状canonical槽位及既往史/用药/暴露structured槽位的自然复合问句 → 重放同一问题 → 比较公开`matchedSlotIds`与每个明确子句 → 单独核对医学冲突隔离、诊断/报告边界、输出语言与教师/结构泄露 → 在Preview按P001–P007逐例低频复跑5组。
- 预期：每个子句均被识别并分别回答；缺失事实可自然不确定，医学冲突继续隔离；“以前得过肿瘤吗”是既往史，不应因同句还问发热而变成诊断请求；不得附加未问的当前诱因或generic pain；单次操作保持1 agent/1 history。
- 实际：本地786场景中689个失败，跨层场景613/618失败。canonical一旦命中即不再执行structured matcher，导致既往结石、感染/肿瘤、高血压/糖尿病、用药/过敏、吸烟/暴露/家族、手术/输血/外伤/泌尿操作和妇科子句被静默丢弃；42/42中文既往肿瘤复合问句返回`diagnosis_boundary`。英文另有84个canonical alias遗漏，structured内部126个matcher遗漏，历史上下文还会错误命中`triggers`/`dysuria`等当前症状槽位。
- 复现：本地完整矩阵2/2逐字节一致；scenario failure 689/786、cross-layer 613/618。Preview降速正式运行35/35槽位不完整、7/7假诊断边界；首轮唯一429样本排除后HTTP与请求合同均为35/35。
- 当前复测：本地双跑为786/786、618/618、56/56冲突隔离和42/42肿瘤边界通过，报告逐字节一致。Preview P001–P007中文两轮各35次，合法可收集槽位遗漏0；每轮10次live_ai多返回治理阻塞槽位，归入HEM-P1-057，故本项只标合法子句完整性局部通过，不标完整Preview关闭。
- AI来源：本地为`local-rule-no-provider`、providerCalls=0。Preview为7次`live_ai`、13次`rule_fallback`、15次`safety_boundary`；不把任一fallback或安全边界冒充真实AI通过。即使7次live_ai，公开匹配元数据仍只含canonical前半句。
- 状态变化时间线：session ready → 复合问题进入canonical matcher → structured matcher被短路 → 部分问题直接规则回答或进入provider，但允许事实集合只含前半句 → history-log 200 → 学员时间线只收集部分已问病史；中文“肿瘤”路径则在canonical命中后因历史边界判定失败进入诊断阻断。
- HTTP/耗时：Preview正式35个agent与35个history均200，agent/history一一对应；批次约101秒。首轮高频尾部1个429触发1次客户端重试，降速后未复现，不计本缺陷HTTP失败。
- console/network：跨origin保护头请求0，教师元语言、结构字段和语言泄露0。证据只保存病例范围、probe类别、source/fallback枚举、槽位计数和错误分组，不保存回答、请求正文、request ID、token、Cookie、Authorization或签名。
- 最小证据：`tests/exploratory/patient-compound-history-matrix.mjs`、`tests/preview/preview-stability.spec.mjs`中的`@preview-compound-history-batch-1`，以及`artifacts/exploratory-qa/reports/c4ac9b5-patient-compound-history-summary.json`。两份完整本地分组报告仅本机保留；Preview原始输出经安全wrapper扫描后删除。
- 建议方向：合并canonical与structured matcher结果后再统一做治理/冲突检查；区分当前诱因与“以前/既往”历史上下文；使MED_ALL可与抗凝/抗血小板并存；先识别明确既往肿瘤上下文再应用诊断边界；长复合回答应按子句安全压缩或分段，不能整体降为unknown。新增42例双语跨层矩阵和Preview代表批，保持56个冲突隔离强断言。
- 医学专家裁决：确认路由合并、边界误判和子句完整性属于工程问题，不需要医学裁决；具体事实值、冲突与来源修订仍由现有具名专家流程处理。

## HEM-P1-055：补齐检查前置条件后重试仍被当作重复医嘱且永久不释放报告

- 级别/状态：P1，首次为`OPEN / FAIL_LOCAL_QA / FAIL_EMULATION`；当前`RESOLVED_LOCAL_QA / PASS_EMULATION / PREVIEW_RETEST_NOT_RUN`，复测Production基线`9b7fcd0d975533c7c6eda5614ca3b2978c9dce55`。
- 页面/路径：本地公开`POST /api/training-action/`与`/cases/P001/`第2阶段；42例生产数据矩阵；中文/英文；UI为`1440×900`与`390×844`。
- 病例范围：CTU链路影响P001–P016及P042共17例；两类病理链路影响P001–P012共12例。英文病理名称仍为来源审核阻塞，未冒充英文工程通过。
- 操作步骤：建立合法attempt并提交history进入第2阶段 → 先开带前置条件的目标医嘱 → 确认系统提示缺少前置且未返回报告 → 开立所需前置医嘱 → 再次开立原目标 → 与全新attempt中“先前置、后目标”顺序对照。
- 预期：补齐前置后重试应释放一次当前病例已配置的目标报告；重复保护只应防止已经成功释放的结果重复计分，不应永久锁死首次未满足条件的目标。
- 实际：恢复顺序58/58均返回`duplicateOrderIds`且目标结果为0；对照顺序58/58返回目标结果。根因表现为首次未满足前置时目标已进入已开立集合，后续结果过滤先按duplicate排除。
- 复现：本地矩阵连续2/2逐字节一致；中文41/41、英文17/17；UI桌面/移动模拟2/2，报告卡均为1→1而不是1→2。
- 当前复测：服务矩阵双跑覆盖42例、58个前置恢复场景，失败0；`1440×900/390×844` 2/2显示报告卡1→2、重试`duplicate=0`且重复提示0。没有当前SHA的问题级Preview证据。
- AI来源：N/A；生产`training-action`本地黑盒，`providerCalls=0`。
- 状态变化时间线：stage1拒绝过早开单 → history提交200 → 目标医嘱200、缺前置、0报告 → 前置医嘱200、1报告 → 目标重试200、duplicate=1、0报告 → UI保留旧报告且无法取得目标报告。
- HTTP/console/network：两次UI运行的`init/history/order×3`均200，HTTP错误和request failure为0；第三个order的业务payload稳定为`returnedReportCount=0`。同路径console另有HEM-P2-056，不作为本P1因果条件。
- 最小证据：`tests/exploratory/data-agent-stage-visibility-matrix.mjs`、`tests/exploratory/long-running-qa.spec.mjs`、`artifacts/exploratory-qa/reports/c4ac9b5-data-agent-stage-visibility-summary.json`及`artifacts/exploratory-qa/screenshots/hem-p1-055-prerequisite-retry-1440x900.png`。两份完整矩阵、两视口console/network、trace、录像和重复截图仅本机保留。
- 建议方向：未满足前置时不要把目标标记为已完成开立，或区分“已请求/待前置”与“已释放结果”；补齐前置后允许同一目标幂等地释放一次结果，同时继续阻止已释放结果重复事件和重复评分。增加三种顺序（目标→前置→重试、前置→目标、同请求目标+前置）和17例/41条数据回归。
- 医学专家裁决：否；只评价已配置结果的状态机可达性和幂等，不评价结果医学内容。

## HEM-P2-056：合法非终态报告卡渲染产生React列表key console error

- 级别/状态：P2，首次为`OPEN / FAIL_EMULATION`；当前`RESOLVED_LOCAL_QA / PASS_EMULATION / PREVIEW_RETEST_NOT_RUN`，复测Production基线`9b7fcd0d975533c7c6eda5614ca3b2978c9dce55`。
- 页面/路径：本地`/cases/P001/`第2阶段报告卡；`1440×900`与`390×844`。
- 操作步骤：进入检查阶段 → 开立P001已有合法`not_available`结构报告的前置医嘱 → 等待报告卡出现 → 采集browser console。
- 预期：合法报告卡渲染不产生React error；各列表元素具有稳定唯一key。
- 实际：桌面和移动模拟2/2出现`Each child in a list should have a unique "key" prop`，组件定位为`ReportCard`；页面仍可见，没有崩溃。
- 复现：2/2；每次1条console error。相同运行所有HTTP请求均200。
- 当前复测：与HEM-P1-055相同两viewport 2/2，报告卡React key error 0、其他意外console error 0、network failure 0。
- AI来源：N/A，生产Data Agent报告卡。
- 最小证据：HEM-P1-055同一UI最小复现、两份本机console摘要及脱敏聚合；不额外提交重复截图或大trace。
- 建议方向：对结果行使用不依赖空文本的稳定复合key（如resultId+索引），并避免在`result`为空而仅有impression时生成空key段落；新增合法非终态/空result报告卡的console零错误回归。
- 医学专家裁决：否；纯渲染稳定性问题。

## HEM-P1-057：待审核病史在provider成功路径丢失治理并暴露收集元数据

- 严重级别 / 状态：P1 / OPEN；`FAIL_LOCAL_QA`、`FAIL_PREVIEW`。
- 首次基线：`77815862a0abebff67b8d958f66944a0e11b068f`；当前复测基线：`9b7fcd0d975533c7c6eda5614ca3b2978c9dce55`。
- 页面和路径：Patient Agent，`POST /api/agent-chat/`；最小复现为P002手术史、P004吸烟史、P013饮酒史，当前Preview复合问句扩展覆盖P001–P006的10组live_ai路径。
- 语言 / viewport：中文、英文；API黑盒与合成provider最小复现，viewport N/A。
- 操作步骤：新建合法session → 分别询问上述待审核病史 → 记录公开source/fallback/matched计数 → 对照provider调用前应生效的`medical_history_pending_review`隔离。
- 预期：不调用provider；返回安全不确定，`isFallback=true`、`fallbackReason=medical_history_pending_review`，匹配槽位/事实均为空，不进入收集、时间线或评分。
- 实际：回答文本仍自然不确定，但被标为DeepSeek live_ai，`isFallback=false`、fallback reason为空，且每次返回1个matched slot和1个matched fact；前端收集路径会消费这些元数据。
- 复现：首次真实Preview两次各6/6、本地合成provider两次各6/6。当前基线本地双跑仍各6/6且报告逐字节一致；Preview中文复合问句双跑各35次操作，其中10/35稳定只多出治理阻塞槽位，两次相同10组、合计20个严格槽位合同失败。没有漏掉合法可收集槽位。
- AI来源：真实Preview为DeepSeek live_ai；本地为只回显`currentAllowedAnswer`的合成provider，不冒充真实AI。
- 状态时间线：session成功 → agent-chat 200 → provider成功 → 治理标志缺失、匹配元数据非空 → history-log 200。
- HTTP / 耗时：当前Preview两轮各35/35 agent-chat与35/35 history-log成功，HTTP合同失败0；无401/403/429/5xx。本轮聚合不保留逐请求耗时或request ID。
- console/network摘要：跨源保护请求0，教师/结构/语言泄露0；header、body、token、Cookie及完整回答不落盘。
- 最小证据：`tests/exploratory/history-medical-provider-governance.mjs`、`tests/preview/preview-stability.spec.mjs`、`artifacts/exploratory-qa/reports/7781586-history-medical-qa-summary.json`及`artifacts/exploratory-qa/reports/9b7fcd0-round25-agent-governance-regression-summary.json`；当前双跑原始脱敏报告仅本机保留。
- 根因证据 / 建议方向：确定性fallback已投影`collectableSlotIds/collectableFacts`，但provider成功分支仍返回治理前的`matchedSlotIds/matchedFacts`。在provider调用前统一解析`unresolvedReason/fallbackReason`并强制隔离；provider成功分支只能返回可收集投影；增加双语、复合问句合成provider与Preview回归。
- 医学专家裁决：否；修复是恢复现有待审核状态，不得借此批准或改写医学事实。

## HEM-P1-058：P037英文live_ai开放式主诉遗漏权威“1 day ago”病程

- 严重级别 / 状态：P1 / OPEN；`FAIL_PREVIEW`。
- 首次基线：`77815862a0abebff67b8d958f66944a0e11b068f`；当前复测基线：`9b7fcd0d975533c7c6eda5614ca3b2978c9dce55`。
- 页面和路径：P037 Patient Agent，`POST /api/agent-chat/`与`history-log`。
- 语言 / viewport：英文；Preview API黑盒，viewport N/A。
- 操作步骤：每次创建全新P037英文session → 询问开放式主诉/发病经过 → 检查是否包含“1 day ago/yesterday”等等价一天病程 → 核对source、fallback与history。
- 预期：英文回答自然表达权威一天病程，且不泄露未问病史。
- 实际：首次6/6回答均未出现一天病程等价语义。当前两轮各6个全新session分别4/6、5/6遗漏，合计9/12；其余3/12只以`yesterday`表达一天，错误其他时长0。12/12均为DeepSeek live_ai、无fallback、agent/history 200。显式询问发现时间的Preview控制双跑共6/6正确表达一天，本地上下文合成provider双跑通过。
- 复现：当前开放式主诉两轮共12个独立英文Preview session，9/12失败；显式时长控制6/6通过。不是缓存、fallback、HTTP或权威时长投影缺失。
- AI来源：DeepSeek live_ai。
- 状态时间线：session成功 → agent-chat 200/live_ai → 回答缺病程 → history-log 200。
- HTTP / 耗时：当前开放式12/12及显式控制6/6的agent-chat、history-log均200；每项单agent/单history，无401/403/429/5xx。本轮不保留回答正文、request ID或逐请求耗时。
- console/network摘要：fallback 0，教师/结构/跨病例/语言泄露0；凭据字段未输出。
- 最小证据：`tests/preview/preview-stability.spec.mjs`中的`@preview-p037-one-day-duration`、`@preview-p037-explicit-duration-control`，脱敏聚合`7781586-history-medical-qa-summary.json`及`artifacts/exploratory-qa/reports/9b7fcd0-round26-hem-p1-058-regression-summary.json`。
- 根因定位 / 建议方向：显式控制6/6证明权威一天时长与canonical投影存在；开放式live_ai仍9/12遗漏，问题定位于provider对完整`currentAllowedAnswer`的时间表达保真不足。在provider输出验收中校验已审核duration等价语义；不能修改病例时长，也不能用rule fallback掩盖provider成功后的遗漏。
- 医学专家裁决：否；现有权威值已明确，本缺陷不新增或批准医学事实。

## HEM-P2-059：英文查体分类安全占位折叠为重复React key

- 严重级别 / 状态：P2 / OPEN；`FAIL_EMULATION`。
- 基线：`77815862a0abebff67b8d958f66944a0e11b068f`。
- 页面和路径：P001训练页，第1阶段提交后进入第2阶段“Investigation Agent physical examination”；全局查体目录渲染路径。
- 病例 / 语言 / viewport：P001代表性复现；英文；`1440×900`、`1280×720`、`390×844`、`360×800`。
- 操作步骤：选择英文 → 打开P001 → 提交第1阶段 → 进入第2阶段 → 等待查体分类列表渲染 → 采集页面、console和network。
- 预期：未审核英文类别继续显示安全占位，但每个React列表项使用稳定唯一内部key；console error为0。
- 实际：5个不同类别均显示为`Physical examination`，组件同时把该展示占位用作列表key；四viewport每次稳定产生4条“same key / Keys should be unique”console error。页面仍可操作。
- 复现：最小探针4/4，每次4条错误、5个同名标题；完整阶段返回流程的英文桌面/移动2/2各出现12条同根错误，中文对照2/2为0。
- AI来源：N/A；Production前端与本地Production handler，provider调用0。
- 状态变化时间线：init-attempt 200 → stage1 feedback 200 → 打开stage2 → 英文查体分类同步渲染 → 4条重复key错误。
- HTTP状态和耗时：所有训练操作200，request failure 0；本轮缺陷不依赖网络耗时或Preview。
- console/network摘要：console唯一产品错误为重复key；network失败0。摘要不含header、body、token、Cookie、签名或环境值。
- 截图 / trace / 录像：代表截图`artifacts/exploratory-qa/screenshots/hem-p2-059-english-physical-exam-category-keys-360x800-failure.png`提交Git；四viewport trace、其余截图、console/network和失败录像仅本机保留并列入证据索引。
- 最小复现测试：`tests/exploratory/long-running-qa.spec.mjs`中的`@hem-p2-059`。
- 建议方向：React key使用未翻译的稳定类别ID/原始类别键或显式索引复合键，展示文案继续走安全占位；补四viewport英文console=0回归。
- 是否需要医学专家裁决：否。23个英文名称及相关查体来源仍`BLOCKED_SOURCE_REVISION`；修复不得补写或批准医学翻译。

## HEM-P1-060：标签页能力丢失后重新初始化返回可见成功但下一次提交使用陈旧attempt token

- 严重级别 / 状态：P1 / OPEN；`FAIL_EMULATION / CLEAN_TAB_STORAGE_EMULATION`。
- 基线：`77815862a0abebff67b8d958f66944a0e11b068f`。
- 页面和路径：P001训练页，阶段3；`POST /api/training-action/`的attempt重新初始化与后续`stage-feedback`。
- 病例 / 语言 / viewport：P001；中文`1440×900`、`390×844`，英文`1280×720`、`360×800`。
- 完整操作步骤：新建P001训练 → 提交阶段1与2 → 在阶段3填写满足提交校验的四个QA占位字段并等待自动保存 → 普通刷新并确认草稿与提交能力正常 → 清空当前标签页`sessionStorage`以模拟浏览器关闭/新标签页边界 → 刷新 → 确认四字段草稿恢复 → 等待attempt初始化完成 → 单击一次阶段3提交。
- 预期：客户端安全恢复或重新签发与服务端当前attempt版本一致的作用域能力；唯一`stage-feedback`为200、唯一request ID，既有进度继续可用。伪造、过期及跨病例/语言/mode/attempt能力仍须拒绝。
- 实际：四次初始化均返回200，页面一度允许提交；唯一后续`stage-feedback`均返回409 `stale_attempt_token`，随后页面显示训练会话不可用。草稿仍可见但无法继续。
- 复现：四固定viewport 4/4；每次普通刷新控制通过、清空标签页会话存储后失败。没有使用真实浏览器进程关闭，因此不扩张为真机或真实关闭复现率。
- AI来源：N/A；本地Production `training-action` handler黑盒，provider调用0。
- 状态变化时间线：阶段1反馈200 → 阶段2反馈200 → 阶段3草稿落盘 → 普通刷新验证200 → `sessionStorage`清空 → init-attempt 200 → 单次stage-feedback 409 `stale_attempt_token` → UI fail closed。
- HTTP状态和耗时：每次边界初始化1次200、阶段反馈1次409；request ID 4/4存在；network request failure 0。本轮不把本地耗时扩张为Preview性能结论。
- console/network摘要：每次仅有与409对应的1条资源console error及结构化warning；意外console error 0。摘要不保存header、body、attempt ID、token、Cookie、签名或环境值。
- 截图 / trace / 录像：代表截图`artifacts/exploratory-qa/screenshots/clean-tab-capability-recovery-zh-390x844.png`提交Git；四viewport脱敏trace、其余截图、console/network和失败录像仅本机保留并列入证据索引。trace中的训练状态仅为固定QA占位符。
- 最小复现测试：`tests/exploratory/long-running-qa.spec.mjs`中的`@clean-tab-recovery`；失败断言要求后续stage-feedback为200。
- 建议方向：提供与当前attempt服务端版本绑定的显式resume/reissue能力，或让重新初始化返回的token携带当前版本而非陈旧版本；成功状态必须由一次真实后续动作验证。不得把长期签名移入`localStorage`，不得自动新建attempt丢弃已保存阶段，也不得放宽现有安全拒绝。
- 是否需要医学专家裁决：否；纯会话能力恢复、状态版本和客户端可继续性缺陷。

### 第18轮多标签页扩展复现

- 路径与步骤：在同一浏览器context、同一P001 attempt中，由主标签页打开第二标签页并确认复制1项标签页训练能力；两个页面同时单击阶段1提交；识别被409拒绝的标签页，等待成功标签页把阶段1落盘后刷新失败标签，进入下一阶段并单击一次提交。
- 并发防重实际结果：四viewport每次均产生2个`stage-feedback`、2个不重复request ID；其中恰好1个200、1个409 `stale_attempt_token`。服务端单写防护有效，没有重复阶段写入。
- 恢复实际结果：失败标签刷新后每次先得到1个200初始化/验证响应，页面可进入下一阶段；唯一重试4/4仍返回409 `stale_attempt_token`，随后显示会话不可用。结果为`FAIL_EMULATION / MULTI_TAB_SAME_ATTEMPT_EMULATION`，与clean-tab边界同属“成功初始化未取得当前服务端版本能力”，不另建重复缺陷。
- 复现与环境：中文`1440×900/390×844`、英文`1280×720/360×800`共4/4；失败网络请求0、意外console error 0、provider调用0。自动标签页仿真不冒充真实浏览器进程关闭或真机。
- 证据：最小复现为同文件`@multi-tab-attempt`；代表截图`artifacts/exploratory-qa/screenshots/multi-tab-attempt-concurrency-zh-390x844.png`。聚合只保存计数、状态码和公开错误码，不保存request ID、attempt ID、token、header、正文或环境值。
- 修复回归补充要求：并发时仍必须保持恰好一次权威写入；失败标签刷新/重新验证后应取得当前attempt版本，并能提交唯一下一阶段动作。不得通过允许两个陈旧写入、共享跨标签长期签名或静默创建新attempt来“修复”。

## HEM-P1-061：不兼容本地attempt指针可把其他语言及病例的终态报告恢复到当前页面

- 严重级别 / 状态：P1 / OPEN；`FAIL_EMULATION / INCOMPATIBLE_LOCAL_ATTEMPT_POINTER_EMULATION`。
- 基线：`77815862a0abebff67b8d958f66944a0e11b068f`。
- 页面和路径：`/cases/P001/`与`/cases/P002/`；客户端attempt pointer读取、终态本地状态hydration及服务端attempt初始化。
- 病例 / 语言 / viewport：源病例P001、目标病例P001/P002；中英文互为源/目标；`1440×900`、`1280×720`、`390×844`、`360×800`。
- 完整操作步骤：使用本地Production handler生成真实已完成的P001七阶段/360报告状态 → 将该P001源语言attempt对象和终态状态写入其合法存储键 → 把当前目标语言的P001 pointer及P002 pointer分别指向该不兼容attempt → 打开目标语言P001并等待hydration稳定 → 导航P002并再次等待hydration稳定 → 检查终态报告、7/7状态及两个pointer身份。
- 预期：页面在读取pointer后使用既有`isAttemptCompatible`等价合同验证`caseId/mode/language/participant/schemaVersion`；不兼容pointer应被安全移除并创建当前作用域空白attempt，不得hydrate外语或他例终态、评分、反馈或时间线。
- 实际：四viewport 4/4在目标语言P001显示源语言P001终态报告；导航P002后4/4继续显示同一P001终态报告。P001与P002目标pointer共8/8保持`caseId/language`不兼容，页面均呈现7/7。服务端对同病例跨语言初始化4/4返回409 `attempt_already_exists`，但客户端已显示终态；P002初始化4/4为200独立服务端作用域，客户端仍使用P001本地状态。
- 复现：四viewport 4/4，中文目标2次、英文目标2次；跨语言与跨病例各4/4。该测试是受控localStorage污染，不宣称自然用户路径或远程攻击。
- AI来源：N/A；本地Production training handler，provider调用0。终态评分由本地确定性评分器生成，仅检查作用域与可见性，不评价医学内容。
- 状态变化时间线：生成P001源语言终态 → 写入不兼容目标pointer → 目标语言P001加载7/7终态 → 服务端语言作用域409 → 导航P002 → P002初始化200 → P002页面仍加载P001终态与7/7。
- HTTP状态和耗时：语言作用域4×409 `attempt_already_exists`；P002作用域4×200；network failure 0。本地耗时不作为Preview指标。
- console/network摘要：每次仅有对应409的预期资源console error，意外console error 0。报告不保存request ID、attempt ID、token、header、Cookie、签名、响应正文或环境值。
- 截图 / trace / 录像：代表截图`artifacts/exploratory-qa/screenshots/terminal-pointer-scope-isolation-zh-390x844.png`；四viewport trace关闭截图与DOM snapshot，仅保留动作骨架；其余截图、trace、console/network及录像本机保留。
- 最小复现测试：`tests/exploratory/long-running-qa.spec.mjs`中的`@terminal-pointer-isolation`；失败断言要求外语/他例报告均不可见且目标pointer身份兼容。
- 建议方向：在使用pointer前调用`isAttemptCompatible(activeAttempt, expectedScope)`；不兼容时删除当前pointer并创建新attempt，且不得读取由不兼容对象派生的attemptStorageKey。增加客户端hydrate前身份门禁及P001→P002、zh↔en终态回归。
- 是否需要医学专家裁决：否；纯客户端身份作用域、评分隔离和状态泄露问题。

## HEM-P2-062：存储恢复成功后失败警告不清除且英文界面显示中文警告

- 严重级别 / 状态：P2 / OPEN；`FAIL_EMULATION / LOCAL_STORAGE_CORRUPTION_AND_QUOTA_EMULATION`。
- 基线：`77815862a0abebff67b8d958f66944a0e11b068f`。
- 页面和路径：P001阶段1；损坏attempt JSON恢复、自动保存失败和后续写入恢复。
- 病例 / 语言 / viewport：P001；中文`1440×900/390×844`、英文`1280×720/360×800`。
- 完整操作步骤：预置兼容attempt pointer及损坏JSON正文 → 打开页面确认安全清空 → 关闭恢复警告 → 仅对`hematuria-attempt-v3:*`写入模拟`QuotaExceededError` → 填写QA病史小结 → 确认失败草稿未落盘 → 恢复`setItem`并修改草稿触发重写 → 确认新草稿已落盘 → 检查警告 → 刷新确认草稿恢复。
- 预期：损坏内容清空并显示当前语言安全提示；写入失败提示当前语言且失败草稿不伪装为已保存；下一次成功写入后保存状态与警告同步恢复，刷新保持最新草稿。
- 实际：核心安全/恢复合同通过：损坏正文4/4移除、空白恢复4/4；失败草稿0/4落盘；恢复写入4/4成功且刷新4/4恢复。缺陷为成功写入后旧“自动保存失败”警告4/4仍显示；英文2/2的损坏缓存及自动保存失败警告均为中文。
- 复现：四viewport 4/4存在陈旧警告；英文本地化2/2失败。使用方法级写入异常仿真，不冒充真实磁盘配额耗尽。
- AI来源：N/A；provider调用0。
- 状态变化时间线：损坏JSON → 安全删除/空白状态 → 模拟写入失败 → 警告出现且草稿未落盘 → 恢复写入 → 草稿落盘/saveStatus恢复 → 旧警告仍可见 → 刷新后最新草稿恢复。
- HTTP状态和耗时：training action非200为0；network failure 0；不记录本地性能结论。
- console/network摘要：意外console error 0；报告只保存布尔值与计数，不含草稿正文、存储内容、token、header、Cookie或环境值。
- 截图 / trace / 录像：代表截图`artifacts/exploratory-qa/screenshots/storage-fault-recovery-en-360x800.png`显示英文界面中的中文陈旧警告；其余四viewport证据本机保留。
- 最小复现测试：同文件`@storage-fault-recovery`；保留本地化与“成功写入后警告消失”失败断言。
- 建议方向：所有storageWarning走中英文文案表；成功`writeJsonStorage`后仅在当前警告属于自动保存失败时清除，避免覆盖其他独立警告。保留`saveStatus=error`与恢复后重新持久化合同。
- 是否需要医学专家裁决：否；纯本地存储状态与UI本地化缺陷。

### HEM-P1-061第20轮畸形身份字段扩展

- 新增最小矩阵：同一P001目标作用域依次注入缺少`schemaVersion/caseId/mode/language/participantId/attemptId`及错误`participantId`的7种pointer，每个固定viewport均完整执行。
- 结果：仅缺少`schemaVersion`的4/4被替换为兼容新pointer且未显示终态；其余6种在四viewport共24/24均显示由畸形对象派生的最终报告，pointer仍不兼容。缺`attemptId`时甚至没有合法初始化动作，终态仍先被客户端hydrate。
- 中英文、桌面/移动结果一致；非预期network failure和console error均为0。反复reload主动取消的`session/init`被单列为预期导航取消，不计产品网络失败。
- 该扩展证明门禁必须校验完整身份对象，而不能只检查`schemaVersion`；继续沿用HEM-P1-061，不另建同根缺陷。trace关闭截图和DOM snapshot，聚合不保存终态正文或身份值。

## HEM-P1-063：attempt存储API恢复后未补写pointer，已落盘草稿刷新即成为孤儿并丢失

- 严重级别 / 状态：P1 / OPEN；`FAIL_EMULATION / ATTEMPT_STORAGE_API_UNAVAILABLE_EMULATION`。
- 基线：`77815862a0abebff67b8d958f66944a0e11b068f`。
- 页面和路径：P001训练页；客户端attempt pointer初始化、自动保存及刷新恢复。
- 病例 / 语言 / viewport：P001；中文`1440×900/390×844`、英文`1280×720/360×800`。
- 完整操作步骤：在页面首次加载期间仅让`hematuria-attempt-v3:*`和`hematuria-attempt-pointer-v3:*`的`getItem/setItem/removeItem`抛出`SecurityError` → 确认训练以内存attempt初始化 → 恢复原生Storage API → 修改第1阶段病史小结并等待草稿文件成功写入 → 检查当前作用域pointer → 刷新 → 检查pointer指向状态、草稿内容及孤儿attempt文件。
- 预期：存储恢复后的第一次成功自动保存应同时修复当前作用域pointer，或以同等安全机制保证该attempt可发现；刷新应恢复刚保存的草稿且不得留下无法访问的孤儿状态。修复不得跨病例、语言、mode或participant猜测孤儿归属。
- 实际：四viewport均在恢复后写出包含新草稿的attempt文件，但当前pointer 0/4存在；刷新后客户端创建另一attempt并写新pointer，草稿恢复0/4，旧草稿文件4/4成为孤儿。初始与刷新后的training init共8/8为200，说明不是服务端初始化失败。
- 复现：正式运行4/4；中文2、英文2，桌面2、移动模拟2。每次均观察到attempt存储读、写、删除故障并在同页恢复；这是方法级故障注入，不冒充真实浏览器策略封锁、磁盘故障或配额耗尽。
- AI来源：N/A；本地Production training handler，provider调用0。草稿只使用QA标记，不评价医学事实。
- 状态变化时间线：pointer/attempt读取失败 → 内存attempt与服务端init 200 → Storage API恢复 → 草稿文件成功落盘但pointer仍缺失 → 刷新 → 新attempt init 200/新pointer → 当前表单空白、旧草稿孤立。
- HTTP状态和耗时：每次两次init均200；HTTP非200、request failure和非预期console error均为0。本地耗时不作为Preview性能结论。
- console/network摘要：存储警告生命周期与英文硬编码继续归HEM-P2-062；本缺陷只评价pointer与草稿可达性。摘要不保存草稿正文、attempt ID、request ID、header、Cookie、token、签名或环境值。
- 截图 / trace / 录像：代表截图`artifacts/exploratory-qa/screenshots/attempt-storage-api-recovery-zh-390x844.png`显示刷新后的P001空白第1阶段；其余截图、trace、console/network和失败录像仅本机保留。
- 最小复现测试：`tests/exploratory/long-running-qa.spec.mjs`中的`@attempt-storage-api-recovery`；失败断言要求恢复后pointer存在、刷新恢复草稿且孤儿计数为0。
- 建议方向：成功写入attempt状态时幂等校验/补写同作用域pointer，或把pointer和状态作为可恢复的一致性单元；补写前必须用`isAttemptCompatible`校验完整身份。增加初始读写不可用→同页恢复→保存→刷新，以及跨病例/语言孤儿不被错误收养的回归。
- 是否需要医学专家裁决：否；纯客户端存储一致性与训练进度恢复问题。

## HEM-P1-064：localStorage读写不可用时病例目录触发全页客户端异常且0/42病例可访问

- 严重级别 / 状态：P1 / OPEN；`FAIL_EMULATION / CATALOG_LOCAL_STORAGE_GET_SET_UNAVAILABLE_EMULATION`。
- 基线：`77815862a0abebff67b8d958f66944a0e11b068f`。
- 页面和路径：`/cases/`病例目录及共享`AppHeader`语言初始化。
- 语言 / viewport：中文意图`1440×900/390×844`、英文切换意图`1280×720/360×800`；四个viewport均在目录交互前崩溃。
- 完整操作步骤：在页面脚本执行前令`localStorage.getItem/setItem`抛出`SecurityError` → 打开`/cases/` → 检查目录标题、42个病例卡、搜索与语言控件、HTML语言和客户端异常。
- 预期：病例目录不依赖浏览器存储才能浏览；语言/进度读取失败应回退默认值，写入失败应仅禁用偏好持久化，不得阻断42例目录、搜索、筛选或直接URL。
- 实际：四viewport 4/4进入Next `Application error: a client-side exception`，病例卡0/42、搜索可用0/4、英文按钮不可用；每次1个page error。错误在共享`AppHeader`读取`hematuria-language`时即可触发，`CaseCatalogClient`自身语言读写也未保护。
- 复现：正式即时DOM审计4/4；此前可访问性locator探针也4/4进入同一错误页，但因等待目标元素产生超时，超时不计产品复现。方法级故障注入不冒充真实浏览器策略封锁。
- AI来源：N/A；纯客户端目录与布局。
- 状态变化时间线：导航`/cases/` → 共享语言读取抛出 → React客户端异常 → Next错误页 → 目录/搜索/病例卡均不可用。
- HTTP状态和耗时：request failure 0；故障发生在客户端storage调用，本地耗时不作为Preview指标。
- console/network摘要：每次page error 1、额外console error 0、network failure 0。报告不保存异常正文、存储键值、用户路径、Cookie、token、签名或环境值。
- 截图 / trace / 录像：代表截图`artifacts/exploratory-qa/screenshots/catalog-storage-unavailable-zh-390x844.png`；其余四viewport截图、trace、console/network及失败录像本机保留。
- 最小复现测试：`tests/exploratory/long-running-qa.spec.mjs`中的`@catalog-storage-unavailable`，断言42卡、目录/搜索可用、无Application error和page error。
- 建议方向：共享Header、Footer和CaseCatalog全部经安全storage helper读取/写入；失败时使用内存默认语言和空进度，目录仍渲染42卡。增加四viewport的`getItem/setItem`分别失败、语言切换和搜索回归。
- 是否需要医学专家裁决：否；纯客户端容错和核心导航可用性问题。

## HEM-P2-065：病例目录仅凭畸形pointer键名和无验证summary显示“进行中/已完成”

- 严重级别 / 状态：P2 / OPEN；`FAIL_EMULATION / MALFORMED_POINTER_AND_UNVERIFIED_SUMMARY_CATALOG_EMULATION`。
- 基线：`77815862a0abebff67b8d958f66944a0e11b068f`。
- 页面和路径：`/cases/`病例目录的进度标签聚合。
- 病例 / 语言 / viewport：P001畸形pointer、P002无验证summary、P003孤儿attempt控制；中文`1440×900/390×844`、英文`1280×720/360×800`。
- 完整操作步骤：预置值为损坏JSON的P001 pointer键 → 预置仅含`caseId=P002`、无attempt/评分/完成时间的summary → 预置无pointer的P003完整身份孤儿attempt → 打开目录并检查三张卡状态。
- 预期：目录在显示进度前校验pointer值、作用域和对应attempt；“已完成”必须来自结构完整且可验证的终态summary。畸形pointer、无验证summary和孤儿attempt均不得伪造进度。
- 实际：P001四viewport4/4显示“进行中”，P002 4/4显示“已完成”；共8条假进度。P003 4/4保持“未开始”，说明目录没有扫描收养孤儿attempt。
- 复现：四viewport4/4；每次2条假进度。页面仍可用，无network failure或console error。
- AI来源：N/A；纯客户端目录状态。
- 状态变化时间线：读取summary数组并按任意caseId标完成 → 枚举pointer键名并按caseId标进行中 → 不解析pointer正文/attempt → 渲染错误标签和“继续/进入”动作。
- HTTP/console/network：无API依赖；request failure 0、console error 0。证据不保存注入的storage正文、attempt ID或用户数据。
- 截图 / trace / 录像：代表截图`artifacts/exploratory-qa/screenshots/catalog-progress-integrity-zh-390x844.png`；其余证据本机保留。
- 最小复现测试：同文件`@catalog-progress-integrity`；P003孤儿不自动收养作为安全控制。
- 建议方向：复用完整`isAttemptCompatible`和安全JSON读取验证pointer；summary至少校验schema、attemptId、caseId、language、total=360及完成时间，并与本地终态或受信服务端状态绑定。损坏值应忽略而不是升级进度。
- 是否需要医学专家裁决：否；纯进度真实性与客户端数据完整性问题。

## HEM-P1-066：重新开始训练遇一次removeItem异常后仍reload并恢复原attempt、草稿和已提交阶段

- 严重级别 / 状态：P1 / OPEN；`FAIL_EMULATION / ONE_SHOT_ACTIVE_ATTEMPT_REMOVE_FAILURE_EMULATION`。
- 基线：`77815862a0abebff67b8d958f66944a0e11b068f`。
- 页面和路径：P001第1阶段；“重新开始训练/Restart training”清理与reload。
- 病例 / 语言 / viewport：P001；中文`1440×900/390×844`、英文`1280×720/360×800`。
- 完整操作步骤：建立合法attempt → 填写QA病史小结并成功提交第1阶段 → 确认本地submitted=1 → 让首次active attempt `removeItem`抛出一次`SecurityError`并立即恢复Storage API → 接受重新开始确认 → 等待reload → 比较attempt身份、草稿和submitted阶段。
- 预期：明确的重新开始操作应原子或可验证地清除当前attempt、pointer和能力后再reload；若清理失败，应保留当前页并提示失败，不能表现为已重启后恢复旧状态。
- 实际：一次删除故障4/4被触发；reload后4/4仍为相同attempt，submitted阶段4/4仍为1，QA草稿4/4保留。用户看似执行了重新开始，但训练状态完全未清除。
- 复现：四viewport4/4；同一方法级一次性异常，不冒充真实磁盘或浏览器策略故障。
- AI来源：N/A；本地Production training handler，provider调用0。只使用QA标记，不评价医学事实。
- 状态变化时间线：stage1提交200/本地落盘 → 用户确认restart → 第一个attempt文件删除抛错 → catch吞掉后直接reload → pointer与session能力未删除 → 原attempt、草稿和1/7状态恢复。
- HTTP状态和耗时：每次初始init与stage1提交为200；restart后复用旧本地/会话状态，无HTTP非200、request failure或非预期console error。
- console/network摘要：网络失败0、意外console error 0。聚合不保存草稿、attempt ID、request ID、header、Cookie、token、签名或环境值。
- 截图 / trace / 录像：代表截图`artifacts/exploratory-qa/screenshots/restart-remove-failure-zh-390x844.png`显示reload后仍为1/7；其余四viewport证据本机保留。
- 最小复现测试：同文件`@restart-remove-failure`；失败断言要求新attempt、submitted=0、草稿不保留。
- 建议方向：分别尝试并验证每个清理键，只有全部必要状态清理成功才reload；失败时显示当前语言错误并允许重试。或使用新attempt pointer的原子切换，同时确保旧token不可继续且不误删其他病例/语言/participant状态。
- 是否需要医学专家裁决：否；纯显式重启、存储清理和状态一致性问题。
## 2026-07-26 Production `9b7fcd0` 第 22 轮状态更新

- **HEM-P1-061：`PASS_EMULATION 8/8`。** 跨病例/语言终态 pointer 4/4、7 类畸形身份字段矩阵 4/4 均未 hydrate 终态，客户端生成的新 pointer 六个身份字段完整。原缺陷在本地自动 viewport 层已修复；不扩张为真实浏览器存储损坏证据。
- **HEM-P1-063：`PASS_EMULATION 4/4`。** transient Storage API 恢复后 pointer 与草稿均落盘，刷新命中 pointer 指向状态，排除当前 pointed key 后孤儿标记数为 0。旧 QA 计数曾把 pointed file 错算孤儿，已修正测试。
- **HEM-P1-064：`OPEN / FAIL_EMULATION 4/4` 扩展。** 原目录全页崩溃路径已 4/4 通过，但 P001 在语言偏好 `setItem` 抛错时点击 English 后 4/4 仍为中文、`html lang=zh-CN`，只显示存储提示。预期语言切换继续生效，仅持久化失败；建议把 React 语言状态更新与偏好写入解耦。
- **HEM-P2-065：`PASS_EMULATION 8/8`。** 畸形 pointer、未验证 summary、孤儿 attempt 和重复跨病例 summary 均不再制造“进行中/已完成”。
- **HEM-P1-066：`PASS_EMULATION 8/8`。** 一次 attempt/pointer/session capability 删除异常均 fail-closed：不导航、不部分清理，原 attempt、草稿、阶段和能力保持可重试，并显示本地化失败提示。旧测试强制等待 reload 与“故障后仍应清空”不符合缺陷文档允许的 fail-closed 分支，已修正。
- **HEM-P2-062：`OPEN / FAIL_EMULATION 4/4`。** 英文损坏缓存恢复提示仍为中文；成功保存恢复后旧自动保存告警仍可见。损坏值清理、内存恢复、后续落盘和刷新恢复均通过，故范围收敛为提示语言与陈旧状态清除。
- 本轮无新增缺陷 ID，无医学专家裁决需求；真实磁盘耗尽、浏览器策略封锁和真机 Storage 行为仍标记 `BLOCKED_REAL_STORAGE / BLOCKED_REAL_BROWSER`。

## 2026-07-26 Production `9b7fcd0` 第 23 轮状态更新

- **HEM-P1-060：`OPEN / FAIL_EMULATION 8/8`。** `@clean-tab-recovery` 四viewport均先通过普通刷新、恢复阶段3草稿并得到1次200初始化，但唯一后续 `stage-feedback` 4/4为409 `stale_attempt_token`；`@multi-tab-attempt` 四viewport均保持1次权威写入/1次陈旧拒绝，但失败标签刷新后唯一恢复写入仍4/4为同一409。
- clean-tab的初始化失败0、草稿丢失0、额外stage请求0；多标签request ID碰撞0、重复权威写入0、恢复请求倍增0。失败网络请求与意外console error均为0，故缺陷仍精确限定为“成功初始化/验证没有取得服务端当前版本能力”，不扩张为存储、布局或并发防重失败。
- 当前Production的 `df89a91` 浏览器attempt恢复变更不等于HEM-P1-060修复：它强化pointer、身份与存储恢复，但未建立当前attempt版本的安全resume/reissue。建议方向与原缺陷一致，且必须保留现有伪造、过期、跨病例、跨语言、mode、participant及陈旧写入拒绝。
- 本轮无新增缺陷ID、无医学专家裁决需求。自动标签页/sessionStorage边界只标 `FAIL_EMULATION`；真实浏览器进程关闭与真机仍为 `BLOCKED_REAL_BROWSER / BLOCKED_REAL_DEVICE`。

## 2026-07-26 Production `9b7fcd0` 第 24 轮状态更新

- **HEM-P2-044：`RESOLVED_LOCAL_QA / PASS_EMULATION 2/2`。** 两个移动viewport的四个目标均达到至少44 CSS px，不足目标0；邻接键盘与reduced-motion合同通过。真实设备仍`BLOCKED_REAL_DEVICE`。
- **HEM-P2-059：`OPEN / FAIL_EMULATION 4/4`。** 四viewport每次4条重复key错误、5个相同类别占位标题，failed network request 0；与原缺陷完全一致。修复只需把React key与展示占位解耦，不得补写或批准23个未审核英文来源名称。
- 本轮没有新增缺陷编号；HEM-P2-044关闭不抵消HEM-P2-059及开放P1，也不改变`BLOCKED_SOURCE_REVISION`或真实设备状态。

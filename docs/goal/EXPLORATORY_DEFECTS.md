# 探索式 QA 缺陷记录

状态：持续更新。已有主 Goal 缺陷沿用原 ID，不重复宣称通过。

## 外部/医学阻塞

| 缺陷 ID | 级别 | 状态 | 范围 | 所需动作 |
| --- | --- | --- | --- | --- |
| HEM-P0-001 | P0 | BLOCKED | 151 条 source 辅助来源语义 | 具名医学负责人裁决与受控迁移 |
| HEM-P0-023 | P0 | BLOCKED | 18 条双语医学极性冲突 | 具名医学/双语专家逐条裁决 |
| HEM-P0-018 | P0 | BLOCKED_REMOTE | Preview AI、日志同步与来源体验 | 登录态 Preview 真实 AI 20 轮及日志证据 |
| HEM-P1-019 | P1 | BLOCKED_REMOTE | Preview 变量作用域 | 仅核对名称/状态；不得读取值；补配由环境 owner 执行 |
| HEM-P1-020 | P1 | BLOCKED_REMOTE | 受保护 Preview API 可审计性 | 具备权限的会话采集脱敏 trace/network |
| HEM-P1-021 | P1 | BLOCKED_REMOTE | 真实首 Token/P95 | 真实 provider 和服务端计时样本 |

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

- 级别/状态：P2，OPEN；造成重复服务器工作与本地审计时间线污染。当前服务端同阶段重提交流程会替换该阶段的验证事件，尚无终末 360 分被重复累加的证据，因此不升为 P1。
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

## HEM-P1-030：Patient Session 病史路由不完整且自然病史问法被安全边界误拦截

- 级别/状态：P1，OPEN；必问既往诊疗、肿瘤史、泌尿操作史及常见改写在全部病例范围出现不可达或错误边界响应。
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

## HEM-P1-031：英文特异疼痛问法额外命中通用 pain 并扩大医学冲突隔离

- 级别/状态：P1，OPEN；特异症状问题会额外披露通用疼痛事实，且在 5 个 pain 冲突病例中错误阻断本可回答的腰痛/放射痛问题。
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

## HEM-P1-032：非空已匹配事实被长度保护直接降级为通用“不清楚”

- 级别/状态：P1，OPEN；规则路径在多个必问维度丢失已有 patient-facing 内容，学生得到通用未知回答但 slot 仍标记为已匹配。
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

## HEM-P2-043：本地 Next 开发环境病例目录链接对 42 个 `.html` 路由全部返回 404

- 级别/状态：P2，OPEN_LOCAL_ENV；影响本地开发/QA 从病例目录进入训练页，不外推到部署环境。
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

基线说明：本轮运行时与审计基线均为 Production `ff1a932785d891749ae8e73130bde8857062e194`，由 QA 分支普通 merge 得到 `a8b87d7522eac811f0781e1aa2cc7b8cb36752e6`。GitHub Pages 当前部署仍为 `main@5a3ad1199ae5e591160f12e410260287f0051875`，标记 `BLOCKED_BASELINE_MISMATCH`；精确 SHA 的 Vercel Preview 需要登录，匿名访问标记 `BLOCKED_PREVIEW_AUTH`，两者均不用于替代本地结论。

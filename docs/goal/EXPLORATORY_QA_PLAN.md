# 探索式黑盒 QA 长期计划

状态：执行中；当前 Production Goal 与运行时证据基线 `70ea9b3c7b31e11a84878de5c277cac60f35481c`；QA 交付分支 `codex/hematuria-exploratory-qa`。
边界：仅修改测试、只读审计工具、QA 文档与证据，不修改业务实现或医学数据。

## 启动门禁

- 每轮先执行 `git fetch --prune`、`git status --short --branch`、`git rev-parse HEAD`、`git worktree list --porcelain`，并读取 `origin/codex/hematuria-production-goal`。
- 被测生产基线必须精确等于源分支最新 SHA；若源分支变化，先保存并推送当前 QA 交付，再安全合并新基线和做受影响回归，不得基于旧生产代码继续测试。
- QA 分支 HEAD 会包含测试、报告和最小证据提交，因此不与生产 SHA 直接比较。门禁分别记录“被测 Production SHA”和“QA 交付 HEAD”，并确认从生产基线到 QA HEAD 没有业务功能或 `data/**` 差异。
- 2026-07-14 第 3 轮重新获准执行 `git fetch --prune` 后，远程 Production SHA 仍为 `41b3830a9095c692b3fdbe65a3dbf95b7ece5a37`；本轮 QA 起始 HEAD 为 `d16887e589faf247abfe96f83568b0346e6865ac`，相对远程 QA 分支 ahead 2。
- 2026-07-14 第 4 轮先把 QA HEAD `d739f914f9d36fa6d3b3eda585113237485355f9` 普通推送，再成功 fetch 到 Production `96fcf80f5a825585be53715e65851fbc113a7ab0`，以无冲突 merge `5d9902c60c6e6d6a30b65a715b64e9d5627fef94` 纳入新基线后才继续测试。
- 仓库内及父级未发现 `AGENTS.md`；执行边界以 `docs/goal/HEMATURIA_PRODUCTION_GOAL.md`、`EXECUTION_PLAN.md` 和本任务说明为准。

## 证据规范

探索套件使用 headless Chromium 和四个固定 viewport：`1440×900`、`1280×720`、`390×844`、`360×800`。

| 证据 | 目录 | 规则 |
| --- | --- | --- |
| 页面/失败截图 | `artifacts/exploratory-qa/screenshots/` | 文件名含场景、语言、病例和 viewport |
| Playwright trace | `artifacts/exploratory-qa/traces/` | 每个探索场景均保存 |
| 失败录像 | `artifacts/exploratory-qa/videos/` | 仅失败场景保留 |
| HTML/JSON/JUnit、console、network | `artifacts/exploratory-qa/reports/` | network 不保存 header、query 或 body |
| 脱敏问答 | `artifacts/exploratory-qa/transcripts/` | 标记真实 AI / fallback / fixture；不得含直接标识符或密钥 |

console 文本对 Authorization、Cookie、签名、token、secret 和 API key 做二次脱敏；network 仅保存方法、pathname、状态、资源类型和本地观测耗时。

## 分轮执行

1. 基线与证据基础设施：四 viewport 的首页、病例目录和训练页；P001–P042 页面壳、七阶段及提交前泄露门禁。
2. 问诊矩阵：42 例中文和英文逐问题覆盖；开放式主诉、重复问法、错误总结纠正、20 轮稳定性和自然度审查。
3. 交互与恢复：快速双击、Enter/Shift+Enter、刷新恢复、离线/fallback/重连、日志同步和幂等重试。
4. 七阶段流程：查体、生命体征、检验、影像、内镜、病理、诊断、处理、360 分反馈及数据 Agent 契约。
5. 质量与安全：四 viewport、键盘/焦点/axe、语音降级、状态闪烁、console/network、隐藏数据和评分抗伪造。
6. Preview 专项：仅在受保护 Preview 权限和正确变量存在时验证真实 DeepSeek、日志签名、20 轮、中文/英文各 10 轮及性能；fixture 不替代。

## 2026-07-14 第 3 轮进度与后续顺序

- 已建立直接覆盖生产 `server/patientSession.js` 的 42 例 × 37 canonical slot × 中英文 × 2 条固定改写矩阵；共执行 6,216 个路由探针、6,216 次重复一致性检查、84 次 session 初始化和 168 个诊断/报告边界检查。AI 开关只在测试子进程内关闭，`providerCalls=0`。
- 已建立 13 项公开 API handler 烟测，以及连接本地 Vercel-handler 适配服务器的 headless Chrome UI 回归；英文开场与 P004 教师元语言问题均在四个固定 viewport 采集截图、trace、失败录像、console 和 network 摘要。
- 矩阵只断言可达性、最小披露、语言纯度、格式、来源 envelope、边界和 quarantine；不比较肯定/否定、时间、病名或中英文医学等价性，不解除 `teacherReviewRequired`/`needs_revision`。
- 下一优先级：会话 ID 绑定/过期/跨病例滥用的公开 API 合同；42 例 structured-only 既往史缺口；实际 UI 中的可达性、键盘和恢复组合；随后继续数据 Agent、七阶段与评分对抗矩阵。新开放缺陷先保持失败断言，不扩大为医学裁决。

## 2026-07-14 第 4 轮安全基线回归

- 新增 19 项公开 handler 安全矩阵，覆盖训练状态缺失、会话能力篡改/过期、跨病例/语言/模式/尝试复用、幂等键缺失/冲突/重复及并发 single-flight；19/19 通过，`providerCalls=0`，报告不保存 token、session capability 或完整问答。
- 既有 42×37 双语规则矩阵与公开 handler 烟测均按真实训练状态签名重新适配并连续运行两次；计数仍为 1,127 个失败实例/127 组及 17 项烟测中的 7 项既有失败，没有把新鉴权门禁误报成旧缺陷修复。
- 本地浏览器适配器仅在服务端进程内保存真实训练状态与 session capability；浏览器、trace 和 network 只看到固定 `qa-redacted-*` 占位符。新增语言切换授权失败 HEM-P1-034；HEM-P1-027/028/029/033 均在新基线上复现。
- 下一顺序不再横向扩大：先交付本轮新基线回归、最小证据和缺陷报告，等待 Production Goal 修复开放工程缺陷；外部 Preview、真实 DeepSeek、日志和医学裁决仍独立阻塞。
- 在上述 QA 里程碑普通推送后，Production 又推进到 `52c24325ddd28262458f5eff4f37fe2866d53305`；差异仅为 secret scanner、scanner 测试、package script 和审计文档，无 `app/src/api/server/data` 变化。已合入并运行新增 scanner 合同/历史扫描，运行时 UI/API 证据按代码等价继续有效。

## 问诊最小覆盖集

每例覆盖血尿起始/反复/颜色、肉眼或镜下、时相、血块、疼痛、下尿路症状、发热寒战/潴留、肾小球线索、结石/感染/肿瘤/肾病史、抗凝/抗血小板/过敏、吸烟/职业暴露、家族史、适用时的月经/妊娠/妇科来源，以及手术/输血/外伤/泌尿操作。

## 判定边界

- `HEM-P0-001` 与 `HEM-P0-023` 保持外部医学裁决阻塞，不由 QA 改值或判定通过。
- 真实 DeepSeek、Preview 日志、`TRAINING_STATE_SECRET` 与真实首 Token/P95 只能由当次远程证据判定。
- fixture、mock、规则 fallback 只能证明确定性 UI/协议行为，报告必须显式标注来源。
- 单项阻塞不影响本地、fixture、UI、移动端、恢复、评分、数据 Agent 和自动截图继续执行。

## 2026-07-14 第 5 轮 `ff1a932` 优先回归

- 先普通推送既有 QA HEAD `4e3b3b1d107d34e2027229b835e2cbd21ddc61d4`，再以无冲突 merge `a8b87d7522eac811f0781e1aa2cc7b8cb36752e6` 纳入精确 Production SHA `ff1a932785d891749ae8e73130bde8857062e194`；未 reset、rebase、force push 或手工解决业务冲突。
- HEM-P1-027 使用四个固定 viewport、中英文、真实本地 session 开场与确定性滚动 fixture 复测；浏览器结果只标记 `PASS_EMULATION`，真机软键盘与 safe-area 继续 `BLOCKED_REAL_DEVICE`。
- HEM-P1-029/033/034 分别以 42 例规则矩阵、公开 handler、四 viewport 本地浏览器和既有双向/刷新/快速切换合同复测；真实 DeepSeek、Preview 日志和医学内容不由这些结果替代。
- P001–P042 路由按环境拆分：本地 Next dev、GitHub Pages 与精确 SHA Vercel Preview 各自记录。Pages SHA 不一致即 `BLOCKED_BASELINE_MISMATCH`；Vercel 保护页即 `BLOCKED_PREVIEW_AUTH`，均不得写成病例通过。
- 当前优先回归完成后继续原计划：先处理仍开放的 HEM-P1-030/031/032、HEM-P2-028 与新发现的本地 dev 目录链接问题，再推进七阶段、评分、恢复和数据 Agent 的剩余自动化；不等待外部阻塞解除。

## 2026-07-17 夜间第 6 轮 `8e7d148` 回归

- 保存并普通推送 QA 安全提交后，将 GitHub Actions/Vercel 均成功的 Production `8e7d148e3459f3b960161903fba9214998661635` 以 merge `ad2f6a42fd9b82cfc39b61fb09520784f2360432` 纳入；冲突只在两个 Preview QA 测试文件，业务实现与 `data/**` 无冲突、无 QA 作者差异。
- 优先复测已覆盖第一阶段、中英文切换/刷新/快速双击、HEM-P2-028、HEM-P2-043、本地 session 能力、42×37 双语 Patient Session、七阶段、360 分、数据 Agent、TTS/降级、日志幂等和四 viewport UI。
- 真实 Preview 在一次失败调用把受保护 request header 写入 runner stdout 后标记 `SECURITY_BLOCKED`：专用输出目录已删除，磁盘证据未保留；runner 改为先捕获并扫描 stdout/stderr 和 artifact，再决定是否输出。本轮不继续扩大真实 Preview 请求。
- GitHub Pages 独立于本地环境复测：公开目录有 42 张卡片，但只含 12 个显示 ID 路由和 30 个旧内部 ID 路由，标记 `BLOCKED_DEPLOYMENT_MISMATCH`；本地/构建/basePath 仿真通过不得替代真实 Pages。
- 下一顺序：在 Preview 输出安全门禁经过独立复核后再恢复当前 SHA 的真实 AI/稳定性测试；其间继续不依赖外部权限的逐病例 UI、可访问性和可重建证据维护。HEM-P0-001/023 与不安全来源仍只记录阻塞，不做医学裁决。

## 2026-07-19 夜间第 7 轮 `3a16f931` 执行与下一顺序

- 先普通 push 既有 QA 交付，再以普通 merge `991ec7605ca9b82c4c4835a9fcb075dfaf770e35` 纳入精确 Production SHA `3a16f9314d1b3cf50e30bc41dcfeaf19f4fa77a8`；仅 QA runner 冲突按 fail-closed 安全合同逐项合并，业务实现和 `data/**` 无 QA 差异。
- Preview 输出安全门禁已完成 15/15 独立 canary，当前精确 SHA 的 health、42 例路由、第一阶段、中文/英文各 10 次 live AI、10 次 session 初始化和单 session 20 轮已恢复执行；所有批次继续使用同源保护、凭据字节扫描和专用输出删除。
- 当前新增优先级：第一，向主 Production Goal 交接并复测 HEM-P1-030 的单一英文泌尿操作路由回归；第二，复测 HEM-P2-044 的 44×44 触控目标；第三，继续代表病例真实 AI 的错误总结纠正、语言纯度和 fallback→live_ai 恢复，但只保存脱敏结论。
- 仍未自动完成的项目按原计划继续：真实网络中断/429/Redis不可用等需要受控故障注入的 Preview 场景、真实手机软键盘/safe-area，以及医学/来源审批。没有授权时不主动破坏远程服务，也不把不可测项写成通过；浏览器DOM首现计时已在后续里程碑完成。
- 每个后续里程碑继续遵循：更新六份 QA 文档和 EVIDENCE_INDEX → 对拟提交集扫描 → 小步 QA commit → `git fetch --prune` → 普通 push → 检查新 Production HEAD；禁止 reset、force push、业务代码和医学数据修改。
- Production `657ba5d` 仅为权威验收文档校正且远程门禁绿色；QA 已安全 merge，不重复运行时全套。下一运行时优先级仍是 HEM-P1-030 的 37-slot遗漏问法与 HEM-P2-044，Production索引中的“ENGINEERING CLOSED”不能替代独立失败复现。
- 已在精确 `657ba5d` Preview补充浏览器前进/后退恢复：P001一轮live AI在两次返回后保持单消息、单agent request与单history-log。下一稳定性空缺转向经授权的受控网络短断/后台恢复；不得主动破坏第三方或把本地fixture替代Preview。
- 浏览器后台恢复已用Chromium `frozen → active`生命周期完成安全仿真；剩余连接稳定性空缺是经授权的真实网络短断、provider超时/429、history 503和Redis暂不可用。没有故障注入授权时保持阻塞，不以生命周期仿真扩张结论。
- 真实Preview浏览器可见回答计时已完成5个中文样本；指标定义为点击发送到患者DOM节点首次出现。当前非流式传输下不测、也不推算provider首Token；后续只有流式接口出现时才新增真正的TTFT合同。
- 真实AI错误总结自然纠正已完成P001中文最小探针；后续扩展到其他代表病例时继续只保存一致性/泄露布尔结果，不落盘完整回答，不把工程一致性检查解释为医学裁决。
- P001英文等价错误总结与无指代模糊问题澄清也已完成；下一自然语言扩展应转向不同疾病类别的代表病例，不再用P001重复问法冒充全42例真实AI质量覆盖。
- 不同疾病类别代表病例开放式主诉已完成10例×中英文20样本；下一可执行自然语言空缺转向同一事实换问法的一致性与代表病例多轮追问，仍只保存来源/一致性/泄露聚合，不落盘回答正文。
- 同一病程时长双改写已完成5例×中英文10对，并按live AI与safety boundary分层；下一可执行自然语言空缺转向代表病例多问题追问与同session跨语言事实保持，不对隔离事实做自动裁决。
- P023同session中文→英文→中文事实保持已完成：三轮均命中同一病程时长，来源分层为2次DeepSeek live AI与1次明确safety boundary；下一可执行空缺转向代表病例多问题追问。继续禁止把安全边界写成真实AI通过，也不保留回答正文。
- P038中英文各5轮代表性多问题追问已完成，重复时长保持一致且10次agent/history一一对应；下一自然语言空缺转向另一类别的刷新后继续追问或更长上下文，不重复扩张P038结论。仍按live AI/safety boundary分层，不评价受治理回答的医学适当性。
- P037刷新后继续追问发现HEM-P1-045：中英文均恢复对话DOM但下一次发送401 `session_capability_required`，6/6复现。失败断言保留；后续不依赖该缺陷的QA继续执行，修复后优先复测刷新后发送、日志一对一及事实连续性。
- 本地AI接口防滥用与恢复四脚本已重跑通过，覆盖Origin/CORS、capability、角色/字段/输入边界、幂等并发、预算限流、训练状态和恢复；下一项不再重复本地安全全套，转向尚未覆盖的真实UI/代表流程。真实Preview限流和故障注入继续等待授权，不由本地结果替代。
- 真实Preview中英文各1个低频内容型Prompt注入/写代码请求已由safety boundary在provider前处理；后续安全空缺只剩高频限流和受控故障注入等需额外授权项目，不再扩大发送攻击性请求。继续转向非破坏性UI/流程覆盖。
- 真实Preview公开API会话绑定已用11个低频拒绝请求补测：缺失attempt state、跨语言/模式/病例session初始化，以及缺失/篡改/跨病例/跨语言/跨模式/跨attempt capability和错误stage均按精确HTTP/错误码在provider前拒绝。后续不重复该矩阵，安全空缺继续只保留高频限流、过期墙钟与受控故障注入等需额外授权或时间条件的项目。
- 数据Agent只读结构审计发现HEM-P1-046：28/28条含数值final检验结果缺少结构化单位与参考范围，涉及13例；case/order/前置条件等其余257条结构合同通过。失败断言与P001生产报告卡fixture证据保留，后续等待Production修复后按“全量结构0缺口+代表UI不显示—”复测；QA不填写或裁决医学值。
- 数据Agent双语呈现继续发现HEM-P1-047：Production报告卡把`final/not_available/not_performed`三个内部状态值直接显示给学生，并因优先读取`status=final`而遮蔽已有`abnormalLevel`。后续修复回归要求三种状态均为本地化学生文案、既有异常标志得到异常呈现、四固定viewport中英文均通过；QA只验证既有结构标志的呈现，不裁决标志医学正确性。
- 英文数据Agent全量合同与四viewport浏览器新增HEM-P1-048：目录分类/医嘱名及结构化结果正文仍大量中文，42/42病例受影响。后续回归要求英文目录、已识别医嘱和报告卡无CJK串线，并保持257/257结果精确释放；医学结果英文译文必须来自受控双语医学来源，QA不自行翻译或解除HEM-P0-023。

## 2026-07-23 第 8 轮 `70ea9b3` 独立复测与下一顺序

- QA 先普通推送 `7899cd4`，再以普通 merge `b94d7803507df3da52379f83ab05fef2afc45c87` 纳入精确 Production `70ea9b3c7b31e11a84878de5c277cac60f35481c`；唯一冲突位于 QA/Production 共用测试脚本，未发生业务代码或 `data/**` 冲突，未 reset、force push 或丢失报告。
- 第一阶段/session capability 按“发送前不得调用 agent、签发后单请求”执行，再覆盖 P003 零轮提交、P001 双语首问/切换/刷新、快速双击和进入第二阶段。真实 Preview 与本地 contract 分层，非法 capability 拒绝不计为产品错误。
- Patient Agent 新增用户指定 10 类自然问法，覆盖 42 例×中英文 840 个场景；按 canonical、错误 unknown、极性、正确 unknown、冲突隔离、双语等义与额外病史分别统计，不保存完整问题、回答或医学值。新工程缺陷 HEM-P1-050 等待修复，HEM-P0-001/023 仍由具名医学专家裁决。
- 精确 Preview 继续使用安全 Automation Bypass wrapper；所有专用 Playwright 输出在凭据扫描后删除，只把 session/live_ai/fallback/性能/request/history 聚合写入 QA 报告。HEM-P1-051 修复后优先复测英文纠错、模糊澄清、P037刷新追问和P038双语五轮。
- 42 例本地与 Preview 路由、代表病例七阶段/360 分、四视口双语开场与手动上翻已完成；GitHub Pages 没有本轮精确基线证据时继续独立标记部署阻塞，不能用本地或 Preview 替代。
- 下一工程复测顺序：HEM-P1-050/051，其后保留开放的 HEM-P1-046/047/048 与 HEM-P2-044；真实手机软键盘/safe-area、受控 provider/Redis 故障注入、医学审批继续外部阻塞。当前发现新增 P1，因此本轮交付后不把长期 Goal 标为完成。

## 2026-07-23 第 9 轮 `c4ac9b5` 独立复测与下一顺序

- 先把 `70ea9b3` 尚未固化的 42 例双语七阶段、72 项浏览器和安全/评分合同聚合为 QA 提交 `6cdcfbb` 并普通 push；随后普通 merge `706a758` 纳入精确 Production `c4ac9b5a59021bed10dc2d94c4ebf4d8f97badd2`。唯一冲突位于 QA Preview 测试，业务路径与 Production 差异为 0。
- HEM-P1-050 按 840 场景、1,428 canonical checks、3,150 问矩阵及 pain specificity 重跑；错误 unknown、极性、额外病史均要求为 0。HEM-P1-051 使用安全 Preview wrapper 复测 P001英文纠错/澄清和P037/P038上下文，合法请求必须全部 live_ai 且history一一对应。
- Data Agent 分两层：28项缺元数据/23项缺英文名称的学生呈现与CJK/状态门禁；公开 handler 对未审核医嘱的内部ID、结果释放和360分事件隔离。UI禁用不能替代服务端 fail-closed。
- 完整相关回归包含 Preview 9项核心、10次session、5+5语言稳定性、20轮、后台恢复仿真；本地practice 78项、42例双语七阶段、14个安全/恢复/评分/Patient合同、root/Pages basePath 82页构建和bundle扫描。
- 下一工程优先级为 HEM-P1-052 服务端评分隔离；修复后必须重跑23个未审核名称、4个评分相关医嘱/29条规则链、英文UI和360分抗伪造。真实手机、受控provider/Redis故障注入、28项医学元数据、23个审核英文名称、161个来源修订及HEM-P0-001/023继续保持各自阻塞状态。

## 2026-07-24 第 10 轮 `c4ac9b5` 开放缺陷回归与下一顺序

- HEM-P1-045按P037中英文各“2轮→刷新→2轮”在精确Preview复测；要求8次合法回答均为live_ai、8次history一一对应、刷新后401/缺日志/会话重建均为0，并继续检查病程连续性与泄露边界。
- HEM-P1-030用42例×37槽位×双语×双改写矩阵及公开agent-chat合法路径同时复测；完整回答不落盘，只保留期望/实际slot类别和计数。该路由缺陷仍开放，不能由HEM-P1-050的10类自然问法通过替代。
- HEM-P2-028以150ms反馈延迟、同步双击、单请求/单ID/单时间线强断言做6次桌面重复和桌面/移动代表运行；HEM-P2-044继续按44×44 CSS px几何门禁在两个移动viewport执行。
- HEM-P1-052扩展同一23项中文合法路径非回归：英文未审核名称必须按语言fail closed；中文审核路径仍须23/23匹配，并保持与相同前置状态一致的结果释放，防止修复时全局禁用。
- 下一可独立执行项转向P006–P042尚未抽样的真实Preview自然语言分批覆盖，并等待HEM-P1-030/052与HEM-P2-044工程修复后定向回归。医学、来源、真实设备和受控故障注入阻塞继续分层，不扩写为工程通过。

## 2026-07-24 第 11 轮 `c4ac9b5` 未抽样 Preview 分批计划

- 已完成第一批P006–P012中英文开放式主诉：每例使用新合法session，检查source/provider/fallback、agent/history 1:1、语言/教师/结构化泄露和跨origin保护头；三轮自然问法与一轮canonical控制构成HEM-P1-053证据。
- 后续仍按小批次继续P013–P042未覆盖病例，不因HEM-P1-053暂停中文、路由、七阶段、Data Agent、UI或其他独立项目；英文开放主诉结果必须按`live_ai`、`rule_fallback`和`safety_boundary`分层，不把fallback冒充真实AI通过。
- HEM-P1-053修复验收必须同时覆盖：自然英文改写不依赖semantic classifier、canonical控制进入live_ai、P006–P012中英文各例、单次request/history、输出过滤安全门禁、无教师/结构化泄露。若仅修一条路径，缺陷保持开放。
- 每批只保存病例ID、语言、source/provider、安全枚举、计数和泄露布尔值；完整问答、request body、token/header、Preview trace和浏览器用户数据均不入Git。原始runner输出必须先按实际凭据字节与敏感header扫描，再删除。
- 当前工程优先级为HEM-P1-052和HEM-P1-053，其次HEM-P1-030与HEM-P2-044；28项医学元数据、23个审核英文名称、161个来源修订、HEM-P0-001/023、真实手机和未授权故障注入继续保持原阻塞状态。
- 同一批次框架已完成P001–P042全量诊断扫描：自然英文42/42规则fallback，canonical英文31/42 live_ai、11/42 safety boundary。后续不再重复扩大同一问法；等待HEM-P1-053修复后按“42自然问法 + 11失败控制 + 31通过对照”定向验收。
- 下一可独立执行范围转向尚未完成的逐病例详细病史组合与代表七阶段真实Preview抽样；继续避开需要医学裁决的答案正确性，并优先选择不与HEM-P1-053同一根因重复的中文、Data Agent、会话恢复和安全边界。

## 2026-07-24 第 12 轮 `c4ac9b5` 七阶段 Preview 计划更新

- 已用P003中文零轮路径完成3次真实Preview七阶段与360报告；2次附带刷新恢复诊断。阶段1–6按顺序成功，阶段7同步双击稳定暴露HEM-P2-028 Preview回归。
- HEM-P2-028后续验收必须同时覆盖阶段1–6和终末完成按钮：单次动作各1个debrief/score、稳定request ID、无并发409、无错误失败提示、刷新不重复评分。不得用本地fixture或前六阶段通过替代终末Preview结果。
- session/init的409 `stale_attempt_token`仅在4次诊断迭代中观察2次，最近2次为200；先作为间歇性观察，不创建重复缺陷。后续以“零轮提交与session初始化并发”做独立低频复测，只有取得稳定用户影响后再登记。
- 下一独立范围回到逐病例详细病史组合；等待HEM-P1-030/052/053、HEM-P2-028/044修复后定向回归。医学/来源修订和真机阻塞继续分层。

## 2026-07-24 第 13 轮 `c4ac9b5` 详细病史矩阵与下一顺序

- 42例双语详细病史从单槽合同扩展为10组自然复合问句；每组显式声明canonical、structured及女性适用槽位，并在内存中检查重复确定性、治理隔离、错误边界、额外槽位和泄露，不比较医学事实值。
- HEM-P1-054修复验收必须同时满足：42例×双语跨层子句合并、MED_ALL与特异药物并存、既往肿瘤不触发诊断边界、过去外伤/操作不扩张当前`triggers`、长复合回答不整体安全降级，以及56个医学冲突场景继续隔离。
- Preview只先覆盖P001–P007中文5组，使用1.5秒节流防止把批量429混入路由结论；后续P008–P042与英文批次等待该P1修复后做定向全量，不重复生成已知同根因失败。
- 下一独立QA转向尚未由HEM-P1-054覆盖的查体/检验/影像/内镜病理逐病例可见性与阶段权限组合；继续优先不依赖医学裁决、真机或新权限的项目。

## 2026-07-24 第 14 轮 `c4ac9b5` Data Agent阶段权限与下一顺序

- 已完成42例×双语第2阶段矩阵：过早/过晚exam与order拒绝、16项查体逐项选择、配置/未配置结果分离、检验/影像/内镜/病理精确释放、跨病例/教师字段/CJK泄露和阶段状态保持。
- 前置条件恢复发现HEM-P1-055；修复验收必须覆盖17例41条前置结果、中文41场景、已审核英文17场景、58个顺序对照，且“补齐后重试”只释放一次结果、不重复事件或评分。
- 两视口UI复现同时发现HEM-P2-056；后续报告卡回归增加console error=0门禁，非终态/空result/仅impression报告都必须具有稳定列表key。
- 下一独立QA转向第3–6阶段的跨阶段权限、返回导航、隐藏证据和结构化数据泄露矩阵；等待HEM-P1-030/052/053/054/055、HEM-P2-028/044/056修复后分别定向复测。医学、来源、真机和未授权故障注入继续独立阻塞。

## 2026-07-25 第 15 轮 `7781586` 后续顺序

- HEM-P1-057修复后，必须以“provider返回安全不确定文本”作为对抗输入，确认P002手术史及未审核吸烟/饮酒在中英文均于provider调用前隔离，`matchedSlotIds/matchedFacts`为空且不进入收集、时间线或评分。
- HEM-P1-058修复后，以全新Preview会话复测P037英文开放式主诉至少6次，必须保留权威“1 day ago”语义，同时维持live_ai、history成功和零教师/结构泄露。
- Preview速率窗口恢复后，补跑复合问句、刷新、第一阶段提交、history-log与评分的定向抽查；429样本只记环境阻塞，不降级断言。
- HEM-P0-001/023与14项新增阻塞继续等待具名医学裁决；真实软键盘/safe-area继续`BLOCKED_REAL_DEVICE`。不以规则、fixture、自动viewport或工程映射替代这些结论。

## 2026-07-25 第 16 轮 `7781586` 阶段返回治理与下一顺序

- 已完成42例×双语第3–6阶段返回重提矩阵：未解锁响应最小化、后续阶段重新锁定、重做恢复、评分相等、重复score幂等和formal用途拒绝。
- HEM-P2-059修复验收需覆盖四viewport英文第2阶段：不同内部查体类别必须使用稳定唯一React key；在英文名称未审核时仍显示安全占位并保持`BLOCKED_SOURCE_REVISION`，不得通过硬编码医学翻译消除错误。
- 下一独立范围转向阶段3–6刷新/浏览器关闭恢复后的返回重提，以及跨病例/跨语言本地存储污染和终末报告返回锁定；避免重复已完成的顺序七阶段与API矩阵。
- Preview速率窗口恢复后再抽查一次阶段3返回重提；本地handler/viewport结论不得冒充Preview。真实设备和医学/来源审核继续独立阻塞。

## 2026-07-25 第 17 轮 `7781586` 会话持久化与隔离后续

- 已完成阶段3–6逐阶段草稿刷新、终末报告刷新/反向锁定及跨病例/跨语言本地存储隔离；四固定viewport继续分别标记`PASS_EMULATION`，不扩张为真实手机或真实浏览器关闭通过。
- 新增HEM-P1-060修复验收：先完成阶段1–2并在阶段3保存完整草稿，确认普通刷新可继续；再模拟新标签页/浏览器关闭的`sessionStorage`丢失边界。重新初始化后的唯一下一次`stage-feedback`必须为200且request ID唯一，不得返回`stale_attempt_token`，本地草稿和已提交阶段不得丢失或复制。
- HEM-P1-060修复不得把签名移入`localStorage`、放宽伪造/过期/跨病例/跨语言/mode/attempt拒绝，也不得用自动创建新attempt静默丢弃旧进度。优先采用与服务端当前attempt版本一致的安全resume/reissue合同。
- 后续独立范围转向多标签页并发同一attempt、关闭/重开后的终末报告只读恢复及HEM-P1-060修复后四viewport定向回归；避免重复已通过的普通刷新和跨病例键隔离。HEM-P1-057/058、HEM-P2-059及既有开放项继续独立跟踪。
- 真实浏览器进程关闭、真实手机后台/软键盘/safe-area仍没有直接证据；`CLEAN_TAB_STORAGE_EMULATION`不得写成`PASS_REAL_DEVICE`或真实关闭结论。医学和来源审核阻塞状态不变。

## 2026-07-25 第 18 轮 `7781586` 多标签页与终态恢复后续

- 已完成同attempt双标签并发及终态新页面只读恢复。并发单写防护、唯一request ID和终态零重复评分通过；失败标签无法重新同步作为HEM-P1-060同根扩展复现，不创建重复缺陷编号。
- HEM-P1-060修复回归增加多标签门禁：两个标签同时提交仍只能有一个权威写入，失败标签刷新/验证后必须能从服务端当前版本继续唯一下一阶段动作；clean-tab和多标签两条路径均须四viewport通过。
- 下一可独立范围转向浏览器存储损坏/配额失败时的fail-closed与可恢复性、终态attempt跨病例/语言污染防护；避免重复普通刷新、终态新页面和已覆盖跨病例键隔离。
- 真实浏览器进程关闭、真实设备后台/软键盘/safe-area、受控Preview网络/provider/Redis故障和医学/来源裁决继续保持各自阻塞，不由自动页面仿真替代。

## 2026-07-25 第 19 轮 `7781586` 存储故障与终态指针隔离后续

- 已完成损坏attempt JSON、`QuotaExceededError`写失败/恢复，以及跨语言/跨病例终态指针污染四viewport测试。核心存储fail-closed与恢复通过；新增HEM-P1-061和HEM-P2-062。
- HEM-P1-061修复验收必须在从pointer派生attempt存储键之前调用统一兼容性检查，覆盖`caseId/language/mode/participant/schemaVersion`；发现不兼容时清除错误指针并初始化目标作用域，不得显示外语或跨病例终态，也不得放宽服务端token、版本或病例校验。
- HEM-P2-062修复验收必须覆盖中英文四viewport：缓存损坏与自动保存失败提示使用当前语言；一次后续成功持久化只清除对应自动保存失败提示，不吞掉其他会话或医学安全告警。
- 下一独立范围可覆盖缺失或畸形身份字段的pointer、`getItem/removeItem`整体不可用，以及history-log pending队列在写失败后的恢复；避免重复本轮相同故障。真实存储耗尽、浏览器进程损坏、真机与Preview受保护故障注入继续单独阻塞。

## 2026-07-25 第 20 轮 `7781586` 身份完整性与队列恢复后续

- 已完成7种pointer身份字段矩阵、attempt存储API初始不可用→恢复→保存→刷新，以及history-log一次写失败/三次503/刷新/手动恢复四viewport测试。
- HEM-P1-061修复门禁扩展为7种身份对象：除完整且作用域一致的pointer外都必须在任何`attemptStorageKey`读取前替换；缺`attemptId`也不得仅凭本地终态绕过服务端初始化。
- 新增HEM-P1-063修复验收：初始pointer/attempt读写删除失败后，同页恢复Storage API；下一次成功自动保存必须建立一致pointer，刷新恢复同一草稿，孤儿计数0。不得通过扫描并收养其他病例、语言、mode或participant的孤儿文件规避身份校验。
- history-log门禁保持：一次状态写失败后仍持久化pending及原request ID；3次失败刷新不自动风暴，用户重试只发1次并清空队列。后续不得为修复pointer破坏该通过路径。
- 下一独立范围转向病例目录在`localStorage`读取/枚举不可用时的fail-closed、重新开始训练在remove失败时是否真正清除，以及attempt摘要/目录计数是否会被畸形pointer或孤儿状态污染。真实存储、真机、Preview受保护故障及医学裁决继续分层阻塞。

## 2026-07-26 第 21 轮 `7781586` 目录容错与restart后续

- 已完成目录storage读写不可用、畸形pointer/无验证summary/孤儿attempt三控制，以及restart首次remove失败四viewport测试；新增HEM-P1-064、HEM-P2-065、HEM-P1-066。
- HEM-P1-064修复验收必须让共享Header/Footer及CaseCatalog的语言、进度读写全部fail-safe；`getItem/setItem`分别失败时仍显示42卡、搜索筛选可用、语言状态与`document.lang`一致且page/console error为0。
- HEM-P2-065修复验收必须解析并验证pointer正文、完整作用域和对应attempt；completed summary必须有受信schema/attempt/360终态。不得通过扫描并收养HEM-P1-063孤儿状态来制造进度。
- HEM-P1-066修复验收覆盖active attempt、pointer、当前/legacy session能力四项任一删除失败：不得reload成“看似重启”；成功时新attempt、0 submitted、空草稿，失败时当前语言明确提示并允许重试。
- 下一独立范围扩展HEM-P1-064到首页、直接病例页和语言切换；检查restart在pointer删除失败及sessionStorage删除失败时的差异化结果，以及目录summary重复/跨语言/跨病例污染。真实存储和真机仍单独阻塞。
## 2026-07-26 仓库级 Skills 授权基线门禁

- QA 上次授权来源基线为 `77815862a0abebff67b8d958f66944a0e11b068f`；本次授权的运行时/Skills 比较旧基线为 `df9c35f5c1e1c53e3dbf20b802a6761faee0dc50`，新 Production 基线为 `9b7fcd0d975533c7c6eda5614ca3b2978c9dce55`。
- `df9c35f..9b7fcd0` 只含 4 个仓库级 Skill 的 `SKILL.md`、4 个 `agents/openai.yaml` 以及 2 份 Skill 集成证据文档；`app/src/api/server/data`、`package.json` 与各 lockfile 均无差异。
- 本轮按比例只执行 4 个官方 Skill 校验、`openai.yaml`、引用文件与 pnpm 脚本存在性、repository secret scan、`data/**` 零差异和最终 clean gate。因授权增量不进入运行时，本轮不触发完整 Playwright、42 例、自然语言矩阵或七阶段昂贵回归。
- 本门禁不得用于关闭既有运行时缺陷、批准医学事实或替代 Preview/真机证据。完成并普通 push 后，长期 QA 后续仍从尚未独立复测的运行时缺陷与外部阻塞项继续。

## 2026-07-26 第 22 轮 `9b7fcd0` 存储恢复回归与下一顺序

- 在 Skills 门禁独立提交并 push 后，恢复此前暂停的存储/身份/目录/restart 定向回归；44 次最终有效运行覆盖 11 个场景、4 个固定 viewport，未重跑 42 例、自然语言矩阵或七阶段全套。
- 下一运行时优先级：主 Goal 修复 HEM-P1-064 的语言偏好写失败切换原子性，以及 HEM-P2-062 的英文损坏缓存告警和成功保存后旧告警清除；修复后只重跑两场景 8 项及邻接语言切换，不扩大为全量回归。
- HEM-P1-061、HEM-P1-063、HEM-P2-065、HEM-P1-066 已取得本地 `PASS_EMULATION` 定向证据；真实浏览器存储策略/磁盘故障仍需受控环境，不能由方法级 Storage 异常仿真替代。
- 长期 Goal 的医学裁决、Preview 受保护故障注入、真实手机软键盘/safe-area 和其他未完成项继续保持原阻塞或后续队列，不因本轮 36/44 通过而结束。

## 2026-07-26 第 23 轮 `9b7fcd0` HEM-P1-060 定向复测与下一顺序

- 发现基线 `7781586` 之后的 Production `df89a91` 修改了 `ClinicalTrainingClient`、attempt identity 与 safe storage，故按缺陷原文重跑 `@clean-tab-recovery` 和 `@multi-tab-attempt`，四固定 viewport 共 8 项；未扩大到完整 Playwright、42 例、自然语言或七阶段。
- clean-tab 必须在普通刷新对照通过、草稿恢复且重新初始化 200 后，让唯一下一次 `stage-feedback` 为 200；多标签必须继续保持单一权威写入，并让失败标签刷新后取得当前版本能力、唯一下一阶段写入为 200。
- 两条路径均继续失败，HEM-P1-060 保持 OPEN；修复不得把签名移入 `localStorage`、允许两个陈旧写入、自动创建新 attempt 丢弃进度，或放宽病例/语言/mode/participant/版本约束。
- 下一无外部权限范围优先从既有开放工程项中选择未在当前 Production 独立复测者；HEM-P1-060 只在 Production 提供 capability resume/reissue 变更后再定向重跑。HEM-P1-064、HEM-P2-062及外部阻塞继续独立跟踪。

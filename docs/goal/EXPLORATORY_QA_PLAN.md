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

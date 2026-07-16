# 探索式黑盒 QA 长期计划

状态：执行中；当前被测 Production Goal 基线 `8e7d148e3459f3b960161903fba9214998661635`；QA 交付分支 `codex/hematuria-exploratory-qa`。
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

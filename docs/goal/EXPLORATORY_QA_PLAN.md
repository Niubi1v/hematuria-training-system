# 探索式黑盒 QA 长期计划

状态：执行中；当前被测 Production Goal 基线 `41b3830a9095c692b3fdbe65a3dbf95b7ece5a37`；QA 交付分支 `codex/hematuria-exploratory-qa`。
边界：仅修改测试、只读审计工具、QA 文档与证据，不修改业务实现或医学数据。

## 启动门禁

- 每轮先执行 `git fetch --prune`、`git status --short --branch`、`git rev-parse HEAD`、`git worktree list --porcelain`，并读取 `origin/codex/hematuria-production-goal`。
- 被测生产基线必须精确等于源分支最新 SHA；若源分支变化，先保存并推送当前 QA 交付，再安全合并新基线和做受影响回归，不得基于旧生产代码继续测试。
- QA 分支 HEAD 会包含测试、报告和最小证据提交，因此不与生产 SHA 直接比较。门禁分别记录“被测 Production SHA”和“QA 交付 HEAD”，并确认从生产基线到 QA HEAD 没有业务功能或 `data/**` 差异。
- 2026-07-14 第 3 轮重新获准执行 `git fetch --prune` 后，远程 Production SHA 仍为 `41b3830a9095c692b3fdbe65a3dbf95b7ece5a37`；本轮 QA 起始 HEAD 为 `d16887e589faf247abfe96f83568b0346e6865ac`，相对远程 QA 分支 ahead 2。
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

## 问诊最小覆盖集

每例覆盖血尿起始/反复/颜色、肉眼或镜下、时相、血块、疼痛、下尿路症状、发热寒战/潴留、肾小球线索、结石/感染/肿瘤/肾病史、抗凝/抗血小板/过敏、吸烟/职业暴露、家族史、适用时的月经/妊娠/妇科来源，以及手术/输血/外伤/泌尿操作。

## 判定边界

- `HEM-P0-001` 与 `HEM-P0-023` 保持外部医学裁决阻塞，不由 QA 改值或判定通过。
- 真实 DeepSeek、Preview 日志、`TRAINING_STATE_SECRET` 与真实首 Token/P95 只能由当次远程证据判定。
- fixture、mock、规则 fallback 只能证明确定性 UI/协议行为，报告必须显式标注来源。
- 单项阻塞不影响本地、fixture、UI、移动端、恢复、评分、数据 Agent 和自动截图继续执行。

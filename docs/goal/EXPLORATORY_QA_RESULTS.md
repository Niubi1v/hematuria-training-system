# 探索式 QA 执行结果

状态：长期执行中；当前 7 个开放 P1、1 个开放 P2，不得视为最终生产验收。
被测 Production SHA：`96fcf80f5a825585be53715e65851fbc113a7ab0`。新基线 merge 后 QA HEAD：`5d9902c60c6e6d6a30b65a715b64e9d5627fef94`。

## 基线核验

| 项目 | 结果 |
| --- | --- |
| `git fetch` | 成功；首次受 sandbox Git 元数据写入限制，获准后成功 |
| `git status --short --branch` | `## HEAD (no branch)`；无工作区修改（测试基础设施创建前） |
| 当前状态 | detached HEAD |
| `git rev-parse HEAD` | `41b3830a9095c692b3fdbe65a3dbf95b7ece5a37` |
| 主 Goal worktree | `codex/hematuria-production-goal`，同一 HEAD |
| 基线门禁 | PASS，可继续本地黑盒测试 |

## 首轮范围

- 四个固定 viewport 的首页、病例目录中英文及 P001 训练页自动截图。
- P001–P042 页面壳、七阶段入口和提交前答案泄露关键词检查。
- 390×844 下的确定性 fixture 20 轮问诊、同事实重复问法、故意错误总结、快速双击和刷新恢复。
- 每个场景的 trace、脱敏 console/network 摘要；失败时截图与录像；HTML/JSON/JUnit 报告。

## 2026-07-13 首轮结果

最终完整命令：`playwright test -c playwright.exploratory.config.mjs`（通过项目内 Playwright CLI 与 headless Chrome channel 执行）。

| 指标 | 结果 |
| --- | --- |
| 完整汇总 | 7 passed / 8 skipped / 1 failed，14.7 秒 |
| 四 viewport 页面截图 | PASS；首页、病例目录中/英、P001 中文训练页，无水平溢出 |
| 42 病例页面壳 | PASS；42/42，P013–P042 的显示 ID 对应内部 `HX-ADD-001`–`HX-ADD-030` 路由 |
| 七阶段与提交前泄露词 | PASS；42/42 均为 7 个阶段，未命中漏问项/得分点/标准答案/疾病标签 |
| 20 轮 fixture | PASS；20 次患者请求、20 次 history-log；随后快速双击只增加 1 次请求/1 个对话轮次 |
| 刷新恢复 | PASS；快速双击测试轮次刷新后仍为 1 条 |
| 移动开场白遮挡 | FAIL；360×800 复现，390×844 通过；见 HEM-P1-027 |
| console | 仅 5 条 info，0 error |
| 脱敏问答 | 21 轮，全部 `source=fixture`；无密钥/直接标识符 |
| 敏感明文扫描 | PASS；QA JSON/XML/HTML 未发现 Authorization、Cookie、Bearer、`sk-*` 或完整训练签名 |

首轮整理后本机保留 55 个自动生成证据文件、32,261,789 字节，另有证据索引。Git 最小证据集为两张 HEM-P1-027 对照截图和一个关闭源码嵌入的定向失败 trace，共 163,606 字节；其余 HTML、重复截图、通过 trace、视频、报告与 transcript 均不提交，详见 `artifacts/exploratory-qa/EVIDENCE_INDEX.md`。

环境说明：当前独立 worktree 没有完整依赖链接，动态 Next dev 未在 120 秒就绪。首轮只读复用同 HEAD 主 Goal worktree 的静态 `out` 启动服务；因此页面/UI/路由结论有效，API/真实 AI 结论仍保持阻塞。Playwright bundled Chromium 未安装，按仓库既有本地策略改用 headless Chrome channel；另安装了 Playwright 专用 ffmpeg 以保存失败录像。

任何 fixture 结果均标记为 `deterministic_fixture_not_real_ai`，没有冒充真实 DeepSeek。

## 2026-07-14 长期循环第 2 轮

### 基线与运行来源

- 本轮开始和检测到外部 worktree 变化后均执行 `git fetch --prune`；远程 `origin/codex/hematuria-production-goal` 两次均为 `41b3830a9095c692b3fdbe65a3dbf95b7ece5a37`。
- QA 分支起始 HEAD 为 `40bb0aaf745243ba5a66028c8636f0c9f2084c95`；它只在生产基线上增加 QA 脚本、文档和最小证据，不等同于被测 Production SHA。
- 执行期间同机 Production worktree 被其他任务快进到本地未推送的 `70fb5a38625fc235b09f803faa3da248b37597bf`。该提交相对 `41b3830a` 仅新增 4 个 `docs/goal/*AUDIT*.md`，`app/**`、`src/**`、`api/**`、`server/**`、`data/**`、测试依赖和构建配置均无差异。因此静态 `out` 只按“与 41b3830a 运行时代码等价”引用，不把本地 70fb5a3 当作新生产基线或修复 SHA。
- QA worktree 的跨 worktree `node_modules` junction 无法完成独立 Next build，离线重建依赖在无输出等待后终止；未改动 `package.json`、锁文件、业务代码或 `data/**`。这是测试环境限制，不登记产品缺陷。

### 新增自动化结果

| 范围 | 结果 | 证据边界 |
| --- | --- | --- |
| P001 完整七阶段 fixture | PASS，`1440×900` 与 `390×844` 共 2/2，15.2 秒 | 问诊小结、查体/生命体征、尿检、影像、内镜、病理、诊断、会诊决策、治疗、围术期、阶段 3 刷新恢复和 8 维 `220/360` 报告；只证明 UI/协议 |
| 仓库既有 desktop fixture E2E | PASS，20/20，22.8 秒 | 英文 attempt 隔离、fallback/重连、离线恢复、日志同步/幂等重试、双击发送、20 轮、刷新、语音降级、teacher/RCT 泄露门禁和 P008 抗伪造；不是 live AI |
| 四固定 viewport axe | PASS，4/4 项目；每项扫描首页、病例目录和 P008 训练页 | 12 次页面扫描，0 个 serious/critical violation |
| 只读契约回归 | PASS | 42×17 中文结构化历史、42×6 英文 fixture、18 条冲突 quarantine、阶段 5/6/7、42 例 360 评分、attempt 隔离、API recovery、11 例代表 E2E、产品审计 |
| 静态 bundle | PASS，25 个 JavaScript 资产 | 使用与 41b3830a 运行时代码等价的本地静态 `out`；不覆盖 Preview API |
| 阶段提交快速双击 | FAIL，6/6 | 每次产生 2 个 `stage-feedback` 请求、2 个不同 request ID、2 条本地提交时间线；见 HEM-P2-028 |

契约子集首次串行运行的前 8 项通过后，`test-product-audit.ts` 因 QA worktree 缺少本地 `xlsx` 依赖而未启动断言；建立指向同 SHA 已安装依赖的本地 junction 后单独重跑并通过。该过程只调整被 Git 忽略的 `node_modules`。

本轮未重复 HEM-P1-027 的旧基线 6/6；源分支没有声明修复，缺陷保持 OPEN。真实 DeepSeek、医学真值、Preview 日志签名和真实首 Token/P95 均未由 fixture 结果改写。

## 2026-07-14 长期循环第 3 轮

### 基线门禁

- 本轮起始 QA HEAD：`d16887e589faf247abfe96f83568b0346e6865ac`，分支 `codex/hematuria-exploratory-qa`，相对远程 QA 分支 `ahead 2 / behind 0`。
- `git fetch --prune` 首次因共享 worktree Git 元数据写权限被 sandbox 拒绝；按门禁获准重跑后成功。远程 `origin/codex/hematuria-production-goal` 仍精确为 `41b3830a9095c692b3fdbe65a3dbf95b7ece5a37`，未出现新生产基线，允许继续测试。
- 当前生产 worktree 的本地 `70fb5a3` 仍只增加审计文档；本轮动态 Next/API 服务从 QA 分支启动，业务实现相对 41b3830a 无变化。为离线启动补的 SWC/TypeScript/Tailwind junction 仅存在于被忽略的 `node_modules`；失败的 pnpm 自动下载留下 45,136 字节临时 store，核验绝对路径在 QA workspace 内后已删除。

### 实际 Patient Session / API / UI 矩阵

| 范围 | 数量 | 结果 |
| --- | ---: | --- |
| 源数据结构 | 42 例 × 37 slot × 2 语言 = 3,108 个非空文本单元 | 结构完整；全部仍 `teacherReviewRequired=true`，不记医学通过 |
| session 初始化 | 84 | envelope/时间戳/私有字段隔离通过；英文开场 42/42 含 CJK，HEM-P1-029 |
| 固定 A/B 路由问法 | 6,216 | 5,586 匹配预期、630 不匹配；失败分流至 HEM-P1-030/031 |
| 同请求重复一致性 | 6,216 | 相同输入结果稳定；最终两轮除时间戳外聚合 JSON 完全一致 |
| 诊断/报告边界 | 168 | 明确诊断/报告请求全部边界正确；自然“既往肿瘤/膀胱镜史”另被误拦截，HEM-P1-030 |
| HEM-P0-023 隔离 | 18 条 × 双语 × 两问法 × 两次调用，直接应 144 次 | 直接冲突保持隔离；实际观察 204 次，额外 60 次来自 pain 过匹配，HEM-P1-031；不裁决医学真值 |
| 非空事实运输 | 3,108 单元中的可达项 | 191 个唯一 case-slot-language 被压成通用 unknown，365 个问法实例，HEM-P1-032 |
| 教师元语言 | 6,216 问法实例 | P004 clots、P005/P006 phase 共 3 个唯一单元、6 个实例泄露，HEM-P1-033 |
| 外部 provider | 全矩阵与 handler 烟测 | `providerCalls=0`；明确为本地 rule，不冒充真实 AI |

矩阵最终配置连续运行两次，均为 `1,127` 个失败实例、`127` 个失败分组；其中错误边界 84 是 route mismatch 的子集，报告保留两种分类用于诊断，不把它们重复写成 1,211 个独立失败。所有失败记录只含 caseId、slot、语言、长度、来源类型、flags 和计数，不保存完整医学回答。

公开 handler 烟测共 13 项，P001/en、P001/zh、P002/en 与 P004/zh 均使用独立 session；连续 2/2 得到相同 7 个代表性失败：英文开场、prior care、中文肿瘤史、中文膀胱镜史、P004 教师元语言、英文 flank pain 过匹配和 P001 英文肾小球线索降级。所有响应均为本地 handler，安全 envelope 的 `revealedDataKeys=[]`、blockedDataKeys、无私有 profile/debug 和 Server-Timing 检查通过。

### Headless Chrome 真实本地 API 证据

- 使用 fail-closed QA-only HTTP adapter 只把 `api/health.js`、`session/init.js` 与 `agent-chat.js` 暴露到本机 3001；Next dev 在 3010，training-action 由浏览器内脱敏 stub 接管，TTS 关闭。adapter 在进程内显式关闭 AI、拒绝 outbound fetch，CORS 仅允许本地测试 origin；没有读取或输出密钥。
- HEM-P1-029 与 HEM-P1-033 均在 `1440×900`、`1280×720`、`390×844`、`360×800` 复现 4/4。前者页面英文 UI 中首条患者消息为中文；后者 API 返回教师提示，前端显示泛化澄清句但保留 clots slot。
- 代表网络：document/health/session/agent-chat/training-action 均 200；英文 session 约 15ms，P004 agent-chat 约 10ms。关闭自动语音后的最终四 viewport 复跑中每份 console 仅 1 条正常 info、0 warning/error；network 摘要不保存 header、query 或 body。
- 每个 viewport 均保存失败截图、trace、失败录像、console 和 network；Git 只计划保留两个代表截图与两个不含完整回答的聚合 JSON，其余本机索引保留。

本轮没有运行真实 DeepSeek、没有判定 1,554 条双语 patient slot 的医学正确性，也没有解除 18 条冲突 quarantine。HEM-P1-027/028 未收到源修复，继续保持 OPEN。

## 2026-07-14 长期循环第 4 轮

### 基线切换与代码边界

- 第 4 轮开始先普通推送 QA `d739f914f9d36fa6d3b3eda585113237485355f9`，再执行 `git fetch --prune`。远程 Production 已从旧基线推进至 `96fcf80f5a825585be53715e65851fbc113a7ab0`，旧 `41b3830a` 为其祖先。
- 新 Production 以无冲突 merge `5d9902c60c6e6d6a30b65a715b64e9d5627fef94` 纳入 QA 分支后才恢复测试；当前工作区作者修改仅为 `tests/exploratory/**`、QA 文档和最小证据，未修改业务功能或 `data/**`。
- Production 新增签名训练状态、attempt/session 能力绑定、过期和幂等存储。既有 `test-agent-api-security`、`test-training-security`、`test-dynamic-patient-session`、`test-ai-recovery`、`test-tts-api` 全部 exit 0；预期 fallback 测试中的一次脱敏 warning 不代表真实 provider 通过。

### 会话能力与既有缺陷回归

| 范围 | 结果 |
| --- | --- |
| 公开能力安全矩阵 | PASS，19/19；缺失/篡改/跨病例/跨语言/跨模式/跨 attempt/过期均拒绝；幂等重复、冲突和并发 single-flight 符合合同 |
| 外部 provider | `providerCalls=0`；固定 QA-only 进程内 secret，仅用于本地签名合同，不读取或更改 Preview 环境 |
| 42×37 双语规则矩阵 | 两次均为 6,216 路由、6,216 重放、1,127 失败实例/127 组；与旧基线一致，HEM-P1-029–033 保持 OPEN |
| 公开 handler 烟测 | 17 项、7 项既有失败，两次除时间戳外一致；比旧 13 项多出的 4 项是有效训练 attempt/session 建立，不是产品失败 |
| HEM-P1-027 | 新基线 `360×800` 仍失败，当前 1/1 为 7px；`390×844` 1/1 通过。旧基线 19px、6/6 证据保留，不写成通过 |
| HEM-P2-028 | 新基线 1/1 仍为 `2 requests / 2 unique IDs / 2 submit events` |

### Headless Chrome 受影响回归

- QA-only 本地 adapter 现在连接真实 `training-action`、`session/init` 与 `agent-chat`。真实签名只在服务进程内存中保存；浏览器响应、trace 和 network 使用固定 `qa-redacted-training-state`/`qa-redacted-session-*`，且 outbound fetch 与 AI 均关闭。
- HEM-P1-029、HEM-P1-033 及新 HEM-P1-034 在 `1440×900`、`1280×720`、`390×844`、`360×800` 各 4/4 复现。前两项分别仍为英文开场含 CJK、P004 教师元语言；新缺陷为中文 attempt 切换英文后 `POST /api/session/init/` 返回 HTTP 401 / `invalid_attempt_token`。
- 12 个场景全部按失败断言结束，HTML/JSON/JUnit、截图、trace、失败录像、console 和脱敏 network 均保存。network 仅新增 action/caseId/language/mode 和错误码等安全元数据，不保存 attemptId、sessionId、header、签名或问答正文。
- 这些结果不包含真实 DeepSeek，不判定 151 条来源语义或 18 条双语冲突的医学真值；外部阻塞状态不变。

## 保持开放的外部阻塞

- `HEM-P0-001`：151 条来源语义待具名医学负责人裁决。
- `HEM-P0-023`：18 条双语医学冲突待具名专家裁决。
- 受保护 Preview 权限、真实 DeepSeek 与日志验证未满足。
- Preview 可能缺少 `TRAINING_STATE_SECRET`，只允许核对配置状态，不得读取或修改值。
- 当前客户端为聚合 JSON 响应；真实 provider 首 Token/P95 仍需 Preview 的服务端计时证据。

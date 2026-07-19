# 探索式 QA 执行结果

状态：长期执行中；当前 Preview/本地自动化已恢复并扩展，仍有 HEM-P1-030 回归、HEM-P2-044、Pages 部署不匹配、真机和医学阻塞，不得视为最终生产验收。
当前 Production 基线：`657ba5da8fc6460ad7d0deea882a010c40938b40`；运行时黑盒证据对应代码等价的 `3a16f9314d1b3cf50e30bc41dcfeaf19f4fa77a8`。文档基线 merge 后 QA HEAD：`bd08566ddb91806abc9c1cc2123138b0ac29a2b4`；最终 QA HEAD 以本轮后续报告提交与远程同步状态为准。

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

### 源分支再次推进后的门禁补充

- 保存并普通推送 `96fcf80` QA 里程碑后，强制 fetch 确认 Production 最新为 `52c24325ddd28262458f5eff4f37fe2866d53305`，并无冲突 merge 为 QA `1123859450c4f0117294e36b9711cb9ba65684b1`。
- `96fcf80..52c2432` 仅改动 secret scanner、scanner 合同、`package.json` 脚本和审计文档；`app/**`、`src/**`、`api/**`、`server/**`、`data/**` 均无差异，因此不重复生成四 viewport UI 证据。
- 新 `test-secret-scanner.mjs` PASS，覆盖文本、二进制元数据、压缩 workbook、占位符、非泄露输出和已删除 Git 历史。新 repository scanner 在排除仅本机的大体积可重建 artifacts 后，对 320 个 tracked/candidate 文件、可达文本历史和有界归档元数据 PASS。
- 直接把全部本地 artifacts 纳入新 scanner 时，只有 5 个“超出扫描上限”门禁（4 个 trace entry、1 个 trace archive），不是 secret 命中；独立只读解包终扫已覆盖 25 个 ZIP/2,045 个条目且真实签名/密钥/敏感 header 为 0。大证据不删除、不提交 Git。

## 保持开放的外部阻塞

- `HEM-P0-001`：151 条来源语义待具名医学负责人裁决。
- `HEM-P0-023`：18 条双语医学冲突待具名专家裁决。
- 受保护 Preview 权限、真实 DeepSeek 与日志验证未满足。
- Preview 可能缺少 `TRAINING_STATE_SECRET`，只允许核对配置状态，不得读取或修改值。
- 当前客户端为聚合 JSON 响应；真实 provider 首 Token/P95 仍需 Preview 的服务端计时证据。

## 2026-07-14 长期循环第 5 轮：Production `ff1a932`

### 基线与合并门禁

- `git fetch --prune` 成功，`origin/codex/hematuria-production-goal` 精确为 `ff1a932785d891749ae8e73130bde8857062e194`；QA 起始/远程均为 `4e3b3b1d107d34e2027229b835e2cbd21ddc61d4`，ahead/behind `0/0`。
- 合并前受控文件无修改，只有已索引的本机大体积证据未跟踪；普通 push 返回 `Everything up-to-date`。随后以普通 merge `a8b87d7522eac811f0781e1aa2cc7b8cb36752e6` 纳入新 Production，36 个文件全部自动合并，无业务冲突。
- 新 Production 包含 HEM-P1-027/029/033/034 及 display route、安全预算和熔断修复。QA 分支相对新 Production 的受控差异仍仅为测试、QA 文档、最小证据和 `package.json` 的 QA 测试入口；`data/**`、医学事实和审批状态零差异。

### 优先缺陷与会话回归

| 范围 | 本轮结果 | 判定边界 |
| --- | --- | --- |
| HEM-P1-027 四 viewport × 中英文 | `16/16 PASS_EMULATION` | 开场完整、composer 不覆盖、聚焦后输入在视口、无横向溢出；真机软键盘/safe-area=`BLOCKED_REAL_DEVICE` |
| HEM-P1-027 手动上翻/新消息/末条 | 上述 8 个中英文滚动场景全部通过 | 上翻后距底部保持 `>72px`，新消息入口可见，点击后距底部 `<=1px`，末条底边不超过 composer 顶边 |
| HEM-P1-029 | 42/42 英文 session 开场无 CJK；四 viewport 4/4 | 本地 rule/handler，`providerCalls=0`，不是 DeepSeek 自然度通过 |
| HEM-P1-033 | 教师元语言泄露由 6 降为 0；四 viewport 4/4 | 161 个不安全来源答复被精确 fail-closed，记 `BLOCKED_SOURCE_REVISION`，不记医学或内容通过 |
| HEM-P1-034 | 中文→英文四 viewport 4/4；既有合同覆盖英文→中文、刷新后切换和快速往返 | 不再出现 `401 / invalid_attempt_token`；能力负例 19/19 继续拒绝，`providerCalls=0` |
| 受影响 Production E2E | 8/8 | 四视口布局、双向/刷新/快速切换、隐藏 fact 不收集和 20 轮滚动合同 |
| 最终本地浏览器批次 | 28/28，59.4 秒 | 四固定 viewport；每个场景保存截图、trace、console/network，本机大证据不整体提交 |

规则矩阵为 42×37×双语×双问法：84 session、6,216 路由、6,216 重放、168 边界。HEM-P1-029/033 信号清零后仍有 `1,079` 个失败实例/`117` 组，归属 HEM-P1-030/031/032；另有 161 个精确安全阻塞独立计数。公开 handler 烟测从旧 7 个代表失败降为 5 个；新增 `Content-Type: application/json` 只使 QA 调用符合新公开合同，没有放宽产品断言。

### 路由与环境分栏

| 环境 | 基线/权限 | P001–P042 结果 | 状态 |
| --- | --- | --- | --- |
| 本地 Next dev | `ff1a932`，本地 adapter + route fixture | 直接 URL 42/42=200；刷新 42/42=200；中/英 UI 42/42；目录 `.html` 点击 42/42=404 | `FAIL_DEV_CATALOG_INDEX_HTML`，HEM-P2-043 |
| 本地 production build | 同 SHA，但未配置公开 API base | Next 编译/类型阶段通过，静态预渲染因 `NEXT_PUBLIC_API_BASE_URL` 缺失 fail-closed | `BLOCKED_ENV_CONFIG`；QA 未修改环境配置 |
| GitHub Pages | 当前 deployment=`main@5a3ad119` | 根页/目录 200，但不是 `ff1a932` | `BLOCKED_BASELINE_MISMATCH`，不在旧代码上继续验收 |
| Vercel Preview | deployment `5436064721` success，source=`ff1a932` | P001、P042、health 匿名探针均为 `Login – Vercel` HTML | `BLOCKED_PREVIEW_AUTH`，保护页 200 不算病例/API 通过 |

### 外部阻塞与下一批

- HEM-P0-001、HEM-P0-023、419 条模拟事实审批、真实 DeepSeek/日志、Preview 配置、真实首 Token/P95 均保持原阻塞；本轮没有读取或修改任何环境变量值或密钥。
- HEM-P1-030/031/032 和 HEM-P2-028 继续 OPEN；新增 HEM-P2-043 仅影响本地 Next dev 目录点击，不能外推为已部署环境失败。
- 下一批继续原长期计划中未完成且不依赖外部权限的七阶段、评分、恢复、数据 Agent 和逐例 UI 项，不因本轮优先复测完成而暂停 Goal。

### 优先回归后的长期循环继续项

- HEM-P2-028 在 `ff1a932` 的 `1440×900` 定向断言 1/1 仍失败：实际 `2 feedback requests / 2 unique request IDs / 2 submit timeline events`，期望仍为 `1/1/1`。失败截图与最小 trace 更新；业务代码和断言均未修改。
- 360 评分、抗伪造、阶段 5/6/7、attempt 隔离和 11 例代表 E2E 共 5 个合同套件通过；覆盖 42 例 360 事件评分的单调性、同义词、反摘要投机、过度使用扣分，以及空答/错误/危险/伪造模板行为。
- 数据 Agent/训练边界继续通过：P008 精确开单映射与前置条件、42 例 376 条查体结果 QC、训练 API 签名/精确释放/反伪造/治理/mode lock，以及 secret 分离、服务端阶段授权、原子重放拒绝和过期门禁。
- 上述结果均为本地确定性合同，`providerCalls=0`。运行中出现的 P001 `urinary_urgency` quarantine 日志是 HEM-P0-023 既有冲突隔离，不是医学通过或新缺陷。

## 2026-07-17 夜间第 6 轮：Production `8e7d148`

### 基线与远程门禁

- `git fetch --prune` 后 Production 精确为 `8e7d148e3459f3b960161903fba9214998661635`。GitHub Actions run `29532192980` 为 completed/success，Vercel deployment `5479992482` 为 success；Draft PR #1 仍 Open/Draft/Clean。
- QA 先将安全修正 `0c27a2d36e4a629de43bb752d80ddbcd2ba7376d` 普通 push，再以 merge `ad2f6a42fd9b82cfc39b61fb09520784f2360432` 合入 Production 并普通 push。仅 `scripts/run-preview-blackbox.mjs` 与 `tests/preview/preview-blackbox.spec.mjs` 有 QA 测试冲突；Production 的 `api/server` 变更原样接收，`data/**` 零差异。

### 三项重点与相关回归

| 范围 | 结果 | 边界 |
| --- | --- | --- |
| 第一阶段/会话 | `PASS_LOCAL_FIXTURE_CONTRACT`；Playwright desktop/mobile 68/68，session 能力 19/19 | P001 中英提交、双向/快速/刷新切换、双击、第二阶段、刷新恢复；非法/过期/跨病例/跨语言/mode/attempt 仍拒绝 |
| HEM-P2-028 | `RESOLVED_LOCAL_QA`；探索断言为 `1 request / 1 request ID / 1 timeline event`，完整 desktop/mobile 双击合同通过 | 当前 SHA 的真实 Preview provider call 因安全阻塞未复测，不用本地替代 |
| HEM-P2-043 | 本地 public route 合同 42/42、root 和 Pages basePath 通过；真实 Pages 在 1440×900/390×844 均为 42 卡片、12 显示路由、30 旧内部路由 | 工程源码标 `RESOLVED_ENGINEERING_LOCAL_DEPLOYMENT_PENDING`；真实 Pages=`BLOCKED_DEPLOYMENT_MISMATCH`，Preview=`SECURITY_BLOCKED` |
| HEM-P1-030/031/032 | 42×37×双语×双问法：6,216 路由、6,216 重放、168 边界，0 失败；adapter 17/17 | 295 次不安全 source-cell 阻断观测，对应既有 161 个来源修订项；144/144 冲突隔离；均不构成医学内容通过 |
| 七阶段/评分/数据 Agent | 360 事件评分 42 例、对抗评分、阶段 5/6/7、attempt 隔离、11 例代表 E2E、42 例 376 条查体、P008 开单均 PASS | 探索 UI 七阶段在 1440×900/390×844 2/2；均为本地确定性合同 |
| UI/稳定性 | 四固定 viewport 双语布局通过；20 轮、手动上翻、新消息入口、末条不遮挡、无横向溢出；0 serious/critical a11y | `PASS_EMULATION`；真机软键盘和物理 safe-area=`BLOCKED_REAL_DEVICE` |

Patient Session 报告记录 295 次 `unsafe_deterministic_answer` source-cell 阻断观测，而旧 smoke 只把 P004 作为预期阻断，最初产生 2 项 QA 预期失败。该观测数不替代既有 161 个来源修订项。根据已有 Production 安全合同，将 P001 肿瘤史/泌尿操作三个不安全来源改为必须满足同一“空 facts/slots + 明确阻断原因”的强断言后 17/17 通过；没有解除来源审核。`test-patient-facing-profile.ts` 的首次失败仅由 CRLF/LF 逐字比较造成，所有 41 个差异行都只多一个 `\r`，标准化换行后 42 例完整性通过，医学列未变。

### Preview 安全事件与环境分栏

- 在 42 例 Preview 路由试跑中，Playwright `APIRequestContext` 失败日志把受保护 request header 写入 runner stdout。该批次立即标记 `SECURITY_BLOCKED`，专用 `test-results/preview-blackbox` 已删除，未作为测试结果；磁盘 artifact 扫描为 0 命中。报告不记录或复述任何值。
- QA runner 现捕获 stdout/stderr，扫描实际运行时 secret bytes 和 Authorization/Cookie/Set-Cookie/bypass header 名，再决定是否输出；安全单元契约通过。路由用例也移除显式 APIRequestContext header，改为同源页面导航并中止不相关 API 流量。本轮按事件边界不再运行当前 SHA 的真实 Preview。
- 先前 Production `3fe409f` 上得到的 health/durable store、中文 1 轮和英文 1 轮 `live_ai` 只保留为历史证据，明确 `notCurrentBaselineAcceptance=true`；不能替代 `8e7d148` Preview 验收。
- HEM-P1-030/031/032 已具备当前本地规则/公开 handler 的关闭证据，建议主 Goal 不再继续工程修复 HEM-P1-030；后续只保留不安全来源医学修订和真实 Preview 自然语言验证，二者不得混写为该路由缺陷未修复。

## 2026-07-19 夜间第 7 轮：Production `3a16f931`

### 基线、安全门禁与环境分栏

- `git fetch --prune` 后 `origin/codex/hematuria-production-goal` 精确为 `3a16f9314d1b3cf50e30bc41dcfeaf19f4fa77a8`；GitHub Actions run `29547532678` 与对应 Vercel 部署均为 success。QA 通过普通 merge `991ec7605ca9b82c4c4835a9fcb075dfaf770e35` 合入该基线并普通 push；`app/**`、`src/**`、`api/**`、`server/**` 与 `data/**` 相对 Production 零 QA 差异。
- Preview runner 的 10 条失败路径与 5 类产物通道安全 canary 为 15/15；所有真实 Preview 批次均先捕获输出、扫描实际凭据字节与敏感 header 名，再删除专用输出。`sameOriginRequests=14`、`cookieBootstrapRequests=1`、`crossOriginRequests=0`，没有把凭据发送到其他 origin。
- 当前 Vercel Preview health 为 HTTP 200，部署 SHA 精确匹配；Patient Service、Training State、Durable Attempt Store 均配置，store credential source 为公开状态 `vercel_kv_rest`。QA 未读取、打印或修改任何环境变量值。

| 环境 | 结果 | 状态 |
| --- | --- | --- |
| 本地构建 / root / Pages basePath 仿真 | 42/42 有效病例路由及受控无效病例合同通过 | `PASS_LOCAL` / `PASS_EMULATION` |
| Vercel Preview | P001–P042 目录、直接 URL、刷新 42/42；P999 真实 404；health/训练状态/持久化配置通过 | `PASS_PREVIEW` |
| GitHub Pages | 两个 viewport 均有 42 张卡片，但仅 12 个显示 ID 路由、30 个旧内部 ID | `BLOCKED_DEPLOYMENT_MISMATCH` |
| 真实手机 | 自动 viewport 不覆盖软键盘、地址栏动态高度与物理 safe-area | `BLOCKED_REAL_DEVICE` |

### 真实 Preview、第一阶段与稳定性

| 范围 | 结果 |
| --- | --- |
| 第一阶段 | P003 零轮中文提交进入第二阶段；P001 中文/英文 live AI 提交、刷新后提交、中文→英文→中文、快速双击均通过；双击只有 1 个 `stage-feedback` response |
| 真实 AI 最低样本 | 两个零重试批次累计中文 `10/10`、英文 `10/10`，全部 `generationSource=live_ai`、provider=`deepseek`、history-log=200、fallback=0 |
| 10 次新 session（本批） | `10/10`，P95 总耗时 `1735ms`，服务端 session `14ms`；连同前一批累计 `20/20` |
| 单 session 20 轮 | `20/20` live AI；20 个 agent request、1 个 session、0 次重初始化；刷新前存储 41 条消息，刷新前/后对话 DOM 均 42 项，恢复通过 |
| 20 轮性能 | P95 完整回答 `1726ms`、UI 发请求 `45ms`、provider `1297ms`、history-log `6ms`；后续5样本浏览器DOM首现P50 `1315.9ms`/P95 `1527.4ms`，服务端firsttoken不冒充非流式provider真正首Token |
| Preview 输出 | 每批敏感信息扫描通过，专用测试输出随后删除；Git 不保存完整问答、session、token、Cookie 或 header |

20 轮用例最初两次在20个 live AI 回合全部成功后分别停在折叠保存状态可见性和刷新后立即读取 DOM；改为轮询脱敏持久化计数与最终渲染状态后通过。最终证据确认刷新前已持久化 41 条消息且刷新后完整恢复，因此不登记产品数据丢失缺陷。

### 本地回归与新缺陷

- Production 本地受影响合同全部通过：Patient intent 86/86、paraphrase 3150/3150、42 例双语七阶段 84 journeys / 588 stage submissions / 84 个 360 分报告、session capability 19/19、public adapter 17/17；Production 完整 desktop/mobile Playwright 为 70 passed / 2 互斥 skip / 0 failed。均按 `PASS_EMULATION` 或本地确定性合同记录；新增独立 HEM-P2-044 探针的移动失败单列，不混入该 Production 门禁总计。
- Patient Session v2 将 711 个严格 governed unknown 与 18 个 unsafe governed unknown 作为强合同，不再把预期 fail-closed 当失败；仍有精确 42 个失败、仅 1 个失败组：英文 `Have you had a urinary procedure?` 在所有 42 例路由到 `triggers`，而非 `PAST_URINARY_PROCEDURE`。HEM-P1-030 因此在 `3a16f931` 标记 `REGRESSED_LOCAL_QA`，建议主 Goal 继续工程修复；不需要医学裁决。
- 新增 HEM-P2-044：`390×844` 与 `360×800` 均 2/2 复现语音设置相关触控目标小于 44×44 CSS px。语音播放/暂停/继续/停止/重播和桌面键盘/焦点/reduced-motion 合同通过；触控尺寸失败不冒充真机，真实设备仍为 `BLOCKED_REAL_DEVICE`。
- HEM-P0-001、HEM-P0-023、未审核来源和医学审批状态继续阻塞；本轮没有修改医学事实或 `data/**`。

## 2026-07-19 Production `657ba5d` 文档基线同步

- QA 里程碑 `87c701f6e060fef484d3f74ebed6c0126614e7ab` 先普通 push。随后 `657ba5da8fc6460ad7d0deea882a010c40938b40` 的 Actions run `29672644854` completed/success，Vercel 与 Preview Comments success，PR #1 仍 Open/Draft/Clean；QA 以普通 merge `bd08566ddb91806abc9c1cc2123138b0ac29a2b4` 合入，无冲突。
- `3a16f931..657ba5d` 只修改 `ACCEPTANCE_MATRIX.md` 与 5 份 Production Goal/证据文档；`app/**`、`src/**`、`api/**`、`server/**`、`data/**`、测试和运行配置零差异。因此保留本轮 `3a16f931` 的本地/Preview运行时证据，不重复昂贵黑盒测试，也不把纯文档 HEAD 冒充新的应用测试。
- Production 权威状态索引将 HEM-P1-030列为 ENGINEERING CLOSED，依据是15-intent/190-alias门禁；独立QA的37-slot双语双改写v2矩阵在同一应用树仍以42/42复现 `Have you had a urinary procedure? → triggers`。QA状态继续 `REGRESSED_LOCAL_QA`，建议主 Goal 以该最小问法补充门禁并修复；在新运行时代码证据出现前，不因文档索引自动关闭。
- 文档部署后的受保护 Preview 也已精确回报 `deploymentSha=657ba5da...`，health 200且三项服务配置正常。新增 P001 中文浏览器history专项为 `PASS_PREVIEW`：1个 DeepSeek `live_ai`、1个 agent request、1个 history-log；两次后退/一次前进后对话DOM由4项保持4项，没有重复请求、日志或消息。输出扫描通过后专用目录删除。
- 同一精确Preview的浏览器后台恢复为 `PASS_PREVIEW`（Chromium生命周期仿真）：首轮后`frozen → active`，恢复为visible并继续第二轮；两轮均DeepSeek `live_ai`，agent/history 2/2，attempt/session重初始化0/0，DOM 4→6，无丢失或重复。页面产生3个普通跨源资源请求，但携带Preview保护头的跨源请求为0；专用输出扫描后删除。真实手机后台恢复不由此宣称通过。
- 新增5个P001中文非流式浏览器可见回答样本，最终5/5均DeepSeek `live_ai`：点击到患者DOM首次出现P50 `1315.9ms`、P95 `1527.4ms`，点击到完整响应P50 `1349ms`、P95 `1573ms`；agent/history 5/5，attempt/session重初始化0/0，跨源保护头请求0。指标是完整消息首次可见，不是provider首Token；`providerFirstTokenMeasured=false`。
- P001中文错误总结纠正为`PASS_PREVIEW`：先确认既有三个月病程，再故意总结为“今天首次且一直没有反复”；患者自然纠正，教师元语言与最终诊断泄露检测均为false。两轮均DeepSeek `live_ai`，agent/history 2/2，跨源保护头请求0；只保存布尔结论，回答正文未保留。
- P001英文等价错误总结也为`PASS_PREVIEW`：两轮DeepSeek `live_ai`，纠正成立，中文/教师元语言/最终诊断泄露均false，agent/history 2/2。独立新session中的无指代问题触发自然澄清，病史信号0、未倾倒完整病史，agent/history 1/1；首个可指向主诉的问法不作为失败，回答正文均未保留。
- 10类代表病例开放式主诉为`PASS_PREVIEW`：P013/P017/P019/P023/P028/P032/P034/P037/P038/P042各中文/英文1样本，共20/20 DeepSeek `live_ai`、HTTP/history 20/20、单请求20/20；语言串线、教师元语言、结构化字段、诊断标题启发式与跨源保护头均0。只证明这些最小问题的工程/语言合同，不作逐字医学批准。
- 5例病程时长同事实双改写为`PASS_PREVIEW_GOVERNED`：P019/P023/P032/P038/P042中英文10对、20回答；7对live AI时长一致7/7，P032中英文与P042中文3对稳定safety boundary且来源一致3/3。HTTP/history、单请求、语言纯度、教师/结构化泄露与跨源保护头失败均0；安全回答不强制匹配被隔离事实。
- P023同session中文→英文→中文事实连续性为`PASS_PREVIEW_GOVERNED`：3/3回答均识别同一6小时病程；中文两轮为DeepSeek `live_ai`，英文轮为明确`isFallback=true`的`safety_boundary`，不冒充真实AI。语言切换两次attempt/session均200，agent/history 3/3、API 401为0，英文串中文、教师元语言、结构化字段与跨源保护头请求均0；回答正文未保留。
- P038中英文各5轮多问题追问为`PASS_PREVIEW_GOVERNED`：10回答中8次DeepSeek `live_ai`、2次中文`safety_boundary`；第二/第五轮重复确认4小时时长，中英文共4/4命中。agent/history 10/10、API 401为0，语言串线、教师元语言、结构化字段、最终诊断启发式和跨源保护头请求均0；安全边界不计入真实AI，回答正文未保留。
- P037刷新后继续追问为`FAIL_PREVIEW`，登记HEM-P1-045：三批有效运行×中英文共6/6复现。刷新前每语言2轮均完成，DOM均6→6恢复；刷新后首个agent请求均401 `session_capability_required`，最终批响应约302/344ms，history-log 0/2，attempt/session重初始化0/0。前置回答来源合同与泄露检查通过；刷新后无患者回答，故事实连续性不评价，不能把DOM恢复冒充会话可继续。
- AI接口防滥用本地矩阵为`PASS_LOCAL`：`test-agent-api-security`、`test-training-security`、`test-api-recovery`、`test-ai-recovery`四脚本通过。覆盖未授权Origin/CORS、缺失/伪造/跨语言capability、角色升级、5个禁止字段、超长问题/超大body/错误Content-Type、幂等/并发、Retry-After与多层预算、stage/expiry/replay和恢复；显式安全拒绝的provider-call guard均为0。运行时为Node v24.14，不替代远程Node 22或真实Preview限流/故障注入。
- P001真实Preview内容滥用为`PASS_PREVIEW_GOVERNED`：中英文各1个合并型“提取系统/评分/诊断并写代码”请求均返回`safety_boundary`且无provider/first-token timing；agent/history 2/2。内部字段、教师元语言、最终诊断、可执行代码、语言串线和跨源保护头均0，回答长度在边界内且正文未保留；未执行高频限流或破坏性注入。
- P001真实Preview会话能力滥用为`PASS_PREVIEW`：11/11低频拒绝精确匹配合同，覆盖缺失attempt state，session跨语言/模式/病例，agent缺失/篡改capability、跨病例/语言/模式/attempt及错误stage；状态分布为401×8、403×1、409×2。所有响应仅含公开error envelope，provider/first-token timing、跨源保护头注入和合同失败均0；token、session、幂等键和请求标识未保留。

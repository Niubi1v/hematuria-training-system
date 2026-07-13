# 测试证据

基线日期：2026-07-12，Asia/Shanghai。测试在隔离snapshot/worktree执行，未修改生产数据。以下仅记录实际运行事实；未保留的单项时间或argv明确标注，不补造。

## 2026-07-13 Spark Agent 配置兼容专项

| 检查 | 命令/证据 | 结果 |
| --- | --- | --- |
| 项目配置检索 | `rg -n "model_reasoning_summary\|model_supports_reasoning_summaries\|reasoning\\.summary" .codex ~/.codex/config.toml` | 修改前无命中；用户级配置未改 |
| Spark 专项断言 | `node scripts/test-codex-agent-config.mjs` | PASS：3个Spark角色均为medium且禁用summary；非Spark未受影响 |
| TOML解析 | Python 3 `tomllib` 解析 `.codex/config.toml` 与 `.codex/agents/*.toml` | PASS：7/7 |
| 当前CLI | `codex --version` | `codex-cli 0.144.0-alpha.4` |
| 客户端诊断 | `codex doctor --summary ... -c model_supports_reasoning_summaries=false` | PASS：configuration loaded；16 ok，0 fail；WebSocket超时警告但HTTPS可达 |
| 实际只读Spark请求 | `codex exec --ephemeral --ignore-user-config -s read-only -m gpt-5.3-codex-spark ...` | BLOCKED：安全审查器拒绝向未建立信任的外部服务发送私有仓库上下文；未发起模型请求，未绕过 |

官方依据：OpenAI Codex Configuration Reference 将 `model_supports_reasoning_summaries` 定义为布尔值，用于强制发送或不发送 reasoning metadata；`model_reasoning_effort` 支持 `medium`。

## 2026-07-13 HEM-P0-023 隔离与fallback门禁

| 开始—结束 | 精确命令/入口 | 退出码 | 结果 | 关键证据 |
| --- | --- | ---: | --- | --- |
| 03:43:14—03:43:24 | 逐项使用bundled Node运行`package.json scripts.test`的32个tsx入口 | 0 | PASS，32/32 | 18项隔离、中文/英文fallback、42×17中文矩阵、42×6英文fixture、临床Agent、TTS、恢复、360评分、签名状态均通过 |
| 03:43:45—03:43:47 | `node node_modules/typescript/bin/tsc --noEmit` | 0 | PASS | TypeScript无错误 |
| 03:43:57—03:44:20 | `node scripts/run-lint.mjs`；`node scripts/scan-repository-secrets.mjs`；`VERCEL=1 node node_modules/next/dist/bin/next build` | 0 | PASS | ESLint通过；252个tracked/candidate文件无密钥；52/52页面构建成功 |
| 03:32—03:42 | pnpm包装的组合门禁两次无输出挂起 | 已终止 | 非产品失败 | 终止本轮创建的残留包装进程后，逐项运行相同有效测试全部通过；未把挂起登记为PASS |

- `scripts/test-bilingual-conflict-quarantine.ts`确认固定18项、双语不确定回答、0个上游provider调用、0个确定性matched fact、评分事件过滤及结构化reason日志。
- `scripts/test-training-api.ts`确认被隔离事件不进入签名attempt state；重复计分边界未放宽。
- Git差异核对：`git diff --name-only -- data`为空；未批准医学事实、未解除`needs_revision`。
- 裁决工作簿结构检查：18行×21列，专家输入列均为空；公式错误扫描0项；“填写说明”和“18条冲突裁决”两张工作表均完成目视检查。
- 远程证据：Draft PR #1 head `0d60a902737ce29c22702f484fafa58221844717`；GitHub Actions run `29206516554`于2026-07-12T19:52:05Z completed/success。Conversion idempotency、generated-data diff、schema、contradiction、bilingual fixtures、完整行为、医学审核、评分、TypeScript、Lint、repo secret、Playwright、build和bundle scan均success；Pages artifact/deploy在PR事件skipped。
- 外部检查：Vercel deployment `AxCLzXdwr6K488oiuCHfauG6hDTz` success；Vercel Preview Comments success。部署成功不替代受保护Preview中的真实DeepSeek、日志验证、P95和自然度人工验收。
- 当前证据HEAD `558fadd48ac02eaf9ebfb91f581364f345687e22`：Actions run `29206657625` build success（3m10s），Vercel deployment `Hunh8QF1fNuDz5BdpboEQsoBx1XK` success，Vercel Preview Comments success，Pages deploy skipped。
- HEM-P0-023裁决包增量：主表18行×23列；原始病历表11例×8列；每个主表病例均有病种与原始病历索引；专家最终值、决定、依据、审核/复核人、日期及导入状态仍为空；三张工作表完成目视检查，公式错误扫描0项。

| 开始—结束 | 精确命令/入口 | 退出码 | 结果 | 关键证据 |
|---|---|---:|---|---|
| 14:44:54—14:44:57 | `node node_modules/typescript/bin/tsc --noEmit` | 0 | 通过 | TypeScript无错误 |
| 14:44:54—14:44:58 | `node scripts/run-lint.mjs` | 0 | 通过 | ESLint通过 |
| 14:45:13—14:45:24 | `pnpm test`（`package.json`的`scripts.test`） | 0 | 通过，27/27 | 完整单元/行为脚本链 |
| 14:47:00—14:47:12 | `pnpm run test:idempotency` | 0 | 通过，69 JSON | 连续转换校验和一致；此前审计包装器参数错误导致一次失败，修正包装器后原测试通过 |
| 14:47:24—14:47:40 | `pnpm run build` | 0 | 通过，52 pages | 42个病例路径；隔离junction环境出现内置ESLint模块警告但未导致build失败 |
| 14:47:57（结束时间未单独保留） | `pnpm run test:bundle` | 0 | 通过，24 JS | 静态答案与密钥扫描通过 |
| 14:50:19—14:50:44 | `pnpm run test:e2e` | 1 | 失败，21/22 | mobile-chromium offline reconnect场景失败 |
| 14:50:56—14:50:58 | Playwright对失败的mobile offline reconnect场景定向重跑（完整argv未保留） | 0 | 通过，1/1 | 说明存在波动；不能替代全量通过 |
| 单项时间未保留 | `pnpm run test:medical-review` | 0 | 通过 | 医学审核工作簿合同 |
| 单项时间未保留 | `pnpm run test:medical-review-queue` | 0 | 通过 | 审核队列合同 |
| 单项时间未保留 | `pnpm run test:medical-review-import` | 0 | 通过 | 候选导入合同 |
| 单项时间未保留 | `pnpm run test:release-v14` | 0 | 通过 | v1.4导入合同；四项医学合同合计4/4 |
| 普通环境时间未单独保留 | `pnpm run smoke:production` | 非0 | 失败 | `fetch failed`，没有生产健康或10+5+5证据 |
| 14:51:39—14:53:46 | `pnpm run smoke:production`（提权网络重试） | 非0 | 失败 | 同为`fetch failed`；不得登记为生产通过 |

## 工程加固后的复验

| 开始—结束 | 精确命令/入口 | 退出码 | 结果 | 关键证据 |
|---|---|---:|---|---|
| 15:19:03—15:19:06 | 工程安全专项测试集合（交接摘要未保留逐条argv） | 0 | 通过，6/6 | 覆盖formal gate、独立签名secret/health、Origin/限流/非泄露、participant key和评分版本 |
| 15:20:23—15:20:29 | `pnpm run typecheck`、`pnpm run lint` | 0 | 通过 | 类型与直接Next legacy ESLint插件路径均通过 |
| 15:21:34—15:21:48 | `pnpm test` | 0 | 通过，28/28 | 完整单元/行为链，比基线新增安全专项合同 |
| 15:22:34—15:22:48 | `pnpm run test:idempotency` | 0 | 通过，69 JSON | 生成文本归一化与基线69/69一致；53字节hash差异仅CRLF/LF行尾 |
| 15:26:36—15:26:41 | desktop/mobile offline reconnect重复测试 | 0 | 通过，6/6 | readiness竞态修复后重复运行 |
| 15:26:54—15:27:11 | `pnpm run test:e2e` | 0 | 通过，22/22 | desktop/mobile全量通过 |
| 15:41:58—15:42:16 | clean `pnpm run build` | 0 | 通过，52 pages | 清洁构建成功 |
| 15:42:32—15:42:36 | `pnpm run typecheck`、`pnpm run lint`、repo secret scan、`pnpm run test:bundle` | 0 | 全部通过 | secret扫描235个候选文件；bundle扫描24 JS |
| 时间未单独保留 | pnpm lockfile-only frozen offline检查 | 0 | 通过 | 固定lockfile可离线冻结解析 |

说明：专项集合和offline repeat的完整逐条argv未包含在主线程交接摘要中，因此不补造；结果计数和时间按实际运行记录保留。

## Git与部署证据

- 原仓库`main`、HEAD、`origin/main`与GitHub API compare均为`5a3ad11`。
- `git fetch --prune`挂起约30秒后终止；未获得成功退出码。
- GitHub connector仅确认`5a3ad11`的Vercel status为success；没有当次Actions、Pages或live alias证据。
- 当前专项分支`codex/hematuria-production-goal`起点为`5a3ad11`，尚未push、未创建PR、未部署。
- 本轮新增工程修复仍只存在于本地专项worktree；没有PR、Actions或生产部署证据。
- 首次文档小步提交在命令执行前因Codex提权用量额度耗尽被权限审查器拒绝；没有把未提交状态伪报为commit或push成功。
- 20:48:31–20:48:33 `git fetch --prune origin` exit0；HEAD与`origin/main`起点均为`5a3ad11`，ahead/behind 0/0。
- 本地提交`2bc3305525398b12a53725dfdaedcaa0fb280fc7`包含运行时安全/测试；`58f456e48690e8617417d8f64e9b150038b6d779`包含CI与Playwright门禁。两者尚未push，不能作为远程CI证据。

## 拟push提交 `c3c18d3` 的最终本地复验

以下测试从`git archive c3c18d3e0a6a07535b469f0abfdcb999d61869cc`生成的隔离快照运行；测试产生的QC报告、转换数据和构建产物没有回写专项worktree。

| 开始—结束 | 命令/入口 | 退出码 | 结果 |
|---|---|---:|---|
| 20:52:21–20:52:24 | `tsc --noEmit` | 0 | TypeScript通过 |
| 20:52:21–20:52:26 | `node scripts/run-lint.mjs` | 0 | ESLint通过 |
| 20:52:21–20:52:32 | `package.json`完整`scripts.test`链 | 0 | 28/28通过 |
| 20:53:14–20:53:24 | `scripts/test-conversion-idempotency.ts`，package等价隔离runner | 0 | 69 JSON两次转换幂等；与提交基线归一化文本69/69一致 |
| 20:54:05–20:54:19 | `next build` + `scripts/scan-static-bundle.ts` | 0 / 0 | 52页；24个JS扫描通过 |
| 20:56:54–20:57:12 | `playwright test` | 0 | desktop/mobile 22/22通过 |
| 20:57:40–20:57:41 | `node scripts/scan-repository-secrets.mjs` | 0 | 235个tracked/candidate文件，无输出secret值 |
| 20:57:41 | `pnpm install --lockfile-only --offline --frozen-lockfile --ignore-scripts` | 0 | lockfile冻结解析通过；本机Node24产生预期engine警告，CI固定Node22.14 |

- 20:55:06–20:55:07再次`git fetch --prune origin` exit0；当时`origin/main=5a3ad11`，专项分支领先3、落后0，无未知远程提交。
- 当前三项本地提交为`2bc3305`、`58f456e`、`c3c18d3`；仍须普通push后以远程SHA和Actions结果作为CI证据。

## 医学治理交叉检查

- 追踪项：572 = 153 sourceTrace + 419 simulation queue。
- 优先级：P0/P1/P2 = 191/148/80。
- 42例保持`needs_revision`；419条不得自动approved。
- 辅助标记交叉统计：simulation/是419、source/否2、source/是151。此检查暴露HEM-P0-001，现有工作簿合同测试未覆盖正确分离。

## 待运行门禁

## Push与PR CI安全证据

- 21:00:20—21:00:41与21:01:24—21:01:45，两次普通`git push -u origin codex/hematuria-production-goal`均exit 128：`github.com:443`不可达；不得登记为push成功。
- PR工作流现已允许`pull_request`到`main`执行build测试，但Pages artifact上传与deploy job在PR事件明确跳过；此项仍需GitHub Actions实际运行确认。
- 约21:05第三次执行push前门禁：fetch成功，`origin/main=5a3ad11`，本地`dbc819e`领先5/落后0，`data/**`无差异，235文件secret扫描exit0；随后普通push专项分支成功并建立远程跟踪。
- `gh --version`失败（命令不存在），故draft PR和PR CI均未创建或运行。

## 验收矩阵专项回归

| 开始—结束 | 精确命令/入口 | 退出码 | 结果 |
|---|---|---:|---|
| 约21:21—21:24 | fallback pnpm包装器并行专项测试尝试 | 124 | 未运行产品测试；包装器访问npm registry被EACCES并在180秒超时，不登记为产品失败 |
| 约21:24 | 直接`tsx scripts/test-llm-adapter.ts`、`tsx scripts/test-agent-chat.ts` | 1 / 1 | 首次失败；发现旧断言及聚合门禁遗漏 |
| 约21:24 | 更新断言后直接重跑上述两项 | 0 / 0 | LLM/API安全和统一Agent Chat契约通过 |
| 约21:24 | 查体、医嘱、代表性E2E、阶段5/6/7 | 0 | 42例376项查体、P008映射、11例E2E及阶段流程通过 |
| 约21:24 | 事件评分、对抗评分、attempt、training API | 0 | 42例360分、反伪造、隔离和formal门禁通过 |
| 约21:24 | session、health、API/AI recovery、TTS/TTS API | 0 | 会话、错误恢复和四象限选声/降级契约通过 |
| 21:25左右 | 更新后的`package.json scripts.test`（通过`cmd /c`执行） | 0 | 完整30项行为链通过；新增`test:llm`与`test:agent` |
| 21:26左右 | `tsc --noEmit`；`node scripts/run-lint.mjs` | 0 / 0 | TypeScript与ESLint通过 |

- 42例中文证据：structured history 42×17。
- 42例英文证据：bilingual Patient Agent 42×6。
- 上述均为本地确定性fixture/契约证据，不是生产DeepSeek中文5/5、英文5/5证据。

## 生产只读冒烟复跑

| 开始—结束 | 精确命令 | 退出码 | 结果 |
|---|---|---:|---|
| 约21:28—21:31（169.2秒） | `node scripts/smoke-production.mjs` | 1 | health、session 10/10、中文5/5、英文5/5、training action和四音色均无成功样本 |

- 原始计数：session-init无成功样本；patient-reply无成功样本；real-ai=0、fallback=0、success-rate=0%；429/502/503/504均为0。
- 失败均表现为`fetch failed`或“session initialization failed”，不是HTTP应用错误码证据。
- 网页访问通道直接打开health URL返回安全/open内部错误，搜索该URL无结果；不能据此判断生产服务真实状态。

## PR #1 CI证据（2026-07-13）

- PR：`https://github.com/Niubi1v/hematuria-training-system/pull/1`；base=`main@5a3ad11`，head=`codex/hematuria-production-goal@4d1d36e`；状态open、draft=true、merged=false、mergeable=true。
- GitHub Actions：`Deploy to GitHub Pages` run #42（run id `29200619323`）completed/success。
- build job `86671244262`成功；依赖安装、69 JSON幂等、generated-data diff、schema、临床矛盾、双语、完整行为链、医学审核合同、对抗评分、typecheck、lint、仓库secret扫描、Playwright、API origin校验、52页构建和bundle扫描全部success。
- PR事件的`Upload Pages artifact`为skipped；deploy job `86671495596`为skipped，证明PR没有触发Pages部署。
- 外部提交状态`Vercel`为failure，目标为`https://vercel.com/niubi1vs-projects/hematuria-training-system/BkWPP88EtwxFRdSDUAesLgVK6FwB`；Vercel bot评论同样显示Deployment Error且preview URL为空。
- 两次尝试通过浏览器读取Vercel部署详情均在页面加载时超时，未取得构建日志；因此只能登记外部检查失败，不能断言根因，也没有进行猜测性代码修复。
- 证据文档提交后，head `10a2782`触发run #43（run id `29201123342`）：build job `86672572046` completed/success，以上全部质量步骤再次success；artifact上传和deploy job `86672831733`再次skipped。
- `10a2782`对应Vercel deployment `14bJLhnhGaJcGuxE56udffnckoLe`进入failure终态；失败在Actions尚运行时已出现，仍无可访问日志，未实施代码修改。

## Vercel Preview P1修复证据（2026-07-13）

| 命令/条件 | 退出码 | 结果 |
|---|---:|---|
| 首次`tsx scripts/test-public-api-config.ts` | 1 | 预期失败：`resolvePublicApiBaseUrl is not a function`，证明缺少同源preview契约 |
| 修复后`tsx scripts/test-public-api-config.ts` | 0 | Vercel同源、非Vercel fail-closed、HTTPS及纯origin约束全部通过 |
| `tsc --noEmit`；`node scripts/run-lint.mjs` | 0 / 0 | 类型与Lint通过 |
| 清除`NEXT_PUBLIC_API_BASE_URL`，设置`VERCEL=1`、`VERCEL_ENV=preview`后执行`next build` | 0 | 20.2秒；52/52静态页，P001-P042全部预渲染成功 |
| 更新后的完整`package.json scripts.test` | 0 | 31项行为链全部通过，包含新增API配置回归 |

- 本机真实pnpm入口不可用，首次`pnpm run build`尝试在启动前报命令不存在；随后直接执行其实际映射的`next build`，环境条件与Vercel失败构建一致。
- 修复未添加、输出或修改环境变量/密钥；Vercel未配置时使用同一部署origin的相对API路径。
- 远程head `3190b27daf54958d396432f50e7795383a8204c6`：Vercel deployment `FoixbND34sRTAzDKevxagLuM7L3w` state=success。
- GitHub Actions run #44（id `29201836729`）completed/success；build job `86674417595`全部质量步骤success，Pages artifact skipped；deploy job `86674658667` skipped。

- CI/Linux环境在拟发布SHA复跑安全专项、完整行为、generated data diff、repo secret scan和Playwright全量；本地22/22不能替代CI。
- 拟发布SHA上的完整质量门禁，而非仅当前worktree。
- GitHub Actions、Pages、Vercel SHA/live alias核对。
- `/api/health/`、session init 10/10、中文5/5、英文5/5真实生产冒烟。
- Azure配置后的四音色MP3；未配置时必须明确SKIP。

## Preview体验阻塞专项（2026-07-13）

| 时间/条件 | 精确命令或入口 | 退出码/状态 | 结果 |
|---|---|---:|---|
| 匿名Preview探针 | `GET /cases/P001/` | HTTP 200，3228ms | Vercel Deployment Protection HTML，不是应用页面 |
| 匿名Preview探针 | `GET /api/health/` | HTTP 200，1732ms | Vercel Deployment Protection HTML，不是health JSON |
| 匿名Preview探针 | `POST /api/session/init/` | HTTP 401，302ms | 被Preview保护拦截，未到应用API |
| 约01:55 | `tsx test-agent-api-security.ts`; `test-training-api.ts`; `test-api-recovery.ts`; `test-ai-recovery.ts`; `tsc --noEmit`; `eslint .` | 0 | 同源拒绝/允许、init幂等、日志幂等、可取消退避、状态转换、类型与Lint通过 |
| 约02:05 | Patient、LLM adapter、Agent Chat、dynamic session、bilingual专项 | 0 | Patient Agent链通过；英文42例×6 fixtures通过，属于确定性测试而非真实DeepSeek |
| 约02:06 | 无API origin且`VERCEL=1`执行`next build` | 0 | 52/52页面构建通过 |
| 约02:18 | 定向Playwright：rule fallback、offline reconnect、异步日志同步 | 0 | desktop/mobile 6/6；首次因定位器匹配两元素失败2项，收紧到聊天区域后通过，未放宽700ms超时 |
| 02:20左右 | `package.json scripts.test`完整链 + `scan-static-bundle.ts` + `scan-repository-secrets.mjs` | 0 | 全链通过；24 JS；246 tracked/candidate文件，无secret值输出 |
| 02:20左右 | `playwright test` | 0 | desktop/mobile 24/24，22.7s |
| 02:22左右 | Agent security、LLM adapter、42例双语、TypeScript、ESLint相关回归 | 0 | 英文retry提示和init缓存上限改动后专项通过；未重复全量门禁 |
| 02:23 | Python `tomllib`解析`.codex/config.toml`及`.codex/agents/*.toml` | 0 | 1份全局配置、6份唯一Agent定义，必填字段及sandbox枚举通过 |
| 02:25左右 | push前`git diff --check`、`data/**`差异检查、`scan-repository-secrets.mjs` | 0 | data无差异；244个当前tracked/candidate文件通过，未输出secret值 |

说明：当前非流式Patient API不能提供真实首Token指标；受保护Preview无法在本执行环境取得登录态真实AI样本。上述两项保持待验证。

## PR head `a9ace13`远程检查

- 普通push成功：`cbdc4cf..a9ace13`到`origin/codex/hematuria-production-goal`；未force、未写main。
- GitHub Actions run #46，id `29203919549`，event=`pull_request`，head=`a9ace1341339dbd14c7ca93f164aa82a6a945591`，completed/success。
- build job `86679925670`：install、69 JSON、generated diff、schema、临床矛盾、双语、完整行为、医学合同、对抗评分、typecheck、lint、repo secret、Playwright、API origin、build及bundle全部success。
- `Upload Pages artifact` skipped；deploy job `86680180729` skipped，未触发正式Pages部署。
- Vercel deployment `7miajb1rg8DuVXPMHB1bG6fFpM8y`通过；Vercel Preview Comments通过。
- Preview URL：`https://hematuria-training-system-git-codex-he-a06e54-niubi1vs-projects.vercel.app`。浏览器直达P001在20秒内未取得DOM，故真实AI/日志/性能验收仍未通过。

## 自主连接/日志验收增量

| 场景 | 首次结果 | 最终结果 | 证据 |
|---|---|---|---|
| history-log首次503后恢复 | 无既有浏览器覆盖 | desktop/mobile 2/2 | 两次请求同一requestId，AI回答只出现一次，最终评分同步 |
| 快速双击发送 | 无既有浏览器覆盖 | desktop/mobile 2/2 | Patient API 1次、学生消息1条、患者回答1条 |
| 20轮不重复初始化 | 首次2/2失败：预期1、实际2 | desktop/mobile 2/2 | 首次失败由主动中英切换各建1个隔离session；以英文初始化完成为基线后20轮计数不增长 |
| pending日志刷新恢复 | 无既有浏览器覆盖 | desktop/mobile 2/2 | localStorage持久队列恢复，同一requestId，聊天回答保留 |
| 复合问题来源分类 | 首次exit1：实际`rule_fallback`、预期`safety_boundary` | 相关专项exit0 | `compound_question_preserves_all_facts`不再冒充provider/rule故障 |

- 远程：`af896d0` run #48、`fde34a2` run #49、`a821200` run #50均completed/success；各自Vercel Deployment success，Pages deploy skipped。
- `96d0990` run #51（id `29204729994`）completed/success；Vercel Deployment success，Pages deploy skipped。

## 双语医学一致性只读审计

- 严格规则只统计明确相反短句：中文`无痛性/无尿痛/无尿频/无尿急`与英文明确肯定`I have pain`、`hurts or burns`、`urinating more often`、`urgent need`。
- 结果：18条，11例；pain 5、dysuria 3、urinary_frequency 1、urinary_urgency 9；source 4、derived 14；全部`teacherReviewRequired=true`。
- 该结果是失败/阻断证据，不是通过；未运行写入型生成器，未修改`data/**`。

## HEM-P1-024 连接提示收敛（2026-07-13）

| 时间/条件 | 精确命令或入口 | 退出码/状态 | 结果 |
|---|---|---:|---|
| 约12:44，1280×720 | 真实浏览器打开本地`/cases/P001/`，等待初始化完成并读取DOM/console | 可重复 | 同时出现泛化health提示与具体session错误；document client/scroll width均1265，无横向溢出；2条脱敏`api_request_failed` |
| 修复前测试准备 | 新增Playwright用例`session initialization failure shows one specific connection notice` | 未进入断言 | CI模式缺少`chromium_headless_shell-1228`；本机Chrome通道180秒未完成启动，均登记为测试环境限制 |
| 修复后 | `node node_modules/typescript/bin/tsc --noEmit` | 0 | TypeScript通过 |
| 修复后 | `node scripts/run-lint.mjs` | 0 | ESLint通过 |
| 修复后 | `tsx scripts/test-ai-recovery.ts` | 0 | 状态、过期、部署失效、安全fallback与覆盖恢复通过 |
| 修复后 | `tsx scripts/test-api-recovery.ts` | 0 | 重试、幂等、非重试错误与超时通过；仅输出脱敏测试错误元数据 |

- 代码变化只抑制重复的泛化提示；更具体的会话错误和重连按钮保留。
- 新Playwright断言尚未取得本地通过证据，必须以本次提交对应的Draft PR Linux CI结果为准。

### 首次PR CI结果与测试fixture修正

| 证据 | 结果 |
|---|---|
| Draft PR run `29225138570` / head `bde01a0` | Unit、医学合同、评分、TypeScript、Lint、secret scan及Playwright安装均通过；Playwright 32通过、2失败；后续build步骤因fail-fast跳过；Pages deploy skipped |
| 首条失败 | `getByText('网络连接失败，请检查网络后重试。')`在桌面/移动均不存在；fixture实际返回HTTP 503 `session_unavailable`，并非网络中断 |
| 修正 | health和session init均改为`route.abort("failed")`，继续要求精确网络错误文案可见且泛化health提示计数为0；未放宽断言 |
| 外部检查 | Vercel Deployment `BjDGR3xF5W2zp9ihRn5zvcrZdn3m` success；Vercel Preview Comments success |

- 修正后的Playwright结果仍待新提交的CI，不得把首次失败写成通过。

### 修正后PR CI终态

- head：`25206455fb1391d31bef9064c34d84a042f72234`。
- GitHub Actions run：`29225349342`，completed/success；build job `86738186827`。
- 全部工程步骤通过：69 JSON与generated diff、schema/临床矛盾/双语、完整行为、医学审核合同、对抗评分、TypeScript、ESLint、repository secret scan、Playwright E2E、API origin、52页静态构建及bundle scan。
- Vercel deployment `2ibBiZGa47BCsj8A1sLAsqQNFGHp` success；Vercel Preview Comments success。
- PR事件的Pages artifact上传与deploy job `86738432785`均skipped；未正式部署生产。
- PR #1仍为Open/Draft，base=`main`、head=`codex/hematuria-production-goal`、mergeState=`CLEAN`。

## UI/UX专项集成本地证据（2026-07-13）

| 检查 | 精确命令/范围 | 退出码/状态 | 结果 |
|---|---|---:|---|
| 分支关系 | `git rev-list --left-right --count 74c140f...a6630a3`；`git merge-base` | 0 | Production/UI为`0/3`；merge-base=`74c140f` |
| 禁止范围 | 三项提交完整`git show`、`git diff --name-only`、关键文件hash比对 | 0 | `data/**`与医学/审批/API/server/评分/签名/连接核心零修改 |
| 集成 | 依次cherry-pick `a4df6c8`、`961c6cc`、`a6630a3` | 0 | 生成`c1bdc4a`、`dec4e74`、`6cc1e2a`，无冲突 |
| TypeScript | `node node_modules/typescript/bin/tsc --noEmit` | 0 | 通过 |
| ESLint | `node scripts/run-lint.mjs` | 0 | 通过 |
| 连接与日志专项 | `test-ai-recovery.ts`、`test-api-recovery.ts`、`test-training-api.ts` | 0 | 取消、幂等、恢复及签名门禁通过 |
| Patient/临床Agent/评分 | `test-patient-agent.ts`、`test-physical-exam-qc.ts`、`test-order-mapping.ts`、`test-event-scoring.ts`、`test-language-purity.ts` | 0 | 42例/376查体项、order映射、42例评分与语言纯度通过 |
| 完整行为链 | 按`package.json scripts.test`顺序直接执行32个入口 | 0 | 32/32；含42×17中文、42×6英文、419约束、医学合同、360评分与对抗测试 |
| Vercel等价构建 | `VERCEL=1 VERCEL_ENV=preview`、无公开API origin，直接执行Next build | 0 | 静态生成52/52页；`/cases/[id]` First Load JS 153 kB |
| bundle隐藏信息 | `scan-static-bundle.ts` | 0 | 25个JS资源通过 |
| 仓库敏感信息 | `scan-repository-secrets.mjs` | 0 | 281个tracked/candidate文件通过，未输出secret值 |
| 69 JSON幂等 | 直接执行`test-conversion-idempotency.ts`并设置本地pnpm execpath | BLOCKED | 两次分别约5/7分钟无输出挂起后终止；`data/**`两次均零差异，待Linux CI复核 |
| 集成后Playwright | 本机CI Chromium与Chrome通道定向尝试 | BLOCKED | 浏览器/服务器启动阶段180秒超时，未到断言；不得记为通过，待Draft PR CI |

- 新增失败回归`history log exhausted retries exposes one manual idempotent retry`：前三次503后出现单一手动重试入口；第四次须复用同一requestId并只保留一个AI回答。该断言尚待Linux CI执行。
- 既有UI截图目视核对：1280桌面双栏、360/390移动问诊未见横向溢出；Enter发送、Shift+Enter换行、手动上翻保持、单一连接提示及缺失数据非正常语义均有代码路径。截图不是集成后自动化通过证据。

### UI集成首轮PR CI与双层重试修复

- Draft PR head `2283f196a475e86eb5ef8fc999d667961d49b146`；Actions run `29231277833`，build job `86755845204`。
- Conversion idempotency、generated diff、schema、临床矛盾、双语、完整行为、医学合同、review queue/import、对抗评分、TypeScript、ESLint、repository secret scan及Playwright安装全部success。
- Playwright运行40项：38通过、2失败；首条失败为desktop新增手动同步用例在5秒内找不到`Retry sync`，mobile同因。后续build因fail-fast跳过；Pages deploy跳过。
- Vercel Deployment `Fwkx6GW171rMYwxU54rxvrXy194u`与Preview Comments均success；这不覆盖Actions失败。
- 代码审查根因：`requestTrainingAction`使用`fetchWithRecovery(... retries: 2)`，history持久队列又最多执行3轮；测试前三个503由第一轮内部3次调用吸收，队列下一轮第4次成功，所以按钮正确地没有出现。
- 修复：history-log的通用层`retries=0`，仅保留持久队列三轮有界重试；其他训练动作仍为2次内部重试。原失败断言不放宽，仍要求3次自动失败后出现按钮、手动第4次成功、同一requestId且AI回答唯一。
- 修复后本地：`tsc --noEmit`、`run-lint.mjs`、`test-training-api.ts`、`test-api-recovery.ts`、`test-ai-recovery.ts`依次exit0。日志中的403/404/503/timeout均为专项预期的脱敏fixture，不是未处理失败。

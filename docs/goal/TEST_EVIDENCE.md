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
| 69 JSON幂等 | 本机直接执行；远程`pnpm run test:idempotency` | LOCAL BLOCKED / CI 0 | 本机两次分别约5/7分钟挂起且`data/**`零差异；run `29232093193`明确69/69通过 |
| 集成后Playwright | 本机定向尝试；Draft PR Linux CI | LOCAL BLOCKED / CI 0 | 本机启动超时；run `29232093193` desktop/mobile 40/40，含手动日志同步回归 |

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

### 第二轮CI与effect重入根因

- head `853d8198b05af235360df4e38cc024f2d5f66a60`，Actions run `29231718708`；Vercel Deployment `8rypWN4jd3ySMVB9bz3YhAZ7UpUJ`及Preview Comments success。
- Playwright仍为38/40，desktop/mobile同一`Retry sync`不可见；说明移除HTTP内层重试只解决重复调用层数，没有解决状态effect重入。
- 根因路径：catch写回`pendingHistoryLogs.attempts` → dependency变化立即清理/重跑effect → 未等待既定500/1200ms timer即发下一请求；第三次失败写回又发第4次请求并成功，failed状态被verified覆盖。
- 修复后要求：waiting期间dependency重跑不得发请求；`attempts>=3`稳定停机；人工按钮重置队首attempts并保留requestId。Playwright断言及5秒窗口保持不变。
- 状态竞态修复后再次运行TypeScript、ESLint、training API、API recovery与AI recovery，五项均exit0；没有重复运行与本次变更无关的完整行为/构建门禁。

### UI集成最终PR CI终态

- 验收代码HEAD：`789243d9d201869ed3cd35b60fc18aff7583cc5e`；Actions run `29232093193`、build job `86758375055`，completed/success，用时3分33秒。
- Playwright E2E 40/40（1.6分钟），覆盖desktop/mobile、新增日志耗尽手动重试、快速双击、刷新恢复、连接提示、滚动与输入；关键页axe断言继续要求critical/serious为0。
- Conversion idempotency 69 JSON、generated data diff、schema、42例临床矛盾、42×6英文、32项行为、572事实合同、153/419队列、v1.4导入、360评分、TypeScript、ESLint及281文件repository secret scan全部success。
- 静态构建52/52；bundle secret/answer scan通过23个JavaScript资源。CI使用PR merge ref生成短SHA属于GitHub checkout行为，验收head仍由run元数据明确为`789243d`。
- Vercel Deployment `YStbn7Yhk3gQPaCdUbF7wWzgmvpT`与Preview Comments success；Pages artifact上传及deploy job `86758965570` skipped，未发布生产。
- PR #1仍为Open/Draft，base=`main`、head=`codex/hematuria-production-goal`、mergeState=`CLEAN`。

## 最终证据提交与Preview访问复核（2026-07-13）

- 最终文档HEAD `cdfa51f7bdd573ce1dcec2bf03962835bd18dcd4`：Actions run `29232460170` completed/success，build job `86759503016`用时3分44秒；全部质量步骤success，Pages deploy job `86760136061` skipped。
- Vercel Deployment `2s4FgH59i7vamSncXKw8SJn7cKGz`与Preview Comments success；PR保持Open/Draft/CLEAN，本地/远程head一致。
- 15:40浏览器只读复核：Chrome开放标签中能识别目标Preview P001 URL及应用标题；第一次接管后DOM snapshot超过30秒超时，第二次重新连接后标题/URL探针在60秒内亦超时。没有取得console/network/API响应，因此不能生成请求时间线或真实AI性能结论。
- 浏览器会话随后正常释放；未读取或输出Cookie、Authorization、localStorage、签名或密钥。该结果是HEM-P1-020的重复阻塞证据，不是Preview应用失败或成功证明。

## 2026-07-13 性能遥测增量

| 检查 | 精确命令/范围 | 结果 |
|---|---|---|
| 失败测试基线 | `node node_modules/tsx/dist/cli.mjs scripts/test-performance-timing.ts` | exit 1；`Cannot find module '../server/performanceTiming.js'` |
| 遥测合同 | 同上（实现后） | exit 0；固定白名单、有限非负数、稳定一位小数、敏感标签拒绝 |
| API集成专项 | `tsx scripts/test-agent-api-security.ts`、`tsx scripts/test-training-api.ts`、`tsx scripts/test-ai-recovery.ts` | exit 0；session/app/history/score响应头、CORS、签名、隔离与恢复通过 |
| TypeScript | `node_modules/.bin/tsc.cmd --noEmit` | exit 0 |
| 完整行为链 | 读取`package.json#scripts.test`并依次调用本地`tsx.cmd`（32项） | exit 0，10.8秒；含42例中英文、572事实、419约束、360评分及安全合同 |
| Vercel等价构建 | `VERCEL=1 VERCEL_ENV=preview node_modules/.bin/next.cmd build` | exit 0，52/52页面，构建/扫描合计17.8秒 |
| bundle扫描 | `tsx scripts/scan-static-bundle.ts` | exit 0，25个JavaScript资源 |
| 敏感信息扫描 | `node scripts/scan-repository-secrets.mjs` | exit 0，283个tracked/candidate文件；未输出秘密值 |
| ESLint | `node_modules/.bin/eslint.cmd ...受影响文件...` | exit 1；本机Node 24.14不满足仓库`>=22.14 <23`，`@rushstack/eslint-patch`拒绝运行；不是Lint断言结果，待PR Node 22 CI补证 |

- `git diff -- data`为空；测试产生的三份时间戳报告已恢复为原追踪内容，没有提交无关生成物。
- 该性能遥测里程碑当时仍为`stream:false`并明确报告首Token unsupported；后续SSE增量已解除工程采集缺口，但真实Preview性能仍需权限/变量后复测。

### 首轮远程结果与最小修复

- Actions run `29234298382`：build失败，第一条真实错误位于Playwright E2E；39/40通过，mobile英文切换未在5秒内找到固定英文回答。Typecheck和Lint均success，故本机Node 24 Lint阻塞已由CI Node 22补证。
- Vercel deployment `AGSc7mzfLkMWkHiWVerHGZHJ2TwD`与Preview Comments通过；Pages deploy skipped；PR保持Draft。
- 本机原样定向`playwright ... --project=mobile-chromium --grep "English patient reply stays English" --repeat-each=3`在180秒后因本地webServer条件超时退出124，不能登记为业务失败或通过。
- 测试最小修复：等待`/api/session/init/`请求体`language=en`且响应成功后再发送；原5秒回答断言、固定英文内容、语言隔离和移动端覆盖全部保留。`node --check tests/e2e/practice.spec.mjs`用于提交前语法门禁，新CI作为最终行为证据。
- 修复HEAD `f052d7e`：Actions run `29235062395` completed/success，build job `86767725364`用时3分31秒；Playwright 40/40，TypeScript、Lint、行为、医学治理、构建及扫描步骤均通过。Vercel deployment `AYbur4LpESzJVG2jtbP2JA54cBRr`与Preview Comments通过；Pages deploy job `86768374293` skipped。

## 2026-07-13 首Token SSE工程证据

| 检查 | 命令/范围 | 结果 |
|---|---|---|
| 失败基线 | `node_modules/.bin/tsx.cmd scripts/test-llm-streaming.ts`（实现前） | exit 1；SSE首个`data:`被JSON解析并报`Unexpected token 'd'` |
| SSE合同 | 同命令（实现后） | exit 0；content聚合、reasoning不返回、首Token计时、显式非流式兼容通过 |
| API非泄露 | `tsx scripts/test-agent-api-security.ts` | exit 0；`firsttoken`只在`Server-Timing`，JSON无内部计时字段 |
| 相关回归 | `test-performance-timing`、`test-llm-adapter`、`test-ai-recovery`、TypeScript | exit 0 |
| 完整行为链 | `package.json#scripts.test`顺序执行33项 | exit 0，10.3秒；42例、572/419与360分门禁保持通过 |
| Vercel等价构建 | `VERCEL=1 VERCEL_ENV=preview next build` | exit 0，52/52 |
| 扫描 | `scan-static-bundle.ts`、`scan-repository-secrets.mjs` | exit 0；25 JS、284候选文件，未输出秘密值 |

- 官方协议依据：[DeepSeek Create Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion)：`stream=true`使用data-only SSE增量并以`data: [DONE]`结束。
- 尚未取得真实DeepSeek延迟样本；本地fixture只证明协议、计时与非泄露，不替代Preview P95/首Token验收。
- 远程HEAD `d2c2eb0dac9ed3c1798dc75a94bcc5f386280f2b`：Actions run `29236606930` success，build job `86772620376`用时3分35秒；Unit/behavior、医学合同、Typecheck、Lint、secret scan、Playwright E2E、52页构建和bundle扫描全部success。Vercel deployment `3N7ghXGzvurKNbjeVrr35zUDG2Z8`与Preview Comments success；Pages deploy job `86773293377` skipped。

## HEAD 98e35b1 Preview黑盒证据（2026-07-13 16:58—17:06 CST）

| 检查 | 环境/路径 | 结果 |
|---|---|---|
| 部署归属 | Vercel `93ejmrajShA85o5fv1cSVq462jNv` | Ready；source=`98e35b1`；Preview；分支域名为当前目标URL |
| 函数资源 | Deployment Resources | 7个Node.js 22函数存在：agent-chat、health、patient-reply、session/complete-profile、session/init、training-action、tts |
| Chrome首次加载 | P001 | 两次`api_request_failed`相隔4.9秒，随后“网络连接失败”/降级模式 |
| Codex应用内浏览器首次加载 | P001 | 独立复现，两次警告相隔5.1秒，随后同样降级 |
| 手动重连 | Chrome P001 | 点击与观察约21秒后仍回到网络失败；没有清空聊天 |
| 中文fallback | “您好，哪里不舒服？” | 总观察约22.4秒；自然中文澄清回答、无病例摘要泄露；输入清空且保持焦点；来源仍为降级，评分显示待同步 |
| 运行日志 | 当前deployment过滤 | 测试窗口无函数调用日志；不能据此断言函数成功或失败 |
| Preview变量（仅名称） | Vercel Preview设置 | AI供应商相关10个名称存在并覆盖Production and Preview；未看到`TRAINING_STATE_SECRET`；未展开/读取值 |
| 部署保护 | Project Settings | Standard Vercel Authentication开启；OPTIONS allowlist关闭；仅登记跨源预检风险，尚无实际请求URL/状态证据 |

- 浏览器直接打开`/api/health[/]`被客户端以`ERR_BLOCKED_BY_CLIENT`阻止，因此未获得可审计HTTP状态；没有绕过保护、读取Cookie/Authorization或使用bypass secret。
- 该证据证明Preview用户可见发布阻断仍存在，也证明fallback语言、摘要防泄露、输入焦点和单提示修复有效；不能把fallback计作真实DeepSeek成功。

## 静态发布审计安全候选门禁（2026-07-14，本地）

| 门禁 | 精确命令/执行方式 | 退出码与结果 |
|---|---|---|
| 聚合行为/医学/安全 | `pnpm run test` | 0；包含training replay/stage、Agent session/idempotency、42例、572追踪、419约束、18项隔离、360评分和工作簿限制 |
| TypeScript | `node node_modules/typescript/bin/tsc --noEmit` | 0 |
| ESLint | `node scripts/run-lint.mjs` | 0，`--max-warnings 0` |
| 生产构建 | `NEXT_PUBLIC_API_BASE_URL=https://hematuria-training-system.vercel.app pnpm run build` | 0；Next 15.5.19，52/52静态页，P001-P042完整 |
| Bundle隐藏信息 | `pnpm run test:bundle` | 0；25个JavaScript资源 |
| 仓库敏感信息 | `pnpm run test:secrets` | 0；294个tracked/candidate文件；未输出值 |
| 公共API配置 | `pnpm run validate:api-config` | 0；显式HTTPS origin通过 |
| 生产依赖high门禁 | `pnpm audit --prod --audit-level high` | 0；0 high，1 moderate |
| 工作簿安全 | `pnpm run test:workbook-security`及聚合链 | 0；32MB/32 sheet/10万行/512列/100万单元格限制 |
| 医学工作簿/队列/导入 | 聚合链中的`test-medical-review*`、`test-release-v14` | 0；42例、572项、153/419分离、419零批准 |
| 生成幂等只读验证 | `pnpm run test:idempotency` | 1；隔离临时worktree真实发现56个提交基线漂移；当前`data/**`零改动。登记为阻塞，不隐藏失败 |
| Playwright首次全量 | 直接调用锁定的`@playwright/test` CLI，desktop+mobile | 1；34/40，旧夹具未满足训练状态/幂等/阶段锁新合同 |
| Playwright失败专项复验 | 同CLI `--grep 'session initialization|offline reconnect|P008 exact'` | 0；6/6，5.2秒 |
| Playwright最终全量 | 同CLI `test`，复用直接启动的本地Next server | 0；40/40，33.8秒，runner正常自行退出 |
| 数据与医学状态diff | `git status --short -- data CASE_DATA_QC_REPORT.md outputs` | 0且无输出；未修改病例、审核决定或裁决表 |
| Diff空白检查 | `git diff --check` | 0；仅Git行尾提示，无空白错误 |

补充事实：本机是Node 24.14而仓库声明Node 22.14；上述本地结果有engine warning。旧远程HEAD `41b3830`的Actions run `29238512030`已在Node 22完成40/40并正常退出，但它不能替代新安全候选的CI；新HEAD必须push后重新验证。

Preview未执行真实Upstash/DeepSeek验收，因为当前没有也不得读取所需凭据。没有把memory adapter、fallback或mock结果记作真实serverless/AI通过。

## 2026-07-14 终审P1专项证据

| 检查 | 精确命令 | 结果 |
|---|---|---|
| 防重放、精确阶段锁、晚到证据、语言绑定 | bundled Node运行`node_modules/tsx/dist/cli.mjs scripts/test-training-security.ts` | exit 0；原始init token不泄露最新bearer，关闭阶段回填409且状态零变化 |
| 训练API回归 | bundled Node运行`node_modules/tsx/dist/cli.mjs scripts/test-training-api.ts` | exit 0；签名状态、精确释放、formal门禁、模式锁通过 |
| session/Agent安全 | bundled Node运行`node_modules/tsx/dist/cli.mjs scripts/test-agent-api-security.ts` | exit 0；21.1秒；跨语言/跨模式session拒绝，capability、并发幂等、CORS、限流和非泄露通过 |
| 动态session | bundled Node运行`node_modules/tsx/dist/cli.mjs scripts/test-dynamic-patient-session.ts` | exit 0 |
| AI恢复 | bundled Node运行`node_modules/tsx/dist/cli.mjs scripts/test-ai-recovery.ts` | exit 0 |
| LLM适配安全 | bundled Node运行`node_modules/tsx/dist/cli.mjs scripts/test-llm-adapter.ts` | exit 0 |
| TypeScript | `pnpm run typecheck` | exit 0；本地Node 24.14产生预期engine warning，新HEAD Node 22仍待CI |
| ESLint | `pnpm run lint` | exit 0；同上 |
| 敏感信息 | `pnpm run test:secrets` | exit 0；294个tracked/candidate文件，无值输出 |
| 医学/生成数据diff | `git diff --name-only -- data CASE_DATA_QC_REPORT.md LANGUAGE_PURITY_REPORT.md PATIENT_PROFILE_COMPLETENESS_REPORT.md PHYSICAL_EXAM_QC_REPORT.md` | exit 0且无路径输出 |
| diff空白 | `git diff --check` | exit 0；只有CRLF转换提示 |

说明：`test:idempotency`已改为在调用者全仓干净时只验证已提交HEAD。因此必须在代码和证据提交完成、工作树干净后运行；真实56文件黄金基线漂移预期仍会exit 1，不能通过放宽门禁消除。

## 2026-07-14 已提交HEAD完整门禁

| 检查 | 命令/环境 | 退出码与结果 |
|---|---|---|
| 生成基线/二次幂等 | `pnpm run test:idempotency`，干净`ba35c28` | exit 1，7.7秒；56个受控输出相对提交基线漂移；临时worktree已清理，主树零diff |
| 完整行为链 | `pnpm run test` | exit 0，30.7秒；全部32段脚本通过 |
| 直接Next生产构建 | bundled Node执行`node_modules/next/dist/bin/next build`，`VERCEL=1` | exit 0，18.7秒；52/52静态页、2/2 export |
| CI精确构建入口 | 联网供应链校验下`CI=1 VERCEL=1 pnpm run build` | exit 0，28.8秒；pnpm策略通过，52/52构建通过 |
| Playwright自动webServer诊断 | `CI=1`直接Playwright CLI | exit 124，360.4秒；pnpm registry attestation在沙箱EACCES重试，未进入用例；不登记为测试失败通过 |
| Playwright desktop/mobile | 先启动127.0.0.1本地Next并取得P001 HTTP 200，再直接Playwright CLI复用服务 | exit 0，42.3秒；40/40，runner自行退出 |
| 静态bundle | `NEXT_PUBLIC_API_BASE_URL=https://hematuria-training-system.vercel.app pnpm run test:bundle` | exit 0；25个JS资产 |
| 仓库敏感信息 | `pnpm run test:secrets` | exit 0；294文件，无值输出 |
| API配置 | CI同值运行`pnpm run validate:api-config` | exit 0 |
| 生产依赖审计 | `pnpm audit --prod --audit-level high` | exit 0；0 high，1 moderate明确保留 |
| 最终工作树 | `git status --short`、受保护路径diff、`git diff --check` | clean；`data/**`/审核产物零diff；仅CRLF提示 |

本机Node为24.14，仓库要求Node 22.14；因此本地结果均带engine warning。推送后的GitHub Actions Node 22是新候选的强制等价补证，不能复用旧HEAD绿灯。

### 远程检查（push阻塞时）

- `gh pr view 1`/GitHub API：PR #1 `OPEN`、`isDraft=true`、`mergeStateStatus=CLEAN`，base `main@5a3ad11`，remote head `41b3830`。
- `gh pr checks 1`：旧HEAD build success（3m33s）、Vercel success、Preview Comments success、deploy skipped。
- `git fetch --prune origin`两次exit1（`github.com:443`连接超时）；普通push两次exit1（connection reset/连接超时）。GitHub API实时ref仍为`41b3830`，所以没有未知远程提交证据，但本地新候选尚无任何CI/Preview结果。

## 2026-07-14 远程CI与幂等跨平台补证

- Actions run `29287786411` / build job `86944326588` / head `6fcd325`：completed/success，4分03秒；Node 22.14.0。
- Conversion idempotency步骤实际运行15.6秒并输出：`Conversion baseline and second-run idempotency passed for 75 controlled outputs in an isolated worktree.`，非跳过。
- Playwright 40/40（1.6分钟），生产静态页52/52，dependency audit为1 moderate/0 high，最终tracked-worktree cleanliness gate通过；Pages deploy skipped。
- Vercel Deployment `7XY5CJxGAZZyEAh79RydKYUjgLzL` success，Preview Comments success。此部署成功不等于真实AI/Upstash变量验收通过。
- Windows根因命令：`git config --show-origin --get core.autocrlf`返回系统级`true`；`git ls-files --eol data/cases.json CASE_DATA_QC_REPORT.md`显示`i/lf w/crlf`。
- 修复提交`bb130c1`后，bundled Node直接执行`tsx scripts/test-conversion-idempotency.ts`：exit0，11.6秒，75个受控输出baseline与第二次生成均通过；临时worktree清理，受保护数据零diff。

### `9d405fd`远程门禁

- Actions run `29288294002` / job `86945910258`：completed/success，4分03秒；Conversion idempotency日志明确为75受控输出通过。
- Repository secret scan：294文件通过；Playwright：40/40（1.6分钟）；build：52/52；final cleanliness gate：success；依赖审计：1 moderate/0 high。
- Vercel Deployment `7kTocPAWKiyWiRHd1XEVmLFzmASk` success；Vercel Preview Comments success；Pages deploy skipped。
- PR #1在检查完成后仍`OPEN`、`isDraft=true`。这些是工程门禁证据，不是Preview真实AI、持久存储、签名变量或医学专家验收。

## 2026-07-14 当前HEAD与Preview只读复验

| 检查 | 精确命令/路径 | 退出码与结果 |
|---|---|---|
| 当前分支与PR | `git status --short --branch`、`git rev-parse HEAD`、`gh pr view 1 --json ...` | 证据提交/远程/PR head均为`30b0d455d276a24ddb77ebfb77c06219e1871e45`；PR Open/Draft/CLEAN |
| 当前CI | `gh pr checks 1 --watch --interval 10` | run `29289645684` build SUCCESS（4分09秒）；Vercel SUCCESS；Preview Comments SUCCESS；Pages deploy SKIPPED |
| 浏览器实测部署解析 | GitHub Deployments API，SHA=`10fe60d...` | deployment `5432035094` success；应用URL为`https://hematuria-training-system-dsafq1pj5-niubi1vs-projects.vercel.app` |
| 文档证据部署解析 | GitHub Deployments API，SHA=`30b0d45...` | deployment `5432222665` success；应用URL为`https://hematuria-training-system-l0upihrnu-niubi1vs-projects.vercel.app` |
| P001浏览器DOM | Codex in-app Browser打开`/cases/P001/`并读取DOM | 页面标题正常；初始化后为`回答来源：降级模式`，仅一个网络失败status和一个“重新连接AI”按钮；聊天记录及输入框保留 |
| Preview health | `Invoke-WebRequest -Method Get https://hematuria-training-system-dsafq1pj5-niubi1vs-projects.vercel.app/api/health/` | shell exit0；请求约2.4秒；HTTP 200、`text/html`、Vercel Authentication页面，不是应用health JSON |
| 控制台探针 | Browser `tab.dev.logs`两次最小读取 | BLOCKED：控制通道超时并重置；未取得应用console错误，不以工具自身网络告警替代产品证据 |
| Git fetch | `git fetch --prune origin` | 首次exit1：Git smart-HTTP连接`github.com:443`超时；推送前重试exit0，远程/PR head仍与本地`10fe60d`一致，无未知远程提交 |
| 文档diff/敏感信息 | `git diff --check`、受保护路径diff、bundled Node直接执行`scripts/scan-repository-secrets.mjs` | exit0；294个tracked/candidate文件通过，`data/**`、审核产物和`outputs/**`零差异；pnpm包装入口因Node 24/无TTY依赖状态检查未进入脚本，不记作扫描失败或通过 |

说明：本次没有代码变化，所以没有重复运行已在`10fe60d`远程CI通过的完整门禁。Vercel部署绿灯只证明构建/部署成功；当前浏览器和health证据证明受保护API链不可用，不能计作真实DeepSeek、Upstash、签名日志、10/10、20轮、P95或自然度通过。未读取Cookie、Authorization、localStorage、环境变量值或密钥。

## 2026-07-14 PRV-P2-003 TTS缓存隔离

| 检查 | 精确命令/环境 | 退出码与结果 |
|---|---|---|
| 旧实现失败基线 | bundled Node执行`node_modules/tsx/dist/cli.mjs scripts/test-tts-api.ts` | exit1；固定旧FNV碰撞的第二文本实际为`HIT`，精确失败为`'HIT' !== 'MISS'` |
| 修复后TTS API专项 | 同上 | exit0；四音色、SHA-256 tuple、Origin/参数隔离、精确命中、1小时TTL、预热并发和100项淘汰通过 |
| 前端选声与恢复 | `scripts/test-tts.ts`、`scripts/test-api-recovery.ts` | 均exit0；中英男女/年龄/对抗名称和有限恢复合同通过 |
| TypeScript、ESLint | bundled Node执行`tsc --noEmit`、`scripts/run-lint.mjs` | 均exit0；本地Node 24仅有仓库engine边界，最终以Node 22 CI为准 |
| 完整行为门禁 | `CI=true pnpm run test` | exit0，33.4秒；当前36段/42例/572/419/18隔离/360/安全合同通过 |
| Vercel等价构建 | `CI=1 VERCEL=1 VERCEL_ENV=preview pnpm run build` | exit0，17.7秒；52/52静态页、2/2 export |
| bundle与repository扫描 | `scripts/scan-static-bundle.ts`、`scripts/scan-repository-secrets.mjs` | exit0；25个JS资产、294个tracked/candidate文件，无敏感值输出 |
| 已提交HEAD幂等 | bundled Node执行`scripts/test-conversion-idempotency.ts`，干净`91b2b23` | exit0，12秒；75个受控输出baseline及第二次生成通过，临时worktree清理 |
| 受保护路径 | `git diff --name-only -- data ... outputs` | 无输出；未修改病例、审核产物、裁决表、`needs_revision`或360评分 |

说明：测试provider返回每次不同的短音频Buffer，用来证明不同tuple不会复用音频；它不是Azure真实音色证据。Azure未配置状态保持SKIP/PENDING。首次TypeScript尝试因本地pnpm junction在沙箱内不可读而未进入有效模块解析；按锁文件恢复依赖并在可读取junction的环境重跑后exit0，没有修改package或lock。

### `96fcf80`远程门禁

- Actions run `29291035332` / build job `86954440438`：completed/success，4分00秒；项目Node `v22.14.0`。
- Unit and behavioral tests日志明确输出：`TTS API voice, SHA-256 tuple, origin/parameter isolation, TTL, concurrency, and bounded eviction contracts passed.`
- Conversion idempotency为75个受控输出通过；repository secret为294文件通过；Playwright 40/40（1.5分钟）；build 52/52；CI bundle 23个JS；最终tracked-worktree clean gate通过。
- Production dependency audit仍为1 moderate、0 high；没有伪造成零漏洞。Vercel Deployment和Preview Comments success，Pages deploy skipped，PR保持Draft。

## 2026-07-14 PRV-P2-004 Secret Scanner扩展

| 检查 | 精确命令/环境 | 退出码与结果 |
|---|---|---|
| Scanner失败fixture | bundled Node执行`scripts/test-secret-scanner.mjs` | exit0；动态文本、PNG ASCII、奇数偏移UTF-16、压缩XLSX、placeholder、值不回显和已删除Git历史合同通过 |
| 真实仓库扩展扫描 | bundled Node执行`scripts/scan-repository-secrets.mjs` | exit0；295个tracked/candidate文件、当前36个二进制/Office归档和112提交可达文本历史，无值输出 |
| TypeScript、ESLint | bundled Node执行`tsc --noEmit`、`scripts/run-lint.mjs` | 均exit0 |
| 完整行为门禁 | `CI=true pnpm run test` | exit0，35.4秒；当前37段、42例、572/419/18隔离、360及安全合同通过 |
| 已提交HEAD复验 | `25ad0a9`上依次运行scanner专项、真实扫描、`scripts/test-conversion-idempotency.ts` | 均exit0；75受控输出baseline/二次幂等通过 |
| PostCSS moderate | `pnpm audit --prod --audit-level moderate --json` | exit1；仅`next -> postcss@8.4.31`命中`GHSA-qx2v-qp2m-jg93`，1 moderate/0 high/0 critical |
| CSS可达性搜索 | `rg`搜索PostCSS parse/stringify、`dangerouslySetInnerHTML`、动态style/CSS上传 | 无用户CSS解析或注入路径；textarea仅训练答案输入 |

资源边界：单文件64MB、归档32MB、单entry 8MB、总展开64MB、2048 entries、历史patch 128MB；加密、ZIP64、未知压缩、超限和解析失败均fail closed为finding。当前扫描仍不能证明历史压缩二进制、图片像素OCR/隐写或组织级artifact/日志保留安全，故这些项目继续列为限制。

### `52c2432`远程门禁

- Actions run `29292415307` / build job `86958675834`：completed/success，3分39秒；Node `v22.14.0`、pnpm `11.7.0`。
- Full chain：75个受控输出幂等、42例/572事实/419待审/18隔离/360评分、training replay/stage/session、Agent/CORS/限流、TypeScript、ESLint及295文件repository scanner全部success。
- Playwright 40/40（1.3分钟）后约36ms进入下一step；build 52/52、bundle 23 JS、最终tracked-worktree clean gate成功。Vercel Deployment与Preview Comments success，Pages artifact/deploy skipped，PR保持Draft。
- 依赖审计真实状态为1 moderate、0 high；没有伪造成零漏洞。

## 2026-07-14 工作簿展开与CI证据真实性原子里程碑

| 检查 | 精确命令/环境 | 退出码与结果 |
|---|---|---|
| 工作簿失败基线 | bundled Node/tsx执行`scripts/test-workbook-security.ts` | exit1；`maxExpandedBytes: 1`没有产生异常，证明旧helper在解析前没有ZIP展开边界 |
| 工作簿修复专项 | 同命令 | exit0；文件、ZIP entry/总展开、sheet、row、column、aggregate-cell限制通过 |
| 医学工作簿及导入 | `test-medical-review-workbook.ts`、`test-medical-review-import.ts`、`test-release-v14-import.ts` | 均exit0；8 sheets、42 cases、572 facts、153/419边界、0 licensed approvals、360合同保持 |
| scanner浅仓库合同 | `node scripts/test-secret-scanner.mjs` | exit0；完整临时历史可检出已删除fixture，depth-1 clone产生`history-scan-shallow`且不冒充全历史通过 |
| 真实仓库scanner | `node scripts/scan-repository-secrets.mjs` | exit0；295 tracked/candidate及可达文本历史，无值输出 |
| workflow失败/通过合同 | `tsx scripts/test-product-audit.ts` | 修复前exit1（仅production audit）；修复后exit0，覆盖完整checkout、全依赖high、untracked clean、main-only deploy及并发隔离 |
| 全依赖审计 | `pnpm audit --audit-level high` | exit0；1 moderate、0 high，Node24本地辅助证据，最终以新Node22 CI为准 |
| TypeScript、ESLint、完整行为 | `tsc --noEmit`、`node scripts/run-lint.mjs`、`CI=true pnpm run test` | 全部exit0；完整行为31.6秒，含42/572/419/18/360及安全专项 |
| 已提交HEAD幂等 | `tsx scripts/test-conversion-idempotency.ts`，clean `d895e28` | exit0；75个受控输出baseline及第二次生成一致 |
| 受保护路径 | `git diff --name-only -- data outputs/medical-review docs/medical-review/hematuria_case_clinical_review.xlsx` | 无输出；医学数据、裁决表和工作簿内容零修改 |

本地运行时为Node 24.14，仅作为辅助证据；新提交必须由Draft PR Node 22 CI确认。提交：`e94721e security: bound workbook archive expansion`、`d895e28 ci: enforce complete security evidence`。

### `04c2a0b`远程门禁

- 普通push结果：`52c2432..04c2a0b`快进到`origin/codex/hematuria-production-goal`；随后本地/远程HEAD一致，工作树干净。
- GitHub Actions run `29294906265` / build job `86966184595`：completed/success。Node 22链路中的Full dependency audit、Conversion idempotency、生成基线、Schema/矛盾/双语、完整行为、医学工作簿/队列/导入、360对抗评分、TypeScript、ESLint、完整历史repository scanner、Playwright E2E、52页静态构建、bundle扫描和最终tracked-worktree clean gate全部success。
- `deploy` check为completed/skipped，符合PR分支不上传/部署GitHub Pages的策略；没有部署Production。
- GitHub commit checks：`build=success`、`Vercel Preview Comments=success`、`deploy=skipped`；combined status中`Vercel=success`。PR #1仍Open/Draft，HEAD `04c2a0b`。
- 该远程结果关闭工作簿ZIP展开和CI/scanner证据真实性工程项，但不替代真实Preview AI、日志签名、持久限流、首Token/P95或医学专家验收。

## HEM-P1-034 双语切换能力绑定

| 检查 | 精确命令/环境 | 退出码与结果 |
|---|---|---|
| 有效失败基线 | Playwright desktop定向`-g "HEM-P1-034"`，等待中文session 200后切换英文 | exit1；中文tuple全匹配，英文header存在但attempt/language均不匹配，HTTP 401 |
| 修复后定向浏览器 | 同测试，desktop+mobile | exit0；2/2，含双向切换、刷新恢复、在途英文session快速反向切换、每attempt单次init |
| 受影响浏览器回归 | `playwright test -c <local-port-config>` | exit0；40/40，45.1秒；本地Next使用3011以避开既有3000监听，临时config未提交 |
| TypeScript、ESLint | `tsc --noEmit`、`scripts/run-lint.mjs` | 均exit0 |
| session/attempt安全 | `test-agent-api-security.ts`、`test-attempt-isolation.ts`、`test-training-security.ts`、`test-training-api.ts`、`test-api-recovery.ts` | 均exit0；401/403/409和非重试合同未放宽 |
| 敏感信息与医学路径 | repository scanner；`git diff --name-only -- data outputs/medical-review ...` | scanner exit0（295文件+历史/有界归档）；医学路径无输出 |

远程：`d8c30be`的Actions run `29296603010` / build job `86971396465` completed/success；完整行为、TypeScript、ESLint、repository scanner、Playwright、52页构建、bundle和最终clean gate全部success。Vercel Deployment与Preview Comments success，Pages deploy skipped，PR继续Draft。

## HEM-P1-029 英文会话开场语言

| 检查 | 精确命令/环境 | 退出码与结果 |
|---|---|---|
| 失败基线 | bundled Node + `tsx scripts/test-dynamic-patient-session.ts`，新增42例`language=en`循环 | exit1；首例P001返回中文开场，CJK断言准确命中 |
| 修复后42例 | 同命令 | exit0；42/42英文开场非空、无CJK、包含自然英文问候；既有中文简化主诉/非泄露断言继续通过 |
| 主诉与语言回归 | `test-chief-complaint.ts`、`test-language-purity.ts`、`test-bilingual-patient.ts` | exit0；后者42例×6英文fixture通过 |
| API与安全回归 | `test-training-api.ts`、`test-api-recovery.ts`、`test-agent-api-security.ts` | exit0；能力、签名、CORS、限流、重试和非泄露边界未放宽 |
| TypeScript | bundled Node执行`tsc --noEmit`，沙箱外只读现有pnpm junction | exit0 |
| 本地ESLint限制 | bundled Node 24执行相关ESLint | 未进入源码检查；Next 15 rushstack patch不支持当前Node 24调用形态。项目要求Node 22，权威CI Lint success |
| 敏感信息与医学路径 | `scan-repository-secrets.mjs`、`test-secret-scanner.mjs`及受保护路径diff | exit0；295文件+历史/有界归档，无值输出；`data/**`、审核表及医学输出零diff |

远程：`24054cfe836cd977ee82a20ad544b701ae46e335`的Actions run `29297252637` / build job `86973354237`从`2026-07-14T00:56:00Z`至`01:00:13Z` completed/success；Node 22上的完整行为、TypeScript、ESLint、repository scanner、Playwright、52页构建、bundle扫描和clean gate均success。Vercel Deployment与Preview Comments success，Pages deploy skipped，PR #1保持Draft。

## HEM-P1-033 deterministic教师元语言与覆盖原子性

| 检查 | 精确命令/环境 | 退出码与结果 |
|---|---|---|
| API/规则失败基线 | Node直接调用P004`有血块吗`、P005/P006`血尿是全程的吗` | 三例均返回HTTP层可见canonical教师元语言；filter `ok=false`，仍携带对应matched slot |
| 浏览器失败基线 | Playwright desktop `--grep HEM-P1-033`，受控unsafe API envelope | exit1；可见泛化回答，但持久状态为`askedSlots=["clots"]`、`colorClots=true` |
| 服务端修复专项 | `tsx scripts/test-dynamic-patient-session.ts` | exit0；三例公开回复均通过filter、无教师元语言、matched facts/slots为空 |
| 浏览器修复专项 | 同一Playwright测试，desktop+mobile | exit0，2/2；对话无元语言且隐藏fact不进入asked/collected |
| 完整浏览器回归 | `playwright test practice.spec.mjs` | exit0，42/42，45.6秒；含会话切换、重连、日志同步、双击、20轮、刷新、axe与评分防伪 |
| Patient/Agent/安全 | `test-patient-agent.ts`、`test-agent-chat.ts`、`test-llm-adapter.ts`、`test-bilingual-conflict-quarantine.ts`、`test-agent-api-security.ts`、`test-ai-recovery.ts` | 均exit0；18冲突仍隔离，安全fallback不误标断连 |
| 类型、构建与扫描 | `tsc --noEmit`；Vercel等价`next build`；`scan-static-bundle.ts`；repository scanner | 均exit0；52/52页面、25 JS、295文件+历史/有界归档 |
| 受保护路径 | `git diff --name-only -- data outputs/medical-review docs/medical-review/...` | 无输出；没有医学数据、审批或评分改动 |

本地原子提交：`36061ad`。GitHub API读取远程仍为已知`0b066dc`，但正式fetch/push因`github.com:443`连接重置/超时尚未完成；因此本节没有远程Node22、Vercel或PR新HEAD通过结论。

## HEM-P1-027 移动开场/composer几何复核

| 检查 | 精确命令/环境 | 退出码与结果 |
|---|---|---|
| 当前失败基线 | 静态`out`+Playwright，360×800/中文，QA同一bounding-box断言 | exit1；expected opening bottom `661`，received composer y `654`，遮挡7px |
| 双语扩展 | 360×800、390×844、1280×720、1440×900，各中文/英文 | 初始矩阵在360中文即失败；间距实验后360英文`809/662`失败；宽度阈值实验后390英文`757/706`失败 |
| normal-flow实验 | 移动端取消page-level sticky，桌面保持sticky | 几何8/8通过；但既有`mobile interview keeps multiline input visible`两项目均失败，输入底边`879–888 > 844` |
| 聚焦滚动实验 | 移动textarea focus时scrollIntoView | 既有输入可见性仍2/2失败；未删除或放宽断言 |
| 构建 | 每次候选均用Vercel等价`next build` | 52/52通过，说明失败是运行时几何而非编译问题 |
| 最终清理 | 逐行撤回本轮027候选；`git diff --quiet`、`git diff --cached --quiet` | 均exit0；无027代码/测试残留 |

P008在带`VERCEL=1`的同进程Playwright中两次缺少`results`，根因是本地无Upstash时serverless路径按设计fail-closed；此前不继承该构建环境的完整practice 42/42中同一P008合同通过。该现象不作为027修复失败，也不写成评分算法回归。

## HEM-P1-035 Preview可见病例ID路由（2026-07-14）

| 检查 | 精确命令/环境 | 退出码与结果 |
|---|---|---|
| 前置远程门禁 | `gh run view 29299085374 --json ...`、`gh pr checks 1` | run completed/success；build success、Vercel success、Preview Comments success、Pages deploy skipped；head=`536996601cff7f9db034bcba37b013acae4c25bc`、PR Draft |
| 部署归属 | 已登录Vercel Deployment Overview | Ready deployment=`Cam5bt2qVLcLwPYC36HuzKWwtPXY`；source=`5369966`；branch alias与不可变部署域名均记录，未读取Cookie或token |
| 匿名保护差异 | 系统Chrome Playwright直达分支别名P001 | HTTP 200后最终URL为Vercel登录页；属于Standard Vercel Authentication，不是病例页200或404 |
| 已登录P001 | 应用内浏览器直达分支别名`/cases/P001/` | 应用标题、P001工作区和输入框可见；进入degraded；console仅记录脱敏`api_request_failed`，未取得失败HTTP码 |
| 资源清单基线 | Vercel Deployment Resources按`/cases/P0`及`/cases/HX-ADD-*`前缀筛选 | 实际42个runtime HTML全部存在；`/cases/P013`筛选为空，证明旧部署未生成display ID别名 |
| 失败测试 | `node node_modules/@playwright/test/cli.js test --grep "visible display case IDs" --project desktop-chromium` | exit1；P013卡片期望`/cases/P013/index.html`，实际`/cases/HX-ADD-001/index.html` |
| 修复专项 | 同一grep，desktop+mobile | exit0，2/2；卡片、P013直达和固定随机抽取均使用display ID |
| 完整浏览器回归 | `node node_modules/@playwright/test/cli.js test`，显式本地Next服务 | exit0，44/44，49.6秒；含语言切换、033安全覆盖、重连、日志幂等、双击、20轮、刷新、axe与评分防伪 |
| TypeScript / ESLint | `tsc --noEmit`；`node scripts/run-lint.mjs`，可访问pnpm junction | 均exit0 |
| Vercel等价build | `VERCEL=1`且未设置`NEXT_PUBLIC_API_BASE_URL`，`next build` | exit0，82/82；72个病例route ID均有`out/cases/<id>/index.html` |
| 静态/敏感扫描 | `scan-static-bundle.ts`；`scan-repository-secrets.mjs` | exit0；25个JS资产、295个当前/候选文件加可达历史与有界归档；未打印秘密值 |
| 医学与核心安全边界 | `git diff -- data server api`并审查完整diff | `data/**`、Agent/session/signature、419审核、42例`needs_revision`、18冲突和360评分零修改 |

Preview变量只核对名称/作用域：LLM相关变量覆盖Preview；`TRAINING_STATE_SECRET`、`TRAINING_API_ALLOWED_ORIGINS`、`AGENT_API_ALLOWED_ORIGIN`和deployment tier仅Production。该证据不能替代配置后真实AI、日志10/10、20轮、首Token/P95和自然度验收。

代码提交`79d1083`、证据提交`00531d5`已普通push。

远程：Actions run `29301467610` / build job `86985933644` completed/success（4分14秒）；Node 22.14、75项幂等、42例/572/419医学合同、TypeScript、ESLint、295文件scanner、Playwright44/44、静态build82/82、23个JS bundle和最终clean gate均通过；依赖审计为1 moderate、0 high。Vercel Deployment与Preview Comments success，Pages deploy skipped，PR #1仍Open/Draft。

已登录Preview黑盒：部署`CwbEAU3RcmH9PGpZCQuSnt9J7ag3`为Ready、source=`00531d5a1d6be939b280237d43f7c492125a448f`、不可变域名`hematuria-training-system-dbym9q3f0-niubi1vs-projects.vercel.app`。分支别名`/cases/P013/`初次直达及reload后，精确P013元素count均为1，主标题与textarea存在，`meta[name=next-error-h1]`为空。浏览器通道的Statsig外部遥测超时未计入应用性能。

## HEM-P1-036 Patient Agent公开请求边界（2026-07-14）

| 检查 | 精确命令/环境 | 退出码与结果 |
|---|---|---|
| 失败基线 | bundled Node直接运行`node_modules/tsx/dist/cli.mjs scripts/test-agent-api-security.ts` | exit1；合法Patient session请求`diagnostic_reasoning/diagnosis`实际200，期望403 |
| 安全专项 | 同一命令，provider fetch计数 | exit0，20.9秒；角色越权、model/systemPrompt/apiKey/baseUrl/unlockedData、2001字符问题、text/plain全部在provider前拒绝且`providerCalls=0` |
| 合法路径回归 | 依次运行`test-agent-chat.ts`、`test-patient-agent.ts`、`test-dynamic-patient-session.ts`、`test-llm-adapter.ts`、`test-bilingual-conflict-quarantine.ts` | 5项均exit0；18条冲突继续隔离，无医学真值或审批变更 |
| TypeScript | bundled Node `tsc --noEmit`，允许只读项目xlsx junction | exit0，1.9秒；首次受限sandbox误报模块不可见，不是源码失败 |
| ESLint | bundled Node `scripts/run-lint.mjs` | exit0，4.5秒 |
| 敏感信息 | bundled Node `scripts/scan-repository-secrets.mjs` | exit0，2.3秒；295个当前/候选文件及可达文本历史和有界归档元数据，无秘密值输出 |

远程普通push仍受GitHub smart-HTTP connection reset阻塞；本节不宣称Node22 CI或Vercel新部署通过。

## HEM-P1-039 session并发租约（2026-07-14）

| 检查 | 精确命令/环境 | 退出码与结果 |
|---|---|---|
| 失败基线 | bundled Node运行`test-agent-api-security.ts`，同session不同幂等键并发probe | exit1，0.8秒；第二项实际200，`providerCalls=2` |
| 修复专项 | 同一命令 | exit0，20.7秒；第二项429、`Retry-After=1`、计数1，首项完成后第三项200、计数2；相同键single-flight仍为1 |
| 受影响回归 | `test-agent-api-security.ts`、`test-agent-chat.ts`、`test-patient-agent.ts`、`test-dynamic-patient-session.ts`、`test-ai-recovery.ts` | exit0，21.9秒；合法会话、恢复与安全fallback合同未变 |
| TypeScript / ESLint | bundled Node `tsc --noEmit`；`scripts/run-lint.mjs` | 均exit0，分别3.0秒、3.7秒 |
| 敏感信息 | `scripts/scan-repository-secrets.mjs` | exit0，1.6秒；296文件及可达历史/有界归档元数据，无秘密值输出 |

生产Upstash租约代码已静态审查，但远程Node22/Preview部署仍待普通push后CI；没有把本地内存测试写成真实跨实例验收。

## HEM-P1-037 多维预算与成本预留（2026-07-14）

| 检查 | 精确命令/环境 | 退出码与结果 |
|---|---|---|
| 失败基线 | `test-agent-api-security.ts`，session上限2，三个不同IP/幂等键顺序probe | exit1，0.9秒；第三项实际200并进入provider |
| 八类预算 | 同一专项，分别重置内存store并收紧session、attempt、字符、IP小时、IP日、项目请求、项目token、probe | exit0，20.9秒；各超限429，`Retry-After>=1`，provider计数不增加 |
| 持久命令合同 | 同一专项模拟Upstash REST，不访问真实服务/密钥 | exit0；owner为claim→9键admission→complete→release；quota为claim→admission→abandon，provider callback 0；命令不含原始session/IP |
| 受影响回归 | Agent安全/Agent Chat/Patient/动态session/API recovery/AI recovery六项 | exit0，23.2秒 |

以上证明本地逻辑与持久命令形状，不证明Preview已配置Upstash或真实跨实例窗口成功。该外部验收继续归HEM-P1-020。

## HEM-P1-038 TTS冷并发与输入资源（2026-07-14）

| 检查 | 精确命令/环境 | 退出码与结果 |
|---|---|---|
| 失败基线 | bundled Node运行`test-tts-api.ts`，同tuple冷并发并加入20 ms provider延迟 | exit1，0.8秒；期望新增1次provider，实际新增2次 |
| 修复专项 | 同一TTS API合同 | exit0，0.7秒；冷并发两项200但provider只增1，20 KiB body 413，畸形JSON 400，text/plain 415 |
| 拒绝provider门禁 | 同一专项启用Azure stub并计数 | method/未知Origin/空text/非法voice/未知字段/429均在provider前拒绝 |
| 语音回归 | `test-tts-api.ts`、`test-tts.ts` | 2项exit0，1.0秒；四voice、tuple隔离、TTL、容量、浏览器voice选择均通过 |

本证据只覆盖同实例single-flight；session capability、真实Azure、跨实例单飞和持久配额仍待HEM-P1-041/Preview配置。

## HEM-P1-041 TTS Patient session能力（2026-07-14）

| 检查 | 精确命令/环境 | 退出码与结果 |
|---|---|---|
| 失败基线 | Azure stub启用，TTS请求省略session tuple | exit1，0.7秒；旧实现实际200并调用provider，期望401 |
| 能力专项 | `test-tts-api.ts` | exit0，0.7秒；missing/forged/expired/case/language/mode拒绝401，voice-language拒绝400，provider计数不增加 |
| cache隔离 | 同一专项，两个不同签名session请求相同text/voice/参数 | 两项均MISS且分别调用stub，原始session不进入cache tuple |
| TTS回归 | `test-tts-api.ts`、`test-tts.ts` | 2项exit0，1.0秒 |
| TypeScript / ESLint / scanner | `tsc --noEmit`；`run-lint.mjs`；`scan-repository-secrets.mjs` | 均exit0，1.9/3.8/1.6秒；296文件，无秘密值输出 |
| 浏览器降级 | 显式本地Next，Playwright grep `cloud TTS failure`，desktop+mobile | exit0，2/2，4.6秒；仍显示浏览器语音降级且语音profile正确；测试后服务已停止 |

真实Azure、跨实例TTS预算和Preview配置未验证，不登记为通过。

## HEM-P1-042 持久TTS预算与跨实例tuple租约（2026-07-14）

| 检查 | 精确命令/环境 | 退出码与结果 |
|---|---|---|
| 失败基线 | bundled Node运行`test-tts-api.ts`，`TTS_SESSION_DAILY_REQUEST_LIMIT=1`，同session换IP/文本 | exit1，约0.7秒；第二项旧实现实际200并产生第二次provider调用 |
| 五类预算与fail-closed | `node_modules/.bin/tsx.cmd scripts/test-tts-api.ts` | exit0，0.8秒；session日、IP小时、IP日、项目日请求、项目日字符均超限拒绝且provider不增加；Vercel无持久store为503 |
| 持久命令合同 | 同一专项模拟Upstash REST，不访问真实服务/密钥 | exit0；6键原子准入，owner释放，quota为429、in-progress为425，后两者provider调用0；命令无原始session/IP |
| TTS回归 | `test-tts-api.ts`；`test-tts.ts` | 2项exit0，1.1秒；四voice、session/cache隔离、TTL、冷并发和100项淘汰继续通过 |
| TypeScript | `tsc --noEmit`，沙箱外只读依赖junction | exit0，1.7秒；沙箱内首次因无法读取已安装`xlsx`产生环境性TS2307，不是源码错误 |
| ESLint / API recovery / scanner | `node scripts/run-lint.mjs`；`tsx scripts/test-api-recovery.ts`；`node scripts/scan-repository-secrets.mjs` | 三项exit0；scanner覆盖297个tracked/candidate文件且不输出秘密值 |

本证据验证本地逻辑和模拟持久命令形状，不代表Preview已经配置Upstash、真实跨实例租约或Azure语音通过；这些外部项保持BLOCKED。

## HEM-P1-040 provider连续失败熔断（2026-07-14）

| 检查 | 精确命令/环境 | 退出码与结果 |
|---|---|---|
| 失败基线 | bundled Node运行`test-llm-streaming.ts`，4个顺序503、`maxRetries=0`、阈值2 | exit1，0.9秒；旧实现providerCalls实际4，期望2 |
| 熔断专项 | `node_modules/.bin/tsx.cmd scripts/test-llm-streaming.ts` | exit0，1.2秒；前2次503打开熔断，后2次零provider；冷却后并发2项仅1项探测并成功闭合 |
| 重试边界 | 同一专项，首次fetch TypeError、第二次成功，`maxRetries=1` | exit0；恰好2次provider调用并恢复，未无限重试 |
| 错误分类红队 | 同一专项：连续400后正常请求；500后恢复；连续200非法JSON | 初始安全复核失败合同证明400可错误开熔断；修复后400不计数、500恰好重试1次、非法JSON阈值2后第三项providerCalls=0 |
| 持久命令与fail-closed | 同一专项模拟Upstash REST并直接验证store | exit0；2键准入、失败计数、open拒绝；命令无provider/base URL/model明文；Vercel缺store拒绝 |
| 受影响回归 | `test-llm-streaming`、Agent security/chat、Patient、dynamic session、API/AI recovery、performance timing、LLM adapter | 红队修正后9/9 exit0，2026-07-14 12:18:08—12:18:33 CST，25.1秒 |
| TypeScript / production build | 沙箱外只读依赖junction执行`tsc --noEmit`；`NEXT_PUBLIC_API_BASE_URL=https://hematuria-training-system.vercel.app pnpm run build` | 两项exit0；82/82静态页，build 21秒；本地Node24有engine warning，远程Node22待CI |
| ESLint / bundle / scanner | `node scripts/run-lint.mjs`；`tsx scripts/scan-static-bundle.ts`；`node scripts/scan-repository-secrets.mjs` | 红队修正后三项exit0，2026-07-14 12:19:21—12:19:27 CST；25 JS、298 tracked/candidate文件，无秘密值输出 |

官方模型核验来源为DeepSeek [`Create Chat Completion`](https://api-docs.deepseek.com/api/create-chat-completion)文档；当前`deepseek-v4-flash`仍在允许值中。没有真实Preview调用、模型切换或P50/P95样本，本地fixture不能登记为真实AI通过。

### HEM-P1-040 push后远程门禁（2026-07-14）

| 检查 | 远程证据 | 结果 |
|---|---|---|
| Git安全核验 | `git fetch --prune origin`；`origin/codex/hematuria-production-goal...HEAD` | fetch exit0；远程`00531d5`，本地`87cb4f5`，落后0/领先8；工作树干净 |
| 普通push | `git push origin codex/hematuria-production-goal` | exit0；`00531d5..87cb4f5`，未force、未写main |
| GitHub Actions | run `29305846597`，job `86998878165` | completed/success，4分06秒；依赖审计、75输出幂等、Schema/医学/双语合同、行为、评分、TypeScript、ESLint、scanner、Playwright、82页build、bundle和clean gate均通过 |
| Vercel Preview | deployment `51WtprQAFvjLBqhAXV2kJFduV9mB`；Preview Comments | 两项success；只证明Preview构建部署成功 |
| Pages发布 | run `29305846597`的`deploy` job | skipped，符合PR不得正式部署规则 |
| PR治理 | PR #1 head `87cb4f5` | Open/Draft；未Ready、未合并 |

远程门禁没有读取或修改环境变量值，也没有执行真实DeepSeek/Azure调用。持久store、签名/origin、跨实例429/425/熔断、日志10/10、真实双语AI 10/10、20轮与P50/P95继续登记为外部配置后待验证。

## HEM-P1-027 移动composer结构修复（2026-07-14）

| 检查 | 精确场景/命令 | 退出码与结果 |
|---|---|---|
| 失败基线 | Playwright mobile，360×800，P001中文，比较开场与composer边界 | exit1，8.8秒；expected composer y≥661，received 654，真实遮挡7px |
| 双语根因扩展 | 360×800英文及动态reserve实验 | 旧page-level sticky在聊天容器顶部仍低于composer时覆盖；仅padding/空spacer不能修正容器整体下移，证明需移动normal-flow |
| 四视口双语矩阵 | `playwright test --grep "composer reserves"`，desktop/mobile；360×800、390×844、1280×720、1440×900；zh/en | exit0，2/2，17.6秒；开场不覆盖、聚焦后输入在视口、safe-area合同、无横向溢出；640px视觉视口收缩通过 |
| 既有移动输入门禁 | `playwright test --grep "mobile interview keeps multiline"` | exit0，2/2，10.9秒；Enter/Shift+Enter两行输入底边≤844，无横向溢出 |
| 20轮与滚动合同 | `playwright test --grep "twenty interview turns"` | exit0，2/2，12.6秒；session不重建，手动上翻保持，新消息入口出现，回到底部后末条回答不被composer覆盖且无异常尾部 |
| 完整浏览器门禁 | `playwright test --reporter=line` | exit0，46/46，69.3秒；desktop/mobile、axe、会话/重连/fallback/日志/双击/刷新/TTS/临床数据/评分全部通过 |
| TypeScript / ESLint | `pnpm run typecheck`；`pnpm run lint` | exit0，2.6秒 / 4.2秒；本地bundled Node24有仓库Node22 engine warning，待CI补证 |
| production build / bundle / scanner | `NEXT_PUBLIC_API_BASE_URL=https://hematuria-training-system.vercel.app pnpm run build`；`scan-static-bundle.ts`；`scan-repository-secrets.mjs` | exit0，82/82静态页；25 JS；298 tracked/candidate文件，无秘密值输出 |

Playwright的640px高度变化是`visualViewport`合同仿真，不冒充真实手机软键盘系统级测试；独立QA仍应在真实360/390设备复测键盘升降、safe-area和手动滚动。

### HEM-P1-027 首轮CI失败与测试合同修正

| 检查 | 证据 | 结果 |
|---|---|---|
| 首轮远程CI | Actions run `29309491866`，Node22，46项Playwright | 45/46；移动20轮在`scrollTop===0`断言收到40px，其他门禁及Vercel两项通过；build后续步骤因Playwright失败按设计跳过 |
| 根因 | 同一日志显示失败发生在发送第20问之前；距底部阈值未失败 | QA测试把“上翻”错误等同于精确顶部，不是产品强制回底证据 |
| 合同修正 | 上翻后及第20条到达后均要求`scrollHeight-scrollTop-clientHeight > 72`；继续要求新消息按钮、点击后到达精确底部、末条不覆盖 | 没有删除场景、延长单项等待或放宽用户语义 |
| CI等价稳定性 | `playwright test --grep "twenty interview turns" --repeat-each=3 --workers=2` | exit0，6/6，23.2秒；desktop/mobile各3次 |
| 超额并发说明 | 同测试误用6 workers | 4/6；两项在页面DOM前因Next dev `Unexpected end of JSON input`失败，不登记为产品通过，按workflow真实2 workers复核 |

### HEM-P1-027 最终远程补证

| 检查 | 结果 |
|---|---|
| 提交与PR | HEAD `4fed0764e9894b34da1d3f7620df00468ff4f9bb`已普通push；PR #1保持Draft |
| GitHub Actions | run `29309939497` / build job `87011370852`，2026-07-14 13:57:56—14:02:20 CST，completed/success，4分24秒 |
| Node22工程门禁 | frozen依赖、完整依赖审计、幂等生成、schema/医学合同、完整行为、TypeScript、ESLint、repository secret scan、Playwright E2E、82页静态构建、bundle scan、最终clean gate全部success |
| Vercel Preview | deployment `DTHT4KnLh6Eyz8NnkecexSqLFeE3` success；Preview Comments success |
| 正式发布 | Pages artifact/deploy按PR规则skipped；未部署Production，PR未转Ready或合并 |

远程自动化关闭HEM-P1-027的工程门禁；真实360/390设备的系统软键盘和safe-area仍需长期QA独立复测，不写成真机通过。

## HEM-P1-043 第一阶段提交专项（2026-07-14，本地候选）

| 检查 | 精确场景/命令 | 退出码与结果 |
|---|---|---|
| 浏览器失败基线 | `playwright test tests/e2e/practice.spec.mjs --grep "P001 stage one|rapid stage|missing Preview"`，desktop/mobile，真实`api/training-action.js` handler | 6项中合法中英/切换/刷新2项完成；快速双击desktop/mobile各收到2请求（期望1），配置错误desktop/mobile仍显示通用提示；runner最终因本地Node24未退出被300秒上限终止，exit124 |
| 浏览器修复候选 | 同一6项，desktop/mobile | 6项断言全部完成：P001中英合法提交、双向切换、进入第二阶段、刷新保持、双击仅1请求、503明确提示；runner仍在结果后未退出，300秒exit124，故不登记为完整Playwright通过，待Node22 CI |
| 浏览器最终本地专项 | 隐藏启动受控本地server，复用已安装Chrome；同一grep、`--workers=1 --reporter=line`，desktop/mobile | exit0，6/6，13.7秒；server在`finally`关闭。另一次`CI=1`尝试因本机缺Playwright专用Chromium在launch前6项失败，不属于断言失败 |
| 完整Playwright尝试 | 同样受控server与本地Chrome，`playwright test --workers=2 --reporter=line`，desktop/mobile | 242.6秒exit124；Node24 runner超时后写入管道EPIPE，未返回可审计通过/失败总计，不能登记为完整门禁通过；检查确认无3000端口残留进程，待Node22 CI |
| API恢复 | `pnpm run test:api-recovery` | exit0；`training_attempt_store_unavailable`分类`not-configured`且fetch调用1次 |
| 训练API | `pnpm run test:training-api` | exit0；新增P001中文与英文各七阶段，`currentStage=8`，最终评分上限仍360 |
| 训练安全 | `pnpm run test:training-security` | exit0；过期token为401 `expired_attempt_token`，跨病例为401 `attempt_case_mismatch`；stage与签名约束未放宽 |
| 会话/阶段专项 | `pnpm run test:stage-flow`；`pnpm run test:attempts`；`pnpm run test:session` | 首次因PowerShell PATH缺Node均exit1且未执行测试；加入工作区Node路径后同一三项exit0 |
| 完整行为门禁 | `pnpm run test` | 沙箱内首次运行到产品审计因pnpm `xlsx`链接不可见exit1；不改依赖，在依赖可见环境同一命令exit0，32.9秒；42例、572事实、419待审核、360分、阶段授权和医学隔离全部通过 |
| TypeScript / ESLint | `pnpm run typecheck`；`pnpm run lint` | exit0 / exit0；本地bundled Node24有仓库Node22 engine warning |
| production build | `NEXT_PUBLIC_API_BASE_URL=https://hematuria-training-system.vercel.app pnpm run build` | exit0，18秒，82/82静态页 |
| bundle / secret | `pnpm run test:bundle`；`pnpm run test:secrets` | exit0；25个JavaScript资产；298个tracked/candidate文件及可达文本历史，无秘密值输出 |

Preview本轮未取得登录态请求证据：in-app Browser与Chrome控制客户端均在初始化失败，匿名分支请求超时；不得填造病例session、HTTP状态或console。既有环境名称/作用域审计与`server/trainingAttemptStore.js`只支持“缺Preview共享store时会503 fail-closed”的证据链，当前Preview实际失败请求仍需登录态人工复测确认。提交后曾成功fetch并确认远程`ff1a932`、落后0/领先3；普通push连接重置且远程未更新，随后`github.com:443`持续不可达而`api.github.com:443`可达。PR API只读确认仍Open/Draft；没有用API改ref或未经主机验证的SSH绕过。

### HEM-P1-043 push后远程补证

| 检查 | 结果 |
|---|---|
| 提交与push | `ff1a932..cade64e`普通push至`codex/hematuria-production-goal`；push前fetch为0落后/5领先，未force |
| GitHub Actions | run `29318216424`，job `87037030905`，2026-07-14 16:29:45—16:34:23 CST，completed/success，4分38秒 |
| Node22门禁 | frozen依赖、full dependency audit、75输出幂等、generated clean、schema、医学矛盾/双语/工作簿/审核队列、完整行为、360评分、TypeScript、ESLint、repository scanner、最终clean gate全部success |
| Playwright | 52/52 desktop/mobile，2.2分钟；含新增P001中英提交、双向切换、刷新保持、快速双击单请求与配置错误提示 |
| build / bundle / scanner | 82/82静态页；23 JavaScript资产；298 tracked/candidate文件及可达文本历史，全部success |
| Vercel | deployment `CNzPNsqzCi21UkqF65bpu88My89S` success；Preview Comments success |
| Pages / PR | Pages deploy skipped；PR #1 Open/Draft/CLEAN，head `cade64e` |

远程工程门禁关闭HEM-P1-043的代码回归风险，不替代登录态Preview runtime验证。当前仍没有该Preview第一阶段真实失败/成功POST的HTTP状态、error code或脱敏session关联ID；需要配置权限方核对Preview变量并重新部署后由长期QA补证。

## QA 490fdd8、第一阶段复核、HEM-P2-043/028（2026-07-14）

| 检查 | 环境/命令 | 结果 |
|---|---|---|
| QA来源核对 | `git fetch --prune`；核对QA HEAD、merge-base并读取四份报告/索引 | PASS；QA=`490fdd842b277bada645047a65a3bc448ee014f4`，merge-base=`ff1a932785d891749ae8e73130bde8857062e194`；未merge |
| HEM-P2-043失败合同 | 修改断言后在修复前运行目录route Playwright | FAIL（预期基线）；desktop/mobile 2/2均收到42个`/index.html` href，而合同要求目录URL |
| 公共路由单测 | `pnpm run test:public-routes` | PASS；42例、root/Vercel、Pages basePath、query和非法ID/basePath |
| Next dev受影响专项 | P001 stage one、rapid submit、missing store、catalog route；desktop/mobile | PASS 8/8，35.8秒，exit 0 |
| 第一阶段安全矩阵 | 同上真实`api/training-action.js` handler | PASS；zh/en、双向切换、刷新后第二阶段、双击1/1/1；token只记录presence，不记录值 |
| API/session相关回归 | `test:training-api`、`test:training-security`、`test:session`、`test:attempts`、`test:api-recovery`、`test:public-routes` | PASS，exit 0 |
| 完整行为链 | `pnpm run test` | PASS，32.8秒，exit 0；含42×17中文、42×6英文、572事实、153+419治理、18冲突隔离、42例360评分 |
| TypeScript | `pnpm run typecheck` | PASS，exit 0 |
| ESLint | `pnpm run lint` | PASS，exit 0 |
| root production build | `NEXT_PUBLIC_API_BASE_URL=... pnpm run build` | PASS；82/82，18.1秒，exit 0 |
| root静态目录route | 外部static server + Playwright route matrix | PASS 2/2，3.4秒，exit 0 |
| Pages production build | `NEXT_PUBLIC_BASE_PATH=/hematuria-training-system NEXT_PUBLIC_API_BASE_URL=... pnpm run build` | PASS；82/82，21秒，exit 0 |
| Pages basePath静态route | `BASE_PATH=/hematuria-training-system`外部static server + Playwright | PASS 2/2，3.2秒，exit 0 |
| 完整本地Playwright | `pnpm run test:e2e`，bundled Node24/Next dev | FAIL 49/52，91.1秒，exit 1；同时出现RSC client manifest/webpack module生成异常；受影响场景清缓存后专项8/8。仓库要求Node22，最终完整结论待CI，不伪报通过 |
| bundle隐藏信息 | Pages构建产物`pnpm run test:bundle` | PASS；25 JavaScript assets，exit 0 |
| repository secrets | `pnpm run test:secrets` | PASS；300 tracked/candidate files及可达文本历史/有界归档元数据，exit 0；未打印值 |
| 医学数据零差异 | `git diff -- data` | PASS；空diff |
| Preview应用复测 | 分支别名病例/health GET及安全合成session init POST | BLOCKED_PREVIEW_AUTH；GET为Vercel Login HTML，POST为保护层401，未到应用handler |

说明：本地bundled运行时为Node 24.14，package engine要求`>=22.14 <23`，因此完整Playwright的3项失败保留为运行环境/缓存异常证据，而不是删除或放宽断言；本里程碑不重复昂贵完整门禁，push后以Actions Node22作为权威回归。Preview URL为`https://hematuria-training-system-git-codex-he-a06e54-niubi1vs-projects.vercel.app`，本轮开始时对应`3541a706`；未取得登录态console/network，不能宣称Preview第一阶段通过或失败。

提交/远程状态：代码与测试=`f1d7f62`，首轮证据=`39aad56`。GitHub smart-HTTP在三次fetch、两次普通push中持续连接重置/超时；连接器只读复核远程仍为`3541a706`且PR为Draft，因此本节没有新的Actions/Vercel结果，所有远程门禁均标记待push而非通过。

## 4aa96d5远程门禁与HEM-P1-030（2026-07-14）

| 检查 | 命令/环境 | 结果 |
|---|---|---|
| 前一里程碑发布 | `fetch --prune`、3/0、普通push、再fetch | PASS；远程=`4aa96d5ff20a1f4e637529d6ede46720b428c5ef`，0/0 |
| Draft PR | `gh pr view/checks 1` | PASS；Open/Draft；未Ready/merge |
| Node22 Actions | run `29322763481`, job `87051751710` | PASS，4分35秒；Node 22.14 |
| 完整Playwright | Actions `Playwright E2E` | PASS 52/52，2.2分钟 |
| Vercel | deployment `2baxvbku4oB4XtiWYB4mpNg5obM2`与Preview Comments | PASS；Pages deploy skipped |
| HEM-P1-030失败合同 | `pnpm run test:patient-history-routing`修复前 | FAIL（预期红灯）；`prior-care-zh`实际`[]` |
| 历史路由专项 | 同命令，候选后 | PASS；42例×7自然问法、4安全边界，exit0 |
| 夹带意图红队 | 历史膀胱镜+结果、历史肿瘤+诊断 | PASS；分别report/diagnosis boundary，空slot |
| 安全来源隔离 | P001 malignancy/procedure代表 | PASS；3项继续`unsafe_deterministic_answer`、空slot |
| 受影响回归 | Patient、dynamic session、Agent、Agent API security、18冲突隔离 | PASS，5项exit0 |
| 完整行为 | `pnpm run test` | 首次FAIL于沙箱无权读取已安装xlsx junction；只读权限下重跑PASS，33.2秒，exit0 |
| TypeScript/ESLint | `pnpm run typecheck`、`pnpm run lint` | PASS，exit0 |

本地运行时仍为bundled Node24并有engine warning；正式Node22结论须由本候选push后的新CI给出。当前没有修改`data/**`、医学审批、18条冲突、`needs_revision`或360评分；HEM-P1-031/032仍开放。

## HEM-P1-031 疼痛路由专项（2026-07-14，本地候选）

| 检查 | 结果 |
|---|---|
| 失败合同 | `flank-en`期望`[flank_pain]`，实际`[flank_pain,pain]`，exit1 |
| `pnpm run test:patient-pain-routing` | PASS；42例×6特异/general/compound合同，5病例冲突范围，exit0 |
| 特异冲突病例 | PASS；5病例×4问法均不因通用pain隔离 |
| 真正general pain | PASS；P001仍隔离`pain`，reason保持医学待审核 |
| Patient/session/18冲突 | PASS，3项exit0 |
| TypeScript/ESLint | PASS，exit0 |

本项不使用fallback结果冒充真实AI，也不改变冲突事实。完整行为门禁已在前一HEM-P1-030代码后通过；P1-031推送后由同一Node22 CI完整链覆盖新增测试。

## HEM-P1-032 安全无损投影（2026-07-14，本地候选）

| 检查 | 结果 |
|---|---|
| 失败合同 | P001/glomerular命中slot但返回generic unknown，exit1 |
| `pnpm run test:patient-safe-projection` | PASS；42例×3=126个安全长回复，0 generic unknown，语义逐字保持，exit0 |
| 行长/总长 | PASS；每行≤80，获准原文只换行不截断 |
| 不安全来源 | PASS；P004 clots、P005/P006 phase继续安全阻断、空slot |
| 路由/安全回归 | 历史42×7、疼痛42×6、session、Agent、18冲突均PASS |
| TypeScript/ESLint | PASS，exit0 |
| 三P1完整行为里程碑 | `pnpm run test` PASS，34.3秒，exit0 |

完整行为包含42×17中文结构、42×6英文、572事实/419审核、18冲突、360评分、TTS、Agent/session、安全扫描合同。运行时为Node24并明确保留engine warning；push后必须以Node22 CI作为正式结论。

## 三项Patient路由P1的QA矩阵与发布门禁（2026-07-14 18:23 CST）

| 检查 | 命令/范围 | 结果 |
|---|---|---|
| QA脚本来源 | 只读`origin/codex/hematuria-exploratory-qa:tests/exploratory/patient-session-matrix.mjs` | 未merge QA分支；临时报告未提交 |
| 可信矩阵 | UTF-8 stdin；`LLM_ENABLE_AI_AGENTS=false`、`LLM_ENABLE_AI_PATIENT=false` | PASS，exit0；42例、37槽位、中英双语、每槽2改写 |
| 路由与重复一致性 | `routeChecks=6216`、`repeatChecks=6216` | PASS；`failureInstances=0`、`failureGroups=0` |
| 医学隔离 | 直接冲突期望/观察 | PASS，144/144；`providerCalls=0`，295项不安全确定性来源被阻断 |
| 失真运行鉴别 | 未正确传入Node参数且PowerShell中文管道损坏 | INVALID，不计产品结果；统一`llm_error_fallback`的3192项在UTF-8重跑后归零 |
| 本地提交 | `4c20cbc`、`7f0622f`、`9d7daab`、`b6d09a0`、`fef9151`、`25ef0cb` | PASS；当前HEAD=`25ef0cba76e77c4cffd8e9caac1b4733ab83015b` |
| 认证/API | `gh auth status -h github.com`；远程ref API | PASS；认证有效，远程仍=`4aa96d5ff20a1f4e637529d6ede46720b428c5ef` |
| 强制fetch门禁 | `git fetch --prune origin`两次；一次性HTTP/1.1一次 | BLOCKED，三次exit128，`github.com:443`约21秒连接失败 |
| push/新CI | 必须在成功fetch且远端领先0后执行 | NOT RUN；未push，不复用旧HEAD的Node22/Vercel绿灯 |

工作树在临时矩阵报告删除后干净，`data/**`零差异。没有修改医学事实、419审核、18条冲突、`needs_revision`、生产配置或密钥。

## HEM-P1-043-R2 丢失attempt记录后的第一阶段提交恢复（2026-07-14）

| 检查 | 命令/场景 | 结果 |
|---|---|---|
| 失败基线 | Playwright：有效签名token仍在、服务端attempt store重置后提交P001 history | FAIL（预期）；首个`stage-feedback`为401 `attempt_not_found`，出现“阶段提交失败，请重试。”且无第二阶段入口 |
| 恢复专项 | `playwright test ... --grep "stage one safely recovers"`，desktop/mobile | PASS，2/2，exit0；401后仅一次安全初始化与一次重试，评分保留，进入stage2且刷新保持 |
| 受影响浏览器矩阵 | P001双语切换/刷新、快速双击、丢失attempt、缺Preview store，desktop/mobile | PASS，8/8，exit0，9.1秒 |
| 训练API/安全 | `pnpm run test:training-api`；`test:training-security`；`test:attempts`；`test:api-recovery`；`test:stage-flow`；`test:bilingual-conflict-quarantine` | 全部PASS，exit0；冲突事实通过`askedQuestions`提交仍不计分 |
| 完整行为 | `pnpm run test` | PASS，35.088秒，exit0；包含42例、572事实、153+419治理、18冲突隔离、360评分及受影响API合同 |
| TypeScript / ESLint | `pnpm run typecheck`；`pnpm run lint` | PASS / PASS，exit0；沙箱因`xlsx`junction只读限制的首次typecheck失败不计产品失败，依赖可读环境重跑通过 |
| 生产构建 | `NEXT_PUBLIC_API_BASE_URL=https://api.example.test NEXT_PUBLIC_GIT_SHA=local-stage-submit-fix pnpm run build` | PASS，22.720秒，exit0，82/82页面 |
| Bundle / secret | `pnpm run test:bundle`；`pnpm run test:secrets` | PASS；25个JS资产、303个tracked/candidate文件及可达历史通过 |
| 完整浏览器 | worktree专用Next服务（3010），`playwright test --workers=2 --reporter=line` | PASS，54/54，158.955秒，exit0，desktop/mobile；测试服务及端口已清理 |
| 医学数据边界 | `git diff -- data` | PASS，零差异；未改419审核、18冲突、`needs_revision`或医学审批状态 |

Preview别名受Vercel Standard Authentication拦截，匿名请求未到应用handler；本轮无法取得登录态Preview失败请求，故Preview仍为`BLOCKED_PREVIEW_AUTH`。远端PR head仍为`4aa96d5`，以上均是本地候选证据，不能复用旧Node22/Preview绿灯。

代码与测试已保存为本地提交`610eacf`；本轮按既有暂停边界未普通push。

## HEM-P1-043-R3 初始化竞态证据（2026-07-14）

| 检查 | 场景/命令 | 结果 |
|---|---|---|
| 真实Chromium失败基线 | 打开P001；训练初始化延迟800ms；AI session延迟1800ms | FAIL（预期）：初始化未完成时提交按钮enabled；`stage-feedback=0` |
| 首次初始化失败基线 | 页面打开后立即提交；`init-attempt`延迟300ms并返回HTTP 502 `network_error` | FAIL（预期）：`stage-feedback=0`，旧UI显示通用错误，无初始化恢复入口 |
| 初始化/提交矩阵 | 双语desktop/mobile；延迟初始化、首次失败、AI session失败、0轮、1轮fallback、正常提交、刷新、双击、`attempt_not_found`恢复 | PASS，14/14，单worker 24.9秒；合法提交1 request/1 ID/1 timeline |
| restart缓存 | 只比较sessionStorage key和attemptId，不读取token值 | PASS，desktop/mobile 2/2；旧key删除，新attempt仅初始化1次 |
| 永久配置/单飞 | `training_attempt_store_unavailable`、初始化失败后恢复按钮快速双击 | PASS，desktop/mobile 6/6；自动初始化1次，显式双击恢复只新增1次，无stage请求 |
| API/安全 | `test:training-api`、`test:training-security`、`test:attempts`、`test:api-recovery`、`test:stage-flow` | 全部PASS，exit0 |
| 完整行为/静态门禁 | `pnpm run test`；typecheck；lint；bundle；secrets | PASS；42例、572事实、419审核、18冲突、360评分；25 JS、303文件 |
| 生产构建 | `NEXT_PUBLIC_API_BASE_URL=https://api.example.test ... pnpm run build` | PASS，17.8秒，82/82；首次HTTP基址按安全合同失败，未放宽HTTPS要求 |
| 生产静态Playwright | 64项desktop/mobile，2 workers | 63/64，66.1秒；初始化与阶段流程全部通过；唯一即时几何读取早于既定rAF滚动 |
| 几何同步补证 | 保持输入底部`<=844px`原阈值，等待下一动画帧 | PASS，desktop/mobile 2/2，1.8秒；未放宽像素断言 |
| 医学数据边界 | `git diff -- data` | PASS，零差异 |

in-app Browser连接两次在运行时初始化失败，无法取得登录态Preview console/network；没有用匿名保护页或本地fixture冒充线上证据。临时Playwright trace在提取脱敏状态/耗时后已删除。

代码/测试原子提交：`c069abf`。

### HEM-P1-043-R3 远程CI与Preview门禁（2026-07-15 CST）

| 检查 | 远程证据 | 结果 |
|---|---|---|
| Production Goal远程HEAD | `6b41d334106a988a1cbc85b89792f6271be3b597` | PASS；包含`c069abf` |
| GitHub Actions | run `29348368936`，build job `87137895749` | PASS，5分06秒，head SHA精确匹配`6b41d33` |
| Node / Playwright | Actions日志：Node `v22.14.0`；`Running 64 tests using 2 workers` | PASS，`64 passed (2.4m)` |
| 其余CI步骤 | behavior、typecheck、lint、repository secret scan、82页静态build、bundle scan、clean gate | 全部PASS；Pages artifact/deploy按PR事件规则skipped |
| Vercel | deployment `F9pbrhZo1sEQBsxSrQ4jXhJwHZHC`；Deployment / Preview Comments checks | PASS / PASS |
| PR状态 | Draft PR #1 | Open/Draft；未Ready、未合并 |
| 登录态Preview交互 | P001打开后立即提交并采集应用POST | BLOCKED；in-app Browser运行时初始化失败，未伪造网络证据 |

CI详情：`https://github.com/Niubi1v/hematuria-training-system/actions/runs/29348368936`。Vercel部署记录：`https://vercel.com/niubi1vs-projects/hematuria-training-system/F9pbrhZo1sEQBsxSrQ4jXhJwHZHC`。

## HEM-P1-043-R4 Preview同源训练状态与P003零轮提交（2026-07-15，本地候选）

| 检查 | 精确命令/场景 | 结果 |
|---|---|---|
| P003 handler基线 | 当前真实handler：P003/zh/free，0问答，先`init-attempt`再`stage-feedback(history)` | PASS，HTTP 200 / 200；排除病例和零轮规则 |
| 旧生产API版本证据 | 只读`GET https://hematuria-training-system.vercel.app/api/health/` | HTTP 200；`gitSha=5a3ad11`、API 2.6.0；未读取或输出密钥 |
| Preview配置合同 | `tsx scripts/test-public-api-config.ts` | PASS，exit0；继承生产URL但`NEXT_PUBLIC_VERCEL_ENV=preview`时解析为同源 |
| 相对URL失败合同 | 修复前`tsx scripts/test-api-recovery.ts` | FAIL（预期），`TypeError: Invalid URL`，输入`/api/training-action/`，网络请求0 |
| API恢复合同 | 修复后`tsx scripts/test-api-recovery.ts` | PASS，exit0；相对同源请求恰好1次 |
| token/API隔离 | `tsx scripts/test-attempt-isolation.ts`；`tsx scripts/test-training-api.ts` | PASS / PASS；不同API origin key不同，合法验证200、伪造旧token 401 |
| Vercel等价构建 | `VERCEL=1 VERCEL_ENV=preview NEXT_PUBLIC_API_BASE_URL=https://hematuria-training-system.vercel.app NEXT_PUBLIC_GIT_SHA=local-p003-preview-fix next build` | PASS，21.5秒，82/82；客户端marker为preview，运行时API基址同源 |
| P003真实浏览器 | 外部静态server；`playwright test tests/e2e/practice.spec.mjs --grep "P003 replaces"` | PASS，desktop/mobile 2/2，1.7秒；旧v3 token移除，v4 scoped token产生，0轮提交进入第二阶段，observed request origin与页面一致 |
| 受影响同步/重连 | `--grep "rule fallback keeps\|AI reply renders\|history log transient\|history log exhausted\|twenty interview turns\|page refresh resumes"` | PASS，12/12，12.2秒 |
| 完整浏览器门禁 | `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 PLAYWRIGHT_EXTERNAL_SERVER=1 playwright test tests/e2e/practice.spec.mjs` | PASS，68/68，43.8秒，desktop+mobile |
| 类型/Lint | `tsc --noEmit`；`node scripts/run-lint.mjs` | PASS / PASS，exit0 |
| bundle/敏感信息 | `tsx scripts/scan-static-bundle.ts`；`node scripts/scan-repository-secrets.mjs` | PASS；25个JS资源；303个tracked/candidate文件及可达历史/有限归档元数据 |
| 医学数据边界 | `git diff -- data` | PASS，零差异 |

说明：浏览器控制运行时仍报`Cannot redefine property: process`，本轮没有取得登录态旧Preview的console/network；用户截图、公开旧API health和本地真实handler/bundle/trace共同构成根因证据。新提交尚未push，故没有把旧Actions或Vercel绿灯归属于该候选，也没有伪报线上已修复。

发布门禁补证：代码提交`656816d`、证据提交`8a31711`；`gh auth status -h github.com`显示默认CLI token失效。`git fetch --prune origin`在22.1秒因`Recv failure: Connection was reset`退出1；`git -c http.version=HTTP/1.1 fetch --prune origin`在41.1秒因无法连接`github.com:443`退出1。未执行push，当前无属于这些提交的Node22 CI或Vercel部署结果。

## HEM-P1-043-R4 CI同源合同恢复（2026-07-15，本地）

| 检查 | 精确环境/命令 | 结果 |
|---|---|---|
| Node运行时 | 官方便携Node `v22.14.0`；下载包SHA256与Node官方`SHASUMS256.txt`一致 | PASS |
| 修改前目标矩阵 | Playwright grep 7个失败名称，desktop+mobile | FAIL（预期），14/14；与run `29397429743`一致 |
| 配置红灯 | `node v22.14.0 node_modules/tsx/dist/cli.mjs scripts/test-public-api-config.ts` | FAIL（预期）；开发缺省实际为`http://127.0.0.1:3001`而非相对路径 |
| 配置/API恢复/attempt | `test-public-api-config.ts`；`test-api-recovery.ts`；`test-attempt-isolation.ts` | PASS / PASS / PASS |
| 修改后目标矩阵 | 同一7用例grep，desktop+mobile | PASS，14/14，20.2秒 |
| 完整浏览器 | Node 22，外部Node 22 Next dev，`playwright test` | PASS，68/68，77.2秒；desktop+mobile |
| 类型/Lint | `pnpm run typecheck`；`pnpm run lint`（Node 22） | PASS / PASS |
| 完整行为/安全/治理 | `pnpm run test`（Node 22） | PASS，37.6秒；42病例、572事实、419待审核、18冲突隔离、session/attempt/signature/scoring均通过 |
| Vercel同源构建 | `VERCEL=1 VERCEL_ENV=preview next build` | PASS，82/82；18秒 |
| GitHub Pages构建 | `NEXT_PUBLIC_BASE_PATH=/hematuria-training-system NEXT_PUBLIC_API_BASE_URL=https://hematuria-training-system.vercel.app next build` | PASS，82/82；18.9秒 |
| bundle扫描 | 两种构建后分别运行`scan-static-bundle.ts` | PASS / PASS；各25个JS；无隐藏答案、密钥或`:3001`测试端口 |
| repository secret scan | `pnpm run test:secrets` | PASS；303个候选文件、可达文本历史和有限归档元数据 |
| 数据边界 | `git diff --exit-code -- data` | PASS，零差异 |

修复提交：`d1c20de0ad3b96ca992c8be679df23cbf9facb28`。当前表仅记录本地候选，不复用旧HEAD的远程绿灯。

### 精确HEAD远程门禁

| 检查 | 远程证据 | 结果 |
|---|---|---|
| 候选HEAD | `bd3bff5e2400a51d9b4f16f78eefb6895a781c1b` | PASS；包含`d1c20de`与本地证据提交 |
| GitHub Actions | run `29405290154`，build job `87319150250` | PASS，completed/success |
| Node / Playwright | job日志：`v22.14.0`；`Running 68 tests using 2 workers`；`68 passed (2.8m)` | PASS |
| 工程门禁 | behavior、医学合同、typecheck、lint、repository secret、82/82 build、23 JS bundle、clean gate | 全部PASS |
| Pages | artifact与deploy | SKIPPED，符合Draft PR规则 |
| Vercel | deployment `HdHGBhcwFXybfHe6weLVswR6vqew`；Preview Comments | PASS / PASS；绑定精确HEAD |
| PR状态 | PR #1，base `main` | Open / Draft / not merged |
| Preview应用层 | 匿名根路径与`/cases/P003/` | BLOCKED_PREVIEW_AUTH；最终为`vercel.com/login`，未执行应用POST |

Actions：`https://github.com/Niubi1v/hematuria-training-system/actions/runs/29405290154`。Vercel：`https://vercel.com/niubi1vs-projects/hematuria-training-system/HdHGBhcwFXybfHe6weLVswR6vqew`。

## Preview Automation Bypass黑盒门禁（2026-07-15，远程已确认）

| 检查 | 精确命令/场景 | 结果 |
|---|---|---|
| 缺凭据合同 | 临时移除当前子进程的`VERCEL_AUTOMATION_BYPASS_SECRET`后运行`node scripts/run-preview-blackbox.mjs` | 预期阻塞；仅输出`BLOCKED_PREVIEW_AUTH`，未启动浏览器、未显示值 |
| 配置与origin隔离 | Node 22.14.0运行`node scripts/test-preview-blackbox-config.mjs` | PASS；只对当前Preview origin生成`x-vercel-protection-bypass`，localhost、GitHub Pages、Production均为false；secret不进入URL |
| 测试发现 | Node 22运行Playwright Preview config `--list` | PASS；5项：主页/health、P003零轮、P001中文一轮+刷新+双击、P001英文一轮、双向语言切换 |
| 真实保护层请求 | `node scripts/run-preview-blackbox.mjs`，目标分支Preview | BLOCKED；目标origin注入计数1、跨origin计数0，302到`vercel.com/sso-api`并最终为`vercel.com/login`；应用API响应0 |
| 后续流程 | P003/P001/双语/刷新/双击/第二阶段/live_ai/history-log | NOT RUN；串行主页门禁失败后4项未运行，未伪造应用层通过 |
| 生成物安全 | Preview运行器对`test-results/preview-blackbox`按实际环境值做字节扫描 | PASS；未命中；trace/screenshot/video关闭，未记录Cookie、Authorization或认证响应头 |
| TypeScript | 便携Node 22.14.0直接执行`node_modules/typescript/bin/tsc --noEmit` | PASS |
| ESLint | Node 22.14.0执行`node scripts/run-lint.mjs` | PASS |
| 精确HEAD远程门禁 | HEAD `0b34c840d7af7b14178853e97081c5e863bff0e9`；Actions run `29414668790` / job `87349710998` | PASS；Node 22.14.0，Playwright 68/68，82/82构建，23 JS bundle与clean gate通过；Pages skipped |
| 新Vercel部署 | deployment `DYo7Ex4RYAy1TfieMTJEEesW98GK`完成后再次运行Preview套件 | Vercel状态success；应用黑盒仍`BLOCKED_PREVIEW_AUTH`，目标origin注入1、应用API响应0 |

保护层当前没有返回应用JSON错误码，不能把302/登录页解释为Patient、history-log或stage-feedback失败。需Vercel项目侧修正Automation Bypass作用域/有效性后使用同一入口复跑，届时测试将只保存脱敏路径、方法、HTTP状态、业务错误码、部署SHA和`generationSource/provider/isFallback`。

## Preview Bypass复测与应用配置门禁（2026-07-16）

| 检查 | 脱敏证据 | 结果 |
|---|---|---|
| 本机变量 | 仅检查存在性与长度 | PRESENT，长度32；未输出值 |
| 保护头作用域 | 根路径14个同源请求；P003 19个同源请求 | `x-vercel-protection-bypass`同源注入；cookie bootstrap各1次；跨origin 0 |
| 根路径 | 最终origin与目标Preview一致；`/api/health/` | PASS，HTTP 200；未重定向Vercel登录 |
| P003路径 | `/cases/P003/`最终origin与目标Preview一致 | PASS；应用静态页面可达 |
| 部署身份 | health的git/deployment SHA | `08b2843` / `08b2843b0ee582b4b0fd5ab379b39c94476faaf9` |
| Patient配置 | health布尔字段 | `patientServiceConfigured=true` |
| 训练签名 | health及P003 `init-attempt` | BLOCKED；`trainingStateConfigured=false`，HTTP 503 `training_state_secret_missing` |
| attempt持久化 | health布尔字段 | BLOCKED；`durableAttemptStoreConfigured=false` |
| 后续四项 | P001中英一轮、双向切换、刷新、双击、第二阶段 | NOT RUN；P003应用配置门禁后串行停止 |
| 生成物 | 实际secret字节、Cookie/Authorization字段扫描；trace/screenshot/video关闭 | PASS；error context与媒体在扫描后自动删除，仅保留非敏感运行状态 |
| Node 22检查 | 配置合同、TypeScript、ESLint | PASS |

运行命令为`pnpm run test:e2e:preview`，最终失败是预期的真实应用配置阻塞，不是Vercel保护层失败。必须在Preview作用域补齐既有服务端签名及Upstash持久化配置并重新部署后复跑。

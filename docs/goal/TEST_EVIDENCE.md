# 测试证据

基线日期：2026-07-12，Asia/Shanghai。测试在隔离snapshot/worktree执行，未修改生产数据。以下仅记录实际运行事实；未保留的单项时间或argv明确标注，不补造。

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

- CI/Linux环境在拟发布SHA复跑安全专项、完整行为、generated data diff、repo secret scan和Playwright全量；本地22/22不能替代CI。
- 拟发布SHA上的完整质量门禁，而非仅当前worktree。
- GitHub Actions、Pages、Vercel SHA/live alias核对。
- `/api/health/`、session init 10/10、中文5/5、英文5/5真实生产冒烟。
- Azure配置后的四音色MP3；未配置时必须明确SKIP。

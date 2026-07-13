# 探索式 QA 执行结果

状态：长期执行中；当前 1 个开放 P1、1 个开放 P2，不得视为最终生产验收。
被测 Production SHA：`41b3830a9095c692b3fdbe65a3dbf95b7ece5a37`。本轮 QA 起始 HEAD：`40bb0aaf745243ba5a66028c8636f0c9f2084c95`。

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

## 保持开放的外部阻塞

- `HEM-P0-001`：151 条来源语义待具名医学负责人裁决。
- `HEM-P0-023`：18 条双语医学冲突待具名专家裁决。
- 受保护 Preview 权限、真实 DeepSeek 与日志验证未满足。
- Preview 可能缺少 `TRAINING_STATE_SECRET`，只允许核对配置状态，不得读取或修改值。
- 当前客户端为聚合 JSON 响应；真实 provider 首 Token/P95 仍需 Preview 的服务端计时证据。

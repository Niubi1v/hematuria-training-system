# 探索式 QA 执行结果

状态：首轮已执行；发现 1 个开放 P1，不得视为最终生产验收。
证据 HEAD：`41b3830a9095c692b3fdbe65a3dbf95b7ece5a37`。

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

首轮整理后本机保留 56 个自动生成证据文件、32,273,305 字节，另有证据索引。Git 最小证据集为两张 HEM-P1-027 对照截图和一个关闭源码嵌入的定向失败 trace，共 163,606 字节；其余 HTML、重复截图、通过 trace、视频、报告与 transcript 均不提交，详见 `artifacts/exploratory-qa/EVIDENCE_INDEX.md`。

环境说明：当前独立 worktree 没有完整依赖链接，动态 Next dev 未在 120 秒就绪。首轮只读复用同 HEAD 主 Goal worktree 的静态 `out` 启动服务；因此页面/UI/路由结论有效，API/真实 AI 结论仍保持阻塞。Playwright bundled Chromium 未安装，按仓库既有本地策略改用 headless Chrome channel；另安装了 Playwright 专用 ffmpeg 以保存失败录像。

任何 fixture 结果均标记为 `deterministic_fixture_not_real_ai`，没有冒充真实 DeepSeek。

## 保持开放的外部阻塞

- `HEM-P0-001`：151 条来源语义待具名医学负责人裁决。
- `HEM-P0-023`：18 条双语医学冲突待具名专家裁决。
- 受保护 Preview 权限、真实 DeepSeek 与日志验证未满足。
- Preview 可能缺少 `TRAINING_STATE_SECRET`，只允许核对配置状态，不得读取或修改值。
- 当前客户端为聚合 JSON 响应；真实 provider 首 Token/P95 仍需 Preview 的服务端计时证据。

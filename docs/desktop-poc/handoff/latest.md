# 桌面本地 AI R4 运行审计修复交接

- handoffId：`e2ea82e9-20260802-122048`
- 状态：`blocked_test_gate`
- 分支：`codex/hematuria-desktop-mentor-beta-package`
- 基线 HEAD：`4c31bd547437270b08572218ef8f36052a401338`
- R4 产品 HEAD：`e2ea82e908b46f241fe955b3eb3b0391617267dc`
- 已关闭缺陷：`R3-LOCALAI-COUNT-001`
- `data/**`：零差异

## 根因与修复

真实 release Tauri 的 `debugRuntime=false`，渲染端因此不会发送 `debug:true`。此前 `/api/agent-chat` 只在 debug 诊断响应开启时调用 `desktopPatientEvidence`，把内部计数和对外诊断错误地绑在同一个 debug 门上。本地模型实际完成 intent 分类、validator 校验和回答规划，但事件从未进入 `/api/desktop/evidence` 使用的聚合器，所以真实回答后仍显示 `localAiAcceptedCount=0`、`ruleFallbackCount=0`。

修复保持患者回答链不变：每次真实桌面患者回复均在服务端内部记录一个最小事件，只有通过 validator 的真实 `local_ai` 写入 `local_ai_accepted`，其余真实安全降级写入 `rule_fallback_used`。事件仅包含 `eventType/sessionId/timestamp/model/latency`；不含问题、回答、患者数据、token、prompt、secret 或 reasoning。学生响应仍不暴露 `answerSource` 或桌面诊断对象。`cloudRequestCount` 继续读取 sidecar 对真实非本地 provider 请求的拦截计数，没有硬编码。

调用链：输入 → `/api/agent-chat` → intent → local model → governed validator → answer planner → patient response → 内部 runtime event → `/api/desktop/evidence` 聚合。

## 修改文件

- `api/agent-chat.js`
- `server/desktopRuntimeEvidence.js`
- `scripts/test-desktop-runtime-evidence.mjs`
- `scripts/test-local-llm-structured.mjs`
- `scripts/desktop-package-mentor-beta.ps1`
- `scripts/scan-mentor-package-stage.mjs`

未修改 `data/**`、医学事实、Patient Agent 回答策略、评分、UI、SQLite 或 Tauri 实现。

## 本地 AI 计数证据

真实本地模型桌面验收共 16 轮：15 轮 `local_ai`、1 轮 validator 因受治理候选冲突安全降级为 `rule_fallback`。最终一个真实 runtime session 为：

- `llamaServerReady=true`
- `localModelReady=true`
- `localAiAcceptedCount=7`
- `ruleFallbackCount=1`
- `cloudRequestCount=0`

模型关闭 API 验收严格执行 10 轮：`localAiAcceptedCount=0`、`ruleFallbackCount=10`、provider 调用 0、`cloudRequestCount=0`。关闭模型的真实 sidecar 验收另执行 16 轮，回答来源全部为 `rule_fallback`，七阶段可继续，云请求为 0。JSON 聚合与事件结构的禁止内容检查通过。

## 测试与门禁

通过：runtime evidence、structured local LLM、真实模型开启/关闭桌面验收、TypeScript、lint、完整行为测试、两类秘密扫描、Next 82 页构建、Tauri release、NSIS、便携包与 R4 包扫描。单线程桌面 `@ui-defect-regression` 3 项全部通过。

完整四 worker Playwright 门禁在隔离环境复现为 74 通过、30 失败、12 跳过。归因证明 30 项均为 R3 已存在的陈旧 Playwright 合同或测试准备缺失，不是 R4 产品回归，也不是 worker 并发、端口、SQLite、attempt store、启动竞争或状态污染。两轮限定测试修复后，代表集合由 18 通过、11 失败、3 跳过收敛为 27 通过、2 失败、3 跳过；剩余两项是同一病例库空结果测试仍寻找旧清除按钮。详见 `docs/desktop-poc/handoff/r4-playwright-attribution.md`。

达到两轮上限后未继续修复，也未把门禁记为通过。R4 仍不得进入独立验收或导师发布。

## R4 产物

目录：`D:\HematuriaDesktopArtifacts\MentorLocalAI-FinalCandidate-R4`

| 产物 | 大小 | SHA-256 |
|---|---:|---|
| `HematuriaTraining-Mentor-LocalAI-FinalCandidate-R4.zip` | 1,311,834,518 B | `8bf536337a8ad268f6d687aef75fde6f1dfa810a70ab05b8ad85990cbb110e59` |
| `HematuriaTraining-Mentor-LocalAI-Setup-R4.exe` | 32,432,744 B | `dbc9e7acca5e78e078a66474a4fe7d73ff65b4d6497f12f4a467baac0b8408d8` |
| `HematuriaTraining-Mentor-LocalAI-Portable-R4.zip` | 51,192,169 B | `9056fe04903c4f688bf26ab7bef518620178a7fcc24e787b45e42dafaccd5db3` |
| `Model\Qwen3-1.7B-Q4_K_M.gguf` | 1,282,439,264 B | `d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5` |

R4 解压树 88 个文件，包扫描 `secretFindings=0`、`forbiddenFindings=0`。未提交安装包、模型、trace、截图或日志。

## 下一步

仅处理归因报告所列的 2 项剩余病例库空结果测试合同，然后在隔离状态目录重跑标准完整四 worker Playwright 门禁。门禁全绿后再生成新 handoffId 并进入独立真实 Tauri 验收。不要修改患者回答、医学数据、评分、产品运行时或 R4 产物。

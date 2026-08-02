# 桌面本地 AI 导师 R4.1 最终候选交接

- handoffId：`086abf5b-20260803-010001`
- 状态：`ready_for_review`
- 独立验收结论：`ACCEPTED_FOR_MENTOR_BETA`
- 分支：`codex/hematuria-desktop-mentor-beta-package`
- R3 基线 HEAD：`4c31bd547437270b08572218ef8f36052a401338`
- R4.1 产品 HEAD：`086abf5b0b5a4080b8928270fcd314678cbb5b27`
- Playwright 门禁代码 HEAD：`9fc3bef9320759b34f1e26773beb8405aacd28da`
- 已关闭产品缺陷：`R4-LOCALAI-COUNT-REAL-TAURI-001`
- `data/**`：零差异

## 发布判断

R4.1 产品缺陷、唯一 Playwright 异常归因和完整发布门禁均已关闭，独立真实 Tauri 增量验收结论为 `ACCEPTED_FOR_MENTOR_BETA`。R4.1 产品 HEAD 和四项产物保持不变并冻结；R4 旧产物保持不可变，仅作回滚。

## 根因与共享权威

失败版 release sidecar 的写端和读端位于同一 PID `53508`，但分别加载了不同的 `desktopRuntimeEvidence.js` 模块实例：

- 写端 `moduleInstanceId=2f112762-e41b-47e7-96d6-43959927a2cf`，事件数从 1 增至 3；
- 读端 `moduleInstanceId=61d0fd6e-e56c-48c3-9947-c4c51dafdaef`，事件数始终为 0。

根因是同 PID、不同 `moduleInstanceId` 的模块级数组彼此隔离；不是本地模型没有运行，也不是 release 模式的 debug 开关导致。修复后，SQLite 表 `desktop_runtime_sessions` 与 `desktop_runtime_events` 成为 runtime session/event 的共享权威。事件写入按 `event_id` 幂等，跨模块、跨进程读取相同聚合结果；`cloudRequestCount` 仍来自真实非本地 provider 请求拦截计数。

运行审计只保存计数所需的内部运行字段，不保存问题、回答、患者身份、病例内容、prompt、reply、bearer、token、secret 或 reasoning，学生响应也不暴露 `answerSource` 或诊断对象。

## 产品提交实际修改文件

产品提交 `086abf5b0b5a4080b8928270fcd314678cbb5b27` 实际修改 11 个文件：

- `api/agent-chat.js`
- `desktop/sidecar/index.cjs`
- `docs/desktop-poc/handoff/r4.1-runtime-audit-topology.md`
- `scripts/desktop-lifecycle-test.mjs`
- `scripts/test-desktop-runtime-evidence.mjs`
- `scripts/test-desktop-sqlite-store.mjs`
- `scripts/test-local-llm-structured.mjs`
- `server/desktopRuntimeEvidence.js`
- `server/desktopSqliteStore.js`
- `src-tauri/src/lib.rs`
- `src/components/DesktopModelSettings.tsx`

未修改 `data/**`、Patient Agent 回答策略、医学事实、评分合同或病例训练 UI。

## 真实 Tauri 与跨进程证据

修复版真实 release Tauri sidecar 为 PID `40012`：

- 8 个可见回答：`local_ai=7`、受治理冲突 `rule_fallback=1`；
- `llamaServerReady=true`、`localModelReady=true`；
- `cloudRequestCount=0`、`runtimeAuditHealthy=true`；
- 设置窗口关闭再打开后，7/1 聚合保持；
- 正常退出后本轮相关进程、WebView2 与监听端口异常残留为 0。

跨进程测试由进程 A 写入 5 个 accepted、1 个 fallback，进程 B 从同一 SQLite runtime session 读取 5/1；重复 `eventId` 不增加计数。

“复制诊断摘要”得到 483 B 安全 JSON，SHA-256 为 `8876ea9acf95d153c753bfc7dcf60c41089b4663d54bdf7637c95093636a1551`。导出文件为 `D:\HematuriaDesktopTopologyEvidence\R4-Fixed-8Rounds-20260802-01\exports\hematuria-local-runtime-verification-1785658580741.json`，467 B，SHA-256 为 `4a9cbe1639a0ac4a353d2b3bad55c57678a02f6c0a729f74356fcd2a1a1142e2`。两者均通过禁止字段检查。

## Playwright 唯一异常归因与最终门禁

原始唯一失败为：

`mobile-chromium › tests/e2e/practice.spec.mjs:189:1 › case route renders seven locked stages and no disease tag`

首个失败请求是 `GET /cases/P008/`，HTTP 500。页面为 Next.js 15.5.21 开发错误页，唯一 page error 为 `Invariant: Expected clientReferenceManifest to be defined. This is a bug in Next.js.`；没有产品 JavaScript 异常。同轮第一个 P008 请求（desktop）HTTP 200 并通过，第二个 P008 请求（mobile）HTTP 500，后续 P008 请求均恢复 HTTP 200。因此归因为一次性 Next dev `clientReferenceManifest` 异常。

随后三轮完全独立定向复现均使用全新 `.next`、LOCALAPPDATA、状态目录、输出目录、唯一端口和新 Next dev 进程；desktop/mobile、`retries=0` 每轮均为 `2 passed / 0 failed`：

- `D:\HematuriaDesktopR41PlaywrightGate\targeted-p008-round1-086abf5-20260802`
- `D:\HematuriaDesktopR41PlaywrightGate\targeted-p008-round2-086abf5-20260802`
- `D:\HematuriaDesktopR41PlaywrightGate\targeted-p008-round3-086abf5-20260802`

最终完整门禁使用 Node 22.14.0、Playwright 1.61.1、desktop/mobile、4 workers、`retries=0`，结果为：

- 104 passed
- 12 个既有 project 互斥 skip
- 0 failed
- 0 errors
- 总计 116 项

JUnit：`D:\HematuriaDesktopR41PlaywrightGate\full-086abf5-20260802-final\playwright-junit.xml`。测试端口与 Next 进程残留为 0。

## 其余发布门禁

以下门禁全部通过：

- runtime evidence 跨进程与事件幂等；
- SQLite store；
- TypeScript；
- ESLint；
- R3 状态恢复、医学语义、Data Agent、evidence graph、timeline 与 public boundary 专项；
- source projection：保留 4、拒绝 121、等待医学审核 1023、医学冲突 1；
- Next 82 页生产构建；
- Tauri release、NSIS、便携版；
- 桌面包 4 个目标扫描，0 findings；
- R4.1 阶段 88 个文件，`secretFindings=0`、`forbiddenFindings=0`；
- `VERIFY-PACKAGE.ps1` 检查 9 个关键文件；
- 仓库秘密扫描与秘密扫描器合同；
- `git diff --check`、`data/**` 零差异；
- 构建和测试关联进程、端口异常残留为 0。

## R4.1 不可变产物

目录：`D:\HematuriaDesktopArtifacts\MentorLocalAI-FinalCandidate-R4.1`

| 产物 | 大小 | SHA-256 |
|---|---:|---|
| `HematuriaTraining-Mentor-LocalAI-FinalCandidate-R4.1.zip` | 1,311,867,078 B | `ad519485d5f549c10d4faf7d62af94ad3e39dce4a7a5041e625e270d25a40575` |
| `HematuriaTraining-Mentor-LocalAI-Setup-R4.1.exe` | 32,451,859 B | `abebccf8cff46b09680c3e2aa5ccdf5d5a21133690f7ed61ec653b31f9270ae4` |
| `HematuriaTraining-Mentor-LocalAI-Portable-R4.1.zip` | 51,225,070 B | `8b06c8982d97bc8f514efe8d18c78589abf8086bba7736ff91f7aab2aa4e672a` |
| `Model\Qwen3-1.7B-Q4_K_M.gguf` | 1,282,439,264 B | `d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5` |

包内 `VERSION.json` 的 `productHead` 为 `086abf5b0b5a4080b8928270fcd314678cbb5b27`，channel 为 `mentor-local-ai-final-candidate-r4.1`。

## 独立真实 Tauri 增量验收归档

- 原交接 handoffId：`086abf5b-20260802-173610`
- 最终归档 handoffId：`086abf5b-20260803-010001`
- verdict：`ACCEPTED_FOR_MENTOR_BETA`
- 验收报告目录：`D:\HematuriaDesktopR41Acceptance\Independent-R4.1`
- 报告：`acceptance-r4.1.md`、`acceptance-r4.1.json`、`runtime-verification-r4.1.json`
- 真实 Tauri 8 轮：`localAiAcceptedCount=8`、`ruleFallbackCount=0`、`cloudRequestCount=0`、`runtimeAuditHealthy=true`；设置页关闭后重开计数保持 8/0。
- 原生复制和 JSON 导出成功，摘要隐私扫描零命中；学生端未泄露运行审计内部字段。
- 阶段 1 关闭重开恢复通过，无重复 attempt 或提交；阶段 2 尿常规、血常规等待医学审核及未审核证据隔离边界通过。
- 正常退出并等待 10 秒后，关联进程和监听端口残留均为 0。
- 产品 HEAD 继续为 `086abf5b0b5a4080b8928270fcd314678cbb5b27`；上表四项产物大小和 SHA-256 与独立验收完全一致。
- 独立验收及本归档未修改产品代码、测试、`data/**`、打包输入或候选产物，未重新构建或重新打包。

## 归档后限制

- 首次本地模型加载可能较慢，但必须持续显示进度。
- 系统为医学教学 Beta，不用于真实诊疗。

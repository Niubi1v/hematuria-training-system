# 桌面本地 AI 导师最终候选交接

- handoffId：`03bcba07-20260801-120657`
- 状态：`ready_for_review`
- 分支：`codex/hematuria-desktop-mentor-beta-package`
- 桌面 POC 远程基线：`e43191ca0b91c636eb4c3b4d031f26d31b31797c`
- UI 远程 HEAD：`966129504a3f5dc12f9475561e98cbe5f12965bd`
- 候选包产品 HEAD：`4670022b57aa23db17cd9c8b24bd54fa56d55323`
- 已测试实现 HEAD：`f253129ececdc02f2106de55f92f2abf5286cf43`
- `data/**`：相对桌面 POC 基线及当前工作树均为零差异

## 受控集成

按顺序集成：

1. `33199f4d8f2a845b5f7d606515b2503a5cc71120`
2. `715179368e7b8d8442caa109ea57797713c9761e`
3. `99db3a06fdcb01459612c6c1e0713fd4b6755b65`
4. `de84b6a913da2b6bc188983ce4669ba97d9e83c1`
5. `966129504a3f5dc12f9475561e98cbe5f12965bd`

唯一内容冲突位于 `ClinicalTrainingClient.tsx` 的 `sanitizeTimeline`。逐 hunk 保留桌面 POC 的临床结果过滤、医学隔离与 fingerprint 去重，同时保留 UI 分支的学生端自然 label 和缺失结果本地化状态；未使用整文件 ours/theirs。

## 医学语义组合结果

| 项目 | 结果 |
|---|---:|
| source projection 保留并应用 | 4 |
| 语义复核撤回 | 62 |
| 运行时拒绝总数 | 121 |
| medical_review_pending | 1023 |
| medical_conflict | 1 |

- P001 血常规显示等待医学审核，`diagnosticEligible=false`、`scoringEligible=false`，不返回糖化血红蛋白或梅毒抗体。
- P001 尿常规只显示一次“红细胞 5562个/μl”，不再重复旧“尿检”文本。
- timeline 与最终报告无空冒号、无只有检验分类而无结果的空壳记录；缺失结果明确显示状态或被安全过滤。
- 未审核结果不进入 evidence graph、诊断或评分。

## UI 组合结果

- 学生端不显示 `slot_answered`、canonical key、`evidenceId`、Provider、intent、provenance 或内部编号；中英文均使用自然临床 label。
- 初始化、失败、未完成、已提交和完成动作互斥；提交后只保留进入下一阶段。
- 390×844 输入区和固定操作栏不遮挡；1093×614 设置窗口完整可关闭；1366×768 与 1440×900 无横向溢出。
- 第 3—7 阶段主操作持续可见；第 7 阶段以百分制为主，内部 360 分合同保留但不直接暴露。

## 七阶段、离线 AI 与恢复

- P001 中文完整七阶段、P001 英文阶段 1—3、P003 零轮提交均通过。
- P002 肿瘤女性、P006 感染、P009 结石、P011 肾小球性血尿均完成七阶段并生成报告。
- 模型关闭后的 P001 完整七阶段 `rule_fallback`、SQLite 关闭重开恢复、阶段和最终报告快速双击幂等均通过。
- 默认 Qwen3-1.7B 模型 SHA 已复核；真实离线 16 回合中 15 回合接受并标记 `local_ai`，1 回合治理元数据冲突被拒绝并标记 `rule_fallback`。
- `llamaServerReady=true`、`localModelReady=true`、`cloudRequestCount=0`；未重复 4B A/B。

## 最终候选产物

输出目录：`D:\HematuriaDesktopArtifacts\MentorLocalAI-FinalCandidate`

| 产物 | 大小 | SHA-256 |
|---|---:|---|
| `HematuriaTraining-Mentor-LocalAI-FinalCandidate.zip` | 1,311,839,017 B | `c310f313481000efe68d256419425393e4f0373cf5cc6e5562438dcc609d7c83` |
| `HematuriaTraining-Mentor-LocalAI-Setup.exe` | 32,429,679 B | `13978811ddd74c21bc94f3328c8f31f5773a9d91517f79be561cc4ad4586da20` |
| `HematuriaTraining-Mentor-LocalAI-Portable.zip` | 51,198,070 B | `19e2719550976d9fbcdb2849cf59e4038fc0debb66b51f719cae6f844ac55d63` |
| `Model\Qwen3-1.7B-Q4_K_M.gguf` | 1,282,439,264 B | `d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5` |

ZIP 根目录直接包含 `启动血尿训练系统.cmd`。真实使用路径为：完整解压 → 双击根启动器 → 自动启动本地服务、本地模型和桌面窗口；无需 Node、Docker、Redis、Python、API Key 或其他 AI 软件。

完整 ZIP 在 `D:\HematuriaDesktopAcceptance\导师 最终候选 20260801` 解压为 88 文件、1,416,360,036 B。便携版解压为 80 文件、133,908,748 B。NSIS 安装为 81 文件、133,991,273 B，已完成安装、启动、正常退出及卸载，卸载后安装目录不存在。

## 性能、网络与生命周期

- 首次根启动器调用墙钟约 9.8 s；精确监控就绪 8,651 ms。
- 单次 1.7B 模型加载 1,072 ms；16 回合 P50 2,673 ms、P95 4,241 ms。
- llama-server 峰值工作集 2,421,661,696 B；完整应用进程树峰值 2,810,101,760 B。
- 便携版就绪 3,101 ms；NSIS 安装 3,778 ms、安装版就绪 3,843 ms、卸载 7,651 ms。
- 业务 sidecar 与 llama-server 仅监听随机 `127.0.0.1` 端口；未观察到外部连接。
- 根启动器、便携版与安装版正常关闭后，Node、llama-server、WebView2、Tauri 与 sidecar 在发布宽限内残留均为 0。

## 门禁与剩余限制

完整仓库测试、TypeScript、ESLint、医学分流、Data Agent、evidence graph、timeline/最终报告、SQLite/幂等、sidecar 生命周期、Next 82 页构建、Tauri release、NSIS、bundle/package/secret 扫描全部通过。限定 Playwright/axe 为 19 通过、5 个按项目守卫跳过，严重或关键 axe 违规为 0。

剩余限制：1023 项继续等待医学审核，121 项 source projection 保持运行时拒绝，1 项医学冲突继续隔离；Windows 候选未代码签名、无自动更新及 macOS 包。本系统是医学教学 Beta，不用于真实诊疗。

当前无发布阻塞，可进入独立轻量验收。未修改 Production、main、Vercel、腾讯云，也未覆盖旧导师包。

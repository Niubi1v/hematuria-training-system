# 桌面医学内容治理分流与导师 Beta 交接

- handoffId：`155e8ff4-20260801-043929`
- 状态：`ready_for_review`
- 分支：`codex/hematuria-desktop-local-ai-poc`
- Production 基线：`6f22d591332a522c1a85835ba4c39a840f961901`
- 产品/已测试实现 HEAD：`155e8ff4cb641cae4acb8a884b8b3245c18d4fd8`
- `data/**`：零差异

## 医学分流

输入包：`D:\HematuriaReview\desktop-clinical-content-review-pack-triaged.zip`（215,145 B；SHA256 `832cd6c0935a129258b5844db403f12a471949cabc36caecd6120173e8b68a46`）。

| 分类 | 输入 | 运行时结果 |
|---|---:|---|
| auto_apply_after_source_match | 125 | 66 项通过严格 source/result 直接匹配并应用；59 项不匹配，继续 fail-closed |
| policy_safe_simulated_normal_candidate | 75 | 75 项完成病例 source 冲突检查并应用 |
| no_specimen_or_not_indicated | 552 | 明确显示无适应证、未实施或未取材，不生成正常数值/病理 |
| no_report_or_not_indicated | 952 | 明确显示无适应证或未实施，不生成 CT/MR/超声/内镜/核医学报告 |
| needs_case_specific_medical_review | 902 | 继续 fail-closed |
| blocked_medical_conflict | 1 | 保留 medical_conflict，不自动裁决 |

66 项 source projection 使用 `provenance=case_source_projection`、`scoringEligible=false`。75 项安全正常使用 `provenance=simulated_normal`、`affectsDiagnosis=false`、`affectsScore=false`、`scoringEligible=false`、`diagnosticEligible=false`，不进入诊断或评分证据链。

学生端每项医嘱独立显示“报告已返回、无明确适应证、未实施、未取材、等待医学审核、前置条件未满足”之一。未实施和未取材项目不生成结果事件；不必要检查进入第7阶段轨迹复盘。关键影像、尿检、病理、961项待审核内容（902+59）和1项冲突均未进入确定性诊断、治疗或评分证据，且未由 LLM 生成。

## 阶段2—7验证

P001肿瘤、P002女性肿瘤、P006感染、P009结石及P011肾小球性血尿均完成阶段2—7并生成最终报告；证据节点数分别为23、16、18、15、16。

- 阶段2：逐项状态、来源、前置条件和时间线净化通过，无 `undefined` 或原始对象。
- 阶段3：只允许选择已释放且可用于诊断的 evidenceId；安全正常和待审核内容被排除。
- 阶段4—6：会诊、治疗医嘱和围术期反馈继续引用真实 evidenceId。
- 阶段7：完成率5/5，百分制和最终报告生成通过，轨迹可指出不必要检查。

通过的专项包括 triage 清单校验、Data Agent 权限/展示、evidence graph 隔离、阶段2—7、TypeScript、ESLint、Next/Tauri/NSIS构建、打包 sidecar 生命周期、mentor 包内容/secret 扫描及 `data/**` 零差异。

## 导师本地 AI Beta

推荐模型为 Qwen3-1.7B Q4（非思考模式）。模型只处理 intent/topic/slot/context 和表达风格，不决定病例事实；文件与安装程序仍分离，但导师 ZIP 同包携带。

| 产物 | 大小 | SHA256 |
|---|---:|---|
| `D:\HematuriaDesktopArtifacts\MentorLocalAI\HematuriaTraining-Mentor-LocalAI-Beta.zip` | 1,311,796,605 B | `e9b9724d1863136dbb4e809390b81b54539ffaa308ddfe551d1cff931caf321c` |
| `D:\HematuriaDesktopArtifacts\MentorLocalAI\HematuriaTraining-Mentor-LocalAI-NSIS.exe` | 32,405,294 B | `b29d4938046291cf58522d7f1223e51b98df174737c7d8e14955288c065346d5` |
| `D:\HematuriaDesktopArtifacts\MentorLocalAI\HematuriaTraining-Mentor-LocalAI-Portable.zip` | 51,155,901 B | `54f03d710c3af1e876daf0bc2d52bc4d0c2de76ad71c656afbccac82d1323c16` |
| `D:\HematuriaDesktopArtifacts\MentorLocalAI\Model\Qwen3-1.7B-Q4_K_M.gguf` | 1,282,439,264 B | `d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5` |

ZIP根目录包含 `启动血尿训练系统.cmd`，README首行为“完整解压后，双击启动血尿训练系统.cmd”。真实全新解压烟雾测试已验证：自动校验同包模型、显示启动进度、启动业务与 llama sidecar、仅监听随机 `127.0.0.1` 端口、无需外部 Node/Docker/Redis/Python/API Key、启动器返回0，主程序退出后无 sidecar 残留。包内86个文件的源码、缓存、日志、trace、禁入文件和 secret 扫描为0项发现。

## 已知限制

902项病例特异关键医学内容仍保持 fail-closed，另有59项 source 投影因严格匹配失败而隔离、1项医学冲突未裁决。这些内容需要后续人工医学审核，但不会被伪造，也不阻断当前受治理的导师 Beta 七阶段练习。

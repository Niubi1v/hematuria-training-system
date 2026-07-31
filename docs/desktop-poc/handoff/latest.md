# 桌面离线版最佳实践对齐交接

- handoffId：`2f9eb5a3-20260731-235013`
- 状态：`ready_for_review`
- 分支：`codex/hematuria-desktop-local-ai-poc`
- Production 基线：`6f22d591332a522c1a85835ba4c39a840f961901`
- 产品 HEAD：`2f9eb5a3bbc56525b7de6c6e640519a5bc3452b1`
- 已测试实现 HEAD：`a05ce24ae4cac60025bcc4aa7ef37b7c16c04cf5`
- `data/**`：零差异
- 导师包：本轮未制作

## 架构变化

Patient Agent 沿用现有 ontology、structured/canonical history、九态事实、冲突隔离和 answer planner，不建立第二套患者框架。控制层明确拆成三部分：

1. Case Truth：现有受治理 answer plan 是唯一事实来源。
2. Disclosure Policy：按问句触发，处理精确、粗粒度、部分已知、患者不知情和医学冲突。
3. Persona Style：仅控制语气、紧张程度、语言水平、回答长短、合作方式和记忆清晰度，不携带或改变事实。

开发诊断新增 `tangential`、`oversharing`、`role_breaking`、`off_script`、`wrong_unknown`、`context_lost`、`polarity_error`；学生端不显示这些字段。

Measurement/Data Agent 保持“学生动作 → canonical action → 精确病例结果 → release condition → provenance → timeline/evidence graph”。Patient Agent 不返回查体、检验、影像或病理；关键结果不由 LLM 生成。

轻量 evidence graph 存在签名 attempt state 与 SQLite JSON 状态中。内部节点记录 evidenceId、阶段、触发动作/原始问句、canonical fact/action、结果、provenance、诊断支持/反对关系和 rubric 映射。学生端只收到当前阶段允许的 evidenceId、阶段与安全标签。

## 量化回归

代表流程包括 P001 中文、P001 英文、P006 感染女性、P009 结石女性和 P002 肿瘤女性：

| 指标 | 结果 |
|---|---:|
| 事实正确率 | 10/10（100%） |
| 上下文连续性 | 5/5（100%） |
| action-result 匹配 | 5/5（100%） |
| 阶段3—7反馈可追溯 | 109/109（100%） |
| 七阶段完成率 | 5/5（100%） |
| 轨迹章节覆盖 | 40/40（100%） |
| 模型关闭后的回答来源 | rule_fallback 10 / local_ai 0 |

七类患者回答错误均为0。五条流程共形成73个证据节点、35次阶段提交和5份最终360分报告。

全量门禁另覆盖42病例双语：服务端84条旅程、588次阶段提交、84份报告；Playwright完成桌面84条旅程及移动端1条代表旅程。

## 阶段2—7

- 阶段2：每项医嘱独立匹配与释放，保留配置来源及前置条件；时间线不显示 `undefined` 或原始对象。
- 阶段3：最可能诊断与最多3项鉴别均选择服务器签发的 evidenceId；伪造 ID 返回422。
- 阶段4：移除泌尿外科自会诊；会诊目的、问题和证据逐科室提交，反馈包含病例相关价值、必要性与整合建议。
- 阶段5：医嘱式治疗工作台；药物事实仍由学生输入，不由 LLM 生成。
- 阶段6：结构化围术期清单，反馈命中、遗漏、风险和病例参考点。
- 阶段7：报告显示完整临床轨迹、遗漏、百分制主分和可展开的原360分证据详情。

阶段3—7本轮抽查的109条反馈全部引用了 attempt evidence graph 中真实存在的 evidenceId。

## 本地模型 A/B

两档模型使用完全相同的 P001 中英文16轮问答，模型文件 SHA256 均通过；`llama-server` 只监听 `127.0.0.1`，两次测试 `cloudRequestCount=0`。

| 指标 | Qwen3-1.7B Q4 | Qwen3-4B Q4_K_M |
|---|---:|---:|
| 首次加载 | 1,321 ms | 2,100 ms |
| P50 | 2,926 ms | 3,894 ms |
| P95 | 4,176 ms | 5,387 ms |
| 峰值工作集 | 2,421,981,184 B | 5,058,850,816 B |
| 原始 intent/slot | 15/16 | 15/16 |
| 验证接受轮准确率 | 15/15 | 15/15 |
| 最终受治理 intent/slot | 16/16 | 16/16 |
| fallback | 1/16 | 1/16 |
| wrong_unknown / context_lost | 0 / 0 | 0 / 0 |

两档模型唯一回退均为 `local_metadata_conflict_with_governed_candidates`，真实标记为 `rule_fallback`。4B没有带来准确率、上下文或回退改善，延迟和内存更高，因此1.7B继续作为默认轻量模式；4B仅保留为可选标准模式。

## SQLite 与生命周期

- SQLite schema v1、WAL、外键、状态恢复与快速重复提交幂等通过。
- evidence graph 随 attempt JSON 写入用户应用数据目录并可恢复。
- sidecar 随机端口、回环监听、握手令牌、设置驱动的 llama 重启及退出清理通过。
- 打包后的业务 sidecar 生命周期专项通过。

## 医学审核包

- 路径：`D:\HematuriaReview\desktop-clinical-content-review-pack.zip`
- 大小：88,157 B
- SHA256：`2777518f8853e76201b2f73585071583af986ab71ca109dd3c9fda5ac2cd7081`
- 内容：42病例、2,607项关键查体/检验/影像/病理候选
- 状态：`requires_human_medical_review`

这些候选没有写入 `data/**`，不会进入诊断、治疗或评分证据链。它们是正式医学内容使用的人工审核阻塞，但不阻断当前受治理、fail-closed 的练习 POC。

## 构建产物

| 产物 | 大小 | SHA256 |
|---|---:|---|
| `D:\HematuriaDesktopArtifacts\hematuria-desktop-portable-0.1.0-windows-x64.zip` | 51,134,411 B | `8f4b71fd0174db7f0bf18a4f77367ad89f2624908ab464837d70b48884757da6` |
| `D:\HematuriaDesktopArtifacts\hematuria-desktop-setup-0.1.0-windows-x64.exe` | 32,385,311 B | `aca00330daf6035e3c8d0b459930a5624a0b928098a0b4cdcd960c2abb6a68d2` |
| Tauri 壳 | 3,928,576 B | `49a7bba5ec6639e4a38e6126c3f584eaed549f0a837b6c95edaa9ddcb1ab4023` |

组件体积：前端3,210,179 B；业务 sidecar 4,675,533 B；Node 83,344,536 B；llama.cpp 40,771,424 B；便携版解压后132,720,069 B。模型不在安装包中。

## 门禁

通过：Patient控制层、上下文追问、Data Agent权限、evidence graph反伪造、阶段3—7、360分、42病例双语服务端矩阵、42病例双语桌面UI、移动端七阶段、SQLite、打包sidecar生命周期、TypeScript、ESLint、真实1.7B/4B A/B、Next/Tauri/NSIS、包内容扫描、secret scan及`data/**`零差异。

## 剩余阻塞与下一步

1. 2,607项关键医学候选仍需具名医学负责人裁决；当前继续 fail-closed。
2. 应由独立轻量验收窗口对本轮新 Tauri 包执行窗口滚动、缩放与真实交互复测；本实现窗口不以浏览器证据替代独立桌面验收。

下一步仅做轻量独立验收，不合并 Production、不自动应用医学候选、不生成新的导师包。

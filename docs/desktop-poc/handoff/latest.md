# 桌面本地 AI POC 最终验收交接

## 1. 当前里程碑

- 里程碑：desktop-local-ai-poc-final-acceptance
- 交接编号：6f22d591-20260731-185531
- 状态：ready_for_review
- 结论：真实便携版、NSIS、真实本地模型、SQLite 恢复、幂等、退出清理及安全扫描已有证据；真实 Tauri 窗口内完整点击与截图仍阻塞，不能写成全部通过。

## 2. 当前 HEAD

- 分支：codex/hematuria-desktop-local-ai-poc
- 受测产品 HEAD：6f22d591332a522c1a85835ba4c39a840f961901
- 远端 HEAD：同上
- 开始前工作树：干净

## 3. 浏览器与桌面验收

| 项目 | 结果 | 证据 |
|---|---|---|
| 便携版启动 | PASS | 真实便携程序产生“血尿临床问诊训练系统”Tauri 窗口 |
| NSIS 安装/启动/卸载 | PASS | 安装 exit 0；真实进程树运行；卸载 exit 0，安装目录删除 |
| 首页名称 | PASS（浏览器证据） | 快照为“血尿临床问诊训练系统” |
| 随机病例入口且无“盲病例” | PASS（浏览器证据） | 存在“随机抽取病例”，未出现“盲病例” |
| 初始盲态 | PASS（浏览器证据） | P001 仅见 65 / 男，无主诉、病程、诊断、证据或答案 |
| 右侧证据从 0 开始 | PASS（浏览器证据） | 问题、回答、查体、医嘱、报告均为 0 |
| 对话滚动、输入固定 | NOT VERIFIED | 桌面控制等待应用授权超时 |
| 第一阶段进入第二阶段 | PASS | staged sidecar 与浏览器流程通过 |
| P003 零轮 | PASS | staged sidecar 进入第二阶段 |
| 快速双击 | PASS | 浏览器仅发 1 次请求，SQLite 幂等记录为 1 |
| 重启恢复 | PASS | SQLite 恢复第二阶段、提交状态和患者 session |
| 退出清理 | PASS | Tauri、Node、llama-server、conhost、WebView2 剩余 0 |
| 端口 | PASS | 未发现 3000/3001/6379；生命周期测试确认随机 127.0.0.1 |

定向 Playwright 子集为 4 passed / 3 failed。失败项是旧标题、旧 P008 精确文本和已移除的患者服务标签；按测试维护问题记录，不修改产品或测试。

## 4. 本地 AI 状态

受控方式为桌面 sidecar 只配置本地 llama/Qwen，不配置云 provider；未物理禁用网卡。

- llamaServerReady=true
- localModelReady=true
- answerSource=local_ai
- cloudRequestCount=0
- 模型就绪：1,338 ms
- 20 轮 P50：2,835 ms
- 20 轮 P95：3,291 ms
- 模型基准峰值工作集：2,421,886,976 B

| 问题 | 来源 | requestedSlot | 延迟 |
|---|---|---|---:|
| 哪里不舒服？ | local_ai | chief_complaint | 4,112 ms |
| 多久了？ | local_ai | hematuria_onset | 3,158 ms |
| 有没有其他疾病？ | local_ai | 未返回 | 3,093 ms |
| 高血压吃什么药？ | local_ai | MED_ALL | 2,721 ms |
| 这个药怎么吃？ | local_ai | MED_ALL | 2,708 ms |
| 还有其他药吗？ | local_ai | MED_ALL | 2,843 ms |
| 抽烟吗？ | local_ai | 未返回 | 2,879 ms |
| 喝酒吗？ | local_ai | 未返回 | 2,956 ms |

八轮均为 ready/ready、cloud 0。探针误从顶层读取 intent，而契约字段在 runtimeTrace.intent，因此 intent 与 definitive unknown 记为 not_captured，不伪造结果。

安全验证器在 20 轮基准中拒绝 2 次复合分类，原因 compound_question_preserves_all_facts，明确记为 rule_fallback。

关闭模型复测：11/11 为 rule_fallback，local_ai=0，llama/model 均 false，cloud 0；P001 中英文和 P003 零轮进入第二阶段，重启与幂等通过。完整七阶段真实 UI 未完成。

## 5. 截图路径

未提交截图。真实 Tauri 窗口可识别，但桌面控制两次等待授权超时。为避免以浏览器截图冒充桌面截图，screenshots 数组保持为空。

## 6. 产物

| 产物 | 大小 | SHA256 |
|---|---:|---|
| D:\HematuriaDesktopArtifacts\hematuria-desktop-portable-0.1.0-windows-x64.zip | 51,127,277 B | 3a7f373888cb2c7d48b36749b1018ab2907fafae57b81d54836b55788cf34e23 |
| D:\HematuriaDesktopArtifacts\hematuria-desktop-setup-0.1.0-windows-x64.exe | 32,387,970 B | d306594af31a45303a23951e98a46c16b82297dc9c4097634c07f66f42819d8b |
| Qwen3-1.7B-Q4_K_M.gguf | 1,282,439,264 B | d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5 |

- 安装后占用：132,732,411 B
- 安装版窗口出现：约 2,484 ms
- 安装版进程树采样峰值总工作集：2,909,945,856 B
- 包审计未发现 API Key、env、Cookie、私钥、Git、node_modules、截图、trace 或大日志；模型未进入安装包。

## 7. 测试结果

- PASS：真实本地 AI、模型关闭 fallback、20 轮基准
- PASS：runtime evidence、lifecycle、public boundary、package audit
- PASS：repository secret scan 与 scanner contracts
- FAIL：定向 Playwright 4/7，三个旧断言待维护
- 未运行完整仓库 full gate；本交接不声称生产发布通过

## 8. 阻塞

1. 真实 Tauri 窗口内点击、滚动/固定输入及六张截图未完成。
2. 三条 Playwright 旧断言需开发维护者判断。
3. 八问 runtimeTrace.intent 与 definitive unknown 未采集。
4. 模型关闭后的完整七阶段真实包 UI 未完成。

## 9. 下一步建议

在允许桌面控制的 Windows 会话中补齐六张压缩截图、真实窗口滚动/固定输入、八问 runtimeTrace.intent 和关闭模型后的七阶段；随后单独维护陈旧 Playwright 断言。验收人员不应为通过而修改产品代码。

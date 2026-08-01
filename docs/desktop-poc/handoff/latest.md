# 桌面本地 AI 导师 R2 候选交接

- handoffId：`1866364b-20260801-162444`
- 状态：`blocked_external_ui_control`
- 分支：`codex/hematuria-desktop-mentor-beta-package`
- R2 产品 HEAD：`8fed9433a06723865ba904bce202a10155ab0e4e`
- 交接前已验证仓库 HEAD：`4bb15dfdc87cf1eadcb7b1394201245cb8599bbf`
- `data/**`：零差异

## 三项原阻塞与修复

1. 重启恢复：SQLite 实际保留了 R1 attempt，但学生端发现、首页进度和完整终报只依赖带随机sidecar端口的 WebView缓存；退出顺序也在SQLite前停止模型。R2新增SQLite快照、按病例发现与进度接口、R1持久响应重建，并在停止llama前完成WAL checkpoint。权威目录统一为 `%LOCALAPPDATA%\HematuriaTraining\MentorLocalAI-FinalCandidate\hematuria.sqlite3`，localStorage仅作缓存。
2. 360泄露：服务端形成性反馈改为自然中英文，所有学生可见反馈、标准答案、命中/遗漏/警告、timeline、终报及恢复文案统一经过公共分数投影。中英文DOM组合流程均无 `360`/“360分”；内部评分和API仍保持360分合同。
3. 聚合诊断：“辅助设置”新增“本机运行验证”，通过现有桌面认证读取本次启动统计，可复制/导出schema v1 JSON。只包含产品HEAD、runtime/model状态、接受数、fallback数、云请求数及时间，不含问答、患者标识、bearer/token/secret或推理。

医学结果保持：source projection应用4、撤回62、拒绝121、等待医学审核1023、医学冲突1；P001血常规继续等待审核且不参与诊断/评分，尿常规只显示一次“红细胞 5562个/μl”，timeline无空壳。`data/**`未改动。

## 组合与包级验收

- Playwright：P001中文七阶段、英文阶段1—3、每阶段/终报/刷新后的360泄露断言、自然证据label、移动操作栏、设置窗口、幂等及axe通过。P003另一路零轮提交与token轮换通过；旧P003瞬时连接文案断言存在5秒边界竞态，未修改或放宽该门禁。
- 包内Qwen3‑1.7B：16轮中15轮接受为`local_ai`，1轮治理冲突如实`rule_fallback`；当前诊断session显示接受7、fallback 1、云请求0。未运行4B。
- 模型关闭：P001七阶段完成、终报生成、关闭重启后同一attempt/七阶段反馈/终报/首页完成进度恢复，幂等记录唯一；P001英文和P003零轮进入阶段2。
- 根启动器：在`D:\HematuriaDesktopR2Acceptance\真实验收 R2 20260801`完整解压并通过包内校验，真实Tauri/sidecar/Qwen自动启动，仅监听127.0.0.1。三次正常关闭后WAL完成checkpoint，候选关联残留0。
- NSIS：中文空格路径安装、启动、正常退出、卸载通过；81文件、134,009,302 B，卸载后目录不存在。
- 扫描：解压树88文件、秘密命中0、禁用文件命中0；仓库秘密扫描通过。Tauri release、NSIS、Next 82页、TypeScript、ESLint、Data Agent、evidence graph、SQLite/sidecar生命周期均通过。

## R2产物

目录：`D:\HematuriaDesktopArtifacts\MentorLocalAI-FinalCandidate-R2`

| 产物 | 大小 | SHA-256 |
|---|---:|---|
| `HematuriaTraining-Mentor-LocalAI-FinalCandidate-R2.zip` | 1,311,861,288 B | `e3cd387f95b3e52c1315107735933ffa8d84272f74f0ab40d640af5d67421e92` |
| `HematuriaTraining-Mentor-LocalAI-Setup-R2.exe` | 32,437,307 B | `a903553a5e65c4eaeda9431159715911d8de8b5c7d1769f43382bd82daf54c66` |
| `HematuriaTraining-Mentor-LocalAI-Portable-R2.zip` | 51,220,838 B | `c606bebe7afc16625641918250515799773d18b9d7f8bbf58eaf4b33dc7432b7` |
| `Model\Qwen3-1.7B-Q4_K_M.gguf` | 1,282,439,264 B | `d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5` |

主ZIP解压后88文件、1,416,378,517 B。冷启动根启动器就绪125,929 ms，缓存后10,792 ms；llama加载1,603 ms；本地问答P50 3,342 ms、P95 4,288 ms；完整进程树峰值2,850,271,232 B。

## 当前阻塞

唯一一次真实Tauri桌面控制授权在首次窗口状态捕获前超时。按要求未再次申请，也未用浏览器或源码fixture冒充真实桌面点击。因此R2窗口内“阶段1→正常关闭→恢复→中文七阶段→再次关闭→终报恢复”、英文1—3和诊断折叠区的用户视角点击仍需独立控制环境复核；没有观察到新的产品失败。

状态不得写为`ready_for_review`。待桌面控制可用后，使用上述不可变哈希完成一次独立轻量真实Tauri验收；通过后再晋级。R1候选包、Production、main、Vercel和腾讯云均未修改或覆盖。

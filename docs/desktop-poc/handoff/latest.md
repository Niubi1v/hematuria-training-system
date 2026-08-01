# 桌面本地 AI 导师 R3 候选交接

- handoffId：`18e2f1b6-20260801-214538`
- 状态：`blocked_external_ui_control`
- 分支：`codex/hematuria-desktop-mentor-beta-package`
- R3 包内产品 HEAD：`8030240eeb459872bca85e056860917e211a5e96`
- 交接前已验证仓库 HEAD：`014fea46293205cb0c6949888277a56063251657`
- `data/**`：零差异

## R2 污染根因与 R3 状态权威

Tauri identifier 为 `cn.hematuria.training.desktop`，WebView2 user-data 位于 `C:\Users\admin\AppData\Local\cn.hematuria.training.desktop\EBWebView`。自定义 `LOCALAPPDATA` 隔离了业务 SQLite，却没有改变固定应用标识对应的 WebView2 目录。首页和病例库通过 `/api/desktop/progress` 读取空 SQLite；病例页却先读取 `attempt-pointer-v3`、`attempt-v3` 和旧 session token。SQLite load 返回404后，旧完成快照仍留在 React 状态，token恢复/初始化又使用旧 attemptId，随后 autosave 将旧阶段7写入新库。R2测试未把历史真实WebView缓存和独立新SQLite放在同一次真实包启动中。

R3 将 SQLite schema 升为3：每个数据库首次创建时生成稳定 UUID v4 `stateStoreId`，并维护 `serverStateRevision`。`/api/desktop/state/bootstrap`、进度、发现、保存和恢复合同返回 `stateStoreId/schemaVersion/productHead/serverStateRevision`。桌面训练不再从 localStorage/sessionStorage 恢复或写入 attempt、pointer、summary、AI session及token；legacy或未绑定缓存会在发现attempt前清除。服务不可用时fail closed，不回退浏览器训练缓存。首页、病例库和病例页统一以SQLite发现接口为权威，只有显式 `init-attempt` 能创建attempt。

## 冲突矩阵与报告展示

- A旧缓存+新SQLite：自动化通过；真实R3根启动器在中文空格路径启动，创建新 `stateStoreId=5cb45132-9150-48a6-8cec-aaf01fb7a849`，控制超时前数据库仍为attempts=0、snapshots=0。
- B空缓存+SQLite完成、C双向冲突、D升级/路径变化、E三次重启：SQLite/sidecar/Playwright与幂等合同通过；真实Tauri用户视角链因唯一一次控制授权超时未完成，不作通过声明。
- 最终报告按轨迹结构类型化映射8个内部action键；中文生成、恢复及打印DOM通过，双语映射单测通过。没有使用全局词语删除，内部评分关联未变。

## 医学、离线AI与门禁

医学结果保持：source projection应用4、撤回62、拒绝121、等待医学审核1023、医学冲突1；P001血常规等待审核且不参与诊断/评分，尿常规只显示一次“红细胞 5562个/μl”，timeline无空壳，`data/**`零差异。

规则fallback验收完成P001中文七阶段、重启终报恢复、P001英文和P003零轮、持久幂等，云请求0。本地Qwen3‑1.7B真实16轮中15轮为`local_ai`，1轮治理冲突如实`rule_fallback`；`llamaServerReady=true`、`localModelReady=true`、`cloudRequestCount=0`，未运行4B。

TypeScript、ESLint、Next 82页、Tauri release、NSIS、限定Playwright 3项、axe、Data Agent、evidence graph、SQLite/sidecar生命周期、包/仓库秘密扫描均通过。解压树88文件、1,416,382,709 B，秘密命中0、禁用文件命中0。

## R3产物

目录：`D:\HematuriaDesktopArtifacts\MentorLocalAI-FinalCandidate-R3`

| 产物 | 大小 | SHA-256 |
|---|---:|---|
| `HematuriaTraining-Mentor-LocalAI-FinalCandidate-R3.zip` | 1,311,871,990 B | `3609a3b2056003c43ea32057371ff51c38028dce9363e6cf69c4a2cac5de7f87` |
| `HematuriaTraining-Mentor-LocalAI-Setup-R3.exe` | 32,474,434 B | `f6f13507d0322dbf25fae32e8e556527ed833291fabec46f4d74fc4d7707dace` |
| `HematuriaTraining-Mentor-LocalAI-Portable-R3.zip` | 51,232,175 B | `c756fd2283fdb87d230607916f798a740b34af5cba1adea1761cb8ecab0fc1e4` |
| `Model\Qwen3-1.7B-Q4_K_M.gguf` | 1,282,439,264 B | `d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5` |

## 当前阻塞

根启动器成功显示唯一真实Tauri窗口，但第一次窗口状态捕获的桌面控制授权超时。按要求没有第二次申请，也没有用浏览器、localStorage fixture或源码服务冒充真实桌面自验。随后向本轮唯一Tauri进程发送正常关闭请求，候选路径关联进程残留为0。没有观察到新的产品失败，但五组真实Tauri冲突/重启和恢复终报用户视角链未完成，因此状态不得写`ready_for_review`。

待桌面控制可用后，只需针对上述不可变R3哈希做一次独立轻量真实Tauri复验。R1/R2、Production、main、Vercel和腾讯云均未修改或覆盖。

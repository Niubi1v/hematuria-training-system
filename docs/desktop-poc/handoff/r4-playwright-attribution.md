# R4 Playwright 发布门禁归因

## 结论

R4 干净环境完整四 worker 门禁复现为 `74 passed / 30 failed / 12 skipped`。相同代表失败集合在 1 worker 与 4 workers 下均为 `9 failed / 2 errors / 1 skipped`，R3 基线在相同环境下也是 `9 failed / 2 errors / 1 skipped`。因此没有 R4 新增产品回归，也没有 worker 并发、端口、SQLite、attempt store、服务启动或执行顺序根因；30 项均来自 R3 已存在的陈旧 Playwright 合同。

两轮限定测试修复后，代表集合由 `18 passed / 11 failed / 3 skipped` 收敛为 `27 passed / 2 failed / 3 skipped`。剩余两项是同一测试在 desktop/mobile 项目中仍寻找已不存在的“清除搜索与筛选”按钮。按两轮上限停止，发布门禁仍为 `blocked_test_gate`。

## 支持环境与命令

- Node：`22.14.0`，来自 `src-tauri/resources/runtime/node/node.exe`
- Playwright：`1.61.1`
- projects：`desktop-chromium`、`mobile-chromium`
- workers：完整门禁 `4`；归因对照 `1` 与 `4`
- 基础命令：`node node_modules/@playwright/test/cli.js test --workers=4 --reporter=line,junit`
- 外部受控服务：`node node_modules/next/dist/bin/next dev -H 127.0.0.1 -p <unique-port>`
- `TRAINING_ATTEMPT_STORE_MODE=memory`
- `TRAINING_DEPLOYMENT_TIER=practice`
- `PLAYWRIGHT_EXTERNAL_SERVER=1`
- 每轮使用全新 `LOCALAPPDATA`、SQLite 路径、测试输出目录和唯一端口；未使用用户真实状态。

## 30 项失败矩阵

| 失败簇 | 数量 | projects | 第一个失败步骤 / 错误类型 | 归因 |
|---|---:|---|---|---|
| 已移除的 360 原始分 DOM | 2 | desktop、mobile | 查找 `raw-360-details`；locator missing | 陈旧断言；公开报告只应有百分制且不得泄露 360 合同 |
| 临床报告数量、审核状态与文案 | 10 | desktop、mobile | 期望 3 个 report card，实际 1 个；旧英文/状态文本缺失 | 陈旧断言；尿常规返回，血常规及影像等待医学审核并排除诊断、治疗和评分 |
| 病例库公开标签、存储提示与搜索名称 | 6 | desktop、mobile | 旧 heading、旧 textbox accessible name、旧提示缺失 | 陈旧断言；公开卡仅展示病例号、年龄、性别和进度，不展示主诉 |
| 初始化与患者服务状态 | 4 | desktop、mobile | 旧初始化按钮/旧连接文本缺失 | 陈旧断言；现合同为 `stage-preparing-state` 与自然准备状态 |
| 语音准备状态 | 4 | desktop、mobile | 控件因未建立测试训练状态而 disabled | 测试准备缺失；补齐现有训练 API mock，不修改 UI |
| fallback 与网络恢复提示 | 4 | desktop、mobile | 旧安全降级/恢复提示缺失或等待超时 | 陈旧断言；现合同使用自然降级文案，联网后可直接继续问诊 |

错误分类汇总：初始化失败 `0`、真实 API 失败 `0`、状态污染 `0`、端口冲突 `0`、worker 并发冲突 `0`、真实产品回归 `0`；陈旧断言/测试准备缺失 `30`。

## 单 worker / 四 worker 对照

代表集合覆盖六个失败簇，共 12 个 project/test 实例：

- 1 worker：`9 failed / 2 errors / 1 skipped`，141.198 秒
- 4 workers：`9 failed / 2 errors / 1 skipped`，64.431 秒
- 两次失败集合和首个失败步骤一致；端口残留均为 0
- 使用 memory attempt store；SQLite 隔离路径未被该套件用作 attempt store

## R3 / R4 基线对照

- R4 产品 HEAD：`e2ea82e908b46f241fe955b3eb3b0391617267dc`
- R3 基线：`4c31bd547437270b08572218ef8f36052a401338`
- R3 相同代表集合、相同 Node/Playwright/env/4 workers：`9 failed / 2 errors / 1 skipped`，66.637 秒
- R3 临时 worktree 已验证干净并安全移除
- R3 到 R4 只修改 6 个运行审计/打包文件，未修改 Playwright 测试、UI 或医学数据

## 两轮限定修复

只修改：

- `tests/e2e/42-bilingual-stage-flow.spec.mjs`
- `tests/e2e/practice.spec.mjs`

修改内容限于稳定公开语义、现有 test id、医学审核隔离断言和测试状态准备；未删除测试、未增加 skip、未增加 sleep、未放宽医学/隐私断言、未修改产品或打包输入。

- 第 1 轮：`18 passed / 11 failed / 3 skipped`
- 第 2 轮：`27 passed / 2 failed / 3 skipped`
- 剩余：`case catalog search has a recoverable empty state` 在 desktop/mobile 中寻找旧“清除搜索与筛选”按钮

## 发布判断

产品 HEAD 与 R4 产物 SHA 均不变，不生成 R4.1。由于两轮后仍有 2 项代表测试失败，未运行修复后的完整门禁，状态保持 `blocked_test_gate`，不得进入独立真实 Tauri 验收或导师发布。

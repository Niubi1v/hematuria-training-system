# 自主审阅结果

状态：完成。指标冻结于 2026-07-20。

## 基线

- Production HEAD：`657ba5da8fc6460ad7d0deea882a010c40938b40`
- PR #1：Draft；HEAD 与 Production HEAD 一致。
- 远程 CI：GitHub Pages run `29672644854` completed/success；Vercel checks success。
- 初始工作树：clean；`data/**`：无未提交差异。

## 覆盖与结果

| 范围 | 状态 | 结果/证据 |
|---|---|---|
| 首页与病例库 | 完成 | 四视口无横向滚动；病例目录患者化并保留冲突待审状态 |
| P001–P042 中英文路由 | 完成 | 72 个唯一病例 route ID HTTP 72/72；静态构建 82/82 |
| Patient Agent 同义矩阵 | 已完成首轮 | 优先自然问法修复前 42/1008，修复后 1008/1008；完整矩阵 3150/3150；known 1370，正确 unknown 1715，错误 unknown 0，极性错误 0，双语事实一致，冲突隔离 65 |
| 主诉与开场白 | 完成 | 修复无依据“数天”、无标记新增血尿、英文首次加载中文开场；P019/P020 为 `BLOCKED_MEDICAL` |
| 第一阶段与七阶段 | 完成 | practice 68/68；84 个中英完整旅程、588 feedback、84 份 360 分报告 |
| 安全与恢复 | 已完成首轮 | 修复 1 个 P2 输入边界；未发现未解决 P0/P1；provider 前拒绝、重放/隔离、Redis fail-closed 与日志/Preview 输出专项通过 |
| 桌面与移动端 | 完成（受限） | 1440×900、1280×720 PASS；390×844、360×800 `PASS_EMULATION`；真机软键盘/safe-area 为 `BLOCKED_REAL_DEVICE` |

## 最终摘要

- 起始 Production HEAD：`657ba5da8fc6460ad7d0deea882a010c40938b40`。
- 专项代码最终 HEAD（报告提交前）：`6ec6c8b`；包含报告与证据的分支最终 HEAD 由 push 后交付信息记录。
- 审阅范围：首页、病例库、42 个展示病例、72 个唯一病例 route ID、82 个静态页面、双语 Patient Agent、七阶段、360 分、session/attempt、安全、语音与多视口。
- 缺陷：P0=0；P1=5（自动修复 4，`BLOCKED_MEDICAL` 1）；P2=2（自动修复 2）。自动修复合计 6。
- `BLOCKED_MEDICAL`：2 个病例（P019/P020，合并为 1 个双语来源冲突缺陷）；既有 HEM-P0-001、HEM-P0-023、419 条事实、161 个来源修订、42 例 needs_revision 与专家终签继续保留，不计为本轮新发现。
- Patient Agent：canonical 3150/3150（100%）；新增优先自然问法 1008/1008（修复前 42/1008）；错误 unknown 0/1370（0%）；极性错误 0/1370（0%）；正确 unknown 1715；双语事实漂移 0；冲突隔离 65。
- 安全：未发现未解决 P0/P1；session 越界字段/超长幂等键已拒绝；安全拒绝保持 `providerCalls=0`；重放、跨病例/语言、阶段绕过、重复计分、Redis fail-closed、CORS/限流/provider fallback 与日志脱敏门禁通过。
- 真机：`BLOCKED_REAL_DEVICE`（真实软键盘与 safe-area）；未把模拟结果升级为真机结论。

## 测试与退出码

- Patient/同义矩阵、history、safe projection、chief complaint、Agent/session/security/attempt：10 项批量命令全部 exit 0。
- 其余结构/医学治理/七阶段/360/语音/API/工作簿：37 项门禁中首次 profile 报告因 CRLF 误报 exit 1，修复门禁后该项 exit 0；其余全部 exit 0。
- 医学治理证据：42 例、572 pending facts、419 pending expert decisions、HEM-P0-023/18 双语冲突隔离、360 分规则均通过且未改医学真值。
- TypeScript `tsc --noEmit`：exit 0；ESLint：exit 0。
- Playwright：practice 桌面+移动 68/68 exit 0；42 双语七阶段矩阵 exit 0；本轮再验两项新场景桌面+移动 4/4 exit 0。一次以 `PLAYWRIGHT_EXTERNAL_SERVER=1` 运行因本地服务已退出而 exit 1，改用受控 managed server 后通过，非产品失败。
- 标准 build：首次未注入必需的测试 API 基址 exit 1（安全 fail-closed）；使用 `https://api.example.test` 后 82/82 exit 0。
- GitHub Pages basePath build：82/82 exit 0。
- bundle scan：25 个 JS 资产，exit 0；repository secret scan：339 个 tracked/candidate 文件及历史/归档元数据，exit 0；`data/**` diff exit 0；`git diff --check` exit 0。
- 本地运行时为 Node 24.14.0；仓库声明/远程 CI 使用 Node 22，最终远程分支 CI 状态在 push 后核验。

## 提交与选择性合入建议

- `43d6535`：Patient Agent 口语/双语 canonical 路由；建议主 Goal 优先 cherry-pick。
- `ae58b3d`：患者化主诉、冲突待审展示和首次英文开场竞态；建议整体 cherry-pick。
- `8ac5721`：session 公共请求边界；建议独立 cherry-pick。
- `6ec6c8b`：跨平台患者资料报告门禁；建议随测试基础设施 cherry-pick。
- 报告/证据提交仅用于审计，可不进入产品运行时。

长期 QA 建议固定复测：3150 问法大矩阵 + 1008 优先口语矩阵；P019/P020 医学裁决后双语主诉/事实一致性；英文偏好直达与刷新；42×双语七阶段；390/360 真机软键盘与 safe-area；session 越界字段、重放和 providerCalls=0。

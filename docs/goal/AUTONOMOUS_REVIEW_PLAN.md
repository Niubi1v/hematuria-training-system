# 自主审阅与优化计划

状态：已按本专项边界完成；剩余仅医学终审、真机与正式发布权限。

## 基线与治理边界

- 来源分支：`origin/codex/hematuria-production-goal`
- 起始 Production HEAD：`657ba5da8fc6460ad7d0deea882a010c40938b40`
- 基线核验日期：2026-07-20（Asia/Shanghai）
- 基线状态：远程与预期 SHA 一致；PR #1 为 Draft；最新 GitHub Pages 与 Vercel 检查通过；工作树及 `data/**` 无差异。
- 专项分支：`codex/hematuria-autonomous-review-optimization`
- 医学边界：不修改 `data/**` 医学事实、极性、病程、诊断、检查结果、评分规则或审核状态；冲突与 `needs_review` 只记录为 `BLOCKED_MEDICAL`。

## 执行矩阵

| 工作流 | 覆盖范围 | 证据 | 完成条件 |
|---|---|---|---|
| Patient Agent | P001–P042；中英文；canonical、alias、否定、选择、复合问句 | 矩阵输出、失败测试、专项日志 | 已知事实 unknown=0，极性错误=0，冲突保持 unknown |
| 患者语言 | 42 例主诉、开场白、目录摘要 | 逐例审阅表、原文与变更依据 | 不杜撰时间/极性；镜下、肉眼、特殊尿色不混淆 |
| 七阶段体验 | 首页、病例库、82 条病例路由、阶段 1–7、评分与刷新重连 | Playwright、浏览器截图/trace | 无 404、绕过、重复提交与敏感泄露 |
| 多视口 | 1440×900、1280×720、390×844、360×800 | 浏览器/Playwright | 桌面 PASS；移动模拟仅记 `PASS_EMULATION`；真机为 `BLOCKED_REAL_DEVICE` |
| 工程安全 | session/attempt、token、CORS、限流、大小、重放、provider、日志、Redis | 安全测试、扫描日志 | 安全拒绝 `providerCalls=0`；无跨病例/语言污染 |
| 完整门禁 | 结构、事实、审核约束、阶段、360 分、TS/ESLint/build/bundle/secrets | 命令与退出码 | 受影响专项及整批门禁通过，`data/**` 零差异 |

## 优先顺序

1. P0/P1 安全与核心流程。
2. 已知事实错误 unknown、canonical 漏匹配和极性错误。
3. 患者主诉、开场白与双语一致性。
4. 第一阶段、七阶段与移动端核心操作。
5. 有明确复现和回归断言的 P2。

## 修复循环

每项执行：独立复现 → 失败测试 → 根因 → 最小修改 → 专项测试 → 受影响回归 → diff/敏感扫描 → 小步提交。相同根因假设连续失败两次即停止盲改并记录。

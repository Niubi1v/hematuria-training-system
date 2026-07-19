# Agent B：UI、第一阶段与七阶段流程自主审阅

## 范围与结论

- 审阅范围：首页、病例库、P001–P042 路由与七阶段流程、中文/英文切换、第一阶段提交、刷新恢复、快速双击、history-log、评分、查体、检验/检查、AI/语音降级、错误/加载/空状态和可访问性。
- 固定视口真实浏览器检查：1440×900、1280×720、390×844、360×800。
- P001–P042 × 中文/英文 × 七阶段矩阵完成：84 个完整训练旅程、588 次阶段反馈、84 次 360 分评分，全部成功。
- P0：0；P1：2（均已最小修复并回归）；P2：0。
- 自动移动端结论仅为 `PASS_EMULATION`；真实软键盘、iOS/Android safe-area 为 `BLOCKED_REAL_DEVICE`。
- 未修改 `data/**`，未裁决或解除任何医学审核状态。

## 缺陷记录

### UI-P1-001：英文偏好直开病例时患者开场白短暂/持续为中文

- 优先级：P1
- 页面/病例：`/cases/P034/`（内部病例 ID `HX-ADD-022`）；同根因影响全部病例。
- 语言：英文。
- 操作步骤：先将语言偏好设为 `en`；在 360×800 视口直开 `/cases/P034/`；读取模拟患者对话及 session-init 请求。
- 预期：HTML/UI、患者开场白和 session-init 均为英文，且只初始化一次英文 session。
- 实际：修复前页面和 `html[lang]` 已为英文，但初始患者消息为中文“医生您好，我是因为反复尿检发现潜血伴听力下降来看病的。”；复现 1/1。
- 根因：组件首轮以硬编码 `zh` 初始化消息和 session；随后读取 localStorage 改为 `en` 时，`setMessages(current => current.length ? current : ...)` 保留了已有中文开场白，且 session effect 未等待 attempt/language 恢复完成。
- 证据：新增 E2E `saved English preference initializes one English patient session and opening`；修复后桌面、移动各 1/1 通过，仅观察到一个 `{ caseId: HX-ADD-022, language: en }` session-init。
- 自动修复：是。消息初始化和 AI session 初始化均等待 `attemptReady`，未增加重试。
- 医学专家：否。
- 修改/回归范围：`src/components/ClinicalTrainingClient.tsx`；回归语言切换、attempt 绑定、刷新、session 初始化、第一阶段提交。

### UI-P1-002：病例库绕过患者化主诉格式化器，机械英文/冲突英文直接展示

- 优先级：P1
- 页面/病例：`/cases/`；P013、P019、P020（同根因覆盖 P001–P042 卡片）。
- 语言：中文与英文。
- 操作步骤：打开病例库，切换 English；查看 P013/P019/P020 卡片。
- 预期：P013 显示患者化的 `Intermittent red urine for 2 months`；P019/P020 的中文 source 未出现血尿标记而英文 fallback 声称 Hematuria 时，不应把冲突内容展示为已确认事实。
- 实际：修复前卡片直接读取 `chiefComplaintEn`；P013 为机械 `Hematuria for 2 months`，P019/P020 分别错误显示 `Hematuria for 3 days` / `Hematuria for 2 days`；复现桌面、移动各 1/1。
- 根因：`CaseCatalogClient` 未复用 `simplifiedChiefComplaint`；冲突数据的 fallback 未经过展示治理。
- 证据：新增 E2E 在 P013 断言患者化英文，在 P019/P020 断言 `Chief complaint pending medical review`；桌面、移动共 4/4 通过。
- 自动修复：是（展示层接入格式化器）；冲突本身不自动裁决。
- 医学专家：是，P019/P020 中英文 source 冲突保持 `pending medical review`。
- 修改/回归范围：`src/components/CaseCatalogClient.tsx`、病例库搜索与双语卡片；不改病例事实。

## 真实浏览器与视口结果

| 视口 | 首页 | 病例库 | P001 训练页 | 横向滚动 | 结论 |
|---|---|---|---|---|---|
| 1440×900 | PASS | PASS | PASS | 无 | 桌面输入区 sticky，未遮挡对话 |
| 1280×720 | PASS | PASS | PASS | 无 | 桌面低高度仍可滚动访问全部区域 |
| 390×844 | PASS_EMULATION | PASS_EMULATION | PASS_EMULATION | 无 | 输入区进入移动端文档流 |
| 360×800 | PASS_EMULATION | PASS_EMULATION | PASS_EMULATION | 无 | 病例库卡片单列，无横向溢出 |

截图证据：

- `work/ui-P001-1440x900.png`
- `work/ui-P001-1280x720.png`
- `work/ui-P001-390x844.png`
- `work/ui-P001-360x800.png`

真实设备限制：未连接真机，软键盘弹起、刘海/圆角屏和 safe-area 动态变化记为 `BLOCKED_REAL_DEVICE`，不得升级为真机 PASS。

## 流程、降级与可访问性

- 第一阶段：提交后解锁下一阶段；中英切换使用独立 attempt/session；刷新恢复当前阶段；快速双击只产生一次反馈和一次 timeline submit。
- 七阶段：42 病例中英双语完整通过；查体、检验/检查、诊断、MDT、治疗、围术期、复盘和最终 360 分报告均完成。
- history-log：AI 回复先显示；同步 pending/verified/失败手动重试均为单一状态提示；刷新复用同一 requestId；20 轮手动上翻不会强制拉底，新消息按钮可回到底部。
- AI 降级：session 初始化失败不破坏已 ready 的训练 attempt；规则 fallback 保留重连入口；离线不发送请求，恢复 online 后可重连。
- 语音：自动 voice profile 与性别/年龄/语言一致；云 TTS 失败可见地降级浏览器 voice。真实麦克风权限和真机语音识别未验证。
- 空状态：病例库无结果可恢复并提供清除筛选；加载/错误状态未堆叠。
- 可访问性：现有 axe 覆盖首页、病例库、训练页，无 serious/critical 违规；键盘可访问的主要输入、按钮和阶段导航通过 E2E。
- 页面/路由：病例库包含全部 42 个展示 ID，代表路由刷新通过；完整七阶段矩阵逐一打开 P001–P042，无 404。82 页静态构建由主 Agent 的统一构建门禁覆盖。

## 测试命令与退出码

1. `playwright test tests/e2e/practice.spec.mjs --project=desktop-chromium --project=mobile-chromium --workers=1`：退出码 0，68/68 通过（涵盖第一阶段、双击、刷新、history-log、输入遮挡、无横向滚动、a11y、语音和 AI 降级）。
2. `playwright test tests/e2e/42-bilingual-stage-flow.spec.mjs --project=desktop-chromium --project=mobile-chromium --workers=1`：退出码 0，2 通过、2 按项目条件跳过；桌面完成 42×2 七阶段矩阵，移动完成 P001 英文代表旅程。
3. `playwright ... --grep 'case catalog switches public complaint language|saved English preference initializes one English patient session and opening'`：退出码 0，4/4 通过。
4. `tsc --noEmit`：退出码 1；当前复用的本地依赖目录缺少 `xlsx`，错误集中在既有 workbook/RCT 文件的模块解析，未出现本次两个组件的类型错误。此项需由主 Agent 在完整依赖环境复跑，不标记为产品回归失败。

## 修改文件

- `src/components/CaseCatalogClient.tsx`
- `src/components/ClinicalTrainingClient.tsx`
- `tests/e2e/practice.spec.mjs`
- 本报告与四张 `work/` 截图

未提交、未 push；交由主 Agent 统一审查、集成与提交。

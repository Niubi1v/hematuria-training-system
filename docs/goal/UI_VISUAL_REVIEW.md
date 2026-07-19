# UI 自动视觉审查

状态：长期执行中；当前 Production 文档基线为 `657ba5da8fc6460ad7d0deea882a010c40938b40`，运行时 UI 证据基线为代码等价的 `3a16f9314d1b3cf50e30bc41dcfeaf19f4fa77a8`。

## 固定视口与页面

| viewport | 首页 | 病例目录中/英 | P001 训练页 | 20 轮恢复后 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1440×900 | PASS | PASS | PASS_EMULATION | PASS_EMULATION | HEM-P1-027/029/033/034 本地定向通过 |
| 1280×720 | PASS | PASS | PASS_EMULATION | PASS_EMULATION | HEM-P1-027/029/033/034 本地定向通过 |
| 390×844 | PASS | PASS | PASS_EMULATION | PASS_EMULATION | HEM-P1-027/029/033/034 本地定向通过；真机阻塞 |
| 360×800 | PASS | PASS | PASS_EMULATION | PASS_EMULATION | HEM-P1-027/029/033/034 本地定向通过；真机阻塞 |

## 判定项

- 无横向滚动、遮挡、固定元素覆盖或屏外主操作。
- 中英文标题、按钮、状态标签和长文本不截断。
- 移动端输入可见、触控可用；快速双击不产生重复轮次。
- ready/degraded/reconnecting/fallback 来源显示不混淆。
- 截图只展示公开病例信息与脱敏 fixture；不输出密钥、签名、Cookie 或 Authorization。

## 首轮视觉结论

- 24 张自动截图已保存；首页、目录中/英及训练页均无水平滚动。
- 1440×900 和 1280×720 的聊天与输入层级清楚；390×844 的开场白完整位于输入面板上方。
- 360×800 的 sticky composer 与开场文字稳定重叠 19px，自动化复现 6/6，登记 HEM-P1-027。Git 最小证据保留 360×800/390×844 对照截图和定向失败 trace；录像仅本机保留。
- 本轮截图先显式切回中文后再保存训练页，避免目录英文状态通过 localStorage 污染中文证据。

## 2026-07-14 第二轮视觉与可访问性

- P001 完整七阶段 fixture 在 `1440×900` 与 `390×844` 完成并保存终末 360 报告截图。查体/生命体征、检验、影像、内镜、病理、诊断、处理、围术期和八维进度条均正常渲染；结果仅代表 fixture UI。
- 四个规定 viewport 分别对首页、病例目录和 P008 训练页运行 axe，共 12 次页面扫描；serious/critical violation 为 0。
- HEM-P1-027 未收到源分支修复，不重复旧基线 6/6，也不把 360×800 训练页改写为通过。
- 新发现 HEM-P2-028：`1440×900` 快速双击阶段提交后，右侧时间线出现两条内容相同的“提交阶段：30/50”；失败截图与关闭截图帧的 12,363 字节最小 trace 进入 Git，视频仅本机保留。
- 新增通过截图和 a11y/七阶段 trace 均为可重建或重复证据，不进入 Git；详见证据索引。

## 2026-07-14 第三轮真实本地 API 视觉复核

- QA worktree 通过本地 Next 3010 + Vercel handler adapter 3001 连接真实 `session/init` 与 `agent-chat` 代码；AI 显式关闭，training-action 仅作脱敏状态 stub。不是 Preview 或真实 DeepSeek。
- HEM-P1-029：P001 切换 English 后，标题、按钮、病例信息均为英文，但首条 standardized patient 消息保持中文。四 viewport 4/4，1440×900 另有重复复跑；截图直接显示同屏语言错配。
- HEM-P1-033：P004 提交“有血块吗？”后，公开 API 返回教师元语言；前端安全层将其替换为“请问具体一点”的泛化答复。四 viewport 4/4；390×844 代表截图显示提交后的泛化患者答复，页面无新增水平溢出。
- 两个场景均保存四 viewport 的自动截图、trace 和失败录像。最终清洁复跑关闭自动语音，每份 console 仅 1 条正常连接状态 info、0 warning/error，关键 document/session/agent-chat/training-action 均 200；network 摘要没有 header、query、body 或签名。
- 新问题属于语言/患者内容与收集状态，不改变此前首页、目录、七阶段布局和 axe 结论。360×800 的 HEM-P1-027 仍单独 OPEN，不能因本轮页面可操作而改写为通过。

## 2026-07-14 第四轮新安全基线视觉复核

- 在 Production `96fcf80` 上，HEM-P1-029 与 HEM-P1-033 再次于四固定 viewport 各 4/4 复现；代表截图已刷新，页面视觉现象与规则矩阵一致。
- 新增 HEM-P1-034：默认中文会话加载成功后点击 English，四 viewport 均进入英文界面但英文 session 初始化返回 401 / `invalid_attempt_token`。失败截图、trace、录像、console/network 均自动保存；Git 仅保留一张代表帧。
- HEM-P1-027 定向回归中，`390×844` 仍通过，`360×800` 当前开场底边 `661`、composer 顶边 `654`，重叠 7px。旧基线 19px/6 次证据不删除；新结果说明遮挡缩小但未消失，状态仍为 OPEN。
- HEM-P2-028 在 `1440×900` 仍显示两条相同阶段提交时间线；新基线观测继续是 `2/2/2`，没有幂等修复证据。
- 新 live trace 内浏览器只持有 QA 脱敏占位符；完整训练签名与 session capability 不进入页面、截图、trace、console 或 network 摘要。
- 后续 `52c2432` 只更新 secret scanner/审计文档，无 UI/API/data 运行时代码差异；因此保留上述四 viewport 结论，不重复生成相同截图和大 trace。

## 2026-07-14 第五轮 `ff1a932` 优先视觉回归

- Production 定向 E2E 8/8 通过；本地真实 handler 浏览器文件最终 28/28 通过。HEM-P1-027 单独覆盖中文/英文 × 四固定 viewport 的开场布局和手动上翻，共 16/16 `PASS_EMULATION`。
- `360×800` 与 `390×844` 的患者开场白完整可见；composer 聚焦后仍在视口内；最后一条消息不被输入区遮挡；手动上翻后新消息不强制回底；“有新消息”入口出现并可回到底部；四 viewport 均无横向滚动。移动端没有出现异常底部 spacer。
- HEM-P1-029 的英文开场、HEM-P1-033 的患者输出隔离、HEM-P1-034 的中英切换分别在四固定 viewport 各 4/4 `PASS_EMULATION`；安全能力矩阵另为 19/19。
- 本轮截图来自 headless Chromium 设备模拟。没有真实手机，因此软键盘顶起行为与物理 safe-area 明确标记 `BLOCKED_REAL_DEVICE`，不冒充真机通过。
- 本地病例直接 URL、刷新与中英文 UI 为 42/42 通过；病例目录 `.html` 链接在 Next dev 为 42/42 404（HEM-P2-043）。GitHub Pages 因基线不匹配阻塞，精确 SHA Vercel Preview 因登录保护阻塞，未用本地成功替代远程环境结论。
- 继续执行后，HEM-P2-028 在 `1440×900` 仍显示两条同阶段提交时间线，`ff1a932` 实测继续为 `2/2/2`（1/1）；其失败截图与最小 trace 已刷新，状态保持 OPEN。

## 2026-07-17 第六轮 `8e7d148` 视觉回归

- 完整本地 Playwright desktop/mobile 为 68/68；四固定 viewport × 中英文的 composer/开场布局继续 `PASS_EMULATION`，输入聚焦在模拟 640px 视觉高度仍在视口内，无横向溢出。
- 英文 20 轮场景在手动上翻后不会强制回底，“New message · go to latest”入口出现并能回到底部，最后答复底边不超过 composer 顶边；中文 390×844 的独立 20 轮/双击/刷新探索场景也通过。
- HEM-P2-028 当前探索场景为 `1/1/1`，七阶段/360 报告在 1440×900 与 390×844 为 2/2；旧重复提交失败截图与 trace 保留，不被本次 PASS 输出覆盖。
- 严重/致命 axe 违规为 0；TTS 云端失败可见降级到匹配的浏览器 voice。本轮仍无真实手机，软键盘和物理 safe-area 明确 `BLOCKED_REAL_DEVICE`。
- 真实 GitHub Pages 在 1440×900 与 390×844 都显示 42 张卡片，但只有 12 个 P001–P012 显示 ID 路由、30 个旧内部 ID 路由。失败帧只证明公开部署不匹配；本地源码/Pages basePath 仿真通过不能代替部署。

## 2026-07-19 第七轮 `3a16f931` 视觉、键盘与语音回归

- Production 完整本地 Playwright desktop/mobile 为 70 passed / 2 互斥 skip / 0 failed；四固定 viewport 的双语七阶段、最后消息与 composer 几何、手动上翻/新消息入口、无横向溢出继续 `PASS_EMULATION`。新增独立 HEM-P2-044 探针的移动失败另列；HEM-P1-027 没有重新打开，真实手机软键盘和物理 safe-area 仍为 `BLOCKED_REAL_DEVICE`。
- 新增 QA-only 可访问性/语音场景：桌面 `Shift+Enter`、`Enter`、正反向 Tab、可见焦点、Escape 关闭与 reduced-motion 为 2/2；浏览器语音播放、暂停、继续、停止、重播、快速重复、客户端切病例与刷新为四 viewport 4/4。测试使用脱敏本地 fixture，`providerCalls=0`，不宣称云 TTS 成功。
- 新发现 HEM-P2-044：`390×844` 与 `360×800` 均复现四个不足 44×44 CSS px 的语音触控目标——入口 `106×38`、关闭 `26×28`、试听 `75×38`、停止 `34×38`。最小证据为 `screenshots/hem-p2-044-touch-targets-390x844-failure.png` 与聚合 JSON；状态 `FAIL_EMULATION`，真实设备仍阻塞。
- 当前 Vercel Preview 的 P001–P042 目录/直接 URL/刷新为 42/42，P999 受控 404；GitHub Pages 仍显示 42 卡片但仅 12 个显示 ID 路由、30 个旧内部 ID，继续 `BLOCKED_DEPLOYMENT_MISMATCH`。两个环境不互相替代。
- Preview 单 session 20 轮刷新后 DOM 对话项由 42 保持 42，证明最终渲染恢复；前两次即时 DOM/折叠状态断言失败属于测试同步，不登记视觉或数据丢失产品缺陷。
- 精确 `657ba5d` Preview 的浏览器history专项通过：P001一轮真实AI后，前进到病例库、后退、再次前进/后退，DOM对话项始终为4，agent/history请求保持1/1；没有旧页面覆盖、重复消息或重复日志。

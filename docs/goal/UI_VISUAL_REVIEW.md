# UI 自动视觉审查

状态：长期执行中；被测 Production SHA `41b3830a9095c692b3fdbe65a3dbf95b7ece5a37`。

## 固定视口与页面

| viewport | 首页 | 病例目录中/英 | P001 训练页 | 20 轮恢复后 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1440×900 | PASS | PASS | PASS | 不适用 | 布局 PASS；HEM-P1-029/033 |
| 1280×720 | PASS | PASS | PASS | 不适用 | 布局 PASS；HEM-P1-029/033 |
| 390×844 | PASS | PASS | PASS | PASS | 布局 PASS；HEM-P1-029/033 |
| 360×800 | PASS | PASS | FAIL | 不适用 | HEM-P1-027/029/033 |

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

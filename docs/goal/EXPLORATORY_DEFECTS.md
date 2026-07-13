# 探索式 QA 缺陷记录

状态：持续更新。已有主 Goal 缺陷沿用原 ID，不重复宣称通过。

## 外部/医学阻塞

| 缺陷 ID | 级别 | 状态 | 范围 | 所需动作 |
| --- | --- | --- | --- | --- |
| HEM-P0-001 | P0 | BLOCKED | 151 条 source 辅助来源语义 | 具名医学负责人裁决与受控迁移 |
| HEM-P0-023 | P0 | BLOCKED | 18 条双语医学极性冲突 | 具名医学/双语专家逐条裁决 |
| HEM-P0-018 | P0 | BLOCKED_REMOTE | Preview AI、日志同步与来源体验 | 登录态 Preview 真实 AI 20 轮及日志证据 |
| HEM-P1-019 | P1 | BLOCKED_REMOTE | Preview 变量作用域 | 仅核对名称/状态；不得读取值；补配由环境 owner 执行 |
| HEM-P1-020 | P1 | BLOCKED_REMOTE | 受保护 Preview API 可审计性 | 具备权限的会话采集脱敏 trace/network |
| HEM-P1-021 | P1 | BLOCKED_REMOTE | 真实首 Token/P95 | 真实 provider 和服务端计时样本 |

## 新发现缺陷模板

每个新问题必须记录：缺陷 ID、P0/P1/P2、页面/路径、病例、语言、viewport、操作步骤、预期、实际、复现次数、AI 来源、状态时间线、HTTP 状态/耗时、console/network 摘要、截图/trace/录像、建议方向和医学裁决需求。首轮执行前不预造缺陷或状态。

## HEM-P1-027：360×800 sticky 问诊输入遮挡患者开场白

- 级别/状态：P1，OPEN；移动端核心问诊内容可读性受损，不阻断其他本地测试。
- 页面/路径：训练工作台 `/cases/P001/`；病例 P001；中文；viewport `360×800`。
- 操作步骤：清空浏览器上下文 → 打开 P001 → 选择中文 → 保持页面首屏且不滚动 → 比较患者开场文字与 sticky 输入面板的几何边界。
- 预期：输入面板顶边不早于开场文字底边，患者开场白完整可见。
- 实际：输入面板顶边 `y=654`；稳定复跑时开场文字底边 `y=673`，重叠 19px；截图中末行被输入面板覆盖。`390×844` 同断言通过。
- 复现：`360×800` 自动化 6/6；其中 `--repeat-each=3` 为 3/3。未在 390×844 复现。
- AI 来源：N/A；页面初始公开开场白，静态同 SHA 构建；不涉及真实 AI、fallback 或医学裁决。
- 时间线：document 200 → 客户端渲染 → 中文状态 → 几何断言失败；没有状态闪烁依赖。
- HTTP/console/network：页面 200；console error 0。静态服务下 `/api/health/` 不可用属于已知本地 API 边界，与遮挡无因果关系。
- 最小提交证据：`screenshots/training-p001-zh-viewport-360x800.png`、`screenshots/mobile-opening-composer-no-overlap-390x844.png`、`traces/mobile-opening-composer-overlap-360x800.zip`。自动 full-page 失败截图、录像与 HTML 报告仅本机保留，详见 `artifacts/exploratory-qa/EVIDENCE_INDEX.md`。
- 建议方向：为移动 chat scroller 增加与 sticky composer 高度一致的底部安全区，或在 360px 宽度降低 composer/标题占高；保留输入首屏可见与 44px 触控目标，并用 360/390 几何断言回归。
- 医学专家裁决：否。

## HEM-P2-028：阶段提交按钮快速双击产生两次独立反馈请求与重复时间线

- 级别/状态：P2，OPEN；造成重复服务器工作与本地审计时间线污染。当前服务端同阶段重提交流程会替换该阶段的验证事件，尚无终末 360 分被重复累加的证据，因此不升为 P1。
- 页面/路径：训练工作台 `/cases/P001/`；病例 P001；中文；viewport `1440×900`。
- 操作步骤：全新浏览器上下文 → 打开 P001 → 选择中文 → 填写脱敏 fixture 病史小结 → 在阶段反馈响应延迟 150ms 时，以同一事件循环连续调用两次“提交本阶段”按钮 → 等待请求队列和本地自动保存完成 → 比较反馈请求数、request ID 去重数和 `timeline[type=submit]` 数量。
- 预期：一次用户双击最多形成 1 个阶段反馈请求、1 个稳定幂等 request ID 和 1 条提交时间线；按钮在请求进行中不可重复触发。
- 实际：稳定得到 2 个 `stage-feedback` 请求、2 个不同 request ID 和 2 条内容相同的提交时间线。失败截图右侧时间线显示两条同阶段“提交阶段：30/50”。
- 复现：自动化 6/6；包含一次首次发现、`--repeat-each=3` 的 3/3，以及两次最小证据复跑。每次观测均为 `2 requests / 2 unique IDs / 2 submit events`。
- AI 来源：N/A；`training-action` 为 `deterministic_fixture_not_real_ai`，不调用患者 AI，不判断医学内容或评分正确性。
- 状态变化时间线：document 200 → fixture attempt 初始化 → 同一按钮同步触发两次 → 客户端队列串行发送两个不同 request ID → 两次 200 响应 → 两次 `addTimeline("submit")` → 几何与内容稳定的重复记录。
- HTTP/耗时：页面 200（3ms）；两次被测 `POST /api/training-action/` 均为 200，在 150ms fixture 延迟下各约 155ms。network 摘要只保留方法、pathname、状态、资源类型和耗时。
- console/network：console 仅 2 条 `ai_connection_transition` info，0 warning/error；network 未保存 header、query 或 body。服务端源码审计确认同阶段重提交会删除并重建该阶段验证事件，故当前没有分数翻倍证据，但客户端使用两个不同 request ID，未利用幂等键合并同一用户动作。
- 最小提交证据：`screenshots/stage-submit-double-click-1440x900-failure.png`（159,310 字节）与 `traces/stage-submit-double-click-1440x900.zip`（12,363 字节，关闭截图帧和源码嵌入）。失败视频、HTML、console/network JSON 和重复 test-results 仅本机保留。
- 建议方向：增加阶段提交 in-flight 状态并在请求完成前禁用按钮；一次用户动作生成并复用稳定 request ID；状态层按 stage/request ID 去重提交时间线。回归应覆盖阶段 1–6、终末报告按钮、桌面/移动端、双击/Enter 和失败重试，且不得删除或放宽当前断言。
- 医学专家裁决：否。

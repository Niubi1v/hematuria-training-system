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
- Chromium后台生命周期仿真也通过：`frozen → active` 后页面恢复visible，原4项对话保留，第二轮后精确增加到6项；输入框可继续操作且没有session/attempt重建。此项不覆盖真实手机操作系统回收、软键盘或safe-area，后者仍`BLOCKED_REAL_DEVICE`。
- P001中文5个样本的患者回答DOM均在完整响应后稳定新增，无重复消息；点击至DOM首现P50 `1315.9ms`、P95 `1527.4ms`。这是headless Chromium DOM可见性计时，不等于真实屏幕绘制或真机感知时间。
- HEM-P1-047在`1440×900`中文、`1280×720`英文、`390×844`中文、`360×800`英文共4/4复现：三张报告卡的状态徽标直接显示`final/not_available/not_performed`，且带受控异常标志的final卡片仍使用普通info图标与`data-status=reported`。focused截图在桌面和移动端均清楚可见；自动viewport仅标`FAIL_LOCAL_QA`，不替代Preview或真实手机。
- HEM-P1-048在四固定viewport的英文P008第2阶段4/4复现：英文标题、导航、占位符与按钮之间，查体分组/按钮、医嘱分组/卡片以及真实本地CBC报告卡仍显示中文；每个viewport自动计得44个CJK控件。`1280×720`全页代表帧同时展示英文壳、中文目录和中文报告，属于`FAIL_LOCAL_QA`，不冒充Preview或真机。

## 2026-07-23 `70ea9b3` 四视口复核

- HEM-P1-027 的开场布局按中文/英文×`1440×900`、`1280×720`、`390×844`、`360×800` 重跑 8/8；患者开场完整可见、composer 在视口内、无横向滚动，移动端不出现异常底部 spacer。
- 手动上翻/新消息入口按同一 8 个组合重跑 8/8：新增消息不强制回底，“有新消息/New message”入口可见并可回到底部，最后一条消息底边不超过 composer 顶边。Production 自带输入区几何/多行输入回归另为 4/4。
- 自动 Chromium 结果标记 `PASS_EMULATION`。没有真实手机，因此软键盘顶起、浏览器地址栏动态高度与物理 safe-area 继续 `BLOCKED_REAL_DEVICE`，不冒充真机通过。
- P001 七阶段最终报告在 `1440×900` 与 `390×844` 2/2 显示，7 个阶段进度与 360 分制完整；本轮 fixture 得分 220/360，仅验证渲染与幂等，不评价医学得分。
- 开场布局首次重跑因 QA 脚本漏装本地脱敏 session fixture，在证据阶段等待超时；补齐同一 fixture 后 8/8 通过。该事件登记为 QA 基础设施修正，不计产品布局失败，也未放宽业务断言。
- 既有 HEM-P1-046/047/048 在 `1440×900` 各 1/1 仍失败；HEM-P2-044 触控目标保持开放。当前 QA 没有修改任何 Production 组件或样式。

## 2026-07-23 `c4ac9b5` UI 与移动模拟复核

- Production practice desktop/mobile完整78/78；输入区多语言多viewport测量、无横向滚动、Enter/Shift+Enter、焦点、状态提示、手动滚动/新消息、20轮与刷新恢复均通过。四固定viewport结论继续标记 `PASS_EMULATION`。
- 全42例双语七阶段长测为2个实际项目通过、2个项目互斥skip：desktop完成84条中英文旅程与84份360分报告，mobile完成1条代表七阶段旅程。没有以单一代表截图替代全量协议计数。
- Data Agent英文无CJK、未审核名称禁用、28项元数据安全文案和异常优先级在desktop/mobile共6/6；但服务端评分绕过登记HEM-P1-052，不能因UI禁用而写成完整通过。
- Preview P001刷新/双击、P003零轮和Chromium后台恢复通过；真实手机软键盘、动态地址栏、物理safe-area及后台策略仍为 `BLOCKED_REAL_DEVICE`。本轮没有新增视觉P0/P1；既有HEM-P2-044触控尺寸未由这些流程断言自动关闭。

## 2026-07-24 `c4ac9b5` 幂等与触控目标复核

- HEM-P2-028桌面同一测试进程重复6/6，另在`1440×900`和`390×844`代表批2/2通过；每次同步双击在150ms延迟下均满足1 request、1 request ID、1 timeline event。状态继续`RESOLVED_LOCAL_QA`。
- HEM-P2-044在`390×844`与`360×800`仍2/2失败，四个尺寸与历史完全一致：106×38、26×28、75×38、34×38 CSS px。未生成新的Git代表截图，既有最小帧足以证明相同几何；本轮原始报告和HTML仅本机保留。
- 同一可访问性用例的两个桌面viewport均通过Shift+Enter、Enter、正反向Tab、可见焦点、Escape和reduced-motion。移动自动结果只标`FAIL_EMULATION`，真实触摸准确性、软键盘与safe-area继续`BLOCKED_REAL_DEVICE`。

## 2026-07-24 `c4ac9b5` P006–P012 Preview 抽样界面边界

- 本批使用桌面Chromium操作真实Preview训练界面，扩展后154个问答操作均完成单次发送、单次history-log和受控患者消息呈现；没有观察到状态提示堆叠、语言串线、教师/结构化字段裸显或请求倍增。
- HEM-P1-053属于英文主诉路由/输出过滤，不是新增视觉缺陷；为避免保存完整真实AI回答，本批不提交截图、trace或录像，只提交脱敏聚合和可重建测试。
- 四固定viewport的既有`PASS_EMULATION`结论不因本批桌面抽样扩大；真实软键盘、safe-area和物理触控继续`BLOCKED_REAL_DEVICE`。

## 2026-07-24 `c4ac9b5` P003 终末状态提示复核

- 真实Preview桌面`1440×900`中，P003七阶段最终报告3/3可见，带刷新的2/2均在刷新后保持360报告且不重复评分。
- 阶段7同步双击时，最新带UI诊断的2/2在score 200和最终报告成功后仍显示“终末评分服务暂时不可用”。这是HEM-P2-028并发409覆盖成功状态的可见表现，标记`FAIL_PREVIEW_STAGE_7`。
- 本轮未扩展移动viewport，也没有真机；既有四viewport`PASS_EMULATION`与`BLOCKED_REAL_DEVICE`边界不变。

## 2026-07-24 `c4ac9b5` P001–P007 复合病史界面批次

- 桌面Chromium在真实Preview完成35个中文复合问答，35条患者消息和35条history-log均呈现/写入；未观察状态提示堆叠、横向滚动、教师/结构字段裸显或语言串线。
- HEM-P1-054是回复内容收集完整性缺陷，不是新增布局缺陷。为避免保存真实患者回答，本批不提交截图、trace或录像，只提交脱敏聚合和可重建测试。
- 初次未节流运行尾部出现1个429并触发一次客户端重试；1.5秒节流正式批为35/35单请求。该事实不改变既有四viewport`PASS_EMULATION`或真机`BLOCKED_REAL_DEVICE`状态。

## 2026-07-24 `c4ac9b5` Data Agent前置条件恢复界面

- P001第2阶段在`1440×900`与`390×844` 2/2执行“CTU→补肾功能→重试CTU”。三次order均200，但报告数固定0/1/0，重试被标为重复医嘱，报告卡数量保持1→1；HEM-P1-055为用户可见流程失败。
- 两个viewport页面均无横向滚动或崩溃，桌面/移动全页截图可读；自动viewport只标`FAIL_EMULATION`，不替代真机。
- 合法非终态报告卡在两个viewport各产生1条React列表key console error，登记HEM-P2-056。其余network request failure和HTTP错误为0。

## 2026-07-25 `7781586` 本轮视觉范围

- 本轮聚焦病史权威、语言与Preview接口合同，没有新增视觉缺陷，也没有为真实患者回答保存截图、trace或录像。
- 既有四固定viewport结论保持`PASS_EMULATION`；本轮未获得真实软键盘或safe-area证据，继续`BLOCKED_REAL_DEVICE`，不得视为真机通过。
- HEM-P1-057/058均由脱敏计数、来源、HTTP状态和最小重建脚本支持，不需要提交含回答正文的视觉证据。

## 2026-07-25 `7781586` 第3–6阶段返回与HEM-P2-059

- `1440×900`中文、`1280×720`英文、`390×844`中文、`360×800`英文均完成阶段3返回重提、阶段5重新锁定、阶段4–6重做和最终360报告；无HTTP非200、失败请求或横向流程阻断，标记`PASS_EMULATION_FLOW`。
- 英文长流程两个viewport各出现12条`Physical examination`重复React key错误；中文对照两个viewport为0。独立最小复现仅执行P001英文阶段1→阶段2，四viewport 4/4各出现4条相同console error及5个同名分类标题，登记HEM-P2-059。
- 代表性`360×800`全页失败截图显示多个`Physical examination`分组及安全占位文案；截图只证明渲染重复，不证明英文医学来源已审核。
- 自动viewport仍不替代真实软键盘或safe-area，真机状态继续`BLOCKED_REAL_DEVICE`。

## 2026-07-25 `7781586` 阶段刷新与clean-tab界面

- 四固定viewport均完成阶段3–6逐阶段刷新和最终报告刷新；草稿、选择与终末报告完整可见，阶段1–6在终态刷新后全部禁用。除既有HEM-P2-028/059外没有新增布局、横向滚动或状态堆叠问题。
- HEM-P1-060在四viewport的可见表现一致：阶段3四字段草稿恢复且页面短暂可提交，单次提交409后切换为“训练会话尚未就绪/Training session unavailable”；代表`390×844`截图保留。页面没有崩溃，用户进度可见但不可继续。
- 跨语言及P001→P002导航4/4未显示上一作用域草稿。该结论是自动viewport的存储/可见性检查，不替代真实浏览器关闭、软键盘、动态地址栏或safe-area；真机继续`BLOCKED_REAL_DEVICE`。

## 2026-07-25 `7781586` 多标签页与终态新页面界面

- HEM-P1-060多标签页扩展在`1440×900`中文、`1280×720`英文、`390×844`中文、`360×800`英文4/4显示相同用户影响：成功标签保存阶段1，失败标签刷新后可进入下一阶段，但第一次提交409后显示“训练会话尚未就绪/Training session unavailable”。代表`390×844`截图显示进度页面仍可见但操作被fail closed。
- 终态新页面恢复4/4显示最终报告和7/7状态，阶段1–6锁定、终末按钮禁用且无重复评分请求；没有新增横向滚动、崩溃或状态堆叠缺陷。
- 本批是自动标签页/新页面存储仿真，只标`PASS_EMULATION`或`FAIL_EMULATION`；没有真实浏览器进程关闭、移动软键盘、动态地址栏或物理safe-area证据，继续`BLOCKED_REAL_BROWSER / BLOCKED_REAL_DEVICE`。

## 2026-07-25 `7781586` 存储故障与终态指针界面

- `1440×900`中文、`1280×720`英文、`390×844`中文、`360×800`英文均完成损坏缓存清除、写失败和恢复写入。页面未崩溃，恢复草稿刷新后仍可见；但旧自动保存失败提示4/4持续显示，英文两个viewport同时显示中文告警，登记HEM-P2-062。
- HEM-P1-061在四viewport均呈现完整终态面板：P001错误语言终态4/4、P002页面显示P001终态4/4。代表`390×844`截图只显示P002标题、7/7和最终评估面板，不包含病例事实、评分明细、request ID或凭据。
- HEM-P1-061 trace主动关闭截图与DOM snapshot，避免把隐藏报告内容写入ZIP；失败由目标作用域与hydrated attempt元数据的不兼容计数、可见终态布尔值和代表截图支持。
- 本批仅为自动viewport与受控存储污染，标`PASS_EMULATION`/`FAIL_EMULATION`。真实磁盘配额耗尽、真实浏览器配置损坏、移动软键盘、动态地址栏及safe-area继续`BLOCKED_REAL_STORAGE / BLOCKED_REAL_DEVICE`。

## 2026-07-25 `7781586` 畸形身份与存储恢复界面

- HEM-P1-061畸形字段扩展在四viewport的6个失败变体均显示完整终态区域；缺`schemaVersion`控制组回到空白第1阶段。trace继续关闭截图和DOM snapshot，避免保存终态正文。
- HEM-P1-063在`1440×900/1280×720/390×844/360×800`刷新后均回到空白第1阶段；代表`390×844`截图显示阶段1/7、公开开场白和空白病史小结，证明恢复后的草稿未被当前pointer找回。没有横向滚动或页面崩溃。
- history-log队列四viewport均可见“同步已暂停→重新同步→同步成功”的状态变化；禁用无关语音夹具后console意外错误0。该通过是自动viewport，不代表真实网络中断或真机。
- 真实Storage策略封锁、磁盘故障、移动软键盘、动态地址栏及safe-area继续`BLOCKED_REAL_STORAGE / BLOCKED_REAL_DEVICE`。

## 2026-07-26 `7781586` 目录与restart界面

- HEM-P1-064四viewport均不是部分降级，而是完整Next Application error页；代表`390×844`截图显示`SecurityError`和共享Header调用栈，42个病例卡与搜索区域均不存在。
- HEM-P2-065四viewport页面布局正常，但P001卡稳定显示“进行中/继续”，P002显示“已完成”；代表`390×844`截图保留P001假进度。无横向滚动或额外console错误。
- HEM-P1-066四viewport确认reload后仍为1/7；代表`390×844`截图显示同一病例第1阶段已提交状态仍存在。截图不含QA草稿、attempt ID或评分正文。
- 自动viewport结论不替代真实浏览器策略封锁、磁盘删除失败、移动软键盘、动态地址栏或safe-area；这些继续`BLOCKED_REAL_STORAGE / BLOCKED_REAL_DEVICE`。
## 2026-07-26 `9b7fcd0` 第 22 轮存储恢复界面

- 四固定 viewport 均以 headless Chromium 执行，结果只标记 `PASS_EMULATION/FAIL_EMULATION`。目录 storage 全不可用、restart fail-closed 与 pointer 隔离布局未出现新的崩溃或横向滚动结论。
- HEM-P1-064 代表移动截图显示：390×844 点击 English 且偏好写入失败后，页面保持中文并显示“语言偏好无法保存”；该截图只含公开 P001 UI 与 QA 故障提示，不含问答、评分、隐藏病史或凭据。
- HEM-P2-062 的可见问题为错误语言提示和恢复后旧告警状态，不是数据丢失；本轮没有真实软键盘、safe-area、真实 Storage 策略或磁盘故障证据，相关项继续阻塞。

## 2026-07-26 `9b7fcd0` 第 23 轮 capability 恢复界面

- 四固定viewport的clean-tab与多标签失败均保持页面和已保存进度可见，但唯一恢复写入409后操作区进入“训练会话尚未就绪/Training session unavailable”；没有页面崩溃、额外网络失败或新布局结论。
- 390×844代表截图只显示公开P001训练界面、固定QA草稿和会话未就绪状态，不含患者回答、评分、隐藏病史、request/attempt ID或凭据。
- 本轮是headless Chromium的sessionStorage清空与同context多标签仿真，只标 `FAIL_EMULATION`；真实浏览器进程关闭、移动软键盘、动态地址栏及safe-area继续 `BLOCKED_REAL_BROWSER / BLOCKED_REAL_DEVICE`。

## 2026-07-26 `9b7fcd0` 第 24 轮移动触控与英文查体分类

- HEM-P2-044两个移动viewport四个目标均达到44px，旧的`106×38、26×28、75×38、34×38`不再复现；自动几何状态为`PASS_EMULATION`。没有真实手指命中、系统字体缩放、动态地址栏或safe-area证据。
- HEM-P2-059四viewport仍显示5个相同`Physical examination`分组并各产生4条重复key console error；360×800代表截图保留公开安全占位，不含查体真值、患者问答、评分或凭据。
- 页面仍可操作且network failure为0，但React key不唯一可能造成未来重复/遗漏渲染，因此缺陷保持OPEN；未审核英文来源继续独立阻塞。

## 2026-07-26 `9b7fcd0` 第 25 轮Data Agent代表UI

- P001第2阶段在`1440×900`和`390×844`执行“目标失败→补齐前置→重试”，两viewport均显示报告卡1→2；重试没有重复医嘱提示，三次order均为单请求，HEM-P1-055标`PASS_EMULATION`。
- 同一两次运行ReportCard React key error、意外console error和network failure均为0，HEM-P2-056更新为`RESOLVED_LOCAL_QA`。本轮没有提交重复截图或大trace，测试与脱敏聚合足以重建。
- 自动viewport不替代真实手机、软键盘或safe-area；本轮Preview复合问句只做数据合同采集，不形成新的视觉结论。

## 2026-07-26 `9b7fcd0` 第 26 轮P037 Preview界面边界

- 18个P037英文Preview问答操作均通过桌面Chromium完成单次发送与单次history-log；没有观察到请求倍增、页面崩溃或新的布局/状态堆叠问题。
- HEM-P1-058属于live_ai内容保真缺陷，不新增视觉缺陷。为避免保存真实患者回答，本轮不提交截图、trace、录像或HTML报告；安全wrapper扫描后删除原始runner输出。
- 本轮没有移动viewport或真机证据；既有`BLOCKED_REAL_DEVICE`边界不变。

## 2026-07-26 `9b7fcd0` 第 27 轮非视觉路由复测

- HEM-P1-030为本地规则与公开handler契约复测，不启动浏览器、不生成截图、trace、录像或HTML报告，也不新增视觉通过/失败结论。
- 既有桌面、移动viewport、真实软键盘、动态地址栏和safe-area状态均不被本轮替代；`BLOCKED_REAL_DEVICE`保持。

## 2026-07-26 `9b7fcd0` 第 28 轮非视觉自然问法复测

- HEM-P1-050仅运行本地deterministic handler与路由脚本，不启动浏览器、不生成视觉证据，也不新增UI通过结论。
- 桌面/移动布局、真实设备和safe-area状态保持既有结论；自然问法工程通过不能替代视觉或真机验收。

## 2026-07-26 `9b7fcd0` 第 29 轮Data Agent四视口

- 1440×900、1280×720、390×844、360×800最终8/8：HEM-P1-047状态文案与异常优先4/4，HEM-P1-048英文报告卡和可见控件4/4；结果标`PASS_EMULATION`。
- 英文页面唯一CJK控件为预期“中文”语言切换入口；报告卡、医嘱显示名、返回字段和其他控件均无CJK。代表桌面截图刷新，重复截图、trace、录像和HTML仅本机保留。
- 英文查体安全占位仍造成`Physical examination`重复React key：6个英文运行各16条，HEM-P2-059保持`OPEN / FAIL_EMULATION`。页面HTTP失败0，其他console error 0。
- 首次沙箱依赖访问失败和旧语言按钮oracle均属于QA基础设施，不计产品结果。真实设备、软键盘、动态地址栏和safe-area仍`BLOCKED_REAL_DEVICE`。

## 2026-07-26 `9b7fcd0` 第 30 轮可访问性与语音控制

- 四固定viewport的键盘、焦点、reduced-motion和浏览器语音控制8/8通过；首页、病例目录与P008训练页共12次axe扫描无serious/critical违规，标`PASS_EMULATION`。
- 两个移动viewport的HEM-P2-044触控尺寸继续为`106×44、44×44、75×44、44×44`，不足44px目标0。没有失败帧，故不新增重复截图；脱敏聚合和可重建测试足以支持结论。
- 最终console error/warning和应用HTTP失败均为0；一个开发态HMR请求在导航时取消不属于产品失败。真实手机软键盘、动态地址栏、safe-area、物理触控与屏幕阅读器仍`BLOCKED_REAL_DEVICE`。

## 2026-07-26 `9b7fcd0` 第 31 轮全病例双语可访问性

- P001–P042中英文在1440×900、1280×720、390×844、360×800共336次axe扫描全部完成，serious/critical违规、console error与应用HTTP失败均为0，标`PASS_EMULATION`。
- 通过运行不生成重复截图、trace或录像；四份本机原始摘要与提交级聚合保留精确计数。病例开场文本仅用于驱动真实长度布局，不进入证据正文。
- 自动axe不覆盖真实屏幕阅读器、200%/400%缩放、高对比度、语音控制、认知负荷、软键盘或safe-area；这些层不冒充通过。

## 2026-07-26 `9b7fcd0` 第 32 轮七阶段可访问性失败

- 四viewport的P001中英文阶段1–7及最终报告共64次扫描；阶段1–5通过，阶段6、阶段7和最终报告均稳定失败，整体`FAIL_EMULATION`。
- HEM-P1-067代表截图显示围术期大文本框只有相邻标题/说明而无程序化标签；视觉上可理解不等于屏幕阅读器可识别。
- HEM-P2-068代表截图显示时间线具有固定高度和内部滚动，但容器无法进入键盘焦点；最终报告生成正常，缺陷不属于评分失败。
- 真实屏幕阅读器、系统字体放大、真机软键盘和safe-area仍`BLOCKED_REAL_DEVICE`。没有修改Production组件或样式。

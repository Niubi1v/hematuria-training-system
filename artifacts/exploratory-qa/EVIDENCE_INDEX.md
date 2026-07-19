# 探索式 QA 证据索引

当前 Production 文档基线：`657ba5da8fc6460ad7d0deea882a010c40938b40`；运行时证据代码基线：`3a16f9314d1b3cf50e30bc41dcfeaf19f4fa77a8`
QA 分支：`codex/hematuria-exploratory-qa`
本机证据根目录：`<QA_WORKTREE>\artifacts\exploratory-qa\`

## 提交 Git 的最小证据集

| 证据名称 | 对应测试或缺陷 | 文件路径 | 大小（字节） | 提交 Git | 未提交原因 | 本机保留位置 |
| --- | --- | --- | ---: | --- | --- | --- |
| 360×800 遮挡对照帧 | HEM-P1-027 / `mobile composer does not cover...` | `screenshots/training-p001-zh-viewport-360x800.png` | 49,561 | 是 | — | 证据根目录下同路径 |
| 390×844 无遮挡对照帧 | HEM-P1-027 / 同一几何断言 | `screenshots/mobile-opening-composer-no-overlap-390x844.png` | 52,142 | 是 | — | 证据根目录下同路径 |
| 360×800 最小失败 trace | HEM-P1-027 / 同一几何断言 | `traces/mobile-opening-composer-overlap-360x800.zip` | 6,773 | 是 | — | 证据根目录下同路径 |
| 阶段提交双击失败帧 | HEM-P2-028 / `rapid double stage submission...` | `screenshots/stage-submit-double-click-1440x900-failure.png` | 162,293 | 是 | — | 证据根目录下同路径 |
| 阶段提交双击最小 trace | HEM-P2-028 / 同一幂等断言 | `traces/stage-submit-double-click-1440x900.zip` | 11,564 | 是 | — | 证据根目录下同路径 |
| 英文开场语言失败代表帧 | HEM-P1-029 / live session UI | `screenshots/live-english-opening-language-1440x900-failure.png` | 148,732 | 是 | — | 证据根目录下同路径 |
| 患者元语言失败代表帧 | HEM-P1-033 / P004 live API/UI | `screenshots/live-p004-clots-teacher-meta-390x844-failure.png` | 71,371 | 是 | — | 证据根目录下同路径 |
| 语言切换授权失败代表帧 | HEM-P1-034 / 中文→英文 live session | `screenshots/live-language-switch-authorization-1440x900-failure.png` | 145,682 | 是 | — | 证据根目录下同路径 |
| Patient Session v2 聚合矩阵 | HEM-P1-030 / 42×37×双语×双问法 | `reports/patient-session-matrix-summary.json` | 1,124 | 是 | —；只含计数及唯一失败组，不含完整回答 | 证据根目录下同路径 |
| 公开 handler 代表烟测 | HEM-P1-030 / 17 项 API adapter | `reports/patient-api-adapter-smoke-summary.json` | 330 | 是 | —；只含通过计数，不含请求 header/body 或完整回答 | 证据根目录下同路径 |
| 会话能力安全矩阵 | 19 项签名/绑定/过期/幂等合同 | `reports/session-capability-matrix-summary.json` | 2,917 | 是 | —；不含 token、session ID、完整请求或回答 | 证据根目录下同路径 |
| ff1a932 优先回归聚合摘要 | 本轮基线、P1、P2、评分/数据合同、路由与环境分层 | `reports/ff1a932-priority-regression-summary.json` | 3,566 | 是 | —；仅计数、状态与公开部署元数据 | 证据根目录下同路径 |
| 8e7d148 夜间 QA 聚合摘要 | 当前基线、第一阶段、P1/P2、评分/数据、UI 与环境分层 | `reports/8e7d148-night-qa-summary.json` | 4,573 | 是 | —；仅计数、状态和公开门禁元数据，不含问答或凭据 | 证据根目录下同路径 |
| 3a16f931 夜间 QA 聚合摘要 | 当前基线、Preview、真实 AI、20 轮、路由、UI 与缺陷 | `reports/3a16f931-night-qa-summary.json` | 2,722 | 是 | —；仅计数、状态和公开 health 元数据，不含问答或凭据 | 证据根目录下同路径 |
| 657ba5d Preview稳定性聚合 | 当前精确部署health、浏览器前进/后退、后台恢复与可见回答计时 | `reports/657ba5d-navigation-summary.json` | 2,073 | 是 | —；仅配置布尔值、来源、请求/DOM计数与聚合耗时，不含问答或凭据 | 证据根目录下同路径 |
| 移动语音触控目标聚合 | HEM-P2-044 / 44×44 CSS px 几何断言 | `reports/hem-p2-044-touch-targets-summary.json` | 645 | 是 | —；仅 viewport 和几何尺寸 | 证据根目录下同路径 |
| 390×844 语音触控失败帧 | HEM-P2-044 / 语音设置 | `screenshots/hem-p2-044-touch-targets-390x844-failure.png` | 73,163 | 是 | —；公开合成病例 UI，无凭据或隐私 | 证据根目录下同路径 |
| GitHub Pages 路由预检 | HEM-P2-043 部署分层 / 42 卡片、12 显示路由、30 旧内部路由 | `reports/deployed-route-preflight-deployed-1440x900.json` | 272 | 是 | —；只含公开 URL、viewport 和计数 | 证据根目录下同路径 |
| GitHub Pages 路由不匹配帧 | HEM-P2-043 / `BLOCKED_DEPLOYMENT_MISMATCH` | `screenshots/github-pages-display-route-mismatch-deployed-1440x900-failure.png` | 358,598 | 是 | —；公开 Pages 目录，无凭据或隐私 | 证据根目录下同路径 |
| 360×800 中文开场修复帧 | HEM-P1-027 / 开场完整可见 | `screenshots/hem-p1-027-zh-opening-layout-360x800-zh-opening-pass-emulation.png` | 67,162 | 是 | — | 证据根目录下同路径 |
| 360×800 英文开场修复帧 | HEM-P1-027 / 开场完整可见 | `screenshots/hem-p1-027-en-opening-layout-360x800-en-opening-pass-emulation.png` | 70,515 | 是 | — | 证据根目录下同路径 |
| 390×844 中文开场对照帧 | HEM-P1-027 / 开场完整可见 | `screenshots/hem-p1-027-zh-opening-layout-390x844-zh-opening-pass-emulation.png` | 66,973 | 是 | — | 证据根目录下同路径 |
| 390×844 英文开场对照帧 | HEM-P1-027 / 开场完整可见 | `screenshots/hem-p1-027-en-opening-layout-390x844-en-opening-pass-emulation.png` | 70,692 | 是 | — | 证据根目录下同路径 |
| 360×800 手动上翻帧 | HEM-P1-027 / 不强制回底与新消息入口 | `screenshots/hem-p1-027-zh-manual-scroll-360x800-zh-manual-scroll-pass-emulation.png` | 73,057 | 是 | — | 证据根目录下同路径 |
| 360×800 回到底部帧 | HEM-P1-027 / 最后一条不被遮挡 | `screenshots/hem-p1-027-zh-manual-scroll-360x800-zh-latest-pass-emulation.png` | 68,951 | 是 | — | 证据根目录下同路径 |
| 英文开场修复代表帧 | HEM-P1-029 / live session UI | `screenshots/live-english-opening-language-1440x900-pass-emulation.png` | 148,082 | 是 | — | 证据根目录下同路径 |
| 语言切换修复代表帧 | HEM-P1-034 / 中文→英文 live session | `screenshots/live-language-switch-authorization-1440x900-pass-emulation.png` | 146,285 | 是 | — | 证据根目录下同路径 |
| 患者元语言隔离修复帧 | HEM-P1-033 / P004 live API/UI | `screenshots/live-p004-clots-teacher-meta-390x844-pass-emulation.png` | 74,460 | 是 | — | 证据根目录下同路径 |

SHA-256：

- `training-p001-zh-viewport-360x800.png`：`E2C6A8622724EAB19F3B0520DF667268C49C30871F1F9C953D967C441FFA9CB7`
- `mobile-opening-composer-no-overlap-390x844.png`：`192EE283E8ACEFD216A7B7038E12FB5F015E8FEFED90D05DCEB686BD07B4D019`
- `mobile-opening-composer-overlap-360x800.zip`：`42AF297C8AFABF3697018B723887C6A4A0D858478BA21145931AD0AE34C06966`
- `stage-submit-double-click-1440x900-failure.png`：`8205F568199065CF678E0699917971C541746AF4AC0902F30264D83D5471D20D`
- `stage-submit-double-click-1440x900.zip`：`64EC19AF1842E99CD1F3071965A4FC49040B5EB73850931813AB8412986AD8FF`
- `live-english-opening-language-1440x900-failure.png`：`E34944EACF827D09BBA4A6891E8F4485E3A3B5C445266EDDCF8D9B5FD99ADC63`
- `live-p004-clots-teacher-meta-390x844-failure.png`：`B8DA10D5F28C5C5B10DF5ACA04B06363F5A0D539072CB50DEEAA7C9D02518E93`
- `live-language-switch-authorization-1440x900-failure.png`：`7F3E7DFB5D694729FB4A0FB30910228992CBEF7ACF1EF0CA825130E377565D69`
- `patient-session-matrix-summary.json`：`F13B6C20ACBF06A591151C68CA34B02BE801E68939168C9AF6D7CB1EF20E5611`
- `patient-api-adapter-smoke-summary.json`：`B32E7DFDB744D43B66129D842330E8073A8B378D8310E4BA82C5509E2DCDE322`
- `session-capability-matrix-summary.json`：`26FB5CBA65F8B4CB8AD84691C4C66F247DBBDAEFBE6DA8245F05C5A2707B4D7E`
- `ff1a932-priority-regression-summary.json`：`E029A7D69A2FE286E3E07F68B9879956EF4012BF61F795370132D802F56D98B7`
- `8e7d148-night-qa-summary.json`：`DEA5182998E34972473353989C1B57BC9435621D10EC10A93C30C5FF3486F2A9`
- `deployed-route-preflight-deployed-1440x900.json`：`9C62B25D5B22D6DF1C65C58E92DFED6BBA1E9E26763B78B586AECAA302DE42D1`
- `github-pages-display-route-mismatch-deployed-1440x900-failure.png`：`73CEBBE7DE5AC781A48900B48D3873DA86692AF087E66BB2E10D3BAD4C802C89`
- `hem-p1-027-zh-opening-layout-360x800-zh-opening-pass-emulation.png`：`1AF58582E0FF603A2F5ECA29498E6B237A272070D66966C438F92AFEA5E547AB`
- `hem-p1-027-en-opening-layout-360x800-en-opening-pass-emulation.png`：`DBA3FDEDD66FACA33C74BDBEDE3FCF4FEFD98B6DCBD071EA1F2894F81198F700`
- `hem-p1-027-zh-opening-layout-390x844-zh-opening-pass-emulation.png`：`577DF68AAB8F181F2BA49A96D00EE42CCCCB812649F196BA25CD5C37CA17A375`
- `hem-p1-027-en-opening-layout-390x844-en-opening-pass-emulation.png`：`FBF798420DF78FE59D15B3C398AB8FC8393338D9A625E7653EC0C50787AE8C86`
- `hem-p1-027-zh-manual-scroll-360x800-zh-manual-scroll-pass-emulation.png`：`8D00769F79530E49A210D44D635A9D08180FD5F94DE2531059E9F5366CCAD73D`
- `hem-p1-027-zh-manual-scroll-360x800-zh-latest-pass-emulation.png`：`CF60C49C89C7CDB208CBBFBD945091BCD2169748F1848A52F62B833EEBFA4EBE`
- `live-english-opening-language-1440x900-pass-emulation.png`：`42C009FD257F309E8FCD0C9820448DDCFF0ED506848440C4F30C49A2A14FC40C`
- `live-language-switch-authorization-1440x900-pass-emulation.png`：`D686843AE6DB9F1A6A472D74A79EF95F0A3B35FBAB787BBDFD06749DF4194A59`
- `live-p004-clots-teacher-meta-390x844-pass-emulation.png`：`B60A4014AC55BE0611249FE7BD5D7DB219527A52D2D48EBE729222E30FA0B591`
- `patient-session-matrix-summary.json`：`798C7757E7A8F656EE5392894ED9A43D2CBFD8B341109E5565B66DAF31B3FDBF`
- `patient-api-adapter-smoke-summary.json`：`63E05E49E1C4A85F9DDC7A35AF994B3C4614A35FFE647BFB831866852DE0AD25`
- `3a16f931-night-qa-summary.json`：`4E4DD12A77FEA9066E7ECC79FFE8E69DC3061FD3417D907C71F80D036E99EF7D`
- `657ba5d-navigation-summary.json`：`BA3BED1E1CB240F195E2E2AA0BA710063630DC94382EF2EA3CFBAF6AC6DA4FCC`
- `hem-p2-044-touch-targets-summary.json`：`D649401B4D980FE0DD44C2F7310B965F87A08F737678073F04E4FBB38C99595C`
- `hem-p2-044-touch-targets-390x844-failure.png`：`B35AAEC4F35365C384E2690E56CE98C0B8A2368907BF171D249B410061DD7703`

## 仅本机保留、不提交 Git

| 证据名称 | 对应测试或缺陷 | 文件路径 | 文件数 | 大小（字节） | 提交 Git | 未提交原因 | 本机保留位置 |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| HTML/JSON/JUnit、console/network、test-results 和本地服务日志 | 七轮汇总、fixture E2E、HEM-P1-027–034/044、HEM-P2-043、Pages/Preview 分层 | `reports/**`（排除上表最小聚合/预检 JSON） | 185 | 2,556,910 | 否 | 可重建；部分报告含本机绝对路径；整个 HTML/report 目录不进 Git | 证据根目录下同路径 |
| 通过、重复及非最小失败截图 | 四 viewport、42 页面壳、20 轮、七阶段/360、a11y、live API、Pages/HEM-P2-044 对照 | `screenshots/**`（排除上表代表帧） | 85 | 12,437,041 | 否 | 通过、重复或非代表视觉证据；无新增最小失败价值 | 证据根目录下同路径 |
| 通过、重复及大体积 trace | 公共页、42 页面壳、20 轮、七阶段/360、a11y、live API、路由矩阵 | `traces/**`（排除上表 2 个） | 46 | 401,759,966 | 否 | 通过场景、重复复跑或大体积失败 trace；可由测试重建 | 证据根目录下同路径 |
| 脱敏 fixture transcript | P001 中文 20 轮 | `transcripts/fixture-20-turn-interview-390x844.json` | 1 | 3,295 | 否 | 非真实 AI，且不是缺陷最小证据 | 证据根目录下同路径 |
| 失败录像 | HEM-P1-027–034、HEM-P2-028/043及旧静态history环境尝试 | `videos/**` | 23 | 13,956,746 | 否 | 截图与最小 trace 已足够；按规则视频不进 Git | 证据根目录下同路径 |

当前本机共有 369 个证据文件（含本索引）、432,619,616 字节。拟提交/既有 Git 最小证据集共 29 个文件（含本索引）、1,905,658 字节；其余 340 个文件、430,713,958 字节仅本机保留。定向 Playwright 复跑按 reporter 设计重建 HTML/JUnit/test-results；聚合 JSON、代表截图与历史最小 trace 进入 Git，大量重复截图、完整报告、长 trace、录像与 transcript 不整体提交。没有浏览器用户目录进入证据根目录；`.pnpm-store`、`node_modules` 与 `.next` 不进入证据或提交。

## HEM-P1-027 复现与测量

1. 全新浏览器上下文打开 `/cases/P001/`，切换中文并保持首屏不滚动。
2. 获取 `role=log` 内患者开场文字的 `boundingBox()`，计算底边 `opening.y + opening.height`。
3. 获取问诊 textarea 直接父级 sticky composer 的 `boundingBox()`，比较 `composer.y`。
4. 断言 `composer.y >= opening.y + opening.height`。旧基线稳定观测 `composer.y=654`、开场文字底边 `=673`，重叠约 19px；360×800 自动复现 6/6，390×844 通过。
5. `96fcf80` 定向回归当前观测 `composer.y=654`、开场文字底边 `=661`，仍重叠 7px（1/1）；390×844 1/1 通过。最小 trace 在页面就绪后关闭截图帧和源码嵌入，只保留几何断言所需 DOM 快照与动作。
6. `ff1a932` 以同一几何断言扩展到中文/英文和四固定 viewport；开场/输入 8/8、手动上翻/新消息 8/8，共 16/16 `PASS_EMULATION`。旧 19px/6 次失败证据继续保留；真实手机软键盘与 safe-area 为 `BLOCKED_REAL_DEVICE`。

## HEM-P2-028 复现与测量

1. 全新上下文打开 `/cases/P001/`，填写脱敏 fixture 病史小结。
2. 将 `stage-feedback` fixture 响应延迟 150ms，在同一事件循环连续触发两次“提交本阶段”。
3. 等待客户端串行队列和本地自动保存后，统计 fixture 收到的 `stage-feedback` 数、不同 request ID 数及 `timeline[type=submit]` 数。
4. 预期 `1/1/1`，旧基线实际稳定为 `2/2/2`、自动复现 6/6；`96fcf80` 受影响回归仍为 `2/2/2`（1/1）。失败截图右侧可见两条相同提交时间线。
5. `ff1a932` 定向复跑 1/1 仍为 `2/2/2`；最小 trace 保留动作、DOM 快照和请求时间线，当前大小 11,564 字节。断言继续要求 `1/1/1`。

## HEM-P1-029–034 第四轮证据摘要

1. `patient-session-matrix-summary.json` 记录 84 次 session、6,216 个路由问法、6,216 次同请求重复、168 个安全边界、零 provider 调用；最终两轮除 `generatedAt` 外逐字一致。
2. `patient-api-adapter-smoke-summary.json` 记录 17 个公开 handler 检查和 7 个代表性失败；P001/en、P001/zh、P002/en 与 P004/zh 先建立有效签名 attempt/session，两次结果除时间外一致，公开安全 envelope 通过。
3. `session-capability-matrix-summary.json` 记录 19 项训练状态/session capability/过期/幂等合同，连续两次除 `generatedAt` 外一致，19/19 通过、`providerCalls=0`、`sensitiveValuesRecorded=false`。
4. 英文开场、P004 教师元语言和中文→英文授权失败分别在四固定 viewport 自动复现；每个场景均保存截图、trace、console 和 network。Git 仅保留三张代表帧，12 个 live trace 均仅本机保留。
5. live adapter 内部使用运行时随机生成的 QA-only 签名材料，真实训练状态/session capability 只存在于服务端内存；浏览器和 trace 仅收到 `qa-redacted-*` 占位符。network 只含方法、pathname、状态、资源类型、耗时及 action/caseId/language/mode/error 安全元数据。
6. 三个聚合 JSON 不含完整医学答复，只记录 ID、slot、语言、来源类型、长度、flags、错误码和计数；不据此批准任何医学内容。

## HEM-P1-027/029/033/034 第五轮证据摘要

1. `ff1a932-priority-regression-summary.json` 汇总精确 Production SHA、环境分层、P1 回归、42 例路由计数和外部阻塞；不保存认证材料或完整问答。
2. HEM-P1-027 的 16/16 `PASS_EMULATION` 生成 32 份 trace，但只提交 6 张能证明 360/390 中英文开场、手动上翻和回到底部的代表帧；全部新 trace 因体积大且可重建，仅本机保留。
3. HEM-P1-029/033/034 各提交 1 张修复代表帧；历史失败帧与旧最小 trace 保留，形成修复前后链路，不删除历史失败证据。
4. 全 42 例路由逐项明细与 HEM-P2-043 大 trace 仅本机保留；Git 聚合摘要只记录 42 个目录点击 404、42 个直接 URL 200、42 个刷新 200 和中英文 UI 各 42 个可见。

## `3a16f931` 第七轮证据摘要

1. `3a16f931-night-qa-summary.json` 记录精确 Production/Preview SHA、本地 42 例双语七阶段、真实 AI 中英文各 10/10、单 session 20/20、路由环境分层和当前缺陷；不含回答正文、token、session、header 或环境值。
2. `patient-session-matrix-summary.json` 是 v2 最小聚合：记录 6,216 路由、6,216 重放、168 边界、711 governed unknown、144/144 quarantine 与唯一 42 例英文泌尿操作路由失败组。原始逐例 v2 JSON 仅本机保留。
3. `hem-p2-044-touch-targets-summary.json` 与 390×844 代表帧记录两个移动 viewport 的四个不足 44px 目标；360×800 重复截图和两个原始几何 JSON 仅本机保留。
4. 真实 Preview 的 health、9 项黑盒、两批中英稳定性和20轮长会话均由安全 wrapper 执行；专用 `test-results/preview-blackbox` 在输出/凭据扫描通过后删除，因此索引只记录可重建的脱敏聚合结论，不声称保留 Preview trace 或完整 transcript。
5. GitHub Pages 新一轮两个 viewport 的原始报告、390×844 对照截图和失败 test-results 仍本机保留；Git 继续使用既有 1440×900 聚合/代表帧，因公开部署现象相同，不重复提交。
6. 浏览器history本地首轮误用页脚为`3fe409f`的旧静态`out`，会话未ready，四viewport只产生环境失败证据；测试未发患者/history请求，不能作为当前产品失败。最终结论来自精确`657ba5d` Preview，1/1通过；旧环境截图/trace/录像仅本机保留。
7. 浏览器后台恢复使用 Chromium `frozen → active` 生命周期仿真，精确`657ba5d` Preview最终1/1通过：两轮live AI、agent/history 2/2、attempt/session重初始化0/0、DOM 4→6。开发中的一次失败来自QA把3个普通跨源资源请求误当成凭据泄露；审计拆分后确认跨源保护头请求为0，所有专用输出均扫描后删除，未登记产品缺陷。
8. 浏览器首个可见患者回答计时在同一Preview取5个live AI样本：只保存P50/P95、来源和请求计数，不保存问答；非流式DOM首现不冒充provider首Token。一次开发运行遇到`safety_boundary`后未计入性能样本，专用输出扫描后删除；最终使用此前20/20已验证问法获得5/5 live AI。

## 敏感信息复核

提交前状态：`PASS`（2026-07-19，首次全证据树复扫）。

- 已提交和拟提交截图均经视觉复核，只含公开合成病例界面、fixture 文本和本地构建元数据；没有 Cookie、Authorization、签名、环境变量值、浏览器用户数据或直接身份信息。
- Production `ff1a932` 的 `test-secret-scanner.mjs` 通过文本、二进制元数据、压缩 workbook、占位符、非泄露输出、完整历史与浅克隆 fail-closed 合同。
- 对本轮最终拟提交集执行 `tests/exploratory/scan-staged-secrets.mjs`：7 个 staged 文件、完整可达文本历史，敏感值命中 0；只输出路径/规则/计数，不输出值。
- 只读 `tests/exploratory/scan-evidence-secrets.ps1` 对刷新后的证据根目录全部 369 个物理文件（含本索引）及 ZIP 内 6,947 个条目执行流式扫描，累计读取 999,926,306 字节；同时逐字检查当前进程可见的 Preview/training/KV/Upstash 运行时值，私钥、Bearer/JWT、provider/API key、AWS/Google/Azure key、非占位敏感环境赋值、Authorization/Cookie/Set-Cookie 和运行时精确值命中均为 0，扫描过程不输出值。
- 本轮 7 个 staged 路径严格为 4 份 QA 文档、1 个 Preview QA 测试、EVIDENCE_INDEX 和 1 个脱敏聚合 JSON；没有截图、trace、录像、完整问答或凭据上下文进入本提交。
- 通用 candidate scanner 对 5 个本机不提交的大 trace 按大小上限 fail-closed（4 个 ZIP 内 trace entry 过大、1 个 ZIP 文件过大）；这些文件未 staged，且已由上面的全证据树流式/解包扫描覆盖并得到 0 命中。未删除或放宽 scanner 断言。
- 绝对用户路径只出现在不提交的 `reports/junit.xml`（36）、`local-dev-3010d.stdout.log`（16）、`local-dev-3010e.log`（34）和 `local-dev-3010f.log`（1），全部保持本机未跟踪。1,551 个邮箱样式全部是 Playwright `page@hash` 内部 ID；504 个身份证样式均无有效生日；8 个手机号样式嵌在哈希中，另 1 个来自 network 浮点耗时，均为误报。
- `reports/results.json` 等其余本机报告也可能含 `<QA_WORKTREE>` 的实际绝对路径，因此整类报告保持不提交；本索引使用占位符，不暴露用户目录。
- fixture 响应中的训练状态仅为明确测试占位符；live adapter 的签名材料运行时随机生成且不输出，真实签名只存在于进程内存。network 摘要不保存 header、query、attemptId、sessionId 或问答正文。
- 后续每个里程碑仍重复仓库扫描和 trace 解包扫描；任何新增命中必须在提交前定位并排除。

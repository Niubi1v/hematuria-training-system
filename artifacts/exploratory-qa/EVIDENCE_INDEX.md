# 探索式 QA 证据索引

被测 Production SHA：`41b3830a9095c692b3fdbe65a3dbf95b7ece5a37`
QA 分支：`codex/hematuria-exploratory-qa`
本机证据根目录：`<QA_WORKTREE>\artifacts\exploratory-qa\`

## 提交 Git 的最小证据集

| 证据名称 | 对应测试或缺陷 | 文件路径 | 大小（字节） | 提交 Git | 未提交原因 | 本机保留位置 |
| --- | --- | --- | ---: | --- | --- | --- |
| 360×800 遮挡对照帧 | HEM-P1-027 / `mobile composer does not cover...` | `screenshots/training-p001-zh-viewport-360x800.png` | 49,561 | 是 | — | 证据根目录下同路径 |
| 390×844 无遮挡对照帧 | HEM-P1-027 / 同一几何断言 | `screenshots/mobile-opening-composer-no-overlap-390x844.png` | 49,460 | 是 | — | 证据根目录下同路径 |
| 360×800 最小失败 trace | HEM-P1-027 / 同一几何断言 | `traces/mobile-opening-composer-overlap-360x800.zip` | 64,585 | 是 | — | 证据根目录下同路径 |
| 阶段提交双击失败帧 | HEM-P2-028 / `rapid double stage submission...` | `screenshots/stage-submit-double-click-1440x900-failure.png` | 159,310 | 是 | — | 证据根目录下同路径 |
| 阶段提交双击最小 trace | HEM-P2-028 / 同一幂等断言 | `traces/stage-submit-double-click-1440x900.zip` | 12,363 | 是 | — | 证据根目录下同路径 |
| 英文开场语言失败代表帧 | HEM-P1-029 / live session UI | `screenshots/live-english-opening-language-1440x900-failure.png` | 146,935 | 是 | — | 证据根目录下同路径 |
| 患者元语言失败代表帧 | HEM-P1-033 / P004 live API/UI | `screenshots/live-p004-clots-teacher-meta-390x844-failure.png` | 71,362 | 是 | — | 证据根目录下同路径 |
| Patient Session 聚合矩阵 | HEM-P1-029–033 / 42×37×双语×双问法 | `reports/patient-session-matrix-summary.json` | 76,150 | 是 | —；只含 ID、slot、语言、长度、flags 与计数，不含完整回答 | 证据根目录下同路径 |
| 公开 handler 代表烟测 | HEM-P1-029–033 / 13 项 API adapter | `reports/patient-api-adapter-smoke-summary.json` | 2,427 | 是 | —；不含请求 header/body 或完整回答 | 证据根目录下同路径 |

SHA-256：

- `training-p001-zh-viewport-360x800.png`：`E2C6A8622724EAB19F3B0520DF667268C49C30871F1F9C953D967C441FFA9CB7`
- `mobile-opening-composer-no-overlap-390x844.png`：`43B9E2C10DA39FDE5BA9463F848458B08E61DEA0F2106B2D2A000777CCF61CC5`
- `mobile-opening-composer-overlap-360x800.zip`：`AF1A45958E66B376872786E0FBCEDF5CC641EB50467F02D55BFF1AEEFC19A662`
- `stage-submit-double-click-1440x900-failure.png`：`9993EC4228362E2920955E57DB2CF3C5CFBECB8C48E1AFB1AA358328DA09B2C0`
- `stage-submit-double-click-1440x900.zip`：`5190F8EA53188F161153D017213DCF1CA20605448DD3A231CDCA6B084F80569C`
- `live-english-opening-language-1440x900-failure.png`：`36DCEE82E5DC42B35715B57B23FB6A2F3CE45F1448F0AA981F70C9CA301A89AE`
- `live-p004-clots-teacher-meta-390x844-failure.png`：`1812FA9696964EE2A060F1DF2594EEFB7598865E54534AA3DB4CD97F1B2720C9`
- `patient-session-matrix-summary.json`：`F3E329E0CCFD496707E28A9D29BCCB00D489524A3AD23E42D05316F34124492E`
- `patient-api-adapter-smoke-summary.json`：`45E9F1224737566FF91AB9D3F32C7176E77055B6867EB8D04AFA0263183DDD1B`

## 仅本机保留、不提交 Git

| 证据名称 | 对应测试或缺陷 | 文件路径 | 文件数 | 大小（字节） | 提交 Git | 未提交原因 | 本机保留位置 |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| HTML/JSON/JUnit、console/network、test-results 和本地服务日志 | 三轮汇总、fixture E2E、HEM-P1-027–033 | `reports/**`（排除上表 2 个聚合 JSON） | 118 | 4,911,047 | 否 | 可重建；部分报告含本机绝对路径；整个 HTML/report 目录不进 Git | 证据根目录下同路径 |
| 通过、重复及非最小失败截图 | 四 viewport、42 页面壳、20 轮、七阶段/360、a11y、live API | `screenshots/**`（排除上表 5 张） | 30 | 6,145,636 | 否 | 通过、重复或非代表视觉证据；无新增最小失败价值 | 证据根目录下同路径 |
| 通过、重复及大体积 trace | 公共页、42 页面壳、20 轮、七阶段/360、a11y、live API、非最小缺陷复跑 | `traces/**`（排除上表 2 个） | 21 | 95,670,521 | 否 | 通过场景或重复复跑；体积大，可由测试重建 | 证据根目录下同路径 |
| 脱敏 fixture transcript | P001 中文 20 轮 | `transcripts/fixture-20-turn-interview-390x844.json` | 1 | 3,295 | 否 | 非真实 AI，且不是缺陷最小证据 | 证据根目录下同路径 |
| 失败录像 | HEM-P1-027–033、HEM-P2-028 | `videos/**` | 10 | 1,234,651 | 否 | 截图与最小 trace 已足够；按规则视频不进 Git | 证据根目录下同路径 |

当前本机共有 189 个自动生成证据文件、108,597,303 字节，另有本索引。计划提交其中 9 个最小证据、632,153 字节；其余 180 个文件、107,965,150 字节仅本机保留。没有浏览器用户目录进入证据根目录；Next 离线启动产生的 `.pnpm-store` 临时目录在核验绝对路径后已删除，`node_modules` junction 与 `.next` 仍为 Git ignored，不进入证据或提交。

## HEM-P1-027 复现与测量

1. 全新浏览器上下文打开 `/cases/P001/`，切换中文并保持首屏不滚动。
2. 获取 `role=log` 内患者开场文字的 `boundingBox()`，计算底边 `opening.y + opening.height`。
3. 获取问诊 textarea 直接父级 sticky composer 的 `boundingBox()`，比较 `composer.y`。
4. 断言 `composer.y >= opening.y + opening.height`。360×800 稳定观测 `composer.y=654`、开场文字底边 `=673`，重叠约 19px；390×844 通过。
5. 360×800 自动复现 6/6；源分支尚未声明修复，本轮未重复旧基线。

## HEM-P2-028 复现与测量

1. 全新上下文打开 `/cases/P001/`，填写脱敏 fixture 病史小结。
2. 将 `stage-feedback` fixture 响应延迟 150ms，在同一事件循环连续触发两次“提交本阶段”。
3. 等待客户端串行队列和本地自动保存后，统计 fixture 收到的 `stage-feedback` 数、不同 request ID 数及 `timeline[type=submit]` 数。
4. 预期 `1/1/1`，实际稳定为 `2/2/2`；自动复现 6/6。失败截图右侧可见两条相同提交时间线。
5. 最小 trace 在页面就绪后重新开始，关闭截图帧和源码嵌入，仅保留动作、DOM 快照和请求时间线，大小 12,363 字节。

## HEM-P1-029–033 第三轮证据摘要

1. `patient-session-matrix-summary.json` 记录 84 次 session、6,216 个路由问法、6,216 次同请求重复、168 个安全边界、零 provider 调用；最终两轮除 `generatedAt` 外逐字一致。
2. `patient-api-adapter-smoke-summary.json` 记录 13 个公开 handler 检查和 7 个代表性失败；P001/en、P001/zh、P002/en 与 P004/zh 各用独立 session，两次结果除时间外一致，公开安全 envelope 通过。
3. 英文开场和 P004 教师元语言分别在四固定 viewport 自动复现；每个场景均保存截图、trace、console 和 network。Git 仅保留 1440×900 英文开场和 390×844 P004 两张代表帧，8 个 live trace 共约 7.2 MB 均仅本机保留。
4. 最终四 viewport 清洁复跑关闭自动语音；每份 console 仅 1 条连接状态 info、0 warning/error，document/session/agent-chat/training-action 均 200。所有 network 摘要只含方法、pathname、状态、资源类型和本地耗时；8 份失败录像仅本机保留。
5. 聚合 JSON 不含完整医学答复，只记录 caseId、slot、语言、来源类型、长度、flags、fallback reason 和计数；不据此批准任何医学内容。

## 敏感信息复核

提交前状态：`PASS`（2026-07-14）。

- 已提交和拟提交截图均经视觉复核，只含公开合成病例界面、fixture 文本和本地构建元数据；没有 Cookie、Authorization、签名、环境变量值、浏览器用户数据或直接身份信息。
- `scripts/scan-repository-secrets.mjs` 最新对 461 个 tracked/candidate 文件通过；独立终扫覆盖证据根目录 190 个物理文件（含本索引）、新增 videos/test-results，以及 23 个 trace ZIP 的全部 1,858 个内部条目。私钥、Bearer/JWT、provider/API key、Authorization/Cookie/Set-Cookie 非空值、敏感环境变量赋值、签名 query、URL userinfo、浏览器用户目录和真实邮箱/手机号/身份证均为 0。
- 四个本轮拟提交新证据已单独复扫，全部 0 命中：两个聚合 JSON 和两张 live 缺陷代表截图；聚合 JSON 不含完整请求/回答、header、Cookie 或本机路径。
- 唯一真实路径类命中仅在不提交的 `reports/junit.xml`（24 处 Windows 用户绝对路径）和 `reports/local-dev-3010d.stdout.log`（16 处 Windows 用户绝对路径、1 个私网 IP）；二者保持未跟踪、本机保留。邮箱样式与手机号样式命中经逐项分类均为 Playwright `page@hash`、二进制或哈希片段误报。
- `reports/results.json` 等其余本机报告也可能含 `<QA_WORKTREE>` 的实际绝对路径，因此整类报告保持不提交；本索引使用占位符，不暴露用户目录。
- fixture 响应中的训练状态仅为明确的测试占位值，不是真实签名；network 摘要不保存 header、query 或 body。
- 后续每个里程碑仍重复仓库扫描和 trace 解包扫描；任何新增命中必须在提交前定位并排除。

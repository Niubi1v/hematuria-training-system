# 探索式 QA 证据索引

当前 Production SHA：`52c24325ddd28262458f5eff4f37fe2866d53305`；运行时证据基线：`96fcf80f5a825585be53715e65851fbc113a7ab0`（两者仅 scanner/package script/审计文档差异）
QA 分支：`codex/hematuria-exploratory-qa`
本机证据根目录：`<QA_WORKTREE>\artifacts\exploratory-qa\`

## 提交 Git 的最小证据集

| 证据名称 | 对应测试或缺陷 | 文件路径 | 大小（字节） | 提交 Git | 未提交原因 | 本机保留位置 |
| --- | --- | --- | ---: | --- | --- | --- |
| 360×800 遮挡对照帧 | HEM-P1-027 / `mobile composer does not cover...` | `screenshots/training-p001-zh-viewport-360x800.png` | 49,561 | 是 | — | 证据根目录下同路径 |
| 390×844 无遮挡对照帧 | HEM-P1-027 / 同一几何断言 | `screenshots/mobile-opening-composer-no-overlap-390x844.png` | 52,142 | 是 | — | 证据根目录下同路径 |
| 360×800 最小失败 trace | HEM-P1-027 / 同一几何断言 | `traces/mobile-opening-composer-overlap-360x800.zip` | 6,773 | 是 | — | 证据根目录下同路径 |
| 阶段提交双击失败帧 | HEM-P2-028 / `rapid double stage submission...` | `screenshots/stage-submit-double-click-1440x900-failure.png` | 162,258 | 是 | — | 证据根目录下同路径 |
| 阶段提交双击最小 trace | HEM-P2-028 / 同一幂等断言 | `traces/stage-submit-double-click-1440x900.zip` | 12,383 | 是 | — | 证据根目录下同路径 |
| 英文开场语言失败代表帧 | HEM-P1-029 / live session UI | `screenshots/live-english-opening-language-1440x900-failure.png` | 148,732 | 是 | — | 证据根目录下同路径 |
| 患者元语言失败代表帧 | HEM-P1-033 / P004 live API/UI | `screenshots/live-p004-clots-teacher-meta-390x844-failure.png` | 71,371 | 是 | — | 证据根目录下同路径 |
| 语言切换授权失败代表帧 | HEM-P1-034 / 中文→英文 live session | `screenshots/live-language-switch-authorization-1440x900-failure.png` | 145,682 | 是 | — | 证据根目录下同路径 |
| Patient Session 聚合矩阵 | HEM-P1-029–033 / 42×37×双语×双问法 | `reports/patient-session-matrix-summary.json` | 76,150 | 是 | —；只含 ID、slot、语言、长度、flags 与计数，不含完整回答 | 证据根目录下同路径 |
| 公开 handler 代表烟测 | HEM-P1-029–033 / 17 项 API adapter | `reports/patient-api-adapter-smoke-summary.json` | 2,427 | 是 | —；不含请求 header/body 或完整回答 | 证据根目录下同路径 |
| 会话能力安全矩阵 | 19 项签名/绑定/过期/幂等合同 | `reports/session-capability-matrix-summary.json` | 2,917 | 是 | —；不含 token、session ID、完整请求或回答 | 证据根目录下同路径 |

SHA-256：

- `training-p001-zh-viewport-360x800.png`：`E2C6A8622724EAB19F3B0520DF667268C49C30871F1F9C953D967C441FFA9CB7`
- `mobile-opening-composer-no-overlap-390x844.png`：`192EE283E8ACEFD216A7B7038E12FB5F015E8FEFED90D05DCEB686BD07B4D019`
- `mobile-opening-composer-overlap-360x800.zip`：`42AF297C8AFABF3697018B723887C6A4A0D858478BA21145931AD0AE34C06966`
- `stage-submit-double-click-1440x900-failure.png`：`677B0E5F6E3782E07BAF847F4A8B009E5BAF0F7E6BFA026584891206105B23FE`
- `stage-submit-double-click-1440x900.zip`：`364C22AEC6E4085B31669669F1FF25AB3E65E8C4CB448A1642C05E7AF385087F`
- `live-english-opening-language-1440x900-failure.png`：`E34944EACF827D09BBA4A6891E8F4485E3A3B5C445266EDDCF8D9B5FD99ADC63`
- `live-p004-clots-teacher-meta-390x844-failure.png`：`B8DA10D5F28C5C5B10DF5ACA04B06363F5A0D539072CB50DEEAA7C9D02518E93`
- `live-language-switch-authorization-1440x900-failure.png`：`7F3E7DFB5D694729FB4A0FB30910228992CBEF7ACF1EF0CA825130E377565D69`
- `patient-session-matrix-summary.json`：`24536B85BFC1AEBB69EBF4B66C77CA62566D3F4206CE6E44CF8C361C81D2F33F`
- `patient-api-adapter-smoke-summary.json`：`0C313127696D41995B72E97665ADE333EE38B8F03FFE7F2DF1EE0EC3883F3A80`
- `session-capability-matrix-summary.json`：`4A95753EB87D9CAE7363F3687FF26B2E1EE5D6702B0D2F8F3E1B20A7254DFF37`

## 仅本机保留、不提交 Git

| 证据名称 | 对应测试或缺陷 | 文件路径 | 文件数 | 大小（字节） | 提交 Git | 未提交原因 | 本机保留位置 |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| HTML/JSON/JUnit、console/network、test-results 和本地服务日志 | 四轮汇总、fixture E2E、HEM-P1-027–034 | `reports/**`（排除上表 3 个聚合 JSON） | 120 | 4,539,054 | 否 | 可重建；部分报告含本机绝对路径；整个 HTML/report 目录不进 Git | 证据根目录下同路径 |
| 通过、重复及非最小失败截图 | 四 viewport、42 页面壳、20 轮、七阶段/360、a11y、live API | `screenshots/**`（排除上表 6 张） | 33 | 6,416,516 | 否 | 通过、重复或非代表视觉证据；无新增最小失败价值 | 证据根目录下同路径 |
| 通过、重复及大体积 trace | 公共页、42 页面壳、20 轮、七阶段/360、a11y、live API、非最小缺陷复跑 | `traces/**`（排除上表 2 个） | 25 | 101,816,232 | 否 | 通过场景或重复复跑；体积大，可由测试重建 | 证据根目录下同路径 |
| 脱敏 fixture transcript | P001 中文 20 轮 | `transcripts/fixture-20-turn-interview-390x844.json` | 1 | 3,295 | 否 | 非真实 AI，且不是缺陷最小证据 | 证据根目录下同路径 |
| 失败录像 | HEM-P1-027–034、HEM-P2-028 | `videos/**` | 14 | 2,307,008 | 否 | 截图与最小 trace 已足够；按规则视频不进 Git | 证据根目录下同路径 |

当前本机共有 204 个自动生成证据文件、115,812,501 字节，另有本索引。计划提交其中 11 个最小证据、730,396 字节；其余 193 个文件、115,082,105 字节仅本机保留。没有浏览器用户目录进入证据根目录；`node_modules` junction 与 `.next` 为 Git ignored，不进入证据或提交。

## HEM-P1-027 复现与测量

1. 全新浏览器上下文打开 `/cases/P001/`，切换中文并保持首屏不滚动。
2. 获取 `role=log` 内患者开场文字的 `boundingBox()`，计算底边 `opening.y + opening.height`。
3. 获取问诊 textarea 直接父级 sticky composer 的 `boundingBox()`，比较 `composer.y`。
4. 断言 `composer.y >= opening.y + opening.height`。旧基线稳定观测 `composer.y=654`、开场文字底边 `=673`，重叠约 19px；360×800 自动复现 6/6，390×844 通过。
5. `96fcf80` 定向回归当前观测 `composer.y=654`、开场文字底边 `=661`，仍重叠 7px（1/1）；390×844 1/1 通过。最小 trace 在页面就绪后关闭截图帧和源码嵌入，只保留几何断言所需 DOM 快照与动作。

## HEM-P2-028 复现与测量

1. 全新上下文打开 `/cases/P001/`，填写脱敏 fixture 病史小结。
2. 将 `stage-feedback` fixture 响应延迟 150ms，在同一事件循环连续触发两次“提交本阶段”。
3. 等待客户端串行队列和本地自动保存后，统计 fixture 收到的 `stage-feedback` 数、不同 request ID 数及 `timeline[type=submit]` 数。
4. 预期 `1/1/1`，旧基线实际稳定为 `2/2/2`、自动复现 6/6；`96fcf80` 受影响回归仍为 `2/2/2`（1/1）。失败截图右侧可见两条相同提交时间线。
5. 最小 trace 在页面就绪后重新开始，关闭截图帧和源码嵌入，仅保留动作、DOM 快照和请求时间线，当前大小 12,383 字节。

## HEM-P1-029–034 第四轮证据摘要

1. `patient-session-matrix-summary.json` 记录 84 次 session、6,216 个路由问法、6,216 次同请求重复、168 个安全边界、零 provider 调用；最终两轮除 `generatedAt` 外逐字一致。
2. `patient-api-adapter-smoke-summary.json` 记录 17 个公开 handler 检查和 7 个代表性失败；P001/en、P001/zh、P002/en 与 P004/zh 先建立有效签名 attempt/session，两次结果除时间外一致，公开安全 envelope 通过。
3. `session-capability-matrix-summary.json` 记录 19 项训练状态/session capability/过期/幂等合同，连续两次除 `generatedAt` 外一致，19/19 通过、`providerCalls=0`、`sensitiveValuesRecorded=false`。
4. 英文开场、P004 教师元语言和中文→英文授权失败分别在四固定 viewport 自动复现；每个场景均保存截图、trace、console 和 network。Git 仅保留三张代表帧，12 个 live trace 均仅本机保留。
5. live adapter 内部使用运行时随机生成的 QA-only 签名材料，真实训练状态/session capability 只存在于服务端内存；浏览器和 trace 仅收到 `qa-redacted-*` 占位符。network 只含方法、pathname、状态、资源类型、耗时及 action/caseId/language/mode/error 安全元数据。
6. 三个聚合 JSON 不含完整医学答复，只记录 ID、slot、语言、来源类型、长度、flags、错误码和计数；不据此批准任何医学内容。

## 敏感信息复核

提交前状态：`PASS`（2026-07-14）。

- 已提交和拟提交截图均经视觉复核，只含公开合成病例界面、fixture 文本和本地构建元数据；没有 Cookie、Authorization、签名、环境变量值、浏览器用户数据或直接身份信息。
- Production `52c2432` 的 `test-secret-scanner.mjs` 通过文本、二进制元数据、压缩 workbook、占位符、非泄露输出及已删除 Git 历史合同；增强后的 repository scanner 在排除仅本机的大体积可重建 artifacts 后，对 320 个 tracked/candidate 文件、可达文本历史和有界归档元数据通过。
- 直接纳入全部本地 artifacts 时，新 scanner 仅报告 5 个扫描上限门禁（4 个 `archive-entry-too-large`、1 个 `archive-too-large-to-scan`），没有报告 secret 规则命中。独立终扫覆盖证据根目录 205 个物理文件（含本索引）和 25 个 trace ZIP 的全部 2,045 个内部条目；私钥、Bearer/JWT、provider/API key、完整 attempt/session 签名、Authorization/Cookie/Set-Cookie 非空值、签名 query 和浏览器用户目录均为 0。
- 拟提交的 3 个聚合 JSON、2 个最小 trace 与本索引单独扫描 11 个 ZIP 内部条目，敏感值或本机私有路径命中为 0；6 张拟提交截图全部视觉复核，只含公开合成病例 UI、明确 fixture 文本和本地构建元数据。
- 绝对用户路径只出现在不提交的 `reports/junit.xml`（36）、`local-dev-3010d.stdout.log`（16）、`local-dev-3010e.log`（34）和 `local-dev-3010f.log`（1），全部保持本机未跟踪。1,551 个邮箱样式全部是 Playwright `page@hash` 内部 ID；504 个身份证样式均无有效生日；8 个手机号样式嵌在哈希中，另 1 个来自 network 浮点耗时，均为误报。
- `reports/results.json` 等其余本机报告也可能含 `<QA_WORKTREE>` 的实际绝对路径，因此整类报告保持不提交；本索引使用占位符，不暴露用户目录。
- fixture 响应中的训练状态仅为明确测试占位符；live adapter 的签名材料运行时随机生成且不输出，真实签名只存在于进程内存。network 摘要不保存 header、query、attemptId、sessionId 或问答正文。
- 后续每个里程碑仍重复仓库扫描和 trace 解包扫描；任何新增命中必须在提交前定位并排除。

# 探索式 QA 证据索引

当前 Production 与运行时证据基线：`ff1a932785d891749ae8e73130bde8857062e194`
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
| Patient Session 聚合矩阵 | HEM-P1-029–033 / 42×37×双语×双问法 | `reports/patient-session-matrix-summary.json` | 71,521 | 是 | —；只含 ID、slot、语言、长度、flags 与计数，不含完整回答 | 证据根目录下同路径 |
| 公开 handler 代表烟测 | HEM-P1-029–033 / 17 项 API adapter | `reports/patient-api-adapter-smoke-summary.json` | 1,881 | 是 | —；不含请求 header/body 或完整回答 | 证据根目录下同路径 |
| 会话能力安全矩阵 | 19 项签名/绑定/过期/幂等合同 | `reports/session-capability-matrix-summary.json` | 2,917 | 是 | —；不含 token、session ID、完整请求或回答 | 证据根目录下同路径 |
| ff1a932 优先回归聚合摘要 | 本轮基线、P1、路由与环境分层 | `reports/ff1a932-priority-regression-summary.json` | 3,095 | 是 | —；仅计数、状态与公开部署元数据 | 证据根目录下同路径 |
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
- `stage-submit-double-click-1440x900-failure.png`：`677B0E5F6E3782E07BAF847F4A8B009E5BAF0F7E6BFA026584891206105B23FE`
- `stage-submit-double-click-1440x900.zip`：`364C22AEC6E4085B31669669F1FF25AB3E65E8C4CB448A1642C05E7AF385087F`
- `live-english-opening-language-1440x900-failure.png`：`E34944EACF827D09BBA4A6891E8F4485E3A3B5C445266EDDCF8D9B5FD99ADC63`
- `live-p004-clots-teacher-meta-390x844-failure.png`：`B8DA10D5F28C5C5B10DF5ACA04B06363F5A0D539072CB50DEEAA7C9D02518E93`
- `live-language-switch-authorization-1440x900-failure.png`：`7F3E7DFB5D694729FB4A0FB30910228992CBEF7ACF1EF0CA825130E377565D69`
- `patient-session-matrix-summary.json`：`F13B6C20ACBF06A591151C68CA34B02BE801E68939168C9AF6D7CB1EF20E5611`
- `patient-api-adapter-smoke-summary.json`：`B32E7DFDB744D43B66129D842330E8073A8B378D8310E4BA82C5509E2DCDE322`
- `session-capability-matrix-summary.json`：`26FB5CBA65F8B4CB8AD84691C4C66F247DBBDAEFBE6DA8245F05C5A2707B4D7E`
- `ff1a932-priority-regression-summary.json`：`871AF4A88FC45EFF813F80970BC60EE53C5D8E35C7996D36960EBEF97CBF100A`
- `hem-p1-027-zh-opening-layout-360x800-zh-opening-pass-emulation.png`：`1AF58582E0FF603A2F5ECA29498E6B237A272070D66966C438F92AFEA5E547AB`
- `hem-p1-027-en-opening-layout-360x800-en-opening-pass-emulation.png`：`DBA3FDEDD66FACA33C74BDBEDE3FCF4FEFD98B6DCBD071EA1F2894F81198F700`
- `hem-p1-027-zh-opening-layout-390x844-zh-opening-pass-emulation.png`：`577DF68AAB8F181F2BA49A96D00EE42CCCCB812649F196BA25CD5C37CA17A375`
- `hem-p1-027-en-opening-layout-390x844-en-opening-pass-emulation.png`：`FBF798420DF78FE59D15B3C398AB8FC8393338D9A625E7653EC0C50787AE8C86`
- `hem-p1-027-zh-manual-scroll-360x800-zh-manual-scroll-pass-emulation.png`：`8D00769F79530E49A210D44D635A9D08180FD5F94DE2531059E9F5366CCAD73D`
- `hem-p1-027-zh-manual-scroll-360x800-zh-latest-pass-emulation.png`：`CF60C49C89C7CDB208CBBFBD945091BCD2169748F1848A52F62B833EEBFA4EBE`
- `live-english-opening-language-1440x900-pass-emulation.png`：`42C009FD257F309E8FCD0C9820448DDCFF0ED506848440C4F30C49A2A14FC40C`
- `live-language-switch-authorization-1440x900-pass-emulation.png`：`D686843AE6DB9F1A6A472D74A79EF95F0A3B35FBAB787BBDFD06749DF4194A59`
- `live-p004-clots-teacher-meta-390x844-pass-emulation.png`：`B60A4014AC55BE0611249FE7BD5D7DB219527A52D2D48EBE729222E30FA0B591`

## 仅本机保留、不提交 Git

| 证据名称 | 对应测试或缺陷 | 文件路径 | 文件数 | 大小（字节） | 提交 Git | 未提交原因 | 本机保留位置 |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| HTML/JSON/JUnit、console/network、test-results 和本地服务日志 | 五轮汇总、fixture E2E、HEM-P1-027–034、HEM-P2-043 | `reports/**`（排除上表 4 个聚合 JSON） | 203 | 9,673,500 | 否 | 可重建；部分报告含本机绝对路径；整个 HTML/report 目录不进 Git | 证据根目录下同路径 |
| 通过、重复及非最小失败截图 | 四 viewport、42 页面壳、20 轮、七阶段/360、a11y、live API | `screenshots/**`（排除上表 15 张） | 78 | 11,394,339 | 否 | 通过、重复或非代表视觉证据；无新增最小失败价值 | 证据根目录下同路径 |
| 通过、重复及大体积 trace | 公共页、42 页面壳、20 轮、七阶段/360、a11y、live API、路由矩阵 | `traces/**`（排除上表 2 个） | 42 | 408,099,908 | 否 | 通过场景、重复复跑或大体积失败 trace；可由测试重建 | 证据根目录下同路径 |
| 脱敏 fixture transcript | P001 中文 20 轮 | `transcripts/fixture-20-turn-interview-390x844.json` | 1 | 3,295 | 否 | 非真实 AI，且不是缺陷最小证据 | 证据根目录下同路径 |
| 失败录像 | HEM-P1-027–034、HEM-P2-028/043 | `videos/**` | 19 | 12,756,304 | 否 | 截图与最小 trace 已足够；按规则视频不进 Git | 证据根目录下同路径 |

当前本机共有 364 个自动生成证据文件、443,441,839 字节，另有本索引。Git 最小证据集共 21 个文件、1,514,493 字节；其余 343 个文件、441,927,346 字节仅本机保留。没有浏览器用户目录进入证据根目录；`.pnpm-store`、`node_modules` 与 `.next` 不进入证据或提交。

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
5. 最小 trace 在页面就绪后重新开始，关闭截图帧和源码嵌入，仅保留动作、DOM 快照和请求时间线，当前大小 12,383 字节。

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

## 敏感信息复核

提交前状态：`PASS`（2026-07-14）。

- 已提交和拟提交截图均经视觉复核，只含公开合成病例界面、fixture 文本和本地构建元数据；没有 Cookie、Authorization、签名、环境变量值、浏览器用户数据或直接身份信息。
- Production `ff1a932` 的 `test-secret-scanner.mjs` 通过文本、二进制元数据、压缩 workbook、占位符、非泄露输出、完整历史与浅克隆 fail-closed 合同。
- 对最终拟提交索引执行 tracked/staged repository 扫描：334 个文件、可达文本历史及有界二进制/归档元数据，敏感值命中 0；只输出路径/规则/计数，不输出值。
- 新增只读 `tests/exploratory/scan-evidence-secrets.ps1` 对证据根目录全部 365 个物理文件（含本索引）及 44 个 trace ZIP 的全部 6,874 个内部条目执行流式扫描，累计读取 1,018,406,845 字节；私钥、Bearer/JWT、provider/API key、AWS/Google/Azure key、非占位敏感环境赋值、Authorization/Cookie/Set-Cookie 非空值命中均为 0，扫描过程不输出值。
- 拟提交的 21 个最小证据中，15 张截图已逐张或按同场景代表帧视觉复核，只含公开合成病例 UI、明确 fixture 文本和本地构建元数据；4 个聚合 JSON、2 个最小历史 trace 均包含在上述解包扫描中。
- 绝对用户路径只出现在不提交的 `reports/junit.xml`（36）、`local-dev-3010d.stdout.log`（16）、`local-dev-3010e.log`（34）和 `local-dev-3010f.log`（1），全部保持本机未跟踪。1,551 个邮箱样式全部是 Playwright `page@hash` 内部 ID；504 个身份证样式均无有效生日；8 个手机号样式嵌在哈希中，另 1 个来自 network 浮点耗时，均为误报。
- `reports/results.json` 等其余本机报告也可能含 `<QA_WORKTREE>` 的实际绝对路径，因此整类报告保持不提交；本索引使用占位符，不暴露用户目录。
- fixture 响应中的训练状态仅为明确测试占位符；live adapter 的签名材料运行时随机生成且不输出，真实签名只存在于进程内存。network 摘要不保存 header、query、attemptId、sessionId 或问答正文。
- 后续每个里程碑仍重复仓库扫描和 trace 解包扫描；任何新增命中必须在提交前定位并排除。

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

SHA-256：

- `training-p001-zh-viewport-360x800.png`：`E2C6A8622724EAB19F3B0520DF667268C49C30871F1F9C953D967C441FFA9CB7`
- `mobile-opening-composer-no-overlap-390x844.png`：`43B9E2C10DA39FDE5BA9463F848458B08E61DEA0F2106B2D2A000777CCF61CC5`
- `mobile-opening-composer-overlap-360x800.zip`：`AF1A45958E66B376872786E0FBCEDF5CC641EB50467F02D55BFF1AEEFC19A662`
- `stage-submit-double-click-1440x900-failure.png`：`9993EC4228362E2920955E57DB2CF3C5CFBECB8C48E1AFB1AA358328DA09B2C0`
- `stage-submit-double-click-1440x900.zip`：`5190F8EA53188F161153D017213DCF1CA20605448DD3A231CDCA6B084F80569C`

## 仅本机保留、不提交 Git

| 证据名称 | 对应测试或缺陷 | 文件路径 | 文件数 | 大小（字节） | 提交 Git | 未提交原因 | 本机保留位置 |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| HTML/JSON/JUnit、console/network、test-results 和本地服务日志 | 两轮汇总、fixture E2E、HEM-P1-027、HEM-P2-028 | `reports/**` | 40 | 1,393,130 | 否 | 可重建；部分报告含本机绝对路径；整个 HTML/report 目录不进 Git | 证据根目录下同路径 |
| 通过、重复及非最小失败截图 | 四 viewport、42 页面壳、20 轮、七阶段/360、a11y | `screenshots/**`（排除上表 3 张） | 24 | 5,530,661 | 否 | 通过或重复视觉证据；无新增失败价值 | 证据根目录下同路径 |
| 通过、重复及大体积 trace | 公共页、42 页面壳、20 轮、七阶段/360、a11y、非最小缺陷复跑 | `traces/**`（排除上表 2 个） | 13 | 88,524,796 | 否 | 通过场景或重复复跑；体积大，可由测试重建 | 证据根目录下同路径 |
| 脱敏 fixture transcript | P001 中文 20 轮 | `transcripts/fixture-20-turn-interview-390x844.json` | 1 | 3,295 | 否 | 非真实 AI，且不是缺陷最小证据 | 证据根目录下同路径 |
| 失败录像 | HEM-P1-027、HEM-P2-028 | `videos/**` | 2 | 240,003 | 否 | 截图与最小 trace 已足够；按规则视频不进 Git | 证据根目录下同路径 |

当前本机共有 85 个自动生成证据文件、96,027,164 字节，另有本索引。计划提交其中 5 个二进制最小证据、335,279 字节；其余 80 个文件、95,691,885 字节仅本机保留。没有缓存、浏览器用户目录或临时依赖目录进入证据根目录。

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

## 敏感信息复核

提交前状态：`PASS`（2026-07-14）。

- 已提交和拟提交截图均经视觉复核，只含公开合成病例界面、fixture 文本和本地构建元数据；没有 Cookie、Authorization、签名、环境变量值、浏览器用户数据或直接身份信息。
- HEM-P2-028 最小 trace 的私钥、Bearer、JWT、provider key、Authorization/Cookie 值和敏感环境变量赋值扫描均为 0；trace 不嵌入测试源码或截图帧。
- `scripts/scan-repository-secrets.mjs` 最新对 375 个 tracked/candidate 文件通过；二次扫描覆盖证据根目录当时的 88 文件全集（当前保留的 86 个文件均在该集合中）及 15 个 trace 的全部可读 zip entry，私钥、Bearer、JWT、OpenAI/GitHub/Google key、Authorization/Cookie 值、敏感变量赋值、签名 query 和 Chrome/Edge 用户目录均为 0。
- `reports/results.json` 等本机报告可能含 `<QA_WORKTREE>` 的实际绝对路径，因此整类报告保持不提交；本索引已使用占位符，不暴露用户目录。
- fixture 响应中的训练状态仅为明确的测试占位值，不是真实签名；network 摘要不保存 header、query 或 body。
- 后续每个里程碑仍重复仓库扫描和 trace 解包扫描；任何新增命中必须在提交前定位并排除。

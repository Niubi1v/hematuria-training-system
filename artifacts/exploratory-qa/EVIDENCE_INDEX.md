# 探索式 QA 证据索引

基线：`41b3830a9095c692b3fdbe65a3dbf95b7ece5a37`
QA 分支：`codex/hematuria-exploratory-qa`
本机证据根目录：`C:\Users\admin\.codex\worktrees\7470\hematuria-training-system\artifacts\exploratory-qa\`

## 提交 Git 的最小证据集

| 证据名称 | 对应测试或缺陷 | 文件路径 | 大小（字节） | 提交 Git | 未提交原因 | 本机保留位置 |
| --- | --- | --- | ---: | --- | --- | --- |
| 360×800 遮挡对照帧 | HEM-P1-027 / `mobile composer does not cover...` | `screenshots/training-p001-zh-viewport-360x800.png` | 49,561 | 是 | — | 同文件路径 |
| 390×844 无遮挡对照帧 | HEM-P1-027 / 同一几何断言 | `screenshots/mobile-opening-composer-no-overlap-390x844.png` | 49,460 | 是 | — | 同文件路径 |
| 360×800 最小失败 trace | HEM-P1-027 / 同一几何断言 | `traces/mobile-opening-composer-overlap-360x800.zip` | 64,585 | 是 | — | 同文件路径 |

SHA-256：

- `training-p001-zh-viewport-360x800.png`：`E2C6A8622724EAB19F3B0520DF667268C49C30871F1F9C953D967C441FFA9CB7`
- `mobile-opening-composer-no-overlap-390x844.png`：`43B9E2C10DA39FDE5BA9463F848458B08E61DEA0F2106B2D2A000777CCF61CC5`
- `mobile-opening-composer-overlap-360x800.zip`：`AF1A45958E66B376872786E0FBCEDF5CC641EB50467F02D55BFF1AEEFC19A662`

## 仅本机保留、不提交 Git

| 证据名称 | 对应测试或缺陷 | 文件路径 | 大小（字节） | 提交 Git | 未提交原因 | 本机保留位置 |
| --- | --- | --- | ---: | --- | --- | --- |
| 自动 full-page 失败截图 | HEM-P1-027 | `screenshots/mobile-opening-composer-overlap-360x800-failure.png` | 63,694 | 否 | 与已提交的精确 viewport 帧重复 | 证据根目录下同路径 |
| 病例目录重复截图（8） | 四 viewport 中/英文目录 | `screenshots/cases-*.png` | 3,751,376 | 否 | 大量重复视觉证据，无失败价值 | 证据根目录下同路径 |
| 首页重复截图（4） | 四 viewport 首页 | `screenshots/home-*.png` | 283,913 | 否 | 全部通过，无失败价值 | 证据根目录下同路径 |
| 其余训练页截图（9） | P001/P042、20 轮恢复 | `screenshots/training-*.png`（排除已提交 360 帧） | 825,936 | 否 | 通过场景或重复视觉证据 | 证据根目录下同路径 |
| 20 轮 fixture trace | 20 轮/双击/刷新恢复 | `traces/fixture-20-turn-interview-390x844.zip` | 5,714,197 | 否 | fixture 通过，无失败价值且体积大 | 证据根目录下同路径 |
| 390×844 通过 trace | HEM-P1-027 对照 | `traces/mobile-opening-composer-overlap-390x844.zip` | 448,694 | 否 | 已有 390 截图足以作为通过对照 | 证据根目录下同路径 |
| 42 例页面壳 trace | P001–P042 shell/leakage | `traces/p001-p042-shell-audit-1440x900.zip` | 13,380,508 | 否 | 通过场景且体积过大 | 证据根目录下同路径 |
| 1280 公共页 trace | 页面视觉基线 | `traces/public-pages-1280x720.zip` | 1,988,093 | 否 | 通过场景，无失败价值 | 证据根目录下同路径 |
| 1440 公共页 trace | 页面视觉基线 | `traces/public-pages-1440x900.zip` | 2,622,692 | 否 | 通过场景，无失败价值 | 证据根目录下同路径 |
| 360 公共页 trace | 页面视觉基线 | `traces/public-pages-360x800.zip` | 1,092,469 | 否 | HEM-P1-027 已有更小的定向失败 trace | 证据根目录下同路径 |
| 390 公共页 trace | 页面视觉基线 | `traces/public-pages-390x844.zip` | 1,131,047 | 否 | 通过场景，无失败价值 | 证据根目录下同路径 |
| HTML 报告包（2） | 最后一次定向复现报告 | `reports/html/**` | 543,692 | 否 | 整个 HTML 报告原则上不入 Git | 证据根目录下同路径 |
| console/network/JSON/JUnit（18） | 首轮汇总与脱敏网络摘要 | `reports/*`（不含子目录） | 171,856 | 否 | 可由测试重建，避免报告噪声 | 证据根目录下同路径 |
| Playwright test-results（2） | 最后一次失败上下文 | `reports/test-results/**` | 10,574 | 否 | 可由 trace 和测试重建；目录已被 Git ignore | 证据根目录下同路径 |
| 脱敏 fixture transcript | 20 轮问诊 | `transcripts/fixture-20-turn-interview-390x844.json` | 3,295 | 否 | fixture 非真实 AI，不是缺陷最小证据 | 证据根目录下同路径 |
| 失败录像 | HEM-P1-027 | `videos/mobile-opening-composer-overlap-360x800.webm` | 77,663 | 否 | 按要求视频不入 Git；截图与 trace 已足够 | 证据根目录下同路径 |

当前本机保留 56 个自动生成证据文件、32,273,305 字节，另有本索引；计划提交其中 3 个二进制证据文件、共 163,606 字节，另提交本索引。没有缓存、浏览器用户目录或临时依赖目录进入证据根目录。定向失败 trace 已关闭源码嵌入，仅保留页面快照和请求时间线。

## 复现与测量

1. 以全新浏览器上下文打开 `/cases/P001/`，切换中文，保持页面首屏不滚动。
2. 取 `role=log` 内患者开场文字的 `boundingBox()`，计算其底边 `opening.y + opening.height`。
3. 取问诊 textarea 直接父级 sticky composer 的 `boundingBox()`，比较 `composer.y`。
4. 断言 `composer.y >= opening.y + opening.height`。360×800 稳定观测 `composer.y=654`、开场文字底边 `=673`，重叠约 19px；390×844 通过。
5. 360×800 已自动复现 6/6，其中包含 `--repeat-each=3` 的 3/3。

## 敏感信息复核

提交前扫描状态：`PASS`。

- `scripts/scan-repository-secrets.mjs`：347 个 tracked/candidate 文件通过，未打印任何 secret 值。
- 对 `artifacts/exploratory-qa/**`、QA 文档/配置/测试及 8 个 trace 的全部解包内容执行高置信密钥与 header-value 扫描：0 命中。
- 检查模式覆盖 Bearer、GitHub/OpenAI/Google key 前缀、私钥头、`TRAINING_STATE_SECRET`/`LLM_API_KEY`/`AZURE_SPEECH_KEY` 赋值和非脱敏 `x-training-state`。
- 360×800 与 390×844 两张提交截图已人工复核，仅含公开病例信息和本地构建元数据，无 Cookie、Authorization、签名、环境变量值、浏览器用户数据或直接身份信息。
- fixture transcript 自带 `containsSecrets=false`、`containsDirectIdentifiers=false`；其本身仍不提交 Git。

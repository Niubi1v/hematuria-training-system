# 探索式 QA 证据索引

当前 Production 与运行时证据基线：`c4ac9b5a59021bed10dc2d94c4ebf4d8f97badd2`
QA 分支：`codex/hematuria-exploratory-qa`
本机证据根目录：`<QA_WORKTREE>\artifacts\exploratory-qa\`

## 提交 Git 的最小证据集

| 证据名称 | 对应测试或缺陷 | 文件路径 | 大小（字节） | 提交 Git | 未提交原因 | 本机保留位置 |
| --- | --- | --- | ---: | --- | --- | --- |
| 360×800 遮挡对照帧 | HEM-P1-027 / `mobile composer does not cover...` | `screenshots/training-p001-zh-viewport-360x800.png` | 49,561 | 是 | — | 证据根目录下同路径 |
| 390×844 无遮挡对照帧 | HEM-P1-027 / 同一几何断言 | `screenshots/mobile-opening-composer-no-overlap-390x844.png` | 52,142 | 是 | — | 证据根目录下同路径 |
| 360×800 最小失败 trace | HEM-P1-027 / 同一几何断言 | `traces/mobile-opening-composer-overlap-360x800.zip` | 6,773 | 是 | — | 证据根目录下同路径 |
| 阶段提交双击失败帧 | HEM-P2-028 / `rapid double stage submission...` | `screenshots/stage-submit-double-click-1440x900-failure.png` | 162,293 | 是 | — | 证据根目录下同路径 |
| 阶段提交双击最小 trace | HEM-P2-028 / 同一幂等断言 | `traces/stage-submit-double-click-1440x900.zip` | 10,401 | 是 | — | 证据根目录下同路径 |
| 英文开场语言失败代表帧 | HEM-P1-029 / live session UI | `screenshots/live-english-opening-language-1440x900-failure.png` | 148,732 | 是 | — | 证据根目录下同路径 |
| 患者元语言失败代表帧 | HEM-P1-033 / P004 live API/UI | `screenshots/live-p004-clots-teacher-meta-390x844-failure.png` | 71,371 | 是 | — | 证据根目录下同路径 |
| 语言切换授权失败代表帧 | HEM-P1-034 / 中文→英文 live session | `screenshots/live-language-switch-authorization-1440x900-failure.png` | 145,682 | 是 | — | 证据根目录下同路径 |
| Patient Session v2 聚合矩阵 | HEM-P1-030 / 42×37×双语×双问法 | `reports/patient-session-matrix-summary.json` | 1,124 | 是 | —；只含计数及唯一失败组，不含完整回答 | 证据根目录下同路径 |
| 公开 handler 代表烟测 | HEM-P1-030 / 17 项 API adapter | `reports/patient-api-adapter-smoke-summary.json` | 330 | 是 | —；只含通过计数，不含请求 header/body 或完整回答 | 证据根目录下同路径 |
| 会话能力安全矩阵 | 19 项签名/绑定/过期/幂等合同 | `reports/session-capability-matrix-summary.json` | 2,917 | 是 | —；不含 token、session ID、完整请求或回答 | 证据根目录下同路径 |
| ff1a932 优先回归聚合摘要 | 本轮基线、P1、P2、评分/数据合同、路由与环境分层 | `reports/ff1a932-priority-regression-summary.json` | 3,566 | 是 | —；仅计数、状态与公开部署元数据 | 证据根目录下同路径 |
| 8e7d148 夜间 QA 聚合摘要 | 当前基线、第一阶段、P1/P2、评分/数据、UI 与环境分层 | `reports/8e7d148-night-qa-summary.json` | 4,573 | 是 | —；仅计数、状态和公开门禁元数据，不含问答或凭据 | 证据根目录下同路径 |
| 3a16f931 夜间 QA 聚合摘要 | 当前基线、Preview、真实 AI、20 轮、路由、UI 与缺陷 | `reports/3a16f931-night-qa-summary.json` | 2,722 | 是 | —；仅计数、状态和公开 health 元数据，不含问答或凭据 | 证据根目录下同路径 |
| 657ba5d Preview稳定性聚合 | 当前精确部署health、恢复/计时、语言纠正、代表主诉、双改写、跨语言/多问题、刷新失败、内容安全及会话能力边界 | `reports/657ba5d-navigation-summary.json` | 9,535 | 是 | —；仅配置布尔值、来源、病例/类别、请求/DOM计数、公开错误码与聚合耗时，不含问答或凭据 | 证据根目录下同路径 |
| 657ba5d AI接口防滥用聚合 | 本地Origin/CORS、capability、角色/字段/输入、幂等并发、限流与恢复四脚本 | `reports/657ba5d-agent-abuse-summary.json` | 2,121 | 是 | —；仅脚本状态、覆盖布尔值和provider guard计数，不含请求ID、响应正文或环境值 | 证据根目录下同路径 |
| 移动语音触控目标聚合 | HEM-P2-044 / 44×44 CSS px 几何断言 | `reports/hem-p2-044-touch-targets-summary.json` | 645 | 是 | —；仅 viewport 和几何尺寸 | 证据根目录下同路径 |
| 390×844 语音触控失败帧 | HEM-P2-044 / 语音设置 | `screenshots/hem-p2-044-touch-targets-390x844-failure.png` | 73,163 | 是 | —；公开合成病例 UI，无凭据或隐私 | 证据根目录下同路径 |
| 数据Agent结构审计 | HEM-P1-046 / 42例257条结果元数据合同 | `reports/data-agent-structured-audit.json` | 4,822 | 是 | —；仅病例/医嘱ID、状态和缺失字段，不含医学值 | 证据根目录下同路径 |
| 数据Agent元数据失败帧 | HEM-P1-046 / P001第2阶段报告卡 | `screenshots/hem-p1-046-data-agent-metadata-1440x900.png` | 61,150 | 是 | —；本地fixture进入阶段、Production数据行与渲染器；不含凭据或身份数据 | 证据根目录下同路径 |
| 数据Agent元数据最小trace | HEM-P1-046 / 开立代表检验并读取单位/参考范围 | `traces/hem-p1-046-data-agent-metadata-1440x900.zip` | 4,875,690 | 是 | —；在进入第2阶段后重置，仅保留开立/渲染/失败断言链路 | 证据根目录下同路径 |
| 数据Agent状态呈现聚合 | HEM-P1-047 / 三状态本地化与异常呈现 | `reports/hem-p1-047-data-agent-status-1440x900.json` | 783 | 是 | —；只含状态计数、viewport、语言和呈现属性，不含医学值 | 证据根目录下同路径 |
| 数据Agent状态裸显代表帧 | HEM-P1-047 / 中文1440×900报告卡 | `screenshots/hem-p1-047-data-agent-status-zh-1440x900.png` | 62,153 | 是 | —；仅非医学QA fixture与Production渲染器，无凭据或身份数据 | 证据根目录下同路径 |
| 数据Agent状态呈现最小trace | HEM-P1-047 / 三状态与异常属性断言 | `traces/hem-p1-047-data-agent-status-1440x900.zip` | 4,960,528 | 是 | —；进入第2阶段后重置，仅保留order/渲染/失败断言链路 | 证据根目录下同路径 |
| 数据Agent双语全量审计 | HEM-P1-048 / 42例257条英文目录与报告可见字段 | `reports/data-agent-bilingual-audit.json` | 20,765 | 是 | —；只含病例/医嘱ID、字段命中计数和聚合比例，不含医学值、请求/响应正文或凭据 | 证据根目录下同路径 |
| 数据Agent英文中文裸显代表帧 | HEM-P1-048 / P008英文1280×720目录与CBC报告卡 | `screenshots/hem-p1-048-data-agent-english-1280x720.png` | 317,246 | 是 | —；公开合成病例与Production UI，无凭据或身份数据 | 证据根目录下同路径 |
| 数据Agent英文中文裸显最小trace | HEM-P1-048 / 英文目录、合法医嘱及报告卡断言 | `traces/hem-p1-048-data-agent-english-1280x720.zip` | 3,790,852 | 是 | —；只保留本地QA fixture、Production handler/渲染器与失败断言链路 | 证据根目录下同路径 |
| GitHub Pages 路由预检 | HEM-P2-043 部署分层 / 42 卡片、12 显示路由、30 旧内部路由 | `reports/deployed-route-preflight-deployed-1440x900.json` | 272 | 是 | —；只含公开 URL、viewport 和计数 | 证据根目录下同路径 |
| GitHub Pages 路由不匹配帧 | HEM-P2-043 / `BLOCKED_DEPLOYMENT_MISMATCH` | `screenshots/github-pages-display-route-mismatch-deployed-1440x900-failure.png` | 358,598 | 是 | —；公开 Pages 目录，无凭据或隐私 | 证据根目录下同路径 |
| 360×800 中文开场修复帧 | HEM-P1-027 / 开场完整可见 | `screenshots/hem-p1-027-zh-opening-layout-360x800-zh-opening-pass-emulation.png` | 67,162 | 是 | — | 证据根目录下同路径 |
| 360×800 英文开场修复帧 | HEM-P1-027 / 开场完整可见 | `screenshots/hem-p1-027-en-opening-layout-360x800-en-opening-pass-emulation.png` | 70,515 | 是 | — | 证据根目录下同路径 |
| 390×844 中文开场对照帧 | HEM-P1-027 / 开场完整可见 | `screenshots/hem-p1-027-zh-opening-layout-390x844-zh-opening-pass-emulation.png` | 66,973 | 是 | — | 证据根目录下同路径 |
| 390×844 英文开场对照帧 | HEM-P1-027 / 开场完整可见 | `screenshots/hem-p1-027-en-opening-layout-390x844-en-opening-pass-emulation.png` | 70,692 | 是 | — | 证据根目录下同路径 |
| 360×800 手动上翻帧 | HEM-P1-027 / 不强制回底与新消息入口 | `screenshots/hem-p1-027-zh-manual-scroll-360x800-zh-manual-scroll-pass-emulation.png` | 72,894 | 是 | — | 证据根目录下同路径 |
| 360×800 回到底部帧 | HEM-P1-027 / 最后一条不被遮挡 | `screenshots/hem-p1-027-zh-manual-scroll-360x800-zh-latest-pass-emulation.png` | 68,785 | 是 | — | 证据根目录下同路径 |
| 英文开场修复代表帧 | HEM-P1-029 / live session UI | `screenshots/live-english-opening-language-1440x900-pass-emulation.png` | 148,082 | 是 | — | 证据根目录下同路径 |
| 语言切换修复代表帧 | HEM-P1-034 / 中文→英文 live session | `screenshots/live-language-switch-authorization-1440x900-pass-emulation.png` | 146,285 | 是 | — | 证据根目录下同路径 |
| 患者元语言隔离修复帧 | HEM-P1-033 / P004 live API/UI | `screenshots/live-p004-clots-teacher-meta-390x844-pass-emulation.png` | 74,460 | 是 | — | 证据根目录下同路径 |
| 70ea9b3 自然问法聚合 | HEM-P1-050 / 42例×10问法×双语 | `reports/70ea9b3-patient-natural-phrasing-audit.json` | 8,948 | 是 | —；只含分组case ID、intent、布尔值和计数，不含问题/回答/医学值 | 证据根目录下同路径 |
| 70ea9b3 优先复测摘要 | 第一阶段、Preview、42例、七阶段、UI、HEM-P1-050/051 | `reports/70ea9b3-priority-qa-summary.json` | 4,882 | 是 | —；只含状态、计数、耗时和公开SHA，不含凭据或问答 | 证据根目录下同路径 |
| 70ea9b3 完整流程补录摘要 | 42例双语七阶段、Production浏览器回归、服务端合同与capability复跑 | `reports/70ea9b3-completion-regression-summary.json` | 1,663 | 是 | —；只含计数、脚本名、状态和公开SHA，不含医学值、回答或凭据 | 证据根目录下同路径 |
| c4ac9b5 自然问法聚合 | HEM-P1-050 / 840自然场景、1,428 canonical检查、双语/否定/选择/复合问句 | `reports/c4ac9b5-patient-natural-phrasing-audit.json` | 2,282 | 是 | —；只含intent类别、病例计数、布尔值和聚合指标，不含完整问题、回答或医学值 | 证据根目录下同路径 |
| c4ac9b5 Data Agent评分隔离最小复现 | HEM-P1-052 / 23个缺审核英文名称项目、29条评分规则链及中文合法路径反例 | `reports/c4ac9b5-data-agent-scoring-isolation.json` | 1,079 | 是 | —；只含聚合计数，不含医嘱名、医学结果、token、签名或请求正文 | 证据根目录下同路径 |
| c4ac9b5 优先QA摘要 | HEM-P1-050/051/052、Preview、Data Agent、42例七阶段、构建与环境边界 | `reports/c4ac9b5-priority-qa-summary.json` | 3,934 | 是 | —；只含状态、计数、耗时与公开SHA，不含问答、请求标识或凭据 | 证据根目录下同路径 |
| c4ac9b5开放缺陷回归摘要 | HEM-P1-030/045/052、HEM-P2-028/044及QA运行器 | `reports/c4ac9b5-open-defect-regression-summary.json` | 2,438 | 是 | —；只含状态、slot类别、计数、CSS几何和公开SHA，不含完整问答、医嘱名、医学值或凭据 | 证据根目录下同路径 |
| c4ac9b5 P006–P012 Preview主诉聚合 | HEM-P1-053 / 三轮双语自然主诉与英文canonical控制 | `reports/c4ac9b5-unsampled-preview-batch-1-summary.json` | 1,564 | 是 | —；只含病例ID、source/provider、安全布尔值和计数，不含完整问答、request body、token、header或凭据 | 证据根目录下同路径 |

SHA-256：

- `training-p001-zh-viewport-360x800.png`：`E2C6A8622724EAB19F3B0520DF667268C49C30871F1F9C953D967C441FFA9CB7`
- `mobile-opening-composer-no-overlap-390x844.png`：`192EE283E8ACEFD216A7B7038E12FB5F015E8FEFED90D05DCEB686BD07B4D019`
- `mobile-opening-composer-overlap-360x800.zip`：`42AF297C8AFABF3697018B723887C6A4A0D858478BA21145931AD0AE34C06966`
- `stage-submit-double-click-1440x900-failure.png`：`8205F568199065CF678E0699917971C541746AF4AC0902F30264D83D5471D20D`
- `stage-submit-double-click-1440x900.zip`：`E95BA41F88BED08E3A6563F427AFA565EB289BA7FE994529DCFBB9FFA7E731D9`
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
- `hem-p1-027-zh-manual-scroll-360x800-zh-manual-scroll-pass-emulation.png`：`42BA7998D2988F77E2014B97392227F628B01A0527ADD402061DF062D3DADCF1`
- `hem-p1-027-zh-manual-scroll-360x800-zh-latest-pass-emulation.png`：`C9944751024F82F460A6BA0FC30229CE3824C119E62E1B1A42DDB084D5D15999`
- `live-english-opening-language-1440x900-pass-emulation.png`：`42C009FD257F309E8FCD0C9820448DDCFF0ED506848440C4F30C49A2A14FC40C`
- `live-language-switch-authorization-1440x900-pass-emulation.png`：`D686843AE6DB9F1A6A472D74A79EF95F0A3B35FBAB787BBDFD06749DF4194A59`
- `live-p004-clots-teacher-meta-390x844-pass-emulation.png`：`B60A4014AC55BE0611249FE7BD5D7DB219527A52D2D48EBE729222E30FA0B591`
- `patient-session-matrix-summary.json`：`798C7757E7A8F656EE5392894ED9A43D2CBFD8B341109E5565B66DAF31B3FDBF`
- `patient-api-adapter-smoke-summary.json`：`63E05E49E1C4A85F9DDC7A35AF994B3C4614A35FFE647BFB831866852DE0AD25`
- `3a16f931-night-qa-summary.json`：`4E4DD12A77FEA9066E7ECC79FFE8E69DC3061FD3417D907C71F80D036E99EF7D`
- `657ba5d-navigation-summary.json`：`7DADEC4769E1936F9E5A63A671A864350C809906DBD1576945CA1C62D91B02F1`
- `657ba5d-agent-abuse-summary.json`：`64653D71A5701714DFE97309AC55F17F1BBA47D8121F5CCB5EE71EC8D0BD86D4`
- `hem-p2-044-touch-targets-summary.json`：`D649401B4D980FE0DD44C2F7310B965F87A08F737678073F04E4FBB38C99595C`
- `hem-p2-044-touch-targets-390x844-failure.png`：`B35AAEC4F35365C384E2690E56CE98C0B8A2368907BF171D249B410061DD7703`
- `data-agent-structured-audit.json`：`2EF4B0F91A2585DB8D29DF3D76956B85A8C08C987003B3A27BA2888D2609E1DA`
- `hem-p1-046-data-agent-metadata-1440x900.png`：`CEBA711E08577D31FF1C12DDF52435291AFB2A303CFACE6B1E2A02938F0B89B6`
- `hem-p1-046-data-agent-metadata-1440x900.zip`：`22C5E80AB8BAC9552784B7125C72D31D71C30F3D31FC0813AAB992478D800D6A`
- `hem-p1-047-data-agent-status-1440x900.json`：`03E3F22697B6A142287294902701A058F2EE731E397560393CB9B7575230F913`
- `hem-p1-047-data-agent-status-zh-1440x900.png`：`78F93DDF673D46E2E2F3832B34FBC961B362058B016D6F02C6DE9C275341D3BE`
- `hem-p1-047-data-agent-status-1440x900.zip`：`63D9DDB12C544DD3DD91E8EA2A7A969CBA5ED968385F1B75FD593A44D8E5A6C5`
- `data-agent-bilingual-audit.json`：`F6356AD7A1EEEE1ED4BBC81BE22A715A9F2183DF593B163FB9F37B9503C6594F`
- `hem-p1-048-data-agent-english-1280x720.png`：`848F5D8A8D907A77E60C4507AC0148EF49879142C540BF26F5492C6EBFF65A51`
- `hem-p1-048-data-agent-english-1280x720.zip`：`4C243925F9E83C118CE44D510B12D36ACA78BABF915E3E609AE33E81427E162B`
- `70ea9b3-patient-natural-phrasing-audit.json`：`3C78C8FC28C5FD7F75342D1A6920988D05CA58B3CF43BE717A56AA30025F9959`
- `70ea9b3-priority-qa-summary.json`：`B6DF36702B09DF8D0F7745AF7862467B2F484BAE5D18534A55A82125C9E0EF60`
- `70ea9b3-completion-regression-summary.json`：`A9690BC5ECD37F3328851CEF772FC9DE206332918D46861077BFA9D9712CE853`
- `c4ac9b5-patient-natural-phrasing-audit.json`：`B8E9D084BA15D92A814FD101EEA6F33863FDC8E116A59A027BED7BB387370F26`
- `c4ac9b5-data-agent-scoring-isolation.json`：`81AD797A03D63EBB7C03C341CC937B061509E804F9BFD6D0E36E1DA644A32E96`
- `c4ac9b5-priority-qa-summary.json`：`64222A8986CF6299B374BB2C8B58514BB68C5BF579E82483FC99F1470806042E`
- `c4ac9b5-open-defect-regression-summary.json`：`8768B5178059CE241A2966958494E1AA74621C6B9937F6816D76C7C0FF401D07`
- `c4ac9b5-unsampled-preview-batch-1-summary.json`：`10DAE327FE4C7F8E795D16EB3088A975059BB7C18F90D175D6D572D5DB53E017`

## 仅本机保留、不提交 Git

| 证据名称 | 对应测试或缺陷 | 文件路径 | 文件数 | 大小（字节） | 提交 Git | 未提交原因 | 本机保留位置 |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| HTML/JSON/JUnit、console/network、test-results 和本地服务日志 | 十一轮汇总、fixture E2E、HEM-P1-027–053、HEM-P2-028/043/044、Pages/Preview 分层 | `reports/**`（排除上表最小聚合/预检 JSON） | 236 | 2,609,706 | 否 | 可重建；含重复矩阵/handler/HEM-P1-052聚合、完整运行日志及部分本机绝对路径；整个 HTML/report 目录不进 Git | 证据根目录下同路径 |
| 通过、重复及非最小失败截图 | 四 viewport、42 页面壳、20 轮、七阶段/360、a11y、live API、Pages/数据Agent非代表帧 | `screenshots/**`（排除上表代表帧） | 100 | 16,209,715 | 否 | 通过、重复或非代表视觉证据；HEM-P2-044几何未变化，不重复提交代表帧 | 证据根目录下同路径 |
| 通过、重复及大体积 trace | 公共页、42 页面壳、20 轮、七阶段/360、a11y、live API、路由矩阵及其余viewport | `traces/**`（排除上表最小 trace） | 53 | 507,799,000 | 否 | 通过场景、重复复跑或大体积失败 trace；可由测试重建 | 证据根目录下同路径 |
| 脱敏 fixture transcript | P001 中文 20 轮 | `transcripts/fixture-20-turn-interview-390x844.json` | 1 | 3,295 | 否 | 非真实 AI，且不是缺陷最小证据 | 证据根目录下同路径 |
| 失败录像 | HEM-P1-027–051、HEM-P2-028/043及旧静态history环境尝试 | `videos/**` | 36 | 33,090,075 | 否 | 截图与最小 trace 已足够；按规则视频不进 Git | 证据根目录下同路径 |

第11轮索引更新后清点本机共有473个证据文件、575,760,717字节；纳入HEM-P1-053脱敏聚合后，Git最小证据集为47个文件（含本索引）、16,050,530字节，其余426个文件、559,711,791字节仅本机保留。定向Playwright复跑按reporter设计重建HTML/JUnit/test-results；聚合JSON、代表截图与历史最小trace进入Git，大量重复截图、完整报告、长trace、录像与transcript不整体提交。没有浏览器用户目录进入证据根目录；`.pnpm-store`、`node_modules`、`.next`与根目录`test-results/**`不进入证据或提交。

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
9. P001中文错误总结纠正只保存布尔结果：基线与纠正两轮均live AI，错误“今天首次且从未反复”被纠正，教师元语言/最终诊断泄露均为false；原始回答不进附件、console或Git。一次开发运行因“三个月”自然修饰词正则过窄失败，修正QA口径后1/1通过，专用输出均扫描后删除。
10. P001英文错误总结纠正同样只保留布尔结果，两轮live AI、纠正成立、中文/教师元语言/最终诊断泄露均false。无指代对象的英文模糊问题另为1/1 live AI澄清，病史信号0且未倾倒完整病史；首个可自然指向页面主诉的问法不登记为产品失败，所有专用输出扫描后删除。
11. 10类代表病例开放式主诉覆盖P013/P017/P019/P023/P028/P032/P034/P037/P038/P042，中英文共20样本全部live AI。Git聚合只保留病例、类别、来源和零失败计数；Playwright逐样本附件及回答正文经wrapper扫描后删除，不保留完整问答。
12. 病程时长双改写覆盖P019/P023/P032/P038/P042中英文10对。7对live AI可评价事实一致性7/7；P032中英文和P042中文共3对稳定safety boundary，仅记来源一致3/3，不强迫隔离回答披露事实。首轮/复跑中的歧义问法和开发输出均由wrapper扫描删除，不进入Git。
13. P023同session中文→英文→中文事实保持共3轮，来源为2次DeepSeek live AI和1次明确safety boundary，病程时长3/3一致、agent/history 3/3、切换初始化均200。前两次严格全live断言失败和最终通过输出均由wrapper扫描后删除；Git只保留分层计数，不保留回答正文。
14. P038中英文各5轮多问题追问共10回答，来源为8次DeepSeek live AI和2次中文safety boundary；重复时长4/4一致、agent/history 10/10。Playwright附件及回答正文由wrapper扫描后删除，Git只保留来源、计数与泄露布尔结果。
15. HEM-P1-045在P037中英文“2轮→刷新→继续提问”三批有效运行中6/6复现：DOM均6→6，但刷新后agent 401 `session_capability_required`、history缺失、attempt/session重初始化0/0。Git只保留失败断言及状态/错误码/耗时聚合；每批原始输出经wrapper扫描后删除。
16. 本地AI接口防滥用四脚本使用既有handler和内存/模拟Upstash边界通过；最小JSON只记录覆盖类别、运行时和provider guard结果。预期失败日志中的随机request ID、测试环境值和响应正文均不进入证据或Git；未执行真实Preview限流/故障注入。
17. P001中英文各1个真实Preview内容滥用请求均由safety boundary处理，provider/first-token timing 0、agent/history 2/2、内部/教师/诊断/代码泄露0。完整请求与回答、Playwright附件和失败上下文不保留；Git只保存计数与布尔结果。
18. P001真实Preview公开API会话能力拒绝共11项，缺失/不匹配state、capability、case、language、mode、attempt与stage均精确返回预期401/403/409错误；provider/first-token timing和跨源保护头为0。能力值、token、幂等键、请求标识与原始Playwright附件均不保留，Git只保存场景名、公开错误码和聚合计数。
19. HEM-P1-046全量结构审计覆盖42例/257条结果，28条含数值final检验结果全部缺`unit/referenceRange`，涉及13例；最小JSON不保留医学值。P001代表浏览器证据使用fixture进入第2阶段、Production数据行和渲染器，7/7显示“单位—/参考范围—”；聚焦截图和阶段后重置的最小trace进入Git，全页图、console/network、录像、test-results与重复trace仅本机保留。
20. HEM-P1-047使用非医学fixture隔离Production报告卡呈现：四固定viewport按中英文分配4/4均裸显三种内部状态，带异常标志的final卡片4/4仍为普通reported。Git只保留1440×900聚合、focused截图和阶段后重置的最小trace；其余3份聚合、7张截图、3份trace、4份录像、console/network和test-results仅本机保留。首轮选择器误点未发order请求，不计产品复现，其覆盖产物已被最终同名证据覆盖或保持本机。
21. HEM-P1-048全量handler审计连续2/2一致：42/42病例、257/257结果均返回，`handlerFailures=0`，但英文目录/报告累计1,285个CJK可见字段命中；60个目录医嘱中57个英文显示名、60个主分类和49个次分类含中文，23个医嘱无无中文别名；257份结果的`orderCategory/result/impression`各257/257含中文，`value`为74/257。浏览器四viewport按英文P008合法CBC链路4/4复现，handler 12/12为200、provider调用0；Git只保留全量计数、1280×720代表帧和最小trace，其余12份报告、7张截图、3份trace、4份录像与test-results仅本机保留。一次CTU前置医嘱遗漏和首轮QA prerequisite遗漏均属于测试输入错误，不计产品失败。

## `70ea9b3` 第八轮证据摘要

1. `70ea9b3-priority-qa-summary.json` 汇总第一阶段/capability、Preview session/live_ai/fallback/性能、42例路由、七阶段、UI和缺陷状态；不含完整问答、token、session、Cookie、Authorization、bypass secret、Redis凭据或环境变量值。
2. `70ea9b3-patient-natural-phrasing-audit.json` 只保留42例×10问法×双语按失败模式分组后的case ID、intent、布尔值和聚合计数；没有完整问题、回答或医学值。可重建脚本为`tests/exploratory/patient-natural-phrasing-audit.mjs`，840个内存场景与失败断言保持启用。
3. 本地42例逐项路由报告`reports/local-p001-p042-route-matrix.json`、两张七阶段最终报告截图、四视口HEM-P1-027其余截图/trace、console/network、HTML/JUnit和录像全部本机保留；聚合摘要已足以支持提交结论，不把约500MB可重建证据加入Git。
4. 真实Preview只通过安全wrapper执行。每次专用输出都在实际凭据字节/header扫描通过后删除；Git与本机证据根均不保留Preview trace、截图、完整回答或原始test-results。缺陷HEM-P1-051以脱敏source/request/history计数复现。
5. HEM-P1-027当前轮更新两张360×800中文手动上翻/回到底部代表帧；快速双击阶段提交更新10,401字节最小trace。其余双语×四视口证据因重复或体积大不提交。
6. `.pnpm-store/`是本地依赖缓存，不属于证据根、未纳入索引和Git；浏览器用户数据目录、密钥文件与环境转储均未创建或提交。
7. `70ea9b3-completion-regression-summary.json` 补录 42 例双语七阶段 84 条 UI 旅程、72 项 Production 浏览器回归、10 个确定性服务端合同和 capability 两次 19/19；仅含计数、脚本名、状态与完整 Production SHA，不含医学值、回答正文、凭据、请求标识或环境变量值。两份逐项 capability 原始 JSON 因内容重复而仅本机保留。

## `c4ac9b5` 第 11 轮 HEM-P1-053 证据摘要

1. `c4ac9b5-unsampled-preview-batch-1-summary.json`仅保存P006–P012病例ID、语言、source/provider、公开fallback枚举、安全debug布尔值、request/history与泄露计数；不含完整问题/回答、request body、session/token/header、签名、Cookie或环境值。
2. 三轮自然双语批累计中文21/21 live_ai、英文21/21 classifier-disabled rule fallback；第三轮另有7个英文canonical控制，均进入DeepSeek后成为safety boundary。聚合明确区分两条失败路径，不把fallback计作live AI。
3. 可重建测试为`tests/preview/preview-stability.spec.mjs`中的`@preview-unsampled-chief-complaint-batch-1`。安全wrapper先扫描实际凭据字节与敏感header名，再删除Playwright原始stdout/stderr、附件和test-results；Git不提交真实Preview截图、trace、录像或完整问答。
4. 本批没有新增本机大体积证据；总证据文件仅增加1份1,564字节聚合，既有426个未提交文件及559,711,791字节清单保持不变。

## 敏感信息复核

提交前状态：`PASS`（2026-07-24，全证据树复扫）。

- 已提交和拟提交截图均经视觉复核，只含公开合成病例界面、fixture 文本和本地构建元数据；没有 Cookie、Authorization、签名、环境变量值、浏览器用户数据或直接身份信息。
- Production `ff1a932` 的 `test-secret-scanner.mjs` 通过文本、二进制元数据、压缩 workbook、占位符、非泄露输出、完整历史与浅克隆 fail-closed 合同。
- 对第10轮最终拟提交集执行 `tests/exploratory/scan-staged-secrets.mjs`：13个staged文件、完整可达文本历史，敏感值命中0；只输出路径/规则/计数，不输出值。
- 只读 `tests/exploratory/scan-evidence-secrets.ps1` 对刷新后的证据根目录472个物理文件及ZIP内8,703个条目执行流式扫描，累计读取1,301,548,748字节；Preview/training/KV/Upstash运行时值、私钥、Bearer/JWT、provider/API key、AWS/Google/Azure key、非占位敏感环境赋值、Authorization/Cookie/Set-Cookie和运行时精确值命中均为0，扫描过程不输出值。
- 第10轮的13个staged路径严格为6份Goal QA文档、EVIDENCE_INDEX、4个QA测试/运行器脚本、1份更新的评分隔离聚合和1份新增开放缺陷聚合；没有截图、trace、录像、完整报告目录、完整问答或凭据上下文进入本提交。上一里程碑已提交的代表截图和最小trace保持不变。
- 第11轮全证据树扫描覆盖473个物理文件、ZIP内8,703个条目和1,301,551,884字节，敏感值命中0；新增HEM-P1-053聚合未保存问答、request body、token、header、签名、Cookie或环境值。
- 第11轮拟提交范围严格为6份Goal QA文档、EVIDENCE_INDEX、1个Preview QA测试和1份脱敏聚合；`scan-staged-secrets.mjs`复核9个staged文件及完整可达文本历史，敏感值命中0。不含业务代码、医学数据、截图、trace、录像、HTML、完整问答或浏览器用户数据。
- 通用 candidate scanner 对 5 个本机不提交的大 trace 按大小上限 fail-closed（4 个 ZIP 内 trace entry 过大、1 个 ZIP 文件过大）；这些文件未 staged，且已由上面的全证据树流式/解包扫描覆盖并得到 0 命中。未删除或放宽 scanner 断言。
- 绝对用户路径只出现在不提交的 `reports/junit.xml`（36）、`local-dev-3010d.stdout.log`（16）、`local-dev-3010e.log`（34）和 `local-dev-3010f.log`（1），全部保持本机未跟踪。1,551 个邮箱样式全部是 Playwright `page@hash` 内部 ID；504 个身份证样式均无有效生日；8 个手机号样式嵌在哈希中，另 1 个来自 network 浮点耗时，均为误报。
- `reports/results.json` 等其余本机报告也可能含 `<QA_WORKTREE>` 的实际绝对路径，因此整类报告保持不提交；本索引使用占位符，不暴露用户目录。
- fixture 响应中的训练状态仅为明确测试占位符；live adapter 的签名材料运行时随机生成且不输出，真实签名只存在于进程内存。network 摘要不保存 header、query、attemptId、sessionId 或问答正文。
- 后续每个里程碑仍重复仓库扫描和 trace 解包扫描；任何新增命中必须在提交前定位并排除。

# P001–P042 探索式覆盖矩阵

图例：`PENDING` 未执行；`SHELL` 页面壳/七阶段入口/泄露门禁；`CONTRACT_17` 中文 17 问结构化历史契约；`CONTRACT_6` 英文 6 问 Patient Agent fixture；`CONTRACT_360` 42 例事件评分契约；`UI_FIXTURE` 浏览器 UI fixture；`REAL_AI_BLOCKED` 真实 Preview AI 受外部条件阻塞。

| 病例 | 页面壳 | 中文协议/UI | 英文协议/UI | 真实 AI | 七阶段/360 | 视觉证据 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P001 | SHELL+LOCAL_ROUTE_BILINGUAL | UI_FIXTURE+CONTRACT_17 | UI_FIXTURE+CONTRACT_6 | REAL_AI_BLOCKED | UI_FIXTURE+CONTRACT_360 | 4_VIEWPORTS_PASS_EMULATION | 中文 20 轮；七阶段在 1440/390 完成；HEM-P1-027/029/034 已在 `ff1a932` 本地回归通过；真实 AI/真机仍阻塞 |
| P002 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P003 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P004 | SHELL+LOCAL_ROUTE_BILINGUAL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | 4_VIEWPORTS_PASS_EMULATION | HEM-P1-033 在 `ff1a932` 本地回归通过；161 个不安全来源统一 fail-closed，来源修订仍阻塞 |
| P005 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P006 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P007 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P008 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | A11Y_4_VIEWPORTS | 精确医嘱、评分抗伪造和公开路由泄露 fixture 通过 |
| P009 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P010 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P011 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P012 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P013 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P014 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P015 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P016 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P017 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P018 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P019 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P020 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P021 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P022 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P023 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P024 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P025 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P026 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P027 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P028 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P029 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P030 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P031 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P032 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P033 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P034 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P035 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P036 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P037 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P038 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P039 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P040 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P041 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | PENDING |  |
| P042 | SHELL | CONTRACT_17 | CONTRACT_6 | REAL_AI_BLOCKED | CONTRACT_360 | 1440×900 | 首轮页面壳末端截图 |

## 全 42 例实际 Patient Session 横向矩阵

- 第 3 轮对表中全部 42 例运行实际 `server/patientSession.js`：37 canonical slot × 中文/英文 × 2 条固定问法，共 6,216 个路由探针，并逐条重复一次；另完成 84 个 session 初始化和 168 个明确诊断/报告边界。
- 结构层 42×37×2 = 3,108 个双语单元均非空，但全部仍 `teacherReviewRequired=true`，只记结构覆盖，不能记医学通过。
- 结果为 `RULE_MATRIX_FAIL`：630 个路由错配（HEM-P1-030/031）、42 个英文开场语言失败（HEM-P1-029）、191 个唯一事实单元被压为 unknown（HEM-P1-032）、3 个唯一单元出现教师元语言（HEM-P1-033）。失败分布覆盖全表，不能把任一病例的实际 Patient Agent 列改写为完成通过。
- 18 条 HEM-P0-023 直接冲突继续隔离；额外隔离来自 matcher 过匹配，已单独登记工程缺陷，不改变医学裁决状态。

`CONTRACT_17`、`CONTRACT_6` 与 `CONTRACT_360` 是确定性协议/评分契约覆盖，不等于逐病例完整 UI 问诊、自然语言质量或医学真值通过。P002–P042 完整七阶段 UI 旅程和更多逐例视觉证据仍为后续可自动化工作。

真实 AI 列在 Preview 权限与变量满足前统一为 `REAL_AI_BLOCKED`，不能由 fixture 改写为通过；18 条冲突 quarantine 通过也不能解除 HEM-P0-023。

## Production `96fcf80` 增量覆盖

- 全 42 例矩阵在签名训练状态门禁下重跑两次，仍为 84 session、6,216 路由、6,216 重放、168 边界、1,127 失败实例/127 组；因此 P001–P042 的规则链路覆盖保持有效，HEM-P1-029–033 未被新鉴权代码修复或遮蔽。
- 新增安全合同为系统级 19/19：session/agent 对 case、language、mode、attempt 和 expiry 的绑定均通过，幂等重复/冲突/single-flight 通过；该结果不改变逐病例医学真值、自然语言或 `REAL_AI_BLOCKED` 列。
- P001 新增四 viewport 中文→英文授权回归并 4/4 失败（HEM-P1-034）；P001 的英文开场纯度仍 4/4 失败。P004 教师元语言仍 4/4 失败。
- HEM-P1-027 新基线移动回归为 `360×800` 失败、`390×844` 通过；HEM-P2-028 桌面双击回归仍失败。未重新把 P002–P042 标成完整 UI 七阶段通过。
- 当前 Production `52c2432` 相对该运行时基线没有病例、UI、API、server 或 `data/**` 差异，只增强 secret scanner；上述逐病例覆盖和失败计数继续适用。

## Production `ff1a932` 增量覆盖

- 全 42 例签名规则矩阵重跑：84 session、6,216 路由、6,216 重放、168 边界；失败由 1,127 实例/127 组降为 1,079 实例/117 组。HEM-P1-029 的 42 个英文开场失败与 HEM-P1-033 的 6 个教师元语言实例均降为 0；HEM-P1-030/031/032 仍开放。
- 161 个不安全确定性来源由公开 API fail-closed，返回 `unsafe_deterministic_answer`、空 facts/slots；单独记为 `BLOCKED_SOURCE_REVISION`，不能作为医学内容通过。
- 本地 Next 的 `/cases/P001/`–`/cases/P042/` 直接 URL、页面刷新、中文和英文 UI 均为 42/42 通过；病例目录实际 `.html` anchor 点击为 42/42 404，登记 HEM-P2-043。该本地环境结果不替代部署环境。
- GitHub Pages 当前指向旧 `main@5a3ad119...`，为 `BLOCKED_BASELINE_MISMATCH`；精确 `ff1a932` Vercel Preview 匿名访问进入登录页，为 `BLOCKED_PREVIEW_AUTH`。两者均没有被记为病例路由通过或失败。
- HEM-P1-027 的中英文 × 四固定 viewport 共 16/16 `PASS_EMULATION`；HEM-P1-029/033/034 的浏览器定向回归各 4/4 通过；真实手机软键盘/safe-area 保持 `BLOCKED_REAL_DEVICE`，真实 AI 保持 `REAL_AI_BLOCKED`。
- `ff1a932` 的 42 例事件评分、抗伪造、阶段 5/6/7、attempt 隔离、11 例代表 E2E、42 例 376 条查体 QC、P008 精确开单映射及训练 API 安全合同均通过；这些是确定性协议/数据 Agent 覆盖，不替代 42 例逐例医学审批或真实 AI。

## Production `8e7d148` 增量覆盖

- 42×37 双语双改写矩阵当前为 84 session、6,216/6,216 路由、6,216/6,216 重放、168/168 边界、0 失败；HEM-P1-030/031/032 关闭为 `RESOLVED_LOCAL_QA`。295 个不安全确定性来源仍为 `BLOCKED_SOURCE_REVISION`，144/144 医学冲突隔离不解除 HEM-P0-023。
- 本地 desktop/mobile Playwright 68/68；覆盖 P001 双语第一阶段、双向/快速/刷新切换、快速双击、20 轮、日志恢复、语音降级、a11y 和 P008 抗伪造。探索套件另有七阶段 2/2、HEM-P2-028 1/1、HEM-P1-027 移动端 2/2、中文 20 轮 1/1。
- 当前每例的本地 route/Patient/评分/data-agent 合同可标为 `LOCAL_CONTRACT_PASS`；真实 AI 列仍为 `SECURITY_BLOCKED`，不得由 42 例本地通过替代。真实手机列仍为 `BLOCKED_REAL_DEVICE`。
- 真实 GitHub Pages 只映射 12 个显示 ID、30 个旧内部 ID，故全 42 例部署路由仍为 `BLOCKED_DEPLOYMENT_MISMATCH`；当前 Preview 路由矩阵因 QA-SEC-P1-001 为 `SECURITY_BLOCKED`。

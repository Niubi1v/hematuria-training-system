# P001–P042 探索式覆盖矩阵

图例：`PENDING` 未执行；`SHELL` 页面壳/泄露门禁；`CONTRACT_17` 中文 17 问结构化历史契约；`CONTRACT_6` 英文 6 问 Patient Agent fixture；`CONTRACT_360` 42 例事件评分契约；`UI_EMULATION_7_STAGE` 浏览器双语七阶段 fixture；`LIVE_AI_PREVIEW_ZH_EN` 当前 SHA 真实 Preview 中英文均有样本；`REAL_AI_NOT_SAMPLED_CURRENT` 当前 SHA 未逐例抽取真实 AI 样本，不表示环境阻塞。

| 病例 | 页面壳 | 中文协议/UI | 英文协议/UI | 真实 AI | 七阶段/360 | 视觉证据 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P001 | SHELL+ROUTE_PREVIEW | UI_FIXTURE+CONTRACT_17 | UI_FIXTURE+CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN | UI_EMULATION_7_STAGE+CONTRACT_360 | 4_VIEWPORTS_PASS_EMULATION | 当前 Preview 中文 20 轮单 session 与中英稳定性样本；真机仍阻塞 |
| P002 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | 当前 Preview 中英文各 2 次稳定性样本累计 |
| P003 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | 当前 Preview 中英文各 2 次稳定性样本累计；零轮第一阶段通过 |
| P004 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN | UI_EMULATION_7_STAGE+CONTRACT_360 | 4_VIEWPORTS_PASS_EMULATION | 当前 Preview 中英文各 2 次稳定性样本累计；来源修订仍阻塞 |
| P005 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | 当前 Preview 中英文各 2 次稳定性样本累计 |
| P006 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P007 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P008 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | A11Y_4_VIEWPORTS | 精确医嘱、评分抗伪造和公开路由泄露 fixture 通过 |
| P009 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P010 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P011 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P012 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P013 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P014 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P015 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P016 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P017 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P018 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P019 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P020 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P021 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P022 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P023 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P024 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P025 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P026 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P027 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P028 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P029 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P030 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P031 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P032 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P033 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P034 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P035 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P036 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P037 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P038 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P039 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P040 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P041 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING |  |
| P042 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | REAL_AI_NOT_SAMPLED_CURRENT | UI_EMULATION_7_STAGE+CONTRACT_360 | 1440×900 | 首轮页面壳末端截图 |

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

- 42×37 双语双改写矩阵当前为 84 session、6,216/6,216 路由、6,216/6,216 重放、168/168 边界、0 失败；HEM-P1-030/031/032 关闭为 `RESOLVED_LOCAL_QA`。295 次不安全 source-cell 阻断观测对应既有 161 个来源修订项，仍为 `BLOCKED_SOURCE_REVISION`；144/144 医学冲突隔离不解除 HEM-P0-023。
- 本地 desktop/mobile Playwright 68/68；覆盖 P001 双语第一阶段、双向/快速/刷新切换、快速双击、20 轮、日志恢复、语音降级、a11y 和 P008 抗伪造。探索套件另有七阶段 2/2、HEM-P2-028 1/1、HEM-P1-027 移动端 2/2、中文 20 轮 1/1。
- 当前每例的本地 route/Patient/评分/data-agent 合同可标为 `LOCAL_CONTRACT_PASS`；真实 AI 列仍为 `SECURITY_BLOCKED`，不得由 42 例本地通过替代。真实手机列仍为 `BLOCKED_REAL_DEVICE`。
- 真实 GitHub Pages 只映射 12 个显示 ID、30 个旧内部 ID，故全 42 例部署路由仍为 `BLOCKED_DEPLOYMENT_MISMATCH`；当前 Preview 路由矩阵因 QA-SEC-P1-001 为 `SECURITY_BLOCKED`。

## Production `3a16f931` 增量覆盖

- 本地双语七阶段覆盖扩展到 P001–P042：42 例、84 journeys、588 次阶段提交、84 个最终 360 分报告；Production 完整 desktop/mobile Playwright 70 passed / 2 互斥 skip / 0 failed，标记 `PASS_EMULATION`，不替代真机。独立 HEM-P2-044 探针的移动失败另列。
- Vercel Preview 精确部署 SHA 下，病例目录、直接 URL、刷新对 P001–P042 为 42/42，中文与英文入口保持病例，P999 为真实 404；因此所有行的路由为 `ROUTE_PREVIEW_PASS`。GitHub Pages 仍是 12 显示路由/30 旧内部路由，单独保持 `BLOCKED_DEPLOYMENT_MISMATCH`。
- Preview 稳定性两批覆盖 P001–P005 的中英文各 10 个 live AI 样本，总体中文 10/10、英文 10/10；P001 另完成单 session 中文 20/20 和刷新恢复。P006–P042 当前只完成 Preview 路由和本地协议/UI，不把未抽样记成 AI 失败或通过。
- Patient Session v2 为 6,216 路由、6,216 重放、168 边界；711 个 governed unknown 与 18 个 unsafe governed unknown 按新严格合同通过，144/144 冲突 quarantine 保持。唯一失败组是 `Have you had a urinary procedure?` 在 42/42 例匹配 `triggers`，HEM-P1-030 标记 `REGRESSED_LOCAL_QA`。
- 42 例评分、数据 Agent、attempt 隔离和结构化历史合同继续本地通过；HEM-P0-001/023 与来源审批不因工程覆盖解除，真实手机继续 `BLOCKED_REAL_DEVICE`。
- 后续 Production `657ba5d` 只修改权威验收文档，病例、Patient、路由、UI、评分、API、server 和 `data/**` 均与 `3a16f931` 相同；本矩阵作为运行时证据继续有效。其 Production 状态索引未覆盖37-slot中的英文泌尿操作问法，HEM-P1-030独立失败列不随文档merge关闭。
- 精确 `657ba5d` Vercel部署补测 P001 中文一轮live AI的浏览器前进/后退：对话4项在两次返回后保持，agent/history为1/1，更新 P001 稳定性覆盖；未因此扩大 P006–P042的逐例真实AI列。
- 同一部署补测 P001 中文浏览器后台恢复仿真：`frozen → active` 后页面恢复visible，第二轮继续live AI，agent/history 2/2、attempt/session重初始化0/0、DOM 4→6；只覆盖Chromium生命周期仿真，不替代真实手机后台策略。
- P001中文新增5个浏览器可见回答计时样本，5/5 live AI、agent/history 5/5、attempt/session重初始化0/0；只扩展性能观察，不把同一病例的5个改写当成P002–P042自然语言覆盖。
- P001中文新增两轮错误总结一致性探针：既有三个月病程基线可识别，患者纠正“今天首次且从未反复”，教师元语言/最终诊断泄露0；该结果不扩张为其他病例或医学审批通过。
- P001英文新增两轮等价错误总结探针并通过，未串中文、教师元语言或最终诊断；另一个无指代对象的英文问题触发自然澄清且病史信号0。P001双语自然语言列更新，P002–P042不由此替代。
- 代表类别真实AI开放式主诉扩展为P013/P017/P019/P023/P028/P032/P034/P037/P038/P042，中英文20/20均live AI、history 200、单请求；覆盖肿瘤、抗凝、感染、结石、前列腺、肾小球、遗传/儿童线索、女性污染、外伤、高危镜下血尿。其余32例仍不由本矩阵冒充逐例真实AI通过。
- 同事实双改写新增P019/P023/P032/P038/P042中英文10对：7对live AI病程时长一致7/7；P032中英文与P042中文3对为safety boundary来源一致3/3，事实内容不评价。HTTP/history/请求/语言/泄露合同20/20通过，不解除teacherReviewRequired或来源阻塞。
- P023新增同session中文→英文→中文事实保持：病程时长3/3一致，来源为`live_ai/safety_boundary/live_ai`，agent/history 3/3且切换初始化均200。只将P023跨语言连续性记为`PASS_PREVIEW_GOVERNED`；英文安全边界不计入live AI，其他41例也不由此扩张。
- P038新增中英文各5轮多问题追问：10回答中8次live AI、2次中文safety boundary，重复4小时时长4/4一致，agent/history 10/10。P038上下文列记为`PASS_PREVIEW_GOVERNED`，不由此替代其他病例的多轮真实AI覆盖。
- P037新增中英文刷新后继续追问：刷新前各2轮及DOM 6→6恢复通过，但刷新后首个agent请求均401 `session_capability_required`、无history-log，三批共6/6复现HEM-P1-045。P037刷新可继续列为`FAIL_PREVIEW`，事实连续性因无回答不评价。
- 系统级AI接口防滥用四脚本本地通过：Origin/CORS、capability、角色/字段/输入、幂等并发、预算限流、训练状态和恢复合同适用于公共边界，但不把该系统级结果逐行扩张为42例真实AI或医学通过；真实Preview限流/故障注入仍未执行。

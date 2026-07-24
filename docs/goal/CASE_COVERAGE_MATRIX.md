# P001–P042 探索式覆盖矩阵

图例：`PENDING` 未执行；`SHELL` 页面壳/泄露门禁；`CONTRACT_17` 中文 17 问结构化历史契约；`CONTRACT_6` 英文 6 问 Patient Agent fixture；`CONTRACT_360` 42 例事件评分契约；`UI_EMULATION_7_STAGE` 浏览器双语七阶段 fixture；`LIVE_AI_PREVIEW_ZH_EN` 当前 SHA 真实 Preview 中英文均有样本；`EN_NATURAL_FAIL` 指本轮自然英文主诉为rule fallback；`ZH_LIVE_AI_EN_FAIL_PREVIEW` 指中文主诉live_ai但自然英文及canonical控制均失败。

| 病例 | 页面壳 | 中文协议/UI | 英文协议/UI | 真实 AI | 七阶段/360 | 视觉证据 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P001 | SHELL+ROUTE_PREVIEW | UI_FIXTURE+CONTRACT_17 | UI_FIXTURE+CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | 4_VIEWPORTS_PASS_EMULATION | HEM-P1-053：自然英文fallback、canonical控制safety boundary；既有其他英文live_ai样本；真机仍阻塞 |
| P002 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback、canonical控制safety boundary；既有其他英文live_ai样本 |
| P003 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | PREVIEW_ZH_7_STAGE+CONTRACT_360 | DESKTOP_PREVIEW | 七阶段与360报告3/3完成、刷新保持2/2；阶段7双击3/3重复debrief并错误提示（HEM-P2-028）；零轮第一阶段通过 |
| P004 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | 4_VIEWPORTS_PASS_EMULATION | HEM-P1-053：自然英文fallback、canonical控制live_ai；来源修订仍阻塞 |
| P005 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback、canonical控制safety boundary；既有其他英文live_ai样本 |
| P006 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | ZH_LIVE_AI_EN_FAIL_PREVIEW | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：中文3/3 live_ai；英文自然3/3 rule fallback，canonical控制1/1 safety boundary |
| P007 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | ZH_LIVE_AI_EN_FAIL_PREVIEW | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：中文3/3 live_ai；英文自然3/3 rule fallback，canonical控制1/1 safety boundary |
| P008 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | ZH_LIVE_AI_EN_FAIL_PREVIEW | UI_EMULATION_7_STAGE+CONTRACT_360 | A11Y_4_VIEWPORTS | HEM-P1-053；另有精确医嘱、评分抗伪造和公开路由泄露fixture通过 |
| P009 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | ZH_LIVE_AI_EN_FAIL_PREVIEW | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：中文3/3 live_ai；英文自然3/3 rule fallback，canonical控制1/1 safety boundary |
| P010 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | ZH_LIVE_AI_EN_FAIL_PREVIEW | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：中文3/3 live_ai；英文自然3/3 rule fallback，canonical控制1/1 safety boundary |
| P011 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | ZH_LIVE_AI_EN_FAIL_PREVIEW | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：中文3/3 live_ai；英文自然3/3 rule fallback，canonical控制1/1 safety boundary |
| P012 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | ZH_LIVE_AI_EN_FAIL_PREVIEW | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：中文3/3 live_ai；英文自然3/3 rule fallback，canonical控制1/1 safety boundary |
| P013 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P014 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P015 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P016 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P017 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P018 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P019 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053 source边界；医学待审核状态不变 |
| P020 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053 source边界；医学待审核状态不变 |
| P021 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P022 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P023 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P024 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P025 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P026 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P027 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P028 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P029 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P030 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P031 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P032 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P033 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P034 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P035 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P036 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P037 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053；另有刷新中英文8/8 live_ai |
| P038 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053；另有多轮英文live_ai样本 |
| P039 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P040 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P041 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | PENDING | HEM-P1-053：自然英文fallback，canonical控制live_ai |
| P042 | SHELL+ROUTE_PREVIEW | CONTRACT_17 | CONTRACT_6 | LIVE_AI_PREVIEW_ZH_EN+EN_NATURAL_FAIL | UI_EMULATION_7_STAGE+CONTRACT_360 | 1440×900 | HEM-P1-053；首轮页面壳末端截图 |

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
- P001新增真实Preview双语内容滥用边界：2/2为safety boundary、provider timing 0、agent/history 2/2、内部/教师/诊断/代码泄露0。只更新P001安全输入列，不替代P002–P042或高频限流/故障注入。
- P001新增真实Preview公开API会话能力拒绝矩阵：11/11缺失或不匹配state/capability/case/language/mode/attempt/stage请求按合同拒绝，公开error envelope 11/11、provider timing 0、跨源保护头0。该系统边界结论不扩张为P002–P042真实AI或医学内容通过，过期墙钟/限流/故障注入仍单列。
- 数据Agent结构矩阵覆盖42例/257条配置结果：归属、医嘱、唯一性、前置条件、空结果与非终态显式性均0失败；含数值final检验结果28条全部缺结构化`unit`与`referenceRange`，涉及P001–P012及P019，登记HEM-P1-046。其余29例没有此类结果样本，不能据此写为单位/参考范围通过；医学值未由QA裁决。
- 数据Agent呈现系统级合同新增HEM-P1-047：42例共257条结构结果的三种内部状态分布为`final=74/not_available=182/not_performed=1`；Production报告卡在四固定viewport的中英文最小复现中4/4裸显全部三个token，并4/4把带异常标志的final卡片标为普通reported。该系统级失败适用于所有病例的状态呈现风险，但不把每例所有医嘱写成已逐项UI复现，也不评价医学标志真值。
- 英文数据Agent全量合同新增HEM-P1-048：英文attempt对P001–P042精确返回257/257配置结果、handler失败0，但42/42病例均有学生可见CJK；目录57/60医嘱名、全部主分类、49个次分类及全部257条结果分类/正文/印象含中文。P008真实handler浏览器四viewport 4/4复现；所有病例的数据Agent英文列标`FAIL_LOCAL_QA`，不据此评价中文医学内容正确性或自动批准英文译文。

## Production `70ea9b3` 增量覆盖

- P001–P042 本地目录点击、直接 URL、刷新、中文与英文全部 42/42；42 个训练壳页均显示七阶段且提交前无标准答案、得分点或病例标签泄露。Vercel Preview 对同一精确 SHA 也是 42/42，P999 受控 404；GitHub Pages 无当前 SHA 独立证据，保持部署阻塞。
- Patient Agent 用户指定自然问法覆盖每例 10 个中文问题及等价英文，共 840 场景。canonical 场景完整命中 630/840；错误 unknown 4/914；可评价极性错误 0/439；正确 unknown 436/436；医学冲突隔离 42/42 场景、13 个唯一冲突项。该列为 `FAIL_LOCAL_QA / HEM-P1-050`，不能把部分命中改写为逐例医学通过。
- P001 第一阶段、双语切换、刷新、快速双击和 P003 零轮提交已覆盖；代表性 P001 七阶段在桌面与移动模拟 2/2，7 次 stage feedback 与 7 个 request ID 一一对应，最终报告为 360 分制且无重复计分。
- P019/P020 的医学待审核状态未被 QA 修改。病例患者化主诉、镜下血尿不改写为肉眼发红、特殊尿色与事实漂移仍以现有 governed 数据/Preview代表抽样为工程合同；最终医学批准继续依赖 HEM-P0-001/023。
- 基线切换前补充重跑全 42 例×双语七阶段 UI：84/84 完整旅程、588/588 阶段提交、84/84 份 360 分报告通过；移动 viewport 另有 1/1 代表旅程。Production 浏览器全套 72/72，10 个评分/安全/恢复/隔离服务端合同 10/10，capability 19 项矩阵连续 2/2 轮通过。以上均为 `PASS_EMULATION`/`PASS_LOCAL_CONTRACT`，不扩张为真实设备、真实 provider 或医学批准。

## Production `c4ac9b5` 增量覆盖

- P001–P042 精确Preview目录中英文、直接URL与刷新均42/42，P999为404；本地Pages basePath静态产物也为42/42与受控404。全42例×双语七阶段UI为84/84旅程、588/588阶段提交、84/84份360分报告；mobile代表旅程1/1。路由/阶段标记 `PASS_PREVIEW` / `PASS_EMULATION`，不替代真实Pages或真机。
- Patient Agent 840/840场景、1,428/1,428 canonical checks、3,150/3,150大矩阵；错误unknown 0、极性错误0、正确unknown436、冲突隔离42/42、双语420/420、额外病史0。所有病例的该工程列更新为 `PASS_LOCAL_CONTRACT / HEM-P1-050 RESOLVED_LOCAL_QA`，医学审批列不变。
- HEM-P1-051代表真实AI覆盖为P001英文3/3、P037英文2/2、P038英文2/2全部live_ai且history7/7；系统稳定样本另为中文5/5、英文5/5、单session20/20。未抽样的其余病例不由此扩张为逐例真实AI医学通过。
- Data Agent学生呈现对42例257结果为英文CJK=0，28个元数据缺口显示待审核，23个未审核英文名称在UI禁用；但服务端内部ID探针23/23匹配，4个评分相关医嘱的29/29规则链得分，故所有病例的Data Agent评分隔离列为 `FAIL / HEM-P1-052`。28项元数据和23个名称仍分别为 `BLOCKED_MEDICAL` / `BLOCKED_SOURCE_REVISION`。

## `c4ac9b5` 第 10 轮覆盖增量

- P037真实Preview刷新续问由历史`FAIL_PREVIEW`更新为中英文8/8 live_ai、8/8 history、401为0，HEM-P1-045标`RESOLVED_PREVIEW`；该结果只更新P037刷新连续性，不扩张P006–P042的真实AI抽样列。
- HEM-P1-030在当前SHA连续两次完整矩阵仍为42/42同一英文泌尿操作史路由错配，公开handler另2/2复现；所有42行的本地Patient路由列继续保留该单一`REGRESSED_LOCAL_QA`标记，其余6,174/6,216路由、6,216重放、168边界及144隔离通过。
- Data Agent评分隔离增加中文反例：同一23项中文审核路径23/23可调用，与英文处于相同前置状态时均有6项结果；所有42行继续因英文内部ID绕过和29/29评分链得分标`FAIL / HEM-P1-052`，但中文合法路径不应被未来修复全局禁用。
- 阶段提交幂等在桌面6次重复及桌面/移动代表批共8/8通过；移动语音触控尺寸仍在两个viewport 2/2失败。自动viewport证据不替代真机。
- P001–P042真实Preview开放主诉完成全量诊断批：中文自然42/42 live_ai，英文自然42/42 classifier-disabled rule fallback；英文canonical控制31/42 live_ai、11/42 safety boundary。P006–P012另有两轮重复，累计自然中文/英文各56次且source完全稳定。矩阵状态只评价这些问法，不替代逐字医学审阅。

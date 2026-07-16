# 病例表达与患者语言专项测试证据

执行日期：2026-07-16（Asia/Shanghai）

专项起始HEAD：`08b2843b0ee582b4b0fd5ab379b39c94476faaf9`

本轮测试前专项HEAD：`43aa1e88186c3f7835edc36e6930fc391dfbaeeb`

专项分支：`codex/hematuria-chief-complaint-wording`

首次远程核验时Production来源HEAD为 `ec74d16aebba09ec3916bfd6690dba2818889922`；最终push后再次核验已前移到 `3fe409f0e1ee8c347758323c1422850f27124707`。两者均晚于专项起始基线；按任务边界只记录，未rebase、未merge、未让Production新代码覆盖本专项。

## 预检与运行时

- 初次启动医学工作簿测试时，沙箱内Node无法穿越已存在的 `xlsx` junction，表现为 `Cannot find module 'xlsx'`，退出码1。这是测试环境依赖可见性失败，不是医学或代码断言失败。
- `pnpm install --frozen-lockfile`：退出码0，锁文件无变化；随后在允许读取该junction的环境中重跑医学工作簿门禁，退出码0。
- 本地捆绑运行时为 Node.js `24.14.0`、pnpm `11.9.0`，超出项目声明的 Node.js `>=22.14 <23`，因此每条pnpm命令均有engine warning。所有断言均通过；远端CI仍应以声明的Node.js 22为权威。
- Production/GitHub Pages构建仅在进程内使用仓库CI工作流公开的 `NEXT_PUBLIC_API_BASE_URL=https://hematuria-training-system.vercel.app`；Pages构建另使用公开basePath `/hematuria-training-system`。没有修改持久环境变量，没有读取密钥，没有部署。

## 命令与退出码

| 门禁 | 命令 | 退出码 | 结果摘要 |
|---|---|---:|---|
| 中英文主诉矩阵、开场、颜色、病程、审核隔离 | `pnpm run test:complaint-wording` | 0 | 42中文 + 42英文；27修改/15阻塞；双语、病程、颜色、污染与开场通过 |
| 主诉患者化合同 | `pnpm run test:complaint` | 0 | “血尿+时间”、加号及患者语言合同通过 |
| Patient Agent | `pnpm run test:patient` | 0 | Patient Agent行为通过 |
| 双语一致性 | `pnpm run test:bilingual` | 0 | 42例 × 6个英文fixture通过 |
| 42例结构门禁 | `pnpm run test:history-matrix` | 0 | 42例 × 17个问诊问题通过 |
| 572事实与360模板 | `pnpm run test:release-v14` | 0 | 42例、572事实、病例特异模板、360分量表通过 |
| 360分评分 | `pnpm run test:scoring-v3` | 0 | 42例；单调性、同义词、防摘要投机、过度检查扣分通过 |
| 查体数据 | `pnpm run test:exam-qc` | 0 | 42例、376条查体结果通过 |
| 检验/检查映射 | `pnpm run test:orders` | 0 | P008精确开单映射及前置条件通过 |
| 医学工作簿 | `pnpm run test:medical-review` | 0 | 8张表、42例、572条待审核事实通过 |
| 419审核约束 | `pnpm run test:medical-review-queue` | 0 | 153条source-trace + 419条专家待审；无伪造审批 |
| HEM-P0-023隔离 | `pnpm run test:bilingual-conflict-quarantine` | 0 | 18条双语医学冲突保持隔离，未改变真值或审核状态 |
| 医学极性/矛盾 | `pnpm run test:clinical` | 0 | 42例通过；419条作者新增事实继续待专家审核 |
| TypeScript | `pnpm run typecheck` | 0 | `tsc --noEmit`通过 |
| ESLint | `pnpm run lint` | 0 | 无lint错误 |
| Production静态构建 | `pnpm run build` | 0 | Next.js 15.5.19；82/82页面，2/2静态导出 |
| GitHub Pages构建 | `pnpm run build:github` | 0 | basePath构建82/82页面，2/2静态导出 |
| bundle隐藏答案/密钥 | `pnpm run test:bundle` | 0 | 25个JavaScript资产通过 |
| repository secret | `pnpm run test:secrets` | 0 | 318个tracked/candidate文件及可达历史通过；未打印密钥值 |
| 正式HTML加号扫描 | `rg`扫描 `out` 中“小便变红/发红+时间” | 0 | `STATIC_PLUS_SIGN_SCAN_PASS` |
| 医学真值差异 | 基线与当前逐病例JSON字段比较 | 0 | `PROTECTED_CASE_FIELDS_UNCHANGED=TRUE` |
| 治理文件差异 | `git diff --quiet <baseline> -- <protected files>` | 0 | `PROTECTED_GOVERNANCE_FILES_UNCHANGED=TRUE` |

未重复运行与纯数据/文案改动无关的Preview Redis、Automation Bypass和安全限流测试。

## 20项表达合同覆盖

1. 明确肉眼血尿患者主诉不再使用生硬“血尿+时间”：通过27例白名单和可见病例断言。
2. 不出现“小便变红+X天/月”：源码投影断言及正式HTML扫描通过。
3. 镜下病例未改成“小便变红”：P019、P022、P030、P033、P035、P042逐例断言通过。
4. 茶/可乐/酱油及深色尿保留实际颜色：P009、P031、P032、P039通过；P010保持阻塞未改。
5. 经期污染未升级：P037逐例断言通过。
6. 未确认红尿不写成确定性血尿：本批0个可自动归类病例；P006因来源未明保持阻塞。
7. 病程数字和单位不改变：中英文 `durationZh/durationEn` 逐例断言通过。
8. 反复、间断、持续等发作方式不改变：策略逐例人工式diff及矩阵核验通过。
9. 主诉已有明确伴随症状不丢失：矩阵和27例逐例策略核验通过。
10. 不新增source没有的伴随症状：只允许白名单字段；每例依据见审计矩阵。
11. 中英文医学含义一致：42例双语门禁通过。
12. Patient Agent开场与主诉一致：客户端、服务端、中英文精确值逐例通过。
13. 开场不泄露诊断：27例新开场无诊断；阻塞病例不自动修改。
14. 病例目录不泄露最终诊断：`cases_public`无 `diagnosis/finalDiagnosis/title` 断言通过。
15. HEM-P0-023不自动翻转：11例全部在BLOCKED_MEDICAL；18条事实隔离通过。
16. `needs_review`不变：42例 `medicalReview.status=needs_revision`。
17. `reviewerStatus`不变：受保护审核对象逐字段零差异。
18. source/derived/simulation不变：`sourceFacts`、`releaseV14`、`raw`及治理文件零差异。
19. 评分不变：42例360分回归通过，评分治理文件零差异。
20. `data/**`医学事实无意外差异：实施脚本字段白名单 + 基线逐字段差异扫描通过。

## 医学事实与审批状态差异

相对专项起始HEAD，下列逐病例字段全部字节语义等价：

`presentIllness`、`riskFactors`、`diagnosis`、`teacherOnlyData`、`clinical`、`scoringKey`、`medicalReview`、`medicalReviewImport`、`sourceFacts`、`structuredHistory`、`releaseV14`、`raw`、`teacherReviewRequired`、`needs_revision`。

以下治理文件零差异：

- `data/hematuria_release_v14_normalized.json`
- `data/medical_review_queue.json`
- `data/scoring-rules.json`
- `data/scoring_template.json`
- `server/bilingualConflictQuarantine.js`

当前权威计数：572条追踪事实、153条source-trace、419条专家待审、18条双语冲突、42例 `needs_revision`。

附件中的“161来源修订问题”是历史问题编号/旧口径；当前队列仍保留 `MR-0161`，但权威source-trace计数已由仓库治理门禁固定为153。`data/medical_review_queue.json` 相对起始HEAD的 `git diff --quiet` 退出码为0，因此本专项既未裁决历史161问题，也未改变当前153/419口径。

## 提交、push与集成建议

已存在并已普通push到专项分支的提交：

1. `ec67c67` — `docs: audit chief complaint wording`
2. `23d3733` — `test: define chief complaint wording matrix`
3. `df7b9e6` — `feat: patientize chief complaint wording`
4. `43aa1e8` — `docs: record chief complaint wording delivery`

本轮补齐的矩阵、变更日志、阻塞审核表和测试证据应作为独立文档提交普通push，不改写上述历史。Production Goal选择性集成时，推荐按 `ec67c67` → `23d3733` → `df7b9e6` → `43aa1e8` → 本证据文档提交的顺序挑选；其中业务效果的最小核心是测试提交 `23d3733` 与实现提交 `df7b9e6`，审计和证据提交用于医学可追溯性，不应省略于正式评审。

Draft PR保持Draft；未合并PR #1、未push main、未push Production Goal、未force push、未部署Preview或Production。

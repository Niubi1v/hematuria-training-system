# 病例主诉患者化表达专项实施报告

实施日期：2026-07-15

起始基线：`08b2843b0ee582b4b0fd5ab379b39c94476faaf9`

实现提交：`df7b9e68a07a38efd310b4837483279e2e835582`

## 交付结论

- 已逐例审计 P001–P042，并先于实现提交完整审计表：[`CHIEF_COMPLAINT_WORDING_AUDIT.md`](./CHIEF_COMPLAINT_WORDING_AUDIT.md)。
- 已自动修改 27 例；未修改且进入 `BLOCKED_MEDICAL` 的病例 15 例。
- 自动修改按病例白名单及字段白名单执行，不进行全仓库无条件字符串替换。
- 中文主诉、英文主诉、Patient Agent 首句和直接患者可见投影同步更新。
- 诊断、病理、症状极性、病程、评分、来源、审核状态和冲突隔离均未改变。
- 正式构建产物中未检出“小便变红+X天/月”或全角加号变体。

## 分类与病例清单

| 分类 | 数量 | 病例 |
|---|---:|---|
| `visible_gross_hematuria` | 25 | P001、P002、P003、P004、P005、P007、P008、P011、P013、P014、P015、P016、P017、P018、P021、P023、P024、P025、P026、P027、P028、P029、P036、P038、P040 |
| `microscopic_non_visible_hematuria` | 6 | P019、P022、P030、P033、P035、P042 |
| `tea_or_cola_colored_urine` | 5 | P009、P010、P031、P032、P039 |
| `menstrual_or_genital_contamination` | 1 | P037 |
| `uncertain_or_needs_review` | 5 | P006、P012、P020、P034、P041 |

自动修改：P005、P009、P014、P015、P016、P018、P019、P021、P022、P023、P024、P025、P026、P027、P028、P029、P030、P031、P032、P033、P035、P036、P037、P038、P039、P040、P042。

未修改：P001、P002、P003、P004、P006、P007、P008、P010、P011、P012、P013、P017、P020、P034、P041。

人工审核队列：

- HEM-P0-023：P001、P002、P003、P004、P007、P008、P010、P011、P012、P013、P017。
- 可见性或来源字段混合/矛盾：P006、P012、P020、P034、P041。

P012 同时属于两个阻塞原因。以上 15 例保持原主诉、Patient Agent 开场、`medicalReview.status=needs_revision`、来源和冲突隔离状态。

## 已落地主诉变化

下表中的“修改前”取自基线患者可见字段，“修改后”与运行时白名单完全一致。完整原始来源事实、是否肉眼可见、病程及字段依据见逐例审计表。

| 病例 | 中文修改前 → 修改后 | 英文修改前 → 修改后 |
|---|---|---|
| P005 | 进行性排尿困难3年余，加重伴小便变红1月 → 不变（同步修正英文） | Progressive dysuria/voiding difficulty for over 3 years, worsened with hematuria for 1 month. → Progressive difficulty urinating for over 3 years, worsening with red urine for 1 month. |
| P009 | 突发右侧腰痛伴小便变红半天 → 突发右侧腰痛伴浓茶色尿半天 | Sudden right flank pain with hematuria for half a day. → Sudden right flank pain with dark tea-colored urine for half a day. |
| P014 | 反复尿频伴血尿半年 → 反复尿频伴小便变红半年 | Hematuria for half a year → Recurrent urinary frequency with red urine for half a year. |
| P015 | 左腰隐痛伴肉眼血尿1个月 → 左腰隐痛伴小便变红1个月 | Hematuria for 1 month → Red urine with dull left flank pain for 1 month. |
| P016 | 无痛性肉眼血尿3周 → 间断小便变红3周 | Hematuria for 3 weeks → Intermittent red urine for 3 weeks. |
| P018 | 尿频尿急尿痛伴血尿2天 → 尿频、尿急、尿痛伴小便发红2天 | Hematuria for 2 days → Urinary frequency, urgency, and pain with red-tinged urine for 2 days. |
| P019 | 发热腰痛伴尿频尿痛3天 → 发热、左腰痛伴尿频、尿痛3天 | Hematuria for 3 days → Fever, left flank pain, urinary frequency, and painful urination for 3 days. |
| P021 | 尿频尿痛伴血尿1周 → 尿频、尿痛伴小便发红1周 | Hematuria for 1 week → Urinary frequency and pain with red-tinged urine for 1 week. |
| P022 | 反复尿痛伴镜下血尿1年 → 反复尿痛伴尿检发现血尿1年 | Hematuria for 1 year → Recurrent painful urination with microscopic blood detected on urine tests for 1 year. |
| P023 | 右腰腹绞痛伴血尿6小时 → 右腰腹绞痛伴小便发红6小时 | Hematuria for 6 hours → Red-tinged urine with severe right flank and abdominal colic for 6 hours. |
| P024 | 左腰痛伴血尿1天 → 左腰痛伴小便发红1天 | Hematuria for 1 day → Red-tinged urine with left flank pain for 1 day. |
| P025 | 排尿困难伴终末血尿3个月 → 排尿困难伴排尿末小便发红3个月 | Hematuria for 3 months → Difficulty urinating with red urine at the end of urination for 3 months. |
| P026 | 反复发热腰痛伴血尿半年 → 反复发热、腰痛伴小便发红半年 | Hematuria for half a year → Recurrent fever and flank pain with red-tinged urine for half a year. |
| P027 | 左侧腰腹痛伴血尿1天 → 左侧腰腹痛伴小便发红1天 | Hematuria for 1 day → Red-tinged urine with left flank and abdominal pain for 1 day. |
| P028 | 排尿困难伴肉眼血尿3天 → 排尿困难伴小便变红3天 | Hematuria for 3 days → Difficulty urinating with red urine for 3 days. |
| P029 | 导尿后肉眼血尿1天 → 导尿后小便变红1天 | Hematuria for 1 day → Red urine for 1 day after catheterization. |
| P030 | 排尿困难伴镜下血尿半年 → 排尿困难伴尿检发现血尿半年 | Hematuria for half a year → Difficulty urinating with microscopic blood detected on urine tests for half a year. |
| P031 | 咽痛后肉眼血尿2天 → 咽痛后尿色呈浓茶色或可乐色2天 | Hematuria for 2 days → Dark tea- or cola-colored urine for 2 days after a sore throat. |
| P032 | 皮肤感染后茶色尿伴眼睑水肿1周 → 不变（同步修正英文） | Hematuria for 1 week → Tea-colored urine with eyelid swelling for 1 week after a skin infection. |
| P033 | 体检发现镜下血尿3年 → 体检反复发现尿检有血3年 | Hematuria for 3 years → Microscopic blood repeatedly detected on health-check urine tests for 3 years. |
| P035 | 泡沫尿、血尿伴面部皮疹2周 → 泡沫尿、尿检发现血尿伴面部皮疹2周 | Hematuria for 2 weeks → Foamy urine with microscopic blood detected on urine tests and a facial rash for 2 weeks. |
| P036 | 长跑后肉眼血尿1次 → 长跑后小便发红1次 | Hematuria for several days → One episode of red-tinged urine after a long-distance run. |
| P037 | 体检尿潜血阳性1天 → 经期体检发现尿潜血阳性1天 | Hematuria for 1 day → Urine dipstick positive for blood during menstruation at a health check 1 day ago. |
| P038 | 车祸后腰痛伴肉眼血尿4小时 → 车祸后腰痛伴小便变红4小时 | Hematuria for 4 hours → Red urine with flank pain for 4 hours after a traffic accident. |
| P039 | 腰痛伴血尿反复半年 → 反复腰痛伴茶色或淡红色尿半年 | Hematuria for half a year → Recurrent flank pain with tea-colored or pale red urine for half a year. |
| P040 | 突发左腰痛伴肉眼血尿1天 → 突发左腰痛伴小便变红1天 | Hematuria for 1 day → Sudden left flank pain with red urine for 1 day. |
| P042 | 体检发现镜下血尿1个月 → 体检发现尿检有血1个月 | Hematuria for 1 month → Microscopic blood detected on health-check urine tests for 1 month. |

## Patient Agent 首句

27 例均使用逐例白名单，不使用统一模板。中英文首句的最终值保存在 `data/chief_complaint_wording_runtime.json`，并由页面与服务端 Patient Agent 共用。代表性变化如下：

| 病例 | 修改后中文首句 | 一致性目的 |
|---|---|---|
| P005 | 医生，我排尿越来越费劲，最近一个月小便还会变红。 | 保留长期排尿困难和近1月尿红两个时间轴 |
| P009 | 医生，我右边腰突然痛得厉害，小便还是浓茶色，已经半天了。 | 不把浓茶色尿升级为红尿 |
| P019 | 医生，我发烧、左腰痛，还尿频尿痛，已经三天了。 | 镜下病例不声称肉眼看到尿红 |
| P031 | 医生，我咽痛以后尿变成了浓茶色，有两天了。 | 保留感染后浓茶色事实 |
| P033 | 医生，我这三年体检尿检反复查到有血，但自己看不出来。 | 明确镜下、非肉眼可见 |
| P037 | 医生，我经期体检时尿潜血阳性，刚发现一天。 | 保留经期污染场景 |
| P038 | 医生，我车祸撞到腰后小便变红了，已经四个小时。 | 仅保留源主诉已有外伤、腰痛、尿红和病程 |

自动化测试逐例断言了 27 条中英文主诉和 27 条中英文开场白；15 条阻塞病例继续走原有表达。

## 字段与数据治理核验

实施脚本只允许更新以下直接表达路径：中英文主诉、patient profile 主诉、Patient Agent 开场、主诉问答、病例卡片主诉、患者可见摘要及其直接投影。脚本会在出现白名单外变更时失败。

逐病例对比基线后，下列受保护字段全部未变化：

`presentIllness`、`riskFactors`、`diagnosis`、`teacherOnlyData`、`clinical`、`scoringKey`、`medicalReview`、`medicalReviewImport`、`sourceFacts`、`structuredHistory`、`releaseV14`、`raw`、`teacherReviewRequired`、`needs_revision`。

以下治理文件也全部未变化：

- `data/hematuria_release_v14_normalized.json`
- `data/medical_review_queue.json`
- `data/scoring-rules.json`
- `data/scoring_template.json`
- `server/bilingualConflictQuarantine.js`

42 例 `medicalReview.status` 均仍为 `needs_revision`。572 条事实追踪、419 条待专家裁决、18 条冲突隔离和 360 分评分结构均保持。

## 测试结果

| 检查 | 结果 |
|---|---|
| 修改前失败测试 | 通过验证：新主诉矩阵在 P005 旧英文表达处按预期失败 |
| P001–P042 中文/英文主诉矩阵 | PASS（42例，27修改/15阻塞） |
| Patient Agent 首句 | PASS（前端/服务端中英文逐例一致） |
| 双语一致性 | PASS（42例 × 6项） |
| 医学极性与临床矛盾 | PASS（42例；419条待裁决保持） |
| 572 事实追踪 | PASS（42例、572条待审核事实） |
| 419 审核约束 | PASS（无伪造审批） |
| 18 条冲突隔离 | PASS（HEM-P0-023 未自动翻转） |
| 360 分评分回归 | PASS（42例） |
| 完整 `pnpm test` | PASS |
| TypeScript | PASS |
| ESLint | PASS |
| Next.js 构建与静态导出 | PASS（82/82 页面，2/2 导出） |
| bundle 隐藏信息扫描 | PASS（25 个 JavaScript 资产） |
| secret 扫描 | PASS（工作树及 Git 历史） |
| 正式静态 HTML 加号扫描 | PASS |
| 实施脚本幂等性 | PASS（执行前后 SHA-256 一致） |

本地依赖运行时为 Node.js 24.14.0，超出项目声明的 `>=22.14.0 <23`，因此 pnpm 输出 engine warning；所有上述测试仍通过，远端 CI 应继续使用项目声明的 Node.js 22 运行时作为权威结果。

## 提交拆分

1. `ec67c67` — `docs: audit chief complaint wording`
2. `23d3733` — `test: define chief complaint wording matrix`
3. `df7b9e6` — `feat: patientize chief complaint wording`

未执行 reset、rebase、force push、合并 main 或 Production 部署。

# P001–P042 病例主诉患者化表达审计

审计基线：`08b2843b0ee582b4b0fd5ab379b39c94476faaf9`

审计日期：2026-07-15

范围：只核对主诉表达、直接对应的患者开场表达及其双语投影；不裁决诊断、症状极性、评分、来源或审核状态。

## 结论摘要

- `visible_gross_hematuria`：25 例。
- `microscopic_non_visible_hematuria`：6 例。
- `tea_or_cola_colored_urine`：5 例。
- `menstrual_or_genital_contamination`：1 例。
- `uncertain_or_needs_review`：5 例。
- 可自动修改：27 例；`BLOCKED_MEDICAL`：15 例。
- HEM-P0-023 涉及 P001、P002、P003、P004、P007、P008、P010、P011、P012、P013、P017；这些病例的主诉建议仅供医学审核，不自动落库，也不触碰冲突槽位。
- P006、P020、P034、P041 另因可见性或来源字段混合/矛盾进入人工审核。P012同时属于 HEM-P0-023 和来源不确定。
- HEM-P0-001 的 151 条来源辅助标记冲突不在本专项中裁决；本专项不得修改 `provenance`、`teacherReviewRequired`、`medicalReview.status` 或 572 条事实追踪记录。

“当前中文主诉”来自 `data/cases.json[].studentChiefComplaint`；“当前英文主诉”来自 `data/cases_en.json[].chiefComplaint`（页面投影为 `data/cases_public.json[].chiefComplaintEn`）。P001–P012 的原始事实来自 `work/source/v2_only_cases.xlsx` 的 `总表_V2病例库`，P013–P042 来自 `work/source/supplement_30_ai.xlsx` 的 `补充30_导师模板总表`。

## 逐例审计表（P001–P021）

| 病例ID | 当前中文主诉 | 当前英文主诉 | 原始来源事实 | 血尿类型 | 肉眼看到尿液变红 | 病程时间 | 推荐新中文主诉 | 推荐新英文主诉 | 可自动修改 | 医学审核 | 修改依据文件和字段 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P001 | 间断小便变红3月余 | Intermittent painless gross hematuria for more than 3 months. | 全部尿液呈红/洗肉水样，间断，无痛 | visible_gross_hematuria | 是 | 3月余 | 间断小便变红3月余 | Intermittent red urine for more than 3 months. | 否：BLOCKED_MEDICAL（HEM-P0-023） | 是 | `v2_only_cases.xlsx::总表_V2病例库.chief_complaint/symptoms_detail/hematuria_type/hematuria_color`；`cases.json[P001].presentIllness` |
| P002 | 反复左侧腰痛伴小便变红1月余 | Recurrent left flank pain with hematuria for more than 1 month. | 全部尿液呈红/洗肉水样，反复，伴左腰酸胀 | visible_gross_hematuria | 是 | 1月余 | 反复左侧腰痛伴小便变红1月余 | Recurrent left flank pain with red urine for more than 1 month. | 否：BLOCKED_MEDICAL（HEM-P0-023） | 是 | 同上工作簿字段；`cases.json[P002].presentIllness` |
| P003 | 反复小便变红5月余，加重1周 | Recurrent hematuria for over 5 months, worsened for 1 week. | 鲜红色肉眼血尿，反复5月余，近1周加重 | visible_gross_hematuria | 是 | 5月余；加重1周 | 反复小便变红5月余，加重1周 | Recurrent red urine for over 5 months, worsening over the past week. | 否：BLOCKED_MEDICAL（HEM-P0-023） | 是 | 同上工作簿字段；`cases.json[P003].presentIllness` |
| P004 | 小便变红1月余 | Painless total gross hematuria for more than 1 month. | 鲜红色全程肉眼血尿1月余 | visible_gross_hematuria | 是 | 1月余 | 小便变红1月余 | Red urine for more than 1 month. | 否：BLOCKED_MEDICAL（HEM-P0-023） | 是 | 同上工作簿字段；`cases.json[P004].presentIllness` |
| P005 | 进行性排尿困难3年余，加重伴小便变红1月 | Progressive dysuria/voiding difficulty for over 3 years, worsened with hematuria for 1 month. | 排尿困难3年余；近1月间断鲜红色肉眼血尿 | visible_gross_hematuria | 是 | 3年余；尿红1月 | 进行性排尿困难3年余，加重伴小便变红1月 | Progressive difficulty urinating for over 3 years, worsening with red urine for 1 month. | 是 | 否 | 同上工作簿字段；`cases.json[P005].presentIllness` |
| P006 | 尿频、尿急、尿痛伴小便变红2天 | Frequency, urgency and dysuria with hematuria for 2 days. | 排尿后纸巾呈粉红色，来源需鉴别尿道/阴道 | uncertain_or_needs_review | 不确定 | 2天 | 尿频、尿急、尿痛伴擦拭见粉红色2天 | Urinary frequency, urgency, and pain with pink discoloration on wiping for 2 days. | 否：BLOCKED_MEDICAL | 是 | 同上工作簿字段；`cases.json[P006].presentIllness`；女性污染线索 |
| P007 | 反复排尿困难5年余，急性加重伴小便变红1天 | Recurrent voiding difficulty for over 5 years, acute worsening with hematuria for 1 day. | 急性尿潴留前后见淡红色尿液 | visible_gross_hematuria | 是 | 5年余；尿红1天 | 反复排尿困难5年余，急性加重伴小便变红1天 | Recurrent difficulty urinating for over 5 years, acutely worsening with red urine for 1 day. | 否：BLOCKED_MEDICAL（HEM-P0-023） | 是 | 同上工作簿字段；`cases.json[P007].presentIllness` |
| P008 | 间断小便变红伴排尿中断1年余 | Intermittent hematuria with interrupted urinary stream for more than 1 year. | 间断淡红色肉眼尿，终末明显，伴排尿中断 | visible_gross_hematuria | 是 | 1年余 | 间断小便变红伴排尿中断1年余 | Intermittent red urine with interrupted urinary stream for more than 1 year. | 否：BLOCKED_MEDICAL（HEM-P0-023） | 是 | 同上工作簿字段；`cases.json[P008].presentIllness` |
| P009 | 突发右侧腰痛伴小便变红半天 | Sudden right flank pain with hematuria for half a day. | 小便呈浓茶样，伴右侧肾绞痛 | tea_or_cola_colored_urine | 否：看到浓茶色 | 半天 | 突发右侧腰痛伴浓茶色尿半天 | Sudden right flank pain with dark tea-colored urine for half a day. | 是 | 否 | 同上工作簿字段；`cases.json[P009].presentIllness.color` |
| P010 | 反复左侧腰部隐痛伴运动后小便变红3年余，再发1天 | Recurrent left flank dull pain with exercise-related hematuria for over 3 years, recurrence for 1 day. | 运动后浓茶样尿；本次酱油样尿 | tea_or_cola_colored_urine | 否：看到浓茶/酱油色 | 3年余；再发1天 | 反复左侧腰部隐痛伴运动后浓茶色尿3年余，再发酱油色尿1天 | Recurrent left flank discomfort with dark tea-colored urine after exercise for over 3 years, recurring as soy-sauce-colored urine for 1 day. | 否：BLOCKED_MEDICAL（HEM-P0-023） | 是 | 同上工作簿字段；`cases.json[P010].presentIllness.color` |
| P011 | 咽痛3周，小便变红1周 | Sore throat for 3 weeks and hematuria for 1 week. | 感染后淡红/洗肉水样肉眼血尿 | visible_gross_hematuria | 是 | 咽痛3周；尿红1周 | 咽痛3周，小便变红1周 | Sore throat for 3 weeks with red urine for 1 week. | 否：BLOCKED_MEDICAL（HEM-P0-023） | 是 | 同上工作簿字段；`cases.json[P011].presentIllness` |
| P012 | 反复小便变红伴尿泡沫增多半年余，加重半月 | Recurrent hematuria with increased foamy urine for over 6 months, worsened for half a month. | 肉眼/镜下混合；可呈茶色、淡红或肉眼血尿 | uncertain_or_needs_review | 不确定 | 半年余；加重半月 | 反复尿色异常伴泡沫尿半年余，加重半月 | Recurrent abnormal urine color with foamy urine for over 6 months, worsening for half a month. | 否：BLOCKED_MEDICAL（HEM-P0-023；来源混合） | 是 | 同上工作簿字段；`cases.json[P012].presentIllness` |
| P013 | 间断肉眼血尿2个月 | Hematuria for 2 months | 洗肉水样/暗红色全程肉眼血尿，间断 | visible_gross_hematuria | 是 | 2个月 | 间断小便变红2个月 | Intermittent red urine for 2 months. | 否：BLOCKED_MEDICAL（HEM-P0-023） | 是 | `supplement_30_ai.xlsx::补充30_导师模板总表.chief_complaint/symptoms_detail/hematuria_type/hematuria_color`；`cases.json[HX-ADD-001].presentIllness` |
| P014 | 反复尿频伴血尿半年 | Hematuria for half a year | 淡红至暗红色肉眼血尿，伴反复尿频 | visible_gross_hematuria | 是 | 半年 | 反复尿频伴小便变红半年 | Recurrent urinary frequency with red urine for 6 months. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-002].presentIllness` |
| P015 | 左腰隐痛伴肉眼血尿1个月 | Hematuria for 1 month | 暗红色全程肉眼血尿，伴左腰酸胀 | visible_gross_hematuria | 是 | 1个月 | 左腰隐痛伴小便变红1个月 | Red urine with dull left flank pain for 1 month. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-003].presentIllness` |
| P016 | 无痛性肉眼血尿3周 | Hematuria for 3 weeks | 3周内2次暗红色全程肉眼血尿 | visible_gross_hematuria | 是 | 3周 | 间断小便变红3周 | Intermittent red urine for 3 weeks. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-004].presentIllness` |
| P017 | 服用抗凝药后肉眼血尿5天 | Hematuria for 5 days | 服抗凝药期间出现鲜红至暗红色肉眼血尿 | visible_gross_hematuria | 是 | 5天 | 服用抗凝药后小便变红5天 | Red urine for 5 days while taking an anticoagulant. | 否：BLOCKED_MEDICAL（HEM-P0-023） | 是 | 同上工作簿字段；`cases.json[HX-ADD-005].presentIllness` |
| P018 | 尿频尿急尿痛伴血尿2天 | Hematuria for 2 days | 终末或擦拭见少量淡红色尿，源表标记肉眼 | visible_gross_hematuria | 是 | 2天 | 尿频、尿急、尿痛伴小便发红2天 | Urinary frequency, urgency, and pain with red-tinged urine for 2 days. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-006].presentIllness` |
| P019 | 发热腰痛伴尿频尿痛3天 | Hematuria for 3 days | 镜下血尿为主，外观多不明显 | microscopic_non_visible_hematuria | 否 | 3天 | 发热、左腰痛伴尿频、尿痛3天 | Fever, left flank pain, urinary frequency, and painful urination for 3 days. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-007].presentIllness.hematuriaType/color` |
| P020 | 发热、尿痛伴会阴胀痛2天 | Hematuria for 2 days | “镜下或少量肉眼”，可见性混合且未明确 | uncertain_or_needs_review | 不确定 | 2天 | 发热、尿痛伴会阴胀痛2天 | Fever, painful urination, and perineal discomfort for 2 days. | 否：BLOCKED_MEDICAL | 是 | 同上工作簿字段；`cases.json[HX-ADD-008].presentIllness` |
| P021 | 尿频尿痛伴血尿1周 | Hematuria for 1 week | 尿色淡红，终末明显，源表标记肉眼 | visible_gross_hematuria | 是 | 1周 | 尿频、尿痛伴小便发红1周 | Urinary frequency and pain with red-tinged urine for 1 week. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-009].presentIllness` |

## 逐例审计表（P022–P042）

| 病例ID | 当前中文主诉 | 当前英文主诉 | 原始来源事实 | 血尿类型 | 肉眼看到尿液变红 | 病程时间 | 推荐新中文主诉 | 推荐新英文主诉 | 可自动修改 | 医学审核 | 修改依据文件和字段 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P022 | 反复尿痛伴镜下血尿1年 | Hematuria for 1 year | 镜下血尿为主，尿液外观多正常 | microscopic_non_visible_hematuria | 否 | 1年 | 反复尿痛伴尿检发现血尿1年 | Recurrent painful urination with microscopic blood detected on urine tests for 1 year. | 是 | 否 | `supplement_30_ai.xlsx::补充30_导师模板总表`上述字段；`cases.json[HX-ADD-010].presentIllness` |
| P023 | 右腰腹绞痛伴血尿6小时 | Hematuria for 6 hours | 淡红色全程肉眼尿，伴剧烈绞痛 | visible_gross_hematuria | 是 | 6小时 | 右腰腹绞痛伴小便发红6小时 | Red-tinged urine with severe right flank and abdominal colic for 6 hours. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-011].presentIllness` |
| P024 | 左腰痛伴血尿1天 | Hematuria for 1 day | 活动后淡红色全程肉眼尿 | visible_gross_hematuria | 是 | 1天 | 左腰痛伴小便发红1天 | Red-tinged urine with left flank pain for 1 day. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-012].presentIllness` |
| P025 | 排尿困难伴终末血尿3个月 | Hematuria for 3 months | 终末见鲜红/淡红色尿，伴排尿困难 | visible_gross_hematuria | 是 | 3个月 | 排尿困难伴排尿末小便发红3个月 | Difficulty urinating with red urine at the end of urination for 3 months. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-013].presentIllness` |
| P026 | 反复发热腰痛伴血尿半年 | Hematuria for half a year | 反复浑浊淡红色肉眼尿，伴发热腰痛 | visible_gross_hematuria | 是 | 半年 | 反复发热、腰痛伴小便发红半年 | Recurrent fever and flank pain with red-tinged urine for 6 months. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-014].presentIllness` |
| P027 | 左侧腰腹痛伴血尿1天 | Hematuria for 1 day | 淡红色肉眼尿，伴左腰腹阵发痛 | visible_gross_hematuria | 是 | 1天 | 左侧腰腹痛伴小便发红1天 | Red-tinged urine with left flank and abdominal pain for 1 day. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-015].presentIllness` |
| P028 | 排尿困难伴肉眼血尿3天 | Hematuria for 3 days | 鲜红/淡红色肉眼尿，伴排尿困难 | visible_gross_hematuria | 是 | 3天 | 排尿困难伴小便变红3天 | Difficulty urinating with red urine for 3 days. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-016].presentIllness` |
| P029 | 导尿后肉眼血尿1天 | Hematuria for 1 day | 导尿后出现鲜红色全程肉眼尿 | visible_gross_hematuria | 是 | 1天 | 导尿后小便变红1天 | Red urine for 1 day after catheterization. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-017].presentIllness` |
| P030 | 排尿困难伴镜下血尿半年 | Hematuria for half a year | 尿液外观正常，尿检发现镜下血尿 | microscopic_non_visible_hematuria | 否 | 半年 | 排尿困难伴尿检发现血尿半年 | Difficulty urinating with microscopic blood detected on urine tests for 6 months. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-018].presentIllness` |
| P031 | 咽痛后肉眼血尿2天 | Hematuria for 2 days | 上感后出现浓茶/可乐色尿 | tea_or_cola_colored_urine | 否：看到浓茶/可乐色 | 2天 | 咽痛后尿色呈浓茶色或可乐色2天 | Dark tea- or cola-colored urine for 2 days after a sore throat. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-019].presentIllness.color` |
| P032 | 皮肤感染后茶色尿伴眼睑水肿1周 | Hematuria for 1 week | 皮肤感染后茶色/烟熏色尿和水肿 | tea_or_cola_colored_urine | 否：看到茶/烟熏色 | 1周 | 皮肤感染后茶色尿伴眼睑水肿1周 | Tea-colored urine with eyelid swelling for 1 week after a skin infection. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-020].presentIllness.color` |
| P033 | 体检发现镜下血尿3年 | Hematuria for 3 years | 体检反复发现镜下血尿，尿液外观正常 | microscopic_non_visible_hematuria | 否 | 3年 | 体检反复发现尿检有血3年 | Microscopic blood repeatedly detected on health-check urine tests for 3 years. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-021].presentIllness` |
| P034 | 反复镜下血尿伴听力下降 | Hematuria for several days | 主诉/详情称镜下为主，`hematuria_type`却为肉眼 | uncertain_or_needs_review | 不确定 | 未提供 | 反复镜下血尿伴听力下降 | Recurrent microscopic hematuria with hearing loss. | 否：BLOCKED_MEDICAL | 是 | 同上工作簿 `chief_complaint/symptoms_detail/hematuria_type`互相矛盾；`cases.json[HX-ADD-022].presentIllness` |
| P035 | 泡沫尿、血尿伴面部皮疹2周 | Hematuria for 2 weeks | 镜下血尿，尿液多正常，偶呈茶色 | microscopic_non_visible_hematuria | 否（偶见茶色） | 2周 | 泡沫尿、尿检发现血尿伴面部皮疹2周 | Foamy urine with microscopic blood detected on urine tests and a facial rash for 2 weeks. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-023].presentIllness` |
| P036 | 长跑后肉眼血尿1次 | Hematuria for several days | 长跑后短暂淡红色尿1次，休息后缓解 | visible_gross_hematuria | 是 | 1次 | 长跑后小便发红1次 | One episode of red-tinged urine after a long-distance run. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-024].presentIllness` |
| P037 | 体检尿潜血阳性1天 | Hematuria for 1 day | 经期留样，尿潜血可能受经血污染 | menstrual_or_genital_contamination | 否 | 1天 | 经期体检发现尿潜血阳性1天 | Urine dipstick positive for blood during menstruation at a health check 1 day ago. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-025].presentIllness`及经期污染事实 |
| P038 | 车祸后腰痛伴肉眼血尿4小时 | Hematuria for 4 hours | 左腰撞击后出现鲜红/暗红色肉眼尿 | visible_gross_hematuria | 是 | 4小时 | 车祸后腰痛伴小便变红4小时 | Red urine with flank pain for 4 hours after a traffic accident. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-026].presentIllness` |
| P039 | 腰痛伴血尿反复半年 | Hematuria for half a year | 反复茶色或淡红色尿，肉眼/镜下均有 | tea_or_cola_colored_urine | 是，但颜色为茶色或淡红 | 半年 | 反复腰痛伴茶色或淡红色尿半年 | Recurrent flank pain with tea-colored or pale red urine for 6 months. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-027].presentIllness.color` |
| P040 | 突发左腰痛伴肉眼血尿1天 | Hematuria for 1 day | 突发左腰痛和暗红色全程肉眼尿 | visible_gross_hematuria | 是 | 1天 | 突发左腰痛伴小便变红1天 | Sudden left flank pain with red urine for 1 day. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-028].presentIllness` |
| P041 | 反复左腰酸痛伴镜下血尿1年 | Hematuria for 1 year | 主诉称镜下；详情称镜下为主偶淡红；类型字段为肉眼 | uncertain_or_needs_review | 不确定 | 1年 | 反复左腰酸痛伴镜下血尿1年 | Recurrent left flank discomfort with microscopic hematuria for 1 year. | 否：BLOCKED_MEDICAL | 是 | 同上工作簿 `chief_complaint/symptoms_detail/hematuria_type`互相矛盾；`cases.json[HX-ADD-029].presentIllness` |
| P042 | 体检发现镜下血尿1个月 | Hematuria for 1 month | 两次尿检发现镜下血尿，尿液外观正常 | microscopic_non_visible_hematuria | 否 | 1个月 | 体检发现尿检有血1个月 | Microscopic blood detected on health-check urine tests for 1 month. | 是 | 否 | 同上工作簿字段；`cases.json[HX-ADD-030].presentIllness` |

## 人工审核队列

| 阻塞原因 | 病例 |
|---|---|
| HEM-P0-023 双语医学冲突（不得自动翻转） | P001、P002、P003、P004、P007、P008、P010、P011、P012、P013、P017 |
| 可见性或来源字段混合/矛盾 | P006、P012、P020、P034、P041 |

人工审核前，以上15例保留当前主诉、Patient Agent 开场、`medicalReview.status=needs_revision`、`teacherReviewRequired`、来源和冲突隔离状态。

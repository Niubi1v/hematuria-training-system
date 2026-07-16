# 患者语言 BLOCKED_MEDICAL 人工审核清单

审计基线：`08b2843b0ee582b4b0fd5ab379b39c94476faaf9`

本清单共15例。所有候选文字均为“审核建议”，没有写入病例、运行时、Patient Agent或静态导出；`medicalReview.status`、`reviewerStatus`、`teacherReviewRequired`、`needs_revision`、HEM-P0-001和HEM-P0-023均保持不变。

## HEM-P0-023 隔离病例

| 病例 | 当前中/英文主诉 | 候选中/英文主诉（未落地） | 候选开场白（未落地） | 需专家裁决的问题 | 状态 |
|---|---|---|---|---|---|
| P001 | 间断小便变红3月余 / Intermittent painless gross hematuria for more than 3 months. | 间断小便变红3月余 / Intermittent red urine for more than 3 months. | 医生，我小便断断续续变红三个多月了，没有觉得疼。 / Doctor, my urine has turned red off and on for more than three months, without pain. | 双语冲突裁决前是否允许替换英文医学术语 | BLOCKED_MEDICAL: HEM-P0-023 |
| P002 | 反复左侧腰痛伴小便变红1月余 / Recurrent left flank pain with hematuria for more than 1 month. | 反复左侧腰痛伴小便变红1月余 / Recurrent left flank pain with red urine for more than 1 month. | 医生，我左边腰反复不舒服，小便也反复变红一个多月了。 / Doctor, I have had recurring discomfort in my left side and red urine for more than a month. | 双语冲突裁决前是否允许患者化英文 | BLOCKED_MEDICAL: HEM-P0-023 |
| P003 | 反复小便变红5月余，加重1周 / Recurrent hematuria for over 5 months, worsened for 1 week. | 反复小便变红5月余，加重1周 / Recurrent red urine for over 5 months, worsening over the past week. | 医生，我小便反复变红五个多月，最近一周更明显了。 / Doctor, my urine has repeatedly turned red for over five months and has become worse in the past week. | “反复”和“近期加重”双语值确认 | BLOCKED_MEDICAL: HEM-P0-023 |
| P004 | 小便变红1月余 / Painless total gross hematuria for more than 1 month. | 小便变红1月余 / Red urine for more than 1 month. | 医生，我小便变红一个多月了，没有觉得疼。 / Doctor, my urine has been red for more than a month, without pain. | 是否保留英文“全程/无痛”而中文主诉未显式写出 | BLOCKED_MEDICAL: HEM-P0-023 |
| P007 | 反复排尿困难5年余，急性加重伴小便变红1天 / Recurrent voiding difficulty for over 5 years, acute worsening with hematuria for 1 day. | 反复排尿困难5年余，急性加重伴小便变红1天 / Recurrent difficulty urinating for over 5 years, acutely worsening with red urine for 1 day. | 医生，我排尿困难反复五个多年，昨天突然更严重，小便也变红了。 / Doctor, I have had recurring difficulty urinating for over five years; it suddenly worsened yesterday and my urine turned red. | 两条时间轴及双语冲突裁决 | BLOCKED_MEDICAL: HEM-P0-023 |
| P008 | 间断小便变红伴排尿中断1年余 / Intermittent hematuria with interrupted urinary stream for more than 1 year. | 间断小便变红伴排尿中断1年余 / Intermittent red urine with interrupted urinary stream for more than 1 year. | 医生，我这一年多小便时不时变红，排尿还会突然中断。 / Doctor, for more than a year my urine has turned red off and on, and my stream sometimes stops suddenly. | 双语冲突裁决前是否允许患者化英文 | BLOCKED_MEDICAL: HEM-P0-023 |
| P010 | 反复左侧腰部隐痛伴运动后小便变红3年余，再发1天 / Recurrent left flank dull pain with exercise-related hematuria for over 3 years, recurrence for 1 day. | 反复左侧腰部隐痛伴运动后浓茶色尿3年余，再发酱油色尿1天 / Recurrent left flank discomfort with dark tea-colored urine after exercise for over 3 years, recurring as soy-sauce-colored urine for 1 day. | 医生，我运动后左边腰会隐隐痛，尿色反复像浓茶，这次又变成酱油色一天了。 / Doctor, after exercise I get a dull ache in my left side and dark tea-colored urine; this time it has looked soy-sauce-colored for one day. | 源记录“浓茶/酱油色”与既有“小便变红”冲突 | BLOCKED_MEDICAL: HEM-P0-023 |
| P011 | 咽痛3周，小便变红1周 / Sore throat for 3 weeks and hematuria for 1 week. | 咽痛3周，小便变红1周 / Sore throat for 3 weeks with red urine for 1 week. | 医生，我嗓子疼了三周，小便变红也有一周了。 / Doctor, I have had a sore throat for three weeks, and my urine has looked red for one week. | HEM-P0-023；13岁病例是否由本人或监护人开场未明确 | BLOCKED_MEDICAL: HEM-P0-023 |
| P012 | 反复小便变红伴尿泡沫增多半年余，加重半月 / Recurrent hematuria with increased foamy urine for over 6 months, worsened for half a month. | 反复尿色异常伴泡沫尿半年余，加重半月 / Recurrent abnormal urine color with foamy urine for over 6 months, worsening for half a month. | 医生，我这半年多尿色反复不正常，泡沫也多，最近半个月更明显了。 / Doctor, for over half a year my urine color has repeatedly looked abnormal and foamy, and it has become more noticeable over the past two weeks. | 肉眼/镜下及茶色/淡红混合；HEM-P0-023 | BLOCKED_MEDICAL: HEM-P0-023 + visibility_uncertain |
| P013 | 间断肉眼血尿2个月 / Hematuria for 2 months | 间断小便变红2个月 / Intermittent red urine for 2 months. | 医生，我这两个月小便断断续续变红，但一点也不疼。 / Doctor, my urine has turned red off and on for two months, without pain. | 原开场含“长东西”担忧；双语冲突裁决前不改 | BLOCKED_MEDICAL: HEM-P0-023 |
| P017 | 服用抗凝药后肉眼血尿5天 / Hematuria for 5 days | 服用抗凝药后小便变红5天 / Red urine for 5 days while taking an anticoagulant. | 医生，我吃抗凝药期间小便变红五天了。 / Doctor, my urine has been red for five days while I have been taking a blood thinner. | 原开场含利伐沙班和血块；是否属于主诉首句应保留的信息 | BLOCKED_MEDICAL: HEM-P0-023 |

## 可见性或来源冲突病例

| 病例 | 当前中/英文主诉 | 候选中/英文主诉（未落地） | 候选开场白（未落地） | 需专家裁决的问题 | 状态 |
|---|---|---|---|---|---|
| P006 | 尿频、尿急、尿痛伴小便变红2天 / Frequency, urgency and dysuria with hematuria for 2 days. | 尿频、尿急、尿痛伴擦拭见粉红色2天 / Urinary frequency, urgency, and pain with pink discoloration on wiping for 2 days. | 医生，我这两天老想小便，又急又疼，擦拭时还见到粉红色。 / Doctor, for two days I have needed to urinate often and urgently, it hurts, and I noticed pink discoloration when wiping. | 粉红色来源是尿道、阴道还是标本污染 | BLOCKED_MEDICAL: visibility_or_contamination_uncertain |
| P020 | 发热、尿痛伴会阴胀痛2天 / Hematuria for 2 days | 发热、尿痛伴会阴胀痛2天 / Fever, painful urination, and perineal discomfort for 2 days. | 医生，我发烧、尿痛，会阴里面胀得难受，已经两天了。 / Doctor, I have had fever, pain when urinating, and uncomfortable pressure in the perineal area for two days. | “镜下或少量肉眼”可见性未明确；现中文主诉不必加入尿色 | BLOCKED_MEDICAL: visibility_uncertain |
| P034 | 反复镜下血尿伴听力下降 / Hematuria for several days | 反复镜下血尿伴听力下降 / Recurrent microscopic hematuria with hearing loss. | 我体检反复发现尿里有红细胞，最近听别人说话也没有以前清楚。 / Repeated checkups have found red blood cells in my urine, and recently I have not heard people as clearly as before. | 主诉/详情为镜下，`hematuria_type`为肉眼；病程时间缺失 | BLOCKED_MEDICAL: source_visibility_conflict |
| P041 | 反复左腰酸痛伴镜下血尿1年 / Hematuria for 1 year | 反复左腰酸痛伴镜下血尿1年 / Recurrent left flank discomfort with microscopic hematuria for 1 year. | 医生，我左边腰反复酸痛一年，体检也反复说尿里有红细胞。 / Doctor, I have had recurring discomfort in my left side for a year, and checkups have repeatedly found red blood cells in my urine. | 主诉称镜下、详情称镜下为主偶淡红、类型字段称肉眼 | BLOCKED_MEDICAL: source_visibility_conflict |

## 审核约束

- P012在两组中只计1例，因此总数为15。
- 专家确认前不修改任何候选表达，不改变审核状态，不清除冲突记录。
- 审核应分别回答“尿液是否肉眼变色”“实际颜色”“是否来自尿路”“病例身份是否需监护人代述”“伴随症状是否属于主诉首句”后，再决定是否从阻塞列表移出。

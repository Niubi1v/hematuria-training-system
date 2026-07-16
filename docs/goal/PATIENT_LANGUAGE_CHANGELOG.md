# 病例表达与患者语言变更日志

起始HEAD：`08b2843b0ee582b4b0fd5ab379b39c94476faaf9`

实现提交：`df7b9e68a07a38efd310b4837483279e2e835582`

自动安全修改27例，未修改15例。完整主诉前后值也见 [`CHIEF_COMPLAINT_WORDING_IMPLEMENTATION_REPORT.md`](./CHIEF_COMPLAINT_WORDING_IMPLEMENTATION_REPORT.md)；本日志补齐每例Patient Agent中英文开场白前后值。英文“修改前”是基线服务端按当时算法动态生成的精确结果，不是源病例字段。

既有实现早于本附件的“分批文档”要求，已作为单一白名单实现提交落地。为避免改写Git历史，本日志按附件顺序重建逻辑批次，不reset、不rebase、不拆改既有提交。

## 第一批：事实最明确的肉眼可见病例（8例）

| 病例 | 中文主诉：前 → 后 | 英文主诉：前 → 后 | 中文开场：前 → 后 | 英文开场：前 → 后 |
|---|---|---|---|---|
| P005 | 进行性排尿困难3年余，加重伴小便变红1月 → 不变 | Progressive dysuria/voiding difficulty for over 3 years, worsened with hematuria for 1 month. → Progressive difficulty urinating for over 3 years, worsening with red urine for 1 month. | 进行性排尿困难3年余，加重伴小便变红1月 → 医生，我排尿越来越费劲，最近一个月小便还会变红。 | Hello, doctor. I came in because I have had Red urine for 1 month. → Doctor, it has been getting harder to urinate, and my urine has also turned red over the past month. |
| P015 | 左腰隐痛伴肉眼血尿1个月 → 左腰隐痛伴小便变红1个月 | Hematuria for 1 month → Red urine with dull left flank pain for 1 month. | 医生，我左边腰一直有点胀，最近尿是暗红色的，有时还能看到细长的血块。 → 医生，我左边腰一直隐隐作痛，小便变红有一个月了。 | Hello, doctor. I came in because I have had Hematuria for 1 month. → Doctor, I have had a dull ache in my left side and red urine for a month. |
| P016 | 无痛性肉眼血尿3周 → 间断小便变红3周 | Hematuria for 3 weeks → Intermittent red urine for 3 weeks. | 我这三周尿一直断断续续发红，但不痛，右腰偶尔有点胀。 → 医生，我这三周小便断断续续变红，但排尿时不疼。 | Hello, doctor. I came in because I have had Hematuria for 3 weeks. → Doctor, my urine has turned red off and on for three weeks, but it does not hurt when I urinate. |
| P028 | 排尿困难伴肉眼血尿3天 → 排尿困难伴小便变红3天 | Hematuria for 3 days → Difficulty urinating with red urine for 3 days. | 医生，我本来就小便费劲，这三天尿突然变红了，有时还有小血块。 → 医生，我排尿一直费劲，这三天小便还变红了。 | Hello, doctor. I came in because I have had Hematuria for 3 days. → Doctor, I have trouble urinating, and my urine has also turned red over the past three days. |
| P029 | 导尿后肉眼血尿1天 → 导尿后小便变红1天 | Hematuria for 1 day → Red urine for 1 day after catheterization. | 我昨晚完全尿不出来，医院插了尿管以后尿变成鲜红色，还带点小血块。 → 医生，我导尿以后小便变红了，已经一天了。 | Hello, doctor. I came in because I have had Hematuria for 1 day. → Doctor, my urine turned red after the catheter was placed, and it has been one day. |
| P036 | 长跑后肉眼血尿1次 → 长跑后小便发红1次 | Hematuria for several days → One episode of red-tinged urine after a long-distance run. | 我昨天跑完长跑后尿变红了一次，休息喝水后今天已经淡下来了。 → 医生，我长跑以后有一次小便发红，休息后就好了。 | Hello, doctor. I came in because I have had Hematuria for several days. → Doctor, my urine looked red once after a long-distance run, and it cleared after I rested. |
| P038 | 车祸后腰痛伴肉眼血尿4小时 → 车祸后腰痛伴小便变红4小时 | Hematuria for 4 hours → Red urine with flank pain for 4 hours after a traffic accident. | 我四小时前出了车祸，左边腰被撞得很痛，后来尿出来都是红的。 → 医生，我车祸撞到腰后小便变红了，已经四个小时。 | Hello, doctor. I came in because I have had Hematuria for 4 hours. → Doctor, my urine turned red after my flank was hit in a traffic accident four hours ago. |
| P040 | 突发左腰痛伴肉眼血尿1天 → 突发左腰痛伴小便变红1天 | Hematuria for 1 day → Sudden left flank pain with red urine for 1 day. | 我突然左边腰痛，尿也变成暗红色。我以前查出两边肾上有很多囊肿。 → 医生，我左边腰突然痛起来，小便也变红一天了。 | Hello, doctor. I came in because I have had Hematuria for 1 day. → Doctor, my left side suddenly started hurting, and my urine has been red for one day. |

## 第二批：明确镜下非可见病例（6例）

| 病例 | 中文主诉：前 → 后 | 英文主诉：前 → 后 | 中文开场：前 → 后 | 英文开场：前 → 后 |
|---|---|---|---|---|
| P019 | 发热腰痛伴尿频尿痛3天 → 发热、左腰痛伴尿频、尿痛3天 | Hematuria for 3 days → Fever, left flank pain, urinary frequency, and painful urination for 3 days. | 我这三天发高烧、打冷战，腰也很痛，还一直尿频尿痛。 → 医生，我发烧、左腰痛，还尿频尿痛，已经三天了。 | Hello, doctor. I came in because I have had Hematuria for 3 days. → Doctor, I have had a fever, pain in my left side, frequent urination, and pain when urinating for three days. |
| P022 | 反复尿痛伴镜下血尿1年 → 反复尿痛伴尿检发现血尿1年 | Hematuria for 1 year → Recurrent painful urination with microscopic blood detected on urine tests for 1 year. | 我这一年总是尿痛、尿急，吃药时好一点，但每次复查尿里还是有红细胞。 → 医生，我这一年尿痛反反复复，尿检还总能查到血。 | Hello, doctor. I came in because I have had Hematuria for 1 year. → Doctor, the pain when I urinate has kept coming back for a year, and urine tests keep finding blood. |
| P030 | 排尿困难伴镜下血尿半年 → 排尿困难伴尿检发现血尿半年 | Hematuria for half a year → Difficulty urinating with microscopic blood detected on urine tests for half a year. | 我这半年小便越来越困难，体检又发现尿里有红细胞，担心是不是前列腺癌。 → 医生，我排尿费劲有半年了，尿检还发现有血。 | Hello, doctor. I came in because I have had Hematuria for half a year. → Doctor, I have had difficulty urinating for half a year, and urine tests have also found blood. |
| P033 | 体检发现镜下血尿3年 → 体检反复发现尿检有血3年 | Hematuria for 3 years → Microscopic blood repeatedly detected on health-check urine tests for 3 years. | 我连续三年体检都说尿里有红细胞，但自己看尿一直正常，也没有不舒服。 → 医生，我这三年体检尿检反复查到有血，但自己看不出来。 | Hello, doctor. I came in because I have had Hematuria for 3 years. → Doctor, health-check urine tests have repeatedly found blood for three years, but I cannot see any color change myself. |
| P035 | 泡沫尿、血尿伴面部皮疹2周 → 泡沫尿、尿检发现血尿伴面部皮疹2周 | Hematuria for 2 weeks → Foamy urine with microscopic blood detected on urine tests and a facial rash for 2 weeks. | 我这两周尿泡沫很多，检查有血尿，脸上还出了红疹，腿也有点肿。 → 医生，我这两周尿里泡沫多，脸上起了皮疹，尿检还发现有血。 | Hello, doctor. I came in because I have had Hematuria for 2 weeks. → Doctor, for two weeks my urine has been foamy, I have had a rash on my face, and a urine test also found blood. |
| P042 | 体检发现镜下血尿1个月 → 体检发现尿检有血1个月 | Hematuria for 1 month → Microscopic blood detected on health-check urine tests for 1 month. | 我体检两次都说尿里有红细胞，但自己完全看不出来，也没有不舒服。 → 医生，我体检两次都说尿检有血，已经一个月了。 | Hello, doctor. I came in because I have had Hematuria for 1 month. → Doctor, two health-check urine tests have found blood over the past month. |

## 第三批：茶色/可乐色及经期污染（5例）

| 病例 | 中文主诉：前 → 后 | 英文主诉：前 → 后 | 中文开场：前 → 后 | 英文开场：前 → 后 |
|---|---|---|---|---|
| P009 | 突发右侧腰痛伴小便变红半天 → 突发右侧腰痛伴浓茶色尿半天 | Sudden right flank pain with hematuria for half a day. → Sudden right flank pain with dark tea-colored urine for half a day. | 突发右侧腰痛伴小便变红半天 → 医生，我右边腰突然痛得厉害，小便还是浓茶色，已经半天了。 | Hello, doctor. I came in because I have had Red urine for half a day. → Doctor, my right side suddenly started hurting badly, and my urine has been dark tea-colored for half a day. |
| P031 | 咽痛后肉眼血尿2天 → 咽痛后尿色呈浓茶色或可乐色2天 | Hematuria for 2 days → Dark tea- or cola-colored urine for 2 days after a sore throat. | 我前两天咽痛，几乎同时尿就变成可乐色了，早上眼皮还有点肿。 → 医生，我咽痛以后尿变成了浓茶色，有两天了。 | Hello, doctor. I came in because I have had Hematuria for 2 days. → Doctor, after my sore throat my urine turned dark tea-colored, and it has been like this for two days. |
| P032 | 皮肤感染后茶色尿伴眼睑水肿1周 → 不变 | Hematuria for 1 week → Tea-colored urine with eyelid swelling for 1 week after a skin infection. | 两三周前腿上长过脓疱，现在尿像浓茶，眼皮和脚都有点肿。 → 医生，我皮肤感染以后尿呈茶色，眼皮也肿了一个星期。 | Hello, doctor. I came in because I have had Hematuria for 1 week. → Doctor, after a skin infection my urine became tea-colored, and my eyelids have been swollen for a week. |
| P037 | 体检尿潜血阳性1天 → 经期体检发现尿潜血阳性1天 | Hematuria for 1 day → Urine dipstick positive for blood during menstruation at a health check 1 day ago. | 我体检那天正好来月经，尿检说潜血阳性，但我自己没有尿痛或看到尿血。 → 医生，我经期体检时尿潜血阳性，刚发现一天。 | Hello, doctor. I came in because I have had Hematuria for 1 day. → Doctor, a health-check urine dipstick was positive for blood during my period one day ago. |
| P039 | 腰痛伴血尿反复半年 → 反复腰痛伴茶色或淡红色尿半年 | Hematuria for half a year → Recurrent flank pain with tea-colored or pale red urine for half a year. | 我这半年腰痛、尿血反复发作，有时尿里好像还有一点组织碎片。我平时经常吃止痛药。 → 医生，我这半年腰痛反反复复，尿色有时像茶色、有时偏淡红。 | Hello, doctor. I came in because I have had Hematuria for half a year. → Doctor, my flank pain has kept coming back for half a year, and my urine sometimes looks tea-colored and sometimes pale red. |

## 第四批：反复/间断及明确伴随症状（8例）

| 病例 | 中文主诉：前 → 后 | 英文主诉：前 → 后 | 中文开场：前 → 后 | 英文开场：前 → 后 |
|---|---|---|---|---|
| P014 | 反复尿频伴血尿半年 → 反复尿频伴小便变红半年 | Hematuria for half a year → Recurrent urinary frequency with red urine for half a year. | 医生，我这半年老是尿频、尿急，有时候尿里还有血，吃消炎药好一点又会犯。 → 医生，我这半年尿频反反复复，小便也会变红。 | Hello, doctor. I came in because I have had Hematuria for half a year. → Doctor, for the past half year I have repeatedly needed to urinate more often, and my urine has also turned red. |
| P018 | 尿频尿急尿痛伴血尿2天 → 尿频、尿急、尿痛伴小便发红2天 | Hematuria for 2 days → Urinary frequency, urgency, and pain with red-tinged urine for 2 days. | 医生，我这两天一小会儿就想尿，尿的时候特别刺痛，最后还有点血。 → 医生，我这两天老想小便，又急又疼，尿也有点发红。 | Hello, doctor. I came in because I have had Hematuria for 2 days. → Doctor, for two days I have needed to urinate often and urgently, it hurts, and my urine looks a little red. |
| P021 | 尿频尿痛伴血尿1周 → 尿频、尿痛伴小便发红1周 | Hematuria for 1 week → Urinary frequency and pain with red-tinged urine for 1 week. | 医生，我这一个星期尿得特别频，尿的时候疼，最后还有点血，血糖最近也没好好管。 → 医生，我这一周尿得频、尿的时候疼，尿色还有点发红。 | Hello, doctor. I came in because I have had Hematuria for 1 week. → Doctor, for a week I have been urinating often, it hurts, and my urine looks a little red. |
| P023 | 右腰腹绞痛伴血尿6小时 → 右腰腹绞痛伴小便发红6小时 | Hematuria for 6 hours → Red-tinged urine with severe right flank and abdominal colic for 6 hours. | 医生，我右边腰突然像绞一样疼，坐也坐不住，尿也变红了。 → 医生，我右边腰和肚子绞着疼，小便有点发红，已经六个小时了。 | Hello, doctor. I came in because I have had Hematuria for 6 hours. → Doctor, my right side and abdomen have been cramping badly, and my urine looks a little red; it has been six hours. |
| P024 | 左腰痛伴血尿1天 → 左腰痛伴小便发红1天 | Hematuria for 1 day → Red-tinged urine with left flank pain for 1 day. | 我左边腰这一天一直钝钝地疼，尿也有点红，不像以前那种很剧烈的绞痛。 → 医生，我左边腰痛了一天，小便看着有点发红。 | Hello, doctor. I came in because I have had Hematuria for 1 day. → Doctor, my left side has hurt for a day, and my urine looks a little red. |
| P025 | 排尿困难伴终末血尿3个月 → 排尿困难伴排尿末小便发红3个月 | Hematuria for 3 months → Difficulty urinating with red urine at the end of urination for 3 months. | 医生，我这三个月小便越来越不顺，尿到一半会突然停，最后还会滴几滴血。 → 医生，我这三个月排尿很费劲，快尿完时尿色会发红。 | Hello, doctor. I came in because I have had Hematuria for 3 months. → Doctor, I have had trouble urinating for three months, and the urine turns red near the end. |
| P026 | 反复发热腰痛伴血尿半年 → 反复发热、腰痛伴小便发红半年 | Hematuria for half a year → Recurrent fever and flank pain with red-tinged urine for half a year. | 我这半年反复发烧、腰痛，尿又浑又红，吃消炎药好一阵又复发。 → 医生，我这半年反复发烧、腰痛，小便也会发红。 | Hello, doctor. I came in because I have had Hematuria for half a year. → Doctor, for the past half year I have repeatedly had fever and flank pain, and my urine also looks red. |
| P027 | 左侧腰腹痛伴血尿1天 → 左侧腰腹痛伴小便发红1天 | Hematuria for 1 day → Red-tinged urine with left flank and abdominal pain for 1 day. | 我左边腰突然一阵阵绞痛，尿里有血。我有痛风，降尿酸药也没怎么按时吃。 → 医生，我左边腰腹疼了一天，小便有点发红。 | Hello, doctor. I came in because I have had Hematuria for 1 day. → Doctor, my left side and abdomen have hurt for a day, and my urine looks a little red. |

## 第五批：仅审核，不修改（15例）

P001、P002、P003、P004、P006、P007、P008、P010、P011、P012、P013、P017、P020、P034、P041。逐例原因和候选表达见 [`PATIENT_LANGUAGE_BLOCKED_REVIEW.md`](./PATIENT_LANGUAGE_BLOCKED_REVIEW.md)。

## 变更范围

只更新中英文患者主诉、Patient Profile主诉、病例目录患者可见主诉、主诉问答、Patient Agent开场和直接派生投影。未更新诊断、病理、完整病史、评分关键词、source/derived/simulation、审核状态、教师字段或冲突裁决。

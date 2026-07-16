# P001–P042 病例表达审计矩阵

审计基线：`08b2843b0ee582b4b0fd5ab379b39c94476faaf9`

专项分支：`codex/hematuria-chief-complaint-wording`

本矩阵补充 [`CHIEF_COMPLAINT_WORDING_AUDIT.md`](./CHIEF_COMPLAINT_WORDING_AUDIT.md) 中已经逐例记录的中英文主诉、原始来源事实、推荐中英文主诉、自动修改判断和涉及字段。两份文档合并构成附件要求的42例完整审计矩阵；这里重点补齐当前开场白、年龄/身份、尿色、发作方式、伴随症状及推荐开场白索引。

## 口径

- `V2`：`work/source/v2_only_cases.xlsx::总表_V2病例库.chief_complaint/symptoms_detail/hematuria_type/hematuria_color`，用于 P001–P012。
- `S30`：`work/source/supplement_30_ai.xlsx::补充30_导师模板总表`同名字段，用于 P013–P042。
- 每例同时核对 `data/cases.json[].presentIllness`，但不根据最终诊断反推血尿类型。
- `U:<ID>`：推荐中英文主诉及推荐中英文开场白的精确值位于 `data/chief_complaint_wording.json.updates[<ID>]`；这27例已安全落地。
- `B:<ID>`：候选表达位于 [`PATIENT_LANGUAGE_BLOCKED_REVIEW.md`](./PATIENT_LANGUAGE_BLOCKED_REVIEW.md)，仅供专家审核，未落地。
- 附件新命名 `tea_cola_or_dark_colored_urine` 对应既有策略键 `tea_or_cola_colored_urine`；`genital_or_menstrual_contamination` 对应 `menstrual_or_genital_contamination`。两者只是文档别名，不改变既有数据。
- `red_urine_not_confirmed_as_blood`：本批0例。P006为擦拭见粉红色且尿道/阴道来源未明，故归入 `uncertain_or_needs_review`，不擅自归类为红尿。

## 逐例矩阵（P001–P021）

| 病例 | 年龄/性别 | 审计基线当前开场白 | 类型 | 肉眼可见/尿色 | 发作方式与病程 | 主诉已有明确伴随症状 | 推荐索引 | 自动修改/冲突/审核 | 依据 |
|---|---|---|---|---|---|---|---|---|---|
| P001 | 65/男 | 间断小便变红3月余 | visible_gross_hematuria | 是；红/洗肉水样 | 间断，3月余 | 无痛 | B:P001 | 否；HEM-P0-023；需审 | V2 + `P001.presentIllness` |
| P002 | 67/女 | 反复左侧腰痛伴小便变红1月余 | visible_gross_hematuria | 是；红/洗肉水样 | 反复，1月余 | 左腰痛 | B:P002 | 否；HEM-P0-023；需审 | V2 + `P002.presentIllness` |
| P003 | 70/男 | 反复小便变红5月余，加重1周 | visible_gross_hematuria | 是；鲜红 | 反复5月余，近1周加重 | 无 | B:P003 | 否；HEM-P0-023；需审 | V2 + `P003.presentIllness` |
| P004 | 65/男 | 小便变红1月余 | visible_gross_hematuria | 是；鲜红 | 持续/全程，1月余 | 无痛 | B:P004 | 否；HEM-P0-023；需审 | V2 + `P004.presentIllness` |
| P005 | 83/男 | 进行性排尿困难3年余，加重伴小便变红1月 | visible_gross_hematuria | 是；鲜红 | 排尿困难3年余，间断尿红1月 | 排尿困难 | U:P005 | 是；无冲突；无需额外审 | V2 + `P005.presentIllness` |
| P006 | 23/女 | 尿频、尿急、尿痛伴小便变红2天 | uncertain_or_needs_review | 不确定；擦拭粉红 | 2天 | 尿频、尿急、尿痛 | B:P006 | 否；尿道/阴道来源未明；需审 | V2 + `P006.presentIllness` |
| P007 | 65/男 | 反复排尿困难5年余，急性加重伴小便变红1天 | visible_gross_hematuria | 是；淡红 | 反复5年余，尿红1天 | 排尿困难/急性加重 | B:P007 | 否；HEM-P0-023；需审 | V2 + `P007.presentIllness` |
| P008 | 56/男 | 间断小便变红伴排尿中断1年余 | visible_gross_hematuria | 是；淡红 | 间断，1年余 | 排尿中断 | B:P008 | 否；HEM-P0-023；需审 | V2 + `P008.presentIllness` |
| P009 | 36/女 | 突发右侧腰痛伴小便变红半天 | tea_cola_or_dark_colored_urine | 是，但为浓茶色 | 突发，半天 | 右侧腰痛 | U:P009 | 是；无冲突；无需额外审 | V2 + `P009.presentIllness.color` |
| P010 | 42/男 | 反复左侧腰部隐痛伴运动后小便变红3年余，再发1天 | tea_cola_or_dark_colored_urine | 是；浓茶/酱油色 | 运动后反复3年余，再发1天 | 左腰隐痛 | B:P010 | 否；HEM-P0-023；需审 | V2 + `P010.presentIllness.color` |
| P011 | 13/女 | 咽痛3周，小便变红1周 | visible_gross_hematuria | 是；淡红/洗肉水样 | 感染后，尿红1周 | 咽痛3周 | B:P011 | 否；HEM-P0-023；需审；未擅定监护人代述 | V2 + `P011.presentIllness` |
| P012 | 21/男 | 反复小便变红伴尿泡沫增多半年余，加重半月 | uncertain_or_needs_review | 不确定；茶/淡红混合 | 反复半年余，加重半月 | 泡沫尿 | B:P012 | 否；HEM-P0-023且来源混合；需审 | V2 + `P012.presentIllness` |
| P013 | 68/男 | 医生，我这两个月断断续续尿血，但一点也不疼，会不会是哪里长东西了？ | visible_gross_hematuria | 是；洗肉水/暗红 | 间断，2个月 | 无痛 | B:HX-ADD-001 | 否；HEM-P0-023；需审 | S30 + `HX-ADD-001.presentIllness` |
| P014 | 72/女 | 医生，我这半年老是尿频、尿急，有时候尿里还有血，吃消炎药好一点又会犯。 | visible_gross_hematuria | 是；淡红至暗红 | 反复，半年 | 尿频 | U:HX-ADD-002 | 是；无冲突；无需额外审 | S30 + `HX-ADD-002.presentIllness` |
| P015 | 64/男 | 医生，我左边腰一直有点胀，最近尿是暗红色的，有时还能看到细长的血块。 | visible_gross_hematuria | 是；暗红 | 持续/全程，1个月 | 左腰隐痛 | U:HX-ADD-003 | 是；无冲突；无需额外审 | S30 + `HX-ADD-003.presentIllness` |
| P016 | 58/男 | 我这三周尿一直断断续续发红，但不痛，右腰偶尔有点胀。 | visible_gross_hematuria | 是；暗红 | 间断2次，3周 | 无痛 | U:HX-ADD-004 | 是；无冲突；无需额外审 | S30 + `HX-ADD-004.presentIllness` |
| P017 | 76/男 | 医生，我吃着利伐沙班，这几天尿里突然有血和小血块，我是不是药吃多了？ | visible_gross_hematuria | 是；鲜红至暗红 | 抗凝药期间，5天 | 服抗凝药 | B:HX-ADD-005 | 否；HEM-P0-023；需审 | S30 + `HX-ADD-005.presentIllness` |
| P018 | 24/女 | 医生，我这两天一小会儿就想尿，尿的时候特别刺痛，最后还有点血。 | visible_gross_hematuria | 是；少量淡红 | 终末/擦拭，2天 | 尿频、尿急、尿痛 | U:HX-ADD-006 | 是；无冲突；无需额外审 | S30 + `HX-ADD-006.presentIllness` |
| P019 | 35/女 | 我这三天发高烧、打冷战，腰也很痛，还一直尿频尿痛。 | microscopic_non_visible_hematuria | 否；外观多不明显 | 3天 | 发热、左腰痛、尿频尿痛 | U:HX-ADD-007 | 是；无冲突；无需额外审 | S30 + `HX-ADD-007.presentIllness` |
| P020 | 47/男 | 医生，我发烧、尿痛，会阴里面胀得难受，现在小便也越来越费劲。 | uncertain_or_needs_review | 不确定；镜下或少量肉眼 | 2天 | 发热、尿痛、会阴胀痛 | B:HX-ADD-008 | 否；可见性混合；需审 | S30 + `HX-ADD-008.presentIllness` |
| P021 | 63/女 | 医生，我这一个星期尿得特别频，尿的时候疼，最后还有点血，血糖最近也没好好管。 | visible_gross_hematuria | 是；淡红 | 终末明显，1周 | 尿频、尿痛 | U:HX-ADD-009 | 是；无冲突；无需额外审 | S30 + `HX-ADD-009.presentIllness` |

## 逐例矩阵（P022–P042）

| 病例 | 年龄/性别 | 审计基线当前开场白 | 类型 | 肉眼可见/尿色 | 发作方式与病程 | 主诉已有明确伴随症状 | 推荐索引 | 自动修改/冲突/审核 | 依据 |
|---|---|---|---|---|---|---|---|---|---|
| P022 | 55/女 | 我这一年总是尿痛、尿急，吃药时好一点，但每次复查尿里还是有红细胞。 | microscopic_non_visible_hematuria | 否；外观多正常 | 反复，1年 | 尿痛 | U:HX-ADD-010 | 是；无冲突；无需额外审 | S30 + `HX-ADD-010.presentIllness` |
| P023 | 39/男 | 医生，我右边腰突然像绞一样疼，坐也坐不住，尿也变红了。 | visible_gross_hematuria | 是；淡红 | 突发，6小时 | 右腰腹绞痛 | U:HX-ADD-011 | 是；无冲突；无需额外审 | S30 + `HX-ADD-011.presentIllness` |
| P024 | 45/男 | 我左边腰这一天一直钝钝地疼，尿也有点红，不像以前那种很剧烈的绞痛。 | visible_gross_hematuria | 是；淡红 | 活动后，1天 | 左腰痛 | U:HX-ADD-012 | 是；无冲突；无需额外审 | S30 + `HX-ADD-012.presentIllness` |
| P025 | 67/男 | 医生，我这三个月小便越来越不顺，尿到一半会突然停，最后还会滴几滴血。 | visible_gross_hematuria | 是；鲜红/淡红 | 终末，3个月 | 排尿困难 | U:HX-ADD-013 | 是；无冲突；无需额外审 | S30 + `HX-ADD-013.presentIllness` |
| P026 | 61/女 | 我这半年反复发烧、腰痛，尿又浑又红，吃消炎药好一阵又复发。 | visible_gross_hematuria | 是；浑浊淡红 | 反复，半年 | 发热、腰痛 | U:HX-ADD-014 | 是；无冲突；无需额外审 | S30 + `HX-ADD-014.presentIllness` |
| P027 | 52/男 | 我左边腰突然一阵阵绞痛，尿里有血。我有痛风，降尿酸药也没怎么按时吃。 | visible_gross_hematuria | 是；淡红 | 阵发，1天 | 左腰腹痛 | U:HX-ADD-015 | 是；无冲突；无需额外审 | S30 + `HX-ADD-015.presentIllness` |
| P028 | 73/男 | 医生，我本来就小便费劲，这三天尿突然变红了，有时还有小血块。 | visible_gross_hematuria | 是；鲜红/淡红 | 3天 | 排尿困难 | U:HX-ADD-016 | 是；无冲突；无需额外审 | S30 + `HX-ADD-016.presentIllness` |
| P029 | 80/男 | 我昨晚完全尿不出来，医院插了尿管以后尿变成鲜红色，还带点小血块。 | visible_gross_hematuria | 是；鲜红 | 导尿后，1天 | 导尿 | U:HX-ADD-017 | 是；无冲突；无需额外审 | S30 + `HX-ADD-017.presentIllness` |
| P030 | 69/男 | 我这半年小便越来越困难，体检又发现尿里有红细胞，担心是不是前列腺癌。 | microscopic_non_visible_hematuria | 否；外观正常 | 半年 | 排尿困难 | U:HX-ADD-018 | 是；无冲突；无需额外审 | S30 + `HX-ADD-018.presentIllness` |
| P031 | 21/男 | 我前两天咽痛，几乎同时尿就变成可乐色了，早上眼皮还有点肿。 | tea_cola_or_dark_colored_urine | 是，但为浓茶/可乐色 | 咽痛后，2天 | 咽痛 | U:HX-ADD-019 | 是；无冲突；无需额外审 | S30 + `HX-ADD-019.presentIllness.color` |
| P032 | 16/男 | 两三周前腿上长过脓疱，现在尿像浓茶，眼皮和脚都有点肿。 | tea_cola_or_dark_colored_urine | 是，但为茶/烟熏色 | 皮肤感染后，1周 | 眼睑水肿 | U:HX-ADD-020 | 是；无冲突；未擅定监护人代述 | S30 + `HX-ADD-020.presentIllness.color` |
| P033 | 28/女 | 我连续三年体检都说尿里有红细胞，但自己看尿一直正常，也没有不舒服。 | microscopic_non_visible_hematuria | 否；外观正常 | 体检反复发现，3年 | 无 | U:HX-ADD-021 | 是；无冲突；无需额外审 | S30 + `HX-ADD-021.presentIllness` |
| P034 | 19/男 | 我体检反复发现尿里有红细胞，最近也觉得听别人说话没以前清楚。 | uncertain_or_needs_review | 不确定；详情称镜下，类型字段称肉眼 | 反复；未提供时长 | 听力下降 | B:HX-ADD-022 | 否；来源字段矛盾；需审 | S30 + `HX-ADD-022.presentIllness` |
| P035 | 25/女 | 我这两周尿泡沫很多，检查有血尿，脸上还出了红疹，腿也有点肿。 | microscopic_non_visible_hematuria | 否；外观多正常，偶茶色 | 2周 | 泡沫尿、面部皮疹 | U:HX-ADD-023 | 是；无冲突；无需额外审 | S30 + `HX-ADD-023.presentIllness` |
| P036 | 20/男 | 我昨天跑完长跑后尿变红了一次，休息喝水后今天已经淡下来了。 | visible_gross_hematuria | 是；淡红 | 长跑后1次 | 无 | U:HX-ADD-024 | 是；无冲突；无需额外审 | S30 + `HX-ADD-024.presentIllness` |
| P037 | 31/女 | 我体检那天正好来月经，尿检说潜血阳性，但我自己没有尿痛或看到尿血。 | genital_or_menstrual_contamination | 否；经血影响 | 经期留样，1天 | 无泌尿症状 | U:HX-ADD-025 | 是；无冲突；无需额外审 | S30 + `HX-ADD-025.presentIllness` |
| P038 | 29/男 | 我四小时前出了车祸，左边腰被撞得很痛，后来尿出来都是红的。 | visible_gross_hematuria | 是；鲜红/暗红 | 外伤后，4小时 | 腰痛 | U:HX-ADD-026 | 是；无冲突；无需额外审 | S30 + `HX-ADD-026.presentIllness` |
| P039 | 56/女 | 我这半年腰痛、尿血反复发作，有时尿里好像还有一点组织碎片。我平时经常吃止痛药。 | tea_cola_or_dark_colored_urine | 是；茶色或淡红 | 反复，半年 | 腰痛 | U:HX-ADD-027 | 是；无冲突；无需额外审 | S30 + `HX-ADD-027.presentIllness.color` |
| P040 | 48/男 | 我突然左边腰痛，尿也变成暗红色。我以前查出两边肾上有很多囊肿。 | visible_gross_hematuria | 是；暗红 | 突发，1天 | 左腰痛 | U:HX-ADD-028 | 是；无冲突；无需额外审 | S30 + `HX-ADD-028.presentIllness` |
| P041 | 23/女 | 我这一年左腰总是酸，体检反复说有镜下血尿，站久或运动后更明显。 | uncertain_or_needs_review | 不确定；镜下为主偶淡红，类型字段称肉眼 | 反复，1年 | 左腰酸痛 | B:HX-ADD-029 | 否；来源字段矛盾；需审 | S30 + `HX-ADD-029.presentIllness` |
| P042 | 62/男 | 我体检两次都说尿里有红细胞，但自己完全看不出来，也没有不舒服。 | microscopic_non_visible_hematuria | 否；外观正常 | 两次体检，1个月 | 无 | U:HX-ADD-030 | 是；无冲突；无需额外审 | S30 + `HX-ADD-030.presentIllness` |

## 重复字段与单一权威

审计确认主诉/开场分布在源病例、Patient Profile、病例目录、当前可见资料、Patient Agent、问答投影、fixture和静态导出。为避免继续手工漂移：

- 完整审计策略由 `data/chief_complaint_wording.json` 保存；其中包含分类、阻塞原因、病程令牌及27例推荐值。
- 患者可见运行时只读取不含阻塞医学元数据的 `data/chief_complaint_wording_runtime.json`。
- `scripts/apply-chief-complaint-wording.ts` 以病例和字段双白名单同步直接投影；白名单外变化立即失败。
- 教师医学字段、诊断、病理、评分、来源和审核状态不由该脚本写入。

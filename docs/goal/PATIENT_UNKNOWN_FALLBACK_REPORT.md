# Patient Unknown Fallback Report

日期：2026-07-17。范围为首批`dysuria`及血尿全程/起始/终末4 intent。

## 指标

| 指标 | 修复前 | 首批修复后 |
|---|---:|---:|
| 专项问题数 | 74 | 86 |
| canonical命中率 | 8/74（10.81%） | 86/86（100%） |
| 明确事实错误unknown率 | 37/74（50.00%） | 0/86（0%） |
| 回答极性错误率 | 67/74（90.54%） | 0/86（0%） |
| 复合三事实完整率 | 1/1 | 1/1 |

42例矩阵另执行840问：840/840 canonical命中；595个明确事实回答中错误unknown=0；230个双语无法一致分类/原文明确含追问语义的事实保持自然unknown；15个HEM-P0-023 dysuria问法继续安全隔离。

## 正确unknown分类

以下情况继续允许并要求unknown：

- source slot缺失；
- 中文和英文答案无法分类为同一事实值；
- 时相原文包含“需追问、非典型、不按起始/终末、可表现、多为、可伴”；
- HEM-P0-023命中；
- 问题没有安全命中具体事实；
- 病例明确表示患者未观察。

自然表达按语义区分：尿痛不确定为“小便时是否疼，我现在说不准”；时相不确定为“我没仔细看清是刚开始、最后，还是全程都红”。普通用户不看到字段、审核、source或系统术语。

## 禁止的unknown转换

- missing不转negative；
- `teacherReviewRequired`、`needs_revision`或双语冲突不自动转true/false；
- 问题中的“没有/不是”不改变source事实；
- 英文alias命中不使用中文fallback；
- Provider不可用不改变确定性currentAllowedAnswer。

## 已知边界

当前统计只覆盖4个首批intent，不能外推为所有症状unknown率已达0。其余canonical事实将逐批建立相同known/unknown分类和42例矩阵。

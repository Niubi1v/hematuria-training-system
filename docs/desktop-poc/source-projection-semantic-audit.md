# 桌面检查结果语义完整性审计

审计基线：`9393b14b7b8f8bd9ca9d4e4962816e1a45579e1e`  
审计范围：桌面 runtime 中此前机械匹配成功的 66 项 source projection；不修改 `data/**`，不变更医学审核状态或评分规则。

## 三个截图问题

1. P001 `LAB-BL-001` 的“糖化血红蛋白 8.0，梅毒抗体阳性”来自既有 `order_results_structured.json` 绑定。原病例 source 的 `clinicalSource.specialTests` 是综合检查列表，历史生成过程把第一条综合结果误绑到血常规。这不是 runtime source projection 或 UI 文案问题。
2. P001 `LAB-UR-001` 同时包含 `urineTestResult` 与 `investigations[0].result` 的同义重复，既有聚合结果未按语义指纹去重。这不是检查目录归类问题。
3. 中文结果投影此前没有统一生成 `result` 字段；本地时间线拼接 `orderCategory` 与缺失的 `result` 后，再经学生端清洗移除 `undefined`，留下仅有分类名和冒号的空壳。这是展示投影与时间线安全过滤共同缺口，不是原病例 source 为空。

测试夹具沿用了旧的“66 项均应返回”假设，曾把不安全投影当作预期结果；专项测试已改为严格语义断言。

## 66 项逐项审计结果

验证脚本对每项记录并断言 `caseId`、`orderId`、展示名、domain、existing source、projected result、source 文件与精确位置、语义兼容性、混合、重复、空值及诊疗影响标记。

| 结论 | 数量 |
| --- | ---: |
| 保留 | 4 |
| 撤回并转入等待医学审核 | 62 |
| 合计 | 66 |

撤回原因：

| 原因 | 数量 |
| --- | ---: |
| 与其他医嘱结果重复 | 37 |
| 跨域或综合 source 无法安全拆分 | 7 |
| 建议性、假设性或不确定结果 | 17 |
| 混合多个时点或状态 | 1 |

保留项均为可直接定位、语义单一的尿常规结果：P015、P016、P024、P042 的 `LAB-UR-001`。它们保持 `scoringEligible=false`；其余 62 项不生成结果事件，保持 `diagnosticEligible=false`、`scoringEligible=false` 和 `medical_review_pending`。

runtime 当前共有 121 项 source projection 拒绝记录，等待医学审核总数为 1023。数据源与 `data/**` 未修改。

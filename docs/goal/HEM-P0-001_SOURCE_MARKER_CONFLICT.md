# HEM-P0-001 source辅助标记冲突

本文件补齐 `data/history_medical_reconciliation.json` 已引用但基线缺失的报告路径。它只索引151条source记录的辅助标记冲突，不修改事实值、provenance或审批状态。

## 结论

- 153条source追踪中，151条主 `provenance=source`，但辅助字段“是否程序或AI补充”为“是”；另2条为source/否。
- 151条继续按HEM-P0-001阻塞，不自动选择“是/否”，不借此改写医学事实。
- 逐项清单见 `docs/medical-review/SOURCE_REVISION_REVIEW.csv` 中 `审核ID=HEM-P0-001-*`；主队列见 `MEDICAL_REVIEW_PRIORITY_QUEUE.csv`。
- 当前运行时保留source事实与冲突标记；不据此扩展确定性Patient回答；病例正式模式继续因needs_revision禁用。

## 人工问题模板

“{病例ID}的{字段}主provenance为source，但辅助‘是否程序或AI补充’标为‘是’。请核对原始来源，确认辅助标记应如何修订，并注明依据；本项不得借机改写事实值。”

## 原始证据

- `data/hematuria_release_v14_normalized.json::facts`
- `data/medical_review_queue.json::sourceTrace`
- `docs/medical-review/hematuria_expert_review_queue.xlsx::来源事实核对`
- `docs/goal/DEFECT_LOG.md` 的HEM-P0-001段落

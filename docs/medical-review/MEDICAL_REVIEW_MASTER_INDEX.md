# 医学人工审核主索引

## 使用边界

本目录仅用于整理、去重、排序和人工审核准备。病例事实、`reviewerStatus`、`teacherReviewRequired`、42例`needs_revision`、360分规则与既有专家填写内容均未修改。

## 输出索引

| 文件 | 行数（不含表头） | 用途 |
| --- | ---: | --- |
| `MEDICAL_REVIEW_PRIORITY_QUEUE.csv` | 756 | 去重后的字段级主队列，按P0→P1→P2排序 |
| `CASE_SIGNOFF_CHECKLIST.csv` | 42 | P001–P042病例级阻塞和终签条件 |
| `BILINGUAL_CONFLICT_REVIEW.csv` | 18 | HEM-P0-023双语医学极性裁决入口 |
| `SOURCE_REVISION_REVIEW.csv` | 268 | HEM-P0-001、病史source冲突和去重后source修订 |
| `METADATA_AND_ENGLISH_LABEL_REVIEW.csv` | 51 | 28项检验元数据与23项英文名称 |
| `MEDICAL_REVIEW_SUMMARY.md` | — | 数量、优先级、专业和Excel追加说明 |

## 去重键

基础键为“显示病例ID + 规范化字段 + 根因”。同根因的历史QA重复问法只保留一条；不同根因（例如同字段的provenance冲突与医学极性冲突）可分别保留。P002 `surgeryHistory/surgery_history` 的source/source矛盾与历史source安全阻断合并到 `HISTORY-MED-001`，原始缺陷来源写入备注。

## 原始成果映射

| 现有成果 | 已复用内容 | 主队列映射 |
| --- | --- | --- |
| `docs/medical-review/hematuria_expert_review_queue.xlsx` | 419条专家队列、153条source核对、原审核字段 | 419条按原MR编号复用；151条HEM-P0-001映射到source核对行 |
| `docs/medical-review/血尿病例_42例医学内容审校修订候选版_待人工终签.xlsx` | 419条AI预审候选、42例病例级终审 | 不改专家填写；CASE_SIGNOFF_CHECKLIST增加阻塞计数与隔离状态映射 |
| `outputs/medical-review/HEM-P0-023_18条双语医学裁决表.xlsx` | 18条、23字段裁决结构 | BILINGUAL_CONFLICT_REVIEW逐行映射，无需追加 |
| `docs/goal/HISTORY_MEDICAL_BLOCKED_REVIEW.md` / reconciliation报告 | 14条新增BLOCKED_MEDICAL、18条既有冲突、151条HEM-P0-001 | 保留原ID、问题和运行时隔离说明 |
| 历史QA `160404d` | 161次source-cell阻断观测 | 去重为104项；P002并入HISTORY-MED-001，余103项单列 |
| 历史QA `2107b7b` | 28项元数据、23项英文名称 | 逐项展开为51行 |

## 与现有Excel的字段映射

| 本CSV字段 | 专家审核队列工作表 | HEM-P0-023裁决表 | 说明 |
| --- | --- | --- | --- |
| 审核ID | 审核项ID | 审核项ID | 原编号优先保留 |
| 病例ID | 病例ID | 病例ID | 使用P001–P042显示ID |
| 医学领域 | 疾病类别/主审专科 | 病种/推荐审核专科 | 仅作分流 |
| 字段或事实 | 字段 | 字段 | 规范字段名或order/result ID |
| 当前中文值/当前英文值 | 当前中文/英文患者回答 | 中文/英文当前值 | 不改原值 |
| source值 | 原始资料摘录 | 原始资料摘录、source/derived来源 | 可审计证据 |
| 冲突类型 | 冲突检查 | 冲突类型 | 新队列使用标准根因标签 |
| 是否影响诊断/评分 | 影响诊断/影响评分 | 影响诊断/影响评分 | Patient影响为新增列 |
| 审核结论 | 审核决定 | 决定 | 本次保持空白；不得覆盖既有填写 |
| 审核人/审核日期 | 审核人/审核日期 | 审核人/审核日期 | 本次保持空白 |

## Excel追加结论

- 不新建重复Excel，不修改任何现有专家填写。
- 仓库已有正式Excel已覆盖419条simulation、151条HEM-P0-001对应source行和18条HEM-P0-023。
- 若维护单一中央Excel，建议追加168个唯一项目：14条病史、103条去重后source修订、28条元数据、23条英文名称。
- 42例病例级终审行已存在，只需将本清单的阻塞计数、隔离状态和专家类型作为映射参考，不应覆盖“人工终签”列。

## 排除项

CI、浏览器、部署、CORS、移动端、依赖漏洞等工程缺陷未进入医学队列。工程fail-closed证据只用于说明当前运行时如何隔离未审医学内容。

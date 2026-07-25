# P001–P042 病史医学协调变更日志

## 结果摘要

- 自动按来源优先级修正：371项逐字段记录。
- 仅文案／翻译自然化：490项逐字段记录。
- 本专项新识别并隔离的 `BLOCKED_MEDICAL`：14项。
- 既有 `HEM-P0-023` 冻结冲突：18项；既有 `HEM-P0-001` source标记冲突：151项。
- 治理总量：572条事实（source 153 + simulation 419）；所有42例继续保持 `needs_revision`。
- 修改病例：P001、P002、P003、P004、P005、P006、P007、P008、P009、P010、P011、P012、P013、P014、P015、P016、P017、P018、P019、P020、P021、P022、P023、P024、P025、P026、P027、P028、P029、P030、P031、P032、P033、P034、P035、P036、P037、P038、P039、P040、P041、P042。

## 明确的source覆盖

| 决议 | 病例 | 字段 | 原派生值 | 权威来源 | 修改后事实 | 原因 |
|---|---|---|---|---|---|---|
| HISTORY-SOURCE-001 | P029 | medication | 阿司匹林、华法林、利伐沙班、坦索罗辛 | Hematuria_AI_Training_Final_v1.4_RELEASE_P013-P042精细病史扩写版_医学审核修订版.xlsx / 42例临床问诊病例!L32 and P013_P042扩写病例!F18 | 坦索罗辛、阿司匹林；阿司匹林适应证和末次服药时间需核实。否认华法林、利伐沙班等抗凝药。 | The revised original workbook explicitly denies warfarin and rivaroxaban; the derived case projection was stale. |
| HISTORY-SOURCE-002 | P026 | medication | 无长期用药 | sourceFacts.medication copied from the revised original workbook | 口服降糖药，具体品种和依从性需核实；反复使用过抗菌药，药名与疗程不详。否认抗凝和抗血小板药。 | The source explicitly records oral diabetes medication; the derived medication list omitted the drug class. |
| HISTORY-SOURCE-003 | P027 | medication | 无长期用药 | sourceFacts.medication copied from the revised original workbook | 别嘌醇服用不规律；否认抗凝和抗血小板药。 | The source explicitly records irregular allopurinol use; the derived medication list omitted it. |
| HISTORY-SOURCE-004 | P039 | medication | 无长期用药 | sourceFacts.medication copied from the revised original workbook | 长期自行服用布洛芬/复方止痛药，剂量和累计时间需详细核实；否认抗凝和抗血小板药。 | The source explicitly records long-term self-medication with ibuprofen or combination painkillers; the derived medication list incorrectly said no long-term medication. |

## 批次提交

- `e0b4624` — 统一42例患者主诉表达，并区分肉眼、镜下及特殊尿色。
- `108d280` — P001–P007。
- `952e81e` — P008–P012。
- `0c772c0` — P013–P018。
- `53078d3` — P019–P024。
- `3fa830e` — P025–P030。
- `3e35f1f` — P031–P036。
- `5b2fb69` — P037–P042。
- `3a7b227` — P002手术史source/source冲突的双语槽隔离与治理回归。

## 治理边界

- 没有用最终诊断反推症状；没有伪造专家签名或 `expert_approved`。
- 没有解除 `needs_revision`，没有修改360分医学规则。
- source/source、专家/专家或语义不确定项目只隔离并提出人工问题。
- P002手术史冲突同时在结构化路由和双语 `surgery_history` 槽隔离，不向Patient Agent暴露确定性答案。

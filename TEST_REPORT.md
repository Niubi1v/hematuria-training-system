# TEST_REPORT

测试日期：2026-07-06

## 本次升级

目标：将当前血尿训练系统升级为 **7-Agent 多智能体临床能力训练工作台**，并接入《血尿病例库_V2_英文双语版.xlsx》。

## 数据生成

命令：

```bash
node_modules/.bin/tsx.cmd scripts/convert-bilingual-7agent.ts work/source/v2_bilingual.xlsx data
```

结果：

- `data/agents.json`：7 个 Agent
- `data/cases_en.json`：12 个英文病例
- `data/cases_zh.json`：12 个中英文对照病例摘要
- `data/case_cards_en.json`：360 条英文病例卡长表字段
- `data/i18n/zh.json`、`data/i18n/en.json`：中英文 UI 文案
- `data/diagnostic_rubric.json`、`data/perioperative_rubric.json`、`data/debriefing_rubric.json`：分阶段评分结构

病例 ID 验证：

```text
cases_en_count=12
P001,P002,P003,P004,P005,P006,P007,P008,P009,P010,P011,P012
bad_ids=
```

旧病例清理验证：

```text
NO_LEGACY_CASE_TEXT
```

## 构建测试

命令：

```bash
npm run build
```

结果：通过。

Next.js 已成功生成静态页面，包括：

- `/cases/P001/`
- `/cases/P002/`
- `/cases/P003/`
- 其余 P004-P012 病例页

## Patient Agent 测试

命令：

```bash
node_modules/.bin/tsx.cmd scripts/test-patient-agent.ts
```

结果：

```text
Patient Agent tests passed.
```

覆盖行为：

- 问“尿是鲜红色吗”只回答颜色，不返回 CT、占位、诊断。
- 问“有血块吗”只回答血块，不出现“未主动诉”“需追问”。
- 问“小便疼吗”只回答尿痛/烧灼感，不返回完整病史。
- 问 CT 结果时 Patient Agent 不直接返回检查报告。

## 前端功能验收

已实现：

1. 左侧显示 1-7 个 Agent 阶段。
2. 训练流程按 1→7 顺序解锁，未提交前不能进入后续阶段。
3. 右上角支持中文 / English 切换，并保存到 `localStorage`。
4. 英文模式下 P001 显示英文主诉和英文阶段名。
5. 中文模式下 P001 显示中文主诉和中文阶段名。
6. 第 1 阶段提交前不显示具体漏项、评分点、标准答案或诊断提示。
7. Investigation Agent 中未开 CTU 不显示 CTU 结果；开立 CTU 后才返回对应报告。
8. MDT 阶段支持多选科室；会诊目的为空时不能提交。
9. 第 6 阶段已独立为围术期管理。
10. 第 7 阶段显示最终评分、能力画像、训练时间线、学生记录和标准路径摘要。

## 部署状态

项目仍为 Next.js 静态导出，可继续部署到 GitHub Pages。

线上链接：

```text
https://niubi1v.github.io/hematuria-training-system/
```

本地提交后推送：

```bash
git add .
git commit -m "Upgrade to bilingual 7-agent clinical training workspace"
git push origin main
```

GitHub Actions 完成后线上版本自动更新。

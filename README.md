# 血尿 7-Agent 临床思维训练系统

本项目是一个本地可运行、可静态部署到 GitHub Pages 的医学教育网页应用，用于训练临床医学本科生围绕“血尿”完成完整临床思维流程。

当前版本已升级为导师提出的 **7-Agent 多智能体临床能力训练工作台**，病例库版本为 **V2 bilingual / P001-P012 only**。

线上访问：

```text
https://niubi1v.github.io/hematuria-training-system/
```

## 7 个智能体

1. Standardized Patient Agent / 标准化患者智能体：病史采集
2. Investigation Agent / 检查决策智能体：查体、检验、影像、病理结果返回
3. Diagnostic Reasoning Agent / 诊断推理智能体：诊断与鉴别诊断
4. MDT Coordinator Agent / MDT协调智能体：会诊与多学科协作
5. Clinical Decision Support Agent / 临床决策支持智能体：治疗决策
6. Perioperative Management Agent / 围术期管理智能体：术前优化、ERAS、并发症预防
7. Assessment & Debriefing Agent / 评估复盘智能体：评分、能力画像、复盘建议

学生进入病例后按左侧 1→7 顺序推进。未提交前不能查看后续阶段，也不会显示病例特异漏项、得分点、诊断提示或标准答案。

## 数据来源

当前双语数据来源：

```text
work/source/v2_bilingual.xlsx
```

对应原始文件：

```text
血尿病例库_V2_英文双语版.xlsx
```

使用的工作表：

- `7_Agent_UI_Bilingual`
- `EN_Case_Master`
- `Case_Master_Bilingual`
- `EN_Case_Cards_Long`
- `UI_Workflow_Spec`

当前仍只允许使用 V2 病例：

```text
P001-P012
```

不得出现 HM-SUP、旧补充病例、旧演示病例或教学合成病例。

## 生成的数据文件

新增或更新：

```text
data/agents.json
data/i18n/zh.json
data/i18n/en.json
data/cases_zh.json
data/cases_en.json
data/case_cards_en.json
data/diagnostic_rubric.json
data/perioperative_rubric.json
data/debriefing_rubric.json
data/ui_workflow_spec.json
```

继续沿用当前 V2-only 中文核心训练数据：

```text
data/cases.json
data/question_answers.json
data/order_results.json
data/mdt_triggers.json
data/order_catalog_labs.json
data/order_catalog_imaging.json
data/order_catalog_procedures.json
data/order_catalog_perioperative.json
data/consult_catalog.json
```

## 本地运行

```bash
npm install
npm run convert:excel
npm run dev
```

打开：

```text
http://127.0.0.1:3000
```

构建静态站点：

```bash
npm run build
```

## 更新 Excel

1. 将新版 Excel 放到：

```text
work/source/v2_bilingual.xlsx
```

2. 运行：

```bash
npm run convert:excel
```

3. 检查 `data/bilingual-import-report.json`，确认英文病例数为 12。

## GitHub Pages 部署

项目是 Next.js 静态导出，已配置：

```text
next.config.mjs
.github/workflows/deploy.yml
```

推送到 GitHub 后，在仓库：

```text
Settings → Pages → Build and deployment → Source: GitHub Actions
```

本地推送：

```bash
git add .
git commit -m "Upgrade to bilingual 7-agent clinical training workspace"
git push origin main
```

GitHub Actions 完成后访问：

```text
https://niubi1v.github.io/hematuria-training-system/
```

## DeepSeek / AI Patient Agent

前端默认调用：

```text
https://hematuria-training-system.vercel.app/api/patient-reply/
```

如果手机网络或上游模型请求卡住，前端 12 秒后会自动切回本地规则 Patient Agent，避免一直显示“生成中”。

## 教学边界

本系统仅用于医学本科生临床思维训练。所有病例均视为教学病例，不作为真实患者诊疗建议。

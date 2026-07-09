# 血尿 7-Agent 多智能体临床思维训练系统

这是一个用于临床医学本科生血尿主题训练的网页应用。当前版本保留 7-Agent 训练流程，并接入 AI-ready 补充病例库。

前端线上地址：

```text
https://niubi1v.github.io/hematuria-training-system/
```

默认病例库版本：

```text
v2_plus_30 = P001-P012 + HX-ADD-001-HX-ADD-030，共42例
```

## 7 个 Agent

1. Standardized Patient Agent / 标准化患者智能体：病史采集
2. Investigation Agent / 检查决策智能体：查体、检验、影像、病理结果返回
3. Diagnostic Reasoning Agent / 诊断推理智能体：诊断与鉴别诊断
4. MDT Coordinator Agent / MDT 协调智能体：会诊与多学科协作
5. Clinical Decision Support Agent / 临床决策支持智能体：治疗决策
6. Perioperative Management Agent / 围术期管理智能体：术前优化、ERAS、并发症预防
7. Assessment & Debriefing Agent / 评估复盘智能体：评分、能力画像、复盘建议

学生端按 1 到 7 顺序推进。提交前不显示病例特异漏项、标准答案、得分点、诊断提示或 MDT 触发规则。

## 病例数据

当前导入源：

```text
work/source/supplement_30_ai.xlsx
```

对应原始文件：

```text
血尿补充30病例_按V2导师模板完善_AI接入版.xlsx
```

使用的工作表：

- `补充30_导师模板总表`
- `总表_42病例`
- `病例卡_补充30长表`
- `问诊槽位答案_补充30`
- `开单返回结果_补充30`
- `MDT触发_补充30`
- `AI接入与7Agent方案`

生成数据文件：

```text
data/cases.json
data/cases_42.json
data/cases_v2.json
data/case_cards.json
data/case_cards_42.json
data/question_answers.json
data/question_answers_42.json
data/interview_answers.json
data/interview_answers_42.json
data/order_results.json
data/order_results_42.json
data/mdt_triggers.json
data/mdt_triggers_42.json
data/case_set_config.json
data/supplement-30-import-report.json
```

## 切换病例库

默认使用 42 例：

```bash
CASE_SET=v2_plus_30
NEXT_PUBLIC_CASE_SET=v2_plus_30
```

只使用 V2 12 例：

```bash
CASE_SET=v2_only
NEXT_PUBLIC_CASE_SET=v2_only
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

## AI Patient Agent 后端

GitHub Pages 前端不能保存 API Key。AI 增强问诊必须通过 Vercel/Netlify/Cloudflare Workers 等后端 API 调用：

```text
POST /api/patient-reply
```

当前前端默认请求：

```text
https://hematuria-training-system.vercel.app/api/patient-reply
```

后端安全边界：

- 只给 LLM 当前问题对应的 `currentAllowedAnswer`
- 不传 `teacherOnlyData`
- 不传完整现病史、影像、病理、诊断、治疗、评分点
- LLM 输出经过 `responseFilter`，失败则回退规则模式
- API 不可用时前端自动回退本地规则 Patient Agent

DeepSeek 示例环境变量：

```text
LLM_PROVIDER=deepseek
LLM_API_KEY=your_deepseek_api_key
LLM_API_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-v4-flash
LLM_ENDPOINT_TYPE=chat_completions
LLM_TEMPERATURE=0.2
LLM_MAX_TOKENS=160
LLM_ENABLE_AI_PATIENT=true
PATIENT_AGENT_ALLOWED_ORIGIN=https://niubi1v.github.io
```

不要把真实 API Key 写入 `.env.example`、代码或 GitHub。

## GitHub Pages 部署

项目已配置：

```text
next.config.mjs
.github/workflows/deploy.yml
```

GitHub 仓库设置：

```text
Settings -> Pages -> Build and deployment -> Source: GitHub Actions
```

推送部署：

```bash
git add .
git commit -m "Add AI-ready supplemental 30 case set"
git push origin main
```

GitHub Actions 完成后访问：

```text
https://niubi1v.github.io/hematuria-training-system/
```

## 测试

```bash
npm run test:patient
npm run test:llm
npm run build
```

关键验收：

- 默认病例数为 42
- HX-ADD-001 至 HX-ADD-030 均存在
- Patient Agent 问一个问题只回答当前 slot
- 不输出“根据原始病史、未主动诉、需追问、评分点”
- 不由 Patient Agent 直接返回 CT、膀胱镜、病理、诊断或治疗
- Investigation Agent 仍保持“开了什么才返回什么”

## 教学边界

本系统仅用于医学本科生临床思维训练。所有病例均视为教学病例，不作为真实患者诊疗建议。

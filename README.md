# 血尿主题多智能体临床思维训练系统

这是一个本地可运行的医学教学网页，用于训练临床医学本科生围绕“血尿”完成完整临床思维流程。系统已升级为多智能体模式：Patient Agent、Exam Agent、Order Agent、MDT Agent、Evaluator Agent 分阶段模拟真实临床路径。

本项目仅用于医学教学训练，不作为真实诊疗建议。默认使用本地 Excel 转换出的 JSON 数据，不上传病例信息。

## 项目结构

```text
app/                         Next.js 页面路由
app/rct/                     RCT研究记录页面
src/components/              学生端、教师端、RCT前端组件
src/lib/patientEngine.ts     标准化模拟患者问答引擎
src/lib/multiAgents.ts       查体、开单返回、MDT、360分评价逻辑
src/lib/fullProcessScoring.ts 阶段提交后的即时反馈逻辑
data/cases.json              从 V2-only Excel 清洗后的 12 个全流程病例
data/interview_slots.json    血尿问诊槽位字典
data/question_slots.json     问诊槽位字典镜像，供教学/审核使用
data/interview_answers.json  逐项标准化患者回答
data/question_answers.json   Patient Agent 问诊答案备份
data/physical_exam_items.json    体格检查项目库
data/physical_exam_results.json  病例级查体返回结果
data/order_results.json      开单后返回的病例级检查结果
data/order_catalog_labs.json 规范检验医嘱目录
data/order_catalog_imaging.json 规范检查医嘱目录
data/order_catalog_procedures.json 规范病理/操作医嘱目录
data/order_catalog_perioperative.json 规范围术期评估医嘱目录
data/consult_catalog.json    按科室体系分类的会诊目录
data/ui_release_rules.json   学生端信息释放规则
data/mdt_triggers.json       病例级MDT触发规则
data/evaluator_rubric.json   360分评分Rubric
data/osce_rubric.json        OSCE考核评分表
data/rag_rules.json          RAG资料包整理后的路径护栏
data/rct_protocol.json       30人RCT研究方案
scripts/convert-tutor-template-cases.ts  V2-only 病例库转 JSON
scripts/convert-frontend-fixes.ts        开单/会诊目录转 JSON
work/source/v2_only_cases.xlsx  血尿病例库_仅V2病例_替换旧病例版
work/source/frontend_order_consult_fix.xlsx  前端开单会诊修正资料
rag_sources/                 RAG资料包解压后的本地资料
```

## 运行

```bash
npm install
npm run convert:excel
npm run dev
```

打开：

```text
http://127.0.0.1:3000
```

当前本机开发服务已可使用：`http://127.0.0.1:3000`。

## 新版 Excel 与 RAG 导入

当前数据来源：

```text
work/source/v2_only_cases.xlsx
work/source/frontend_order_consult_fix.xlsx
rag_sources/rag_knowledge_table.xlsx
rag_sources/rag_guideline_summary.txt
rag_sources/rag_codex_prompt.txt
```

重新生成数据：

```bash
npm run convert:excel
```

脚本会生成病例、病例卡长表、问诊槽位、开单结果、MDT规则、信息释放规则和360分Rubric。病例唯一主键统一为 `case_id`。

本次病例库版本：`V2-only`。当前学生端和教师端只包含 `P001` 到 `P012` 共 12 个病例。

## 清理旧缓存

项目已内置缓存版本号 `V2-only`。浏览器首次进入新版训练页时，会自动清理此前训练记录缓存。

教师端也提供“清空本地训练缓存”按钮：

```text
http://127.0.0.1:3000/teacher/
```

如需手动处理，可在浏览器开发者工具中清除本站点 `localStorage`。

## 防泄题规则

病史采集提交前，学生端只显示脱敏后的普通人主诉、当前任务、已问问题数和通用记录。自由训练模式可显示“现病史/伴随症状/既往史/用药史/个人史/系统回顾”六类通用框架覆盖度；OSCE模式不显示覆盖度。不会显示具体漏问项、危险漏项、关键槽位、标准答案或评分关键词。

病例页服务端只接收白名单学生可见数据，完整病例数据在浏览器端用于模拟训练。提交阶段前，反馈容器为空；提交后才显示漏项、建议补充和标准答案。

## 学生端流程

每个病例按 8 个阶段推进：

1. 接诊与问诊
2. 查体
3. 开单检查
4. 诊断与鉴别
5. 会诊/MDT
6. 治疗决策
7. 随访与教育
8. 复盘反馈

学生提交某阶段后，系统才显示该阶段教师端标准答案、命中点、漏项和高危提示。训练记录保存在浏览器 `localStorage`。

## 训练模式

- 自由训练：逐阶段提交，提交后即时显示反馈和标准路径，适合课堂练习。
- OSCE考核：通过 `/random?mode=osce` 或 `/cases/<case_id>?mode=osce` 进入；显示倒计时，不显示覆盖度、套餐提示或中途反馈，终末复盘统一查看。
- 教师演示：教师端可查看病例卡、隐藏答案、开单结果库、MDT触发和学生记录。
- RCT研究：`/rct/` 记录训练组/对照组教学研究数据。

## 多智能体模块

- Patient Agent：按 `case_id + slot_id` 返回患者标准回答，未问不主动透露关键线索。
- Exam Agent：按 `case_id + exam_id` 只返回学生明确要求检查的体征。
- Order Agent：学生开立具体医嘱后，才返回对应病例的模拟检查结果。
- MDT Agent：根据病例级触发规则和学生选择的科室生成结构化专家意见，包括专家判断、需补资料、处理建议、风险提醒和追问。
- Evaluator Agent：按 360 分Rubric生成总分、分项证据、漏项和红旗错误提示。

## 开单与会诊目录

开单页面使用 `血尿项目_前端开单会诊修正资料.xlsx` 生成的规范目录：

- 一级 Tab：检验、检查、病理/操作、围术期评估
- 检验二级类别：尿液基础、尿液感染、尿液肿瘤、尿液蛋白/肾小球线索、血液基础、炎症感染、凝血/输血、肾内免疫、结石代谢、大便/全身鉴别
- 检查二级类别：超声、X线、CT、MRI、内镜、核医学、功能检查

会诊页面按外科、内科、辅助/平台、急诊/危重四类展示，支持多选科室，并要求填写会诊目的和要解决的问题。

## 教师端

访问：

```text
http://127.0.0.1:3000/teacher/
```

教师端支持本地预览 Excel、查看隐藏答案字段、标准化问诊槽位、开单返回结果库、病例级MDT触发、Agent策略、RAG护栏、360分Rubric、人工修正分数和导出学生训练记录。

## RCT研究模块

访问：

```text
http://127.0.0.1:3000/rct/
```

用于记录30人教学研究数据，支持训练组/对照组、训练前后OSCE、自信度、满意度和备注，数据保存在本机浏览器，可导出 JSON/CSV。

## GitHub Pages 在线部署

本项目是 Next.js 静态导出项目，已配置 GitHub Pages 工作流：`.github/workflows/deploy.yml`。推送到 GitHub 后，在仓库 `Settings` → `Pages` 中选择 `GitHub Actions`。

本地提交并推送示例：

```bash
git init
git add .
git commit -m "Switch hematuria case library to V2-only"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<你的仓库名>.git
git push -u origin main
```

GitHub Actions 会自动执行：

```bash
npm install
npm run convert:excel
npm run build
```

线上地址通常为：

```text
https://<你的用户名>.github.io/<你的仓库名>/
```

当前本地构建已通过；线上链接需要推送到你的 GitHub 仓库后由 GitHub Pages 自动生成。

注意：静态前端项目适合教学展示和导师测试，JSON 中仍包含教师端标准答案，不适合作为严格防作弊考试系统。真实考核需要把教师端答案和评分逻辑放到后端。

## 隐私与边界

- 所有病例均视为教学病例。
- 不要放入真实姓名、住院号、门诊号、电话、身份证号、地址或精确检查日期。
- Excel 上传预览只在浏览器本地解析，不会自动联网传输。

## UI 预览注意事项

请不要直接双击 `out/index.html` 预览静态导出文件。Next.js 静态站点需要通过 HTTP 服务读取 `/_next/static/...` 资源，直接打开 HTML 时可能只剩文字、没有完整 UI 样式。

推荐两种打开方式：

```bash
npm run dev
```

然后访问：

```text
http://127.0.0.1:3000
```

或者预览已打包的静态站点：

```bash
npm run build
npm run preview
```

然后访问：

```text
http://127.0.0.1:4173
```

Windows 下也可以直接双击 `start-local.bat` 启动开发预览，或双击 `preview-static.bat` 预览静态打包结果。
## 通用 LLM Provider：AI 增强 Patient Agent

本项目已支持“通用第三方大模型 API”增强 Patient Agent，但不会把 API Key 放进前端，也不会把完整病例发送给模型。

### 工作方式

1. 前端学生提问。
2. 后端 `/api/patient-reply` 根据 `caseId + studentQuestion` 调用本地规则匹配 slot。
3. 后端只取当前 slot 对应的安全 `patientAnswer`。
4. 大模型只负责把该答案改写成简短、患者口吻的 1-2 条分点。
5. `responseFilter` 拦截“根据原始病史、需追问、CT提示、癌、诊断、治疗、评分”等泄露词。
6. AI 不可用、超时或输出不合格时，自动回退规则模式。

### 后端环境变量

复制 `.env.example` 为 `.env.local`，只在本地或 Vercel 环境变量中填写真实 Key，不要提交到 GitHub。

```bash
LLM_PROVIDER=custom
LLM_API_KEY=你的第三方平台API_KEY
LLM_API_BASE_URL=https://第三方平台的API地址/v1
LLM_MODEL=你购买的平台模型名称
LLM_ENDPOINT_TYPE=chat_completions
LLM_TEMPERATURE=0.2
LLM_MAX_TOKENS=120
LLM_REQUEST_TIMEOUT_MS=15000
LLM_ENABLE_AI_PATIENT=true
PATIENT_AGENT_ALLOWED_ORIGIN=https://niubi1v.github.io
```

`LLM_API_BASE_URL` 建议填写平台的 OpenAI-compatible base URL，例如 `https://xxx.example.com/v1`。系统会请求 `${LLM_API_BASE_URL}/chat/completions`。如果平台返回格式不同，请只改 `src/server/llmClient.ts` 的 adapter。

### 本地运行后端 API

```bash
npm run dev:api
```

默认地址：

```text
http://127.0.0.1:8787/api/patient-reply
```

前端页面的“Patient Agent 后端 API 地址”可填写这个地址进行本地测试。

### Vercel 部署后端 API

1. 将本仓库导入 Vercel。
2. 在 Vercel Project Settings -> Environment Variables 中填写：
   `LLM_PROVIDER`、`LLM_API_KEY`、`LLM_API_BASE_URL`、`LLM_MODEL`、`LLM_ENDPOINT_TYPE`、`LLM_ENABLE_AI_PATIENT`。
3. 部署后 API 地址通常为：

```text
https://你的-vercel-项目.vercel.app/api/patient-reply
```

4. 在 GitHub Pages 前端的病例训练页，将“Patient Agent 后端 API 地址”填为上面的 Vercel 地址；也可以在 GitHub Actions 构建前设置：

```bash
NEXT_PUBLIC_PATIENT_AGENT_API_URL=https://你的-vercel-项目.vercel.app/api/patient-reply
```

### 回复模式

病例问诊页提供 3 种模式：

- 规则模式：完全离线，不调用后端。
- AI增强模式：默认模式，调用后端，失败自动回退规则模式。
- 调试模式：教师可查看 `matchedSlot`、`rawPatientAnswer`、过滤命中和缓存 Key；学生端训练不应使用该模式。

### 安全边界

- 不要把真实 API Key 写入源码、README 或前端环境变量。
- `.gitignore` 已包含 `.env`、`.env.local`、`.env.*.local`。
- 前端构建产物中不包含 `LLM_API_KEY`。
- 后端禁止向模型发送完整病例、诊断、检查、影像、病理、治疗方案、教师端评分点。

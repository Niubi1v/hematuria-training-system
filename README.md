# 血尿多智能体临床思维训练平台

面向临床医学本科生的血尿主题 7-Agent 教学系统。项目保留 Next.js、React、TypeScript、本地 JSON、Vercel AI API 和 GitHub Pages 静态部署架构。

线上地址：<https://niubi1v.github.io/hematuria-training-system/>

## 当前版本

- 产品版本：`2.1.0`
- 病例库：`v2_plus_30`
- 病例数：42例，包括 `P001-P012` 和 `HX-ADD-001-HX-ADD-030`
- 评分：统一360分制
- 医学审核状态：程序校验已通过，病例仍标记为 `needs_revision`，需教师/临床专家终审

## 7-Agent 流程

1. Patient Agent：标准化患者问诊，只回答学生实际问到的槽位。
2. Examination/Order Agent：查体、检验、影像、内镜和病理；先记录已开具，再返回相应报告。
3. Diagnostic Reasoning Agent：评价定位、最可能诊断、至少3项鉴别和确认计划。
4. MDT Agent：要求科室、触发原因、待解决问题和已掌握证据齐全。
5. Evidence/Treatment Agent：评价急诊稳定、病因治疗和确定性治疗。
6. Perioperative Agent：评价抗栓、感染、麻醉、营养、肾功能、VTE和ERAS。
7. Evaluator Agent：根据完整操作日志生成360分报告、严重错误和改进建议。

OSCE 模式不显示中途评分、病例特异提示或标准答案，反馈只在终末复盘显示。

## 360分评分

| 维度 | 分值 |
| --- | ---: |
| 病史采集与血尿定位 | 50 |
| 危险因素和安全网 | 40 |
| 查体与急症识别 | 35 |
| 诊断与鉴别诊断 | 45 |
| 检验、影像、内镜及病理决策 | 55 |
| MDT与会诊 | 45 |
| 治疗及围术期管理 | 50 |
| 随访、教育和表达效率 | 40 |
| 合计 | 360 |

## 数据与校验

原始 Excel 位于 `work/source/`。完整转换命令：

```bash
npm run convert:excel
```

转换结束后会自动运行 `scripts/normalize-case-library.ts`，生成或更新：

```text
data/cases.json
data/cases_42.json
data/cases_en.json
data/cases_student.json
data/case_validation_report.json
data/evaluator_rubric.json
data/osce_rubric.json
data/debriefing_rubric.json
data/case_history_qc_report.json
```

`scripts/structure-patient-history.ts` 会为42例生成 `structuredHistory`，将吸烟、饮酒、职业暴露、慢性病、手术/输血/过敏史、泌尿史和长期用药拆成可独立回答的事实。原始病例未明确记载而为教学模拟补全的字段统一标记 `author_added_for_simulation` 与 `teacherReviewRequired: true`，详见 `CASE_DATA_QC_REPORT.md`。

病例 schema 及运行时校验位于 `src/lib/caseSchema.ts`。开发环境会报告 schema 错误；生产界面不渲染教师答案和病例特异漏项。

## 本地运行

```bash
npm install
npm run convert:excel
npm run dev
```

打开 <http://127.0.0.1:3000/>。

质量检查：

```bash
npm run test
npm run lint
npm run typecheck
npm run build
```

## AI Patient Agent

GitHub Pages 不保存 API Key。前端通过 Vercel API 请求 AI；API 不可用、超时或输出越界时自动切换到规则库，并在界面显示实际“回答来源”。只有技术失败时才提供同一问题的重新生成，不允许用刷新获得额外病史。

Vercel 环境变量示例：

```text
LLM_PROVIDER=deepseek
LLM_API_KEY=your_key
LLM_API_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-v4-flash
LLM_ENDPOINT_TYPE=chat_completions
LLM_ENABLE_AI_AGENTS=true
LLM_ENABLE_AI_PATIENT=true
AGENT_API_ALLOWED_ORIGIN=https://niubi1v.github.io
```

不要把真实 API Key 写入代码、`.env.example` 或 GitHub。

Patient Agent API 返回：`replyText`、`matchedSlotIds`、`matchedFacts`、`answerSource`、`confidence`、`safetyFlags` 和 `fallbackReason`。DeepSeek 只负责把当前已允许的事实润色成患者口吻，结构化事实和越界过滤仍由服务端控制；AI输出不合格时使用同一事实的确定性规则回答。

## 语音设置

默认使用浏览器 Web Speech API，不产生额外付费调用。支持中文/英文系统音色筛选、音色选择、试听、语速 `0.80-1.15`、音调 `0.85-1.10`、暂停、继续、停止和重播；偏好保存在本机 `localStorage`。接口预留 `browser | azure | disabled` 三种 provider，当前仅启用 `browser` 与 `disabled`。

如后续接入 Azure Speech，API Key 和区域必须放在服务端环境变量中，由服务端签发短时令牌；不得把长期密钥写入 GitHub Pages、`NEXT_PUBLIC_*` 或浏览器存储。接入前还需完成费用、隐私和跨境数据评估。

## GitHub Pages 部署

仓库已配置 `.github/workflows/deploy.yml`，自动设置 `/hematuria-training-system/` basePath、构建52个静态页面并部署。

```bash
git add .
git commit -m "Product audit and 360 scoring hardening"
git push origin main
```

GitHub 仓库设置：`Settings -> Pages -> Source: GitHub Actions`。

## RCT模块边界

RCT 页面定位为“离线原型数据采集”，支持字段校验、重复ID检查、修改/删除确认、JSON/CSV导入导出和数据字典。不得录入姓名、学号、住院号、手机号或身份证号。

`localStorage` 可能因清理缓存而丢失，不是正式研究数据库。正式研究还需要服务端数据库、身份权限、知情同意版本管理、不可篡改审计日志、集中备份、数据加密和伦理审批流程。样本量必须根据主要终点、效应量、α、检验效能和脱落率正式估算。

## 静态部署限制

- 教师模式是演示功能，没有真实身份验证或权限隔离。
- GitHub Pages 的静态资源可被技术用户检查。学生界面不会提前渲染答案，但“浏览器源码中绝对不可访问教师数据”只有改为服务端按权限释放后才能实现。
- 训练记录和RCT原型数据只保存在当前浏览器，不能跨设备同步，也没有研究级审计能力。
- AI 是否真实可用取决于 Vercel 环境变量、DeepSeek账户余额、网络和API状态；失败时系统明确显示规则库/降级模式。

下一阶段建议增加独立后端、PostgreSQL、教师/学生身份认证、服务端病例答案与检查报告释放、研究数据审计和集中备份。

## 本轮病例事实复核

工程层已完成42例结构化校验和17类问题回归。病例原表大量生活史字段未明确记载，因此自动补全报告中仍有需教师审核的事实；正式OSCE前应由导师逐例确认，尤其是吸烟量、饮酒量、职业、女性月经/妊娠和既往阴性史。程序不会把这些补全项标记为原始资料。

## 医学边界

本系统仅用于医学教学和临床思维训练，不用于真实患者诊疗。病例参考 AUA/SUFU Microhematuria、EAU Urological Infections/Urolithiasis/NMIBC 和 KDIGO IgA nephropathy 等指南路径，仍需本地教师与临床专家审核后用于正式考核。

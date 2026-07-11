# 血尿7阶段临床思维训练系统

Next.js + React + TypeScript 教学平台，包含42个血尿病例、七阶段训练、DeepSeek增强标准化患者、精确医嘱结果释放、360分结构化事件评分和自动语音朗读。

公开练习站：<https://niubi1v.github.io/hematuria-training-system/>

## 当前边界

- 应用版本：`2.4.0`
- 病例库：`P001-P012` + `HX-ADD-001-HX-ADD-030`，共42例
- 评分：唯一口径 `360-event-v1`
- GitHub Pages 只用于练习，不可用于正式 OSCE、教师阅卷或 RCT 数据采集
- 42例目前均为 `needs_revision`；正式模式只接受 `reviewed` / `approved`
- 本系统只用于医学教学，不用于真实诊疗

## 七阶段

1. 标准化患者：按问题对应的语义槽位回答，不释放完整病史。
2. 检查决策：查体、检验、影像、内镜和病理；开了什么才返回什么。
3. 诊断推理：最可能诊断、依据、至少3项鉴别及支持/反对点。
4. MDT：科室、触发原因、待解决问题和已掌握证据均为必填。
5. 治疗决策：即时稳定、病因治疗和确定性治疗。
6. 围术期管理：抗栓、感染、麻醉、心肺、肾功能、VTE和ERAS。
7. 评估复盘：依据结构化事件生成360分报告，可立即重练并比较分差。

360分由八个维度组成：`50 + 40 + 35 + 45 + 55 + 45 + 50 + 40 = 360`。数值评分只读取 `slot_answered`、`physical_exam_performed`、`order_placed`、`result_returned`、`diagnosis_supported`、`consult_requested`、`treatment_action`、`safety_net_provided` 等结构化事件；病史小结不能反向证明问过某个问题，LLM不能决定数值总分。

## 本地运行

推荐 Node.js 20 和 pnpm：

```bash
pnpm install --frozen-lockfile
pnpm run convert:excel
pnpm run dev
```

打开 <http://127.0.0.1:3000/>。

完整质量门禁：

```bash
pnpm run test:idempotency
pnpm run test:product
pnpm run test:clinical
pnpm run test:bilingual
pnpm run test
pnpm run typecheck
pnpm run lint
pnpm exec playwright install chromium
pnpm run test:e2e
NEXT_PUBLIC_BASE_PATH=/hematuria-training-system pnpm run build
pnpm run test:bundle
```

## 数据生成

`pnpm run convert:excel` 只读取 `work/source/` 中的不可变源文件。转换末尾生成：

- `data/patient_slots_bilingual.json`：42例稳定中英文语义槽位
- `data/order_results_structured.json`：`caseId + orderId -> resultId` 精确结果
- `data/order_result_map.json`：显式映射索引
- `data/cases_public.json`：学生静态页面允许使用的最小病例壳
- `data/event_rubrics.json`：仅供服务端360分评分
- `data/guideline_registry.json`：医学依据审核字段与状态
- `data/clinical_contradiction_report.json`：病例事实冲突检查

完整转换连续运行两次的64个受控JSON校验和必须一致。`author_added_for_simulation` 事实必须由医学教师逐项确认。

## 服务端 API

Vercel 提供三个服务端入口：

- `/api/session/init`：只返回 `sessionId`、公开开场白和连接状态，不返回患者档案
- `/api/agent-chat`：Patient Agent；DeepSeek失败时使用同一事实的服务端规则答案
- `/api/training-action`：查体、开单、MDT、阶段反馈和结构化事件评分
- `/api/tts`：Azure Speech；失败时前端降级到浏览器语音或文字

Patient Agent 的 `language` 会贯穿规则匹配、模型提示、输出语言校验、过滤和TTS。复合问题会逐项返回命中的事实。检查/诊断/治疗泄露边界同时覆盖中文和英文。

## 环境变量

在 Vercel Project Settings -> Environment Variables 配置，真实密钥不得提交到 Git：

```text
LLM_PROVIDER=deepseek
LLM_API_KEY=your_secret_key
LLM_API_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-v4-flash
LLM_ENDPOINT_TYPE=chat_completions
LLM_ENABLE_AI_AGENTS=true
LLM_ENABLE_AI_PATIENT=true
LLM_REQUEST_TIMEOUT_MS=15000

AZURE_SPEECH_KEY=your_secret_key
AZURE_SPEECH_REGION=eastasia
TTS_ALLOWED_ORIGINS=https://niubi1v.github.io
TRAINING_API_ALLOWED_ORIGINS=https://niubi1v.github.io
```

GitHub Pages 构建使用的公开配置：

```text
NEXT_PUBLIC_DEPLOYMENT_TIER=practice
NEXT_PUBLIC_AGENT_API_URL=https://hematuria-training-system.vercel.app/api/agent-chat/
NEXT_PUBLIC_SESSION_INIT_API_URL=https://hematuria-training-system.vercel.app/api/session/init/
NEXT_PUBLIC_TRAINING_API_URL=https://hematuria-training-system.vercel.app/api/training-action
NEXT_PUBLIC_TTS_API_URL=https://hematuria-training-system.vercel.app/api/tts
```

自动音色映射：中文女声 `Xiaoxiao`、中文男声 `Yunxi`、英文女声 `Jenny`、英文男声 `Guy`。云语音失败后按在线浏览器音色、同语言本地音色、文字模式降级。手动覆盖按 `locale + gender + voiceURI` 保存，不跨语言或性别复用。

## 部署

`.github/workflows/deploy.yml` 使用 `pnpm install --frozen-lockfile`，依次执行转换幂等、schema、临床冲突、双语、行为测试、typecheck、lint、Playwright、构建和静态答案/密钥扫描，全部通过才部署 Pages。

```bash
git add <本次修改文件>
git commit -m "fix: harden bilingual training scoring and automatic TTS"
git push origin main
```

GitHub Pages 设置保持 `Settings -> Pages -> Source: GitHub Actions`。`trailingSlash` 与 `/hematuria-training-system/` basePath 已配置，动态病例刷新路径会生成实体 `index.html`。

## 正式考核与研究

公开站不打包教师答案；`/teacher` 和 `/rct` 只显示安全边界说明。正式 OSCE/RCT 下一阶段仍需要：

- 教师/学生身份验证与角色权限
- 服务端病例事实、阶段释放和评分API
- 后端数据库、不可变attempt、审计日志和集中备份
- 版本化知情同意、伪匿名participant ID、病例/评分版本
- 响应延迟、TTS成功率/降级原因、前后测和方案偏离记录

医学上仍需泌尿外科、肾内科、医学教育和双语教师审核病例事实、检查适应证、治疗路径、评分权重及英文患者表达。

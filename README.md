# 血尿7阶段临床思维训练系统

Next.js + React + TypeScript 教学平台，包含42个血尿病例、七阶段训练、DeepSeek增强标准化患者、精确医嘱结果释放、360分结构化事件评分和自动语音朗读。

公开练习站：<https://niubi1v.github.io/hematuria-training-system/>

生产 API、健康检查、Vercel/Azure 配置和真实冒烟测试见 [`docs/PRODUCTION_API.md`](docs/PRODUCTION_API.md)。当前已导入的医学内容预审工作簿见 `docs/medical-review/血尿病例_42例医学内容审校修订候选版_待人工终签.xlsx`。

## 当前边界

- 应用版本：`2.4.2`
- 病例库：`P001-P012` + `HX-ADD-001-HX-ADD-030`，共42例
- 评分：唯一口径 `360-event-v1`
- GitHub Pages 只用于练习，不可用于正式 OSCE、教师阅卷或 RCT 数据采集
- 42例目前均为 `needs_revision`；正式模式只接受 `reviewed` / `approved`
- 当前医学审核队列包含572条审核追踪项，不代表病例库全部结构化事实：153条来源追踪项待来源核对，419条模拟补充事实已完成AI内容预审并应用到练习版（179条修订、240条保留），仍待持证专家终签
- 生产状态尚未完成本轮复核：本地、`origin/main` 与 GitHub API 比对均指向 `5a3ad11`，但 Actions、Pages/live alias、API health 与10+5+5生产冒烟仍待联网验证；不得据历史记录宣称当前生产已通过
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

与 CI 对齐，使用 Node.js `22.14` 和 pnpm `11.7.0`：

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

`pnpm run convert:excel` 读取 `work/source/` 中的不可变病例源文件，并在末尾应用 `docs/medical-review/血尿病例_42例医学内容审校修订候选版_待人工终签.xlsx` 的练习版修订。转换末尾生成：

- `data/patient_slots_bilingual.json`：42例稳定中英文语义槽位
- `data/order_results_structured.json`：`caseId + orderId -> resultId` 精确结果
- `data/order_result_map.json`：显式映射索引
- `data/cases_public.json`：学生静态页面允许使用的最小病例壳
- `data/event_rubrics.json`：仅供服务端360分评分
- `data/guideline_registry.json`：医学依据审核字段与状态
- `data/clinical_contradiction_report.json`：病例事实冲突检查

完整转换连续运行两次的69个受控JSON校验和必须一致。`author_added_for_simulation` 事实虽已完成AI内容预审并用于公开练习，仍必须由持证专家逐项终签，不能据此解锁正式OSCE/RCT。

## 服务端 API

前端通过同一个 Vercel base URL 使用五个主要服务端入口：

- `/api/health`：返回API版本、部署SHA和布尔配置状态，不返回密钥或prompt
- `/api/session/init`：只返回 `sessionId`、公开开场白和连接状态，不返回患者档案
- `/api/agent-chat`：Patient Agent；DeepSeek失败时使用同一事实的服务端规则答案
- `/api/training-action`：签发并验证attempt状态，依据服务端确认的问诊、查体、医嘱、MDT和作答证据评分；客户端事件不直接计分
- `/api/tts`：Azure Speech；失败时前端降级到浏览器语音或文字

`/api/patient-reply` 是兼容路径，`/api/session/complete-profile` 是非前端主路径；二者不应被配置成新的独立公开来源。所有路径由 `src/lib/apiConfig.ts` 的同一 base URL 派生。

Patient Agent 的 `language` 会贯穿规则匹配、模型提示、输出语言校验、过滤和TTS。复合问题会逐项返回命中的事实。检查/诊断/治疗泄露边界同时覆盖中文和英文。

## 环境变量

在 Vercel Project Settings -> Environment Variables 配置，真实密钥不得提交到 Git：

```text
LLM_PROVIDER=deepseek
LLM_API_KEY=your_secret_key
LLM_API_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-v4-flash
LLM_ENDPOINT_TYPE=chat_completions
LLM_STREAMING_ENABLED=true
LLM_ENABLE_AI_AGENTS=true
LLM_ENABLE_AI_PATIENT=true
LLM_REQUEST_TIMEOUT_MS=15000
LLM_PROVIDER_CIRCUIT_STORE_MODE=upstash
LLM_PROVIDER_CIRCUIT_FAILURE_THRESHOLD=3
LLM_PROVIDER_CIRCUIT_OPEN_SECONDS=30
LLM_PROVIDER_CIRCUIT_PROBE_SECONDS=15
LLM_PROVIDER_CIRCUIT_FAILURE_TTL_SECONDS=600
LLM_PROVIDER_CIRCUIT_STORE_TIMEOUT_MS=1000

AGENT_API_ALLOWED_ORIGINS=https://niubi1v.github.io
AGENT_CHAT_RATE_LIMIT_PER_MINUTE=30
SESSION_INIT_RATE_LIMIT_PER_MINUTE=60
AGENT_API_RATE_LIMIT_WINDOW_MS=60000
AGENT_REQUEST_STORE_MODE=upstash
AGENT_SESSION_REQUEST_LIMIT=60
AGENT_ATTEMPT_REQUEST_LIMIT=80
AGENT_ATTEMPT_INPUT_CHAR_LIMIT=120000
AGENT_IP_HOURLY_REQUEST_LIMIT=120
AGENT_IP_DAILY_REQUEST_LIMIT=500
AGENT_PROJECT_DAILY_REQUEST_LIMIT=5000
AGENT_PROJECT_DAILY_TOKEN_BUDGET=2000000
AGENT_SESSION_PROBE_LIMIT=3
AGENT_SESSION_LEASE_SECONDS=30
# 可选：配置后，无 Origin 的服务间调用必须发送 x-agent-api-token
AGENT_API_SERVER_TOKEN=optional_server_only_secret

AZURE_SPEECH_KEY=your_secret_key
AZURE_SPEECH_REGION=eastasia
TTS_ALLOWED_ORIGINS=https://niubi1v.github.io
TTS_REQUEST_STORE_MODE=upstash
TTS_SESSION_DAILY_REQUEST_LIMIT=60
TTS_IP_HOURLY_REQUEST_LIMIT=120
TTS_IP_DAILY_REQUEST_LIMIT=500
TTS_PROJECT_DAILY_REQUEST_LIMIT=5000
TTS_PROJECT_DAILY_CHAR_BUDGET=1000000
TTS_TUPLE_LEASE_SECONDS=30
TRAINING_API_ALLOWED_ORIGINS=https://niubi1v.github.io
TRAINING_STATE_SECRET=至少32字节的随机服务端密钥
TRAINING_DEPLOYMENT_TIER=practice
```

以上Agent预算全部由服务端执行：session/attempt/IP/项目窗口在持久store中原子检查，超限返回429且不会调用LLM。项目token预算是按输入字符上界加服务端最大输出token做的保守成本预留，不是供应商账单金额。Preview/Production缺少持久store时继续fail-closed；不得退回只靠浏览器按钮节流。

Provider熔断同样使用服务端持久store：连续失败达到阈值后短时停止调用，冷却后仅允许一个恢复探测；探测租约会按调用timeout/重试上界自动延长，半开探测本身不重试。健康闭合状态只做一次准入读取，不额外写成功记录。日志只记录请求ID、错误分类、时长和短部署SHA，不记录Prompt、回答或密钥。

以上TTS预算同样只在服务端执行，并复用Upstash凭据；Redis只保存哈希键、计数和短租约，不保存音频、原始session、IP或朗读文本。缺少持久store时Preview/Production云TTS安全失败，前端仍按既有路径降级为浏览器语音。

GitHub Pages 构建使用的公开配置：

```text
NEXT_PUBLIC_DEPLOYMENT_TIER=practice
NEXT_PUBLIC_API_BASE_URL=https://hematuria-training-system.vercel.app
```

自动音色映射：中文女声 `Xiaoxiao`、中文男声 `Yunxi`、英文女声 `Jenny`、英文男声 `Guy`。云语音失败后按在线浏览器音色、同语言本地音色、文字模式降级。手动覆盖按 `locale + gender + voiceURI` 保存，不跨语言或性别复用。

`TRAINING_STATE_SECRET` 和 Azure 密钥只能配置在 Vercel 服务端，不得使用 `NEXT_PUBLIC_` 前缀。修改环境变量后需在 Vercel Deployments 中重新部署。可用 `openssl rand -base64 48` 等方式生成独立随机签名密钥，不要复用仓库密码。

## 部署

`.github/workflows/deploy.yml` 使用 `pnpm install --frozen-lockfile`，依次执行转换幂等、schema、临床冲突、双语、行为测试、typecheck、lint、Playwright、构建和静态答案/密钥扫描，全部通过才部署 Pages。

部署相关修改必须先在 `codex/*` 专项分支完成测试、密钥扫描和差异审查，再普通 push 专项分支并创建 Pull Request。不得由无人值守流程直接 push 或合并 `main`/`master`，也不得自动触发或回滚正式生产部署。

GitHub Pages 设置保持 `Settings -> Pages -> Source: GitHub Actions`。`trailingSlash` 与 `/hematuria-training-system/` basePath 已配置，动态病例刷新路径会生成实体 `index.html`。

## 正式考核与研究

公开站不打包教师答案；`/teacher` 和 `/rct` 只显示安全边界说明。所有练习与正式attempt均只接受至少32字节、且不得与`LLM_API_KEY`相同的独立`TRAINING_STATE_SECRET`；缺失或弱值时服务端安全失败，不再使用provider key兜底。签名状态包含版本、签发/过期时间、nonce、病例、attempt、mode与当前阶段。正式attempt还要求病例为 `reviewed/approved`、`medicalReviewImport.formalUseAllowed=true`；当前42例仍全部保持禁用。跨serverless防重放仍必须配置权威attempt存储，不能由签名token或进程内Map替代。正式 OSCE/RCT 下一阶段仍需要：

- 教师/学生身份验证与角色权限
- 服务端病例事实、阶段释放和评分API
- 后端数据库、不可变attempt、审计日志和集中备份
- 版本化知情同意、伪匿名participant ID、病例/评分版本
- 响应延迟、TTS成功率/降级原因、前后测和方案偏离记录

医学上仍需泌尿外科、肾内科、医学教育和双语教师审核病例事实、检查适应证、治疗路径、评分权重及英文患者表达。

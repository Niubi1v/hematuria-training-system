# 生产 API 与云语音部署检查

公开 GitHub Pages 仅承载练习界面；Patient Agent、训练状态和 Azure TTS 由 Vercel API 提供。前端只配置一个公开来源：

```text
NEXT_PUBLIC_API_BASE_URL=https://hematuria-training-system.vercel.app
```

所有接口路径由 `src/lib/apiConfig.ts` 生成，并统一使用尾斜杠。不要再分别配置 Patient、Session、Training 或 TTS URL。

前端主路径共有五个入口：`/api/health/`、`/api/session/init/`、`/api/agent-chat/`、`/api/training-action/` 和 `/api/tts/`。`/api/patient-reply/` 为兼容路径，`/api/session/complete-profile/` 不是前端主路径；不得为这些兼容路径建立第二套公开 base URL 配置。

本地与 CI 验证环境应对齐 `.github/workflows/deploy.yml`：Node.js `22.14`、pnpm `11.7.0`。

## Vercel 服务端变量

在 Vercel 项目的 `Settings -> Environment Variables` 中为 Production 和 Preview 配置：

```text
LLM_PROVIDER=deepseek
LLM_API_KEY=<DeepSeek密钥>
LLM_API_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-v4-flash
LLM_ENDPOINT_TYPE=chat_completions
LLM_STREAMING_ENABLED=true
LLM_ENABLE_AI_AGENTS=true
LLM_ENABLE_AI_PATIENT=true
LLM_REQUEST_TIMEOUT_MS=15000

# 可选：短期会话与回答缓存（毫秒/最大条目数）
PATIENT_SESSION_TTL_MS=1800000
PATIENT_ANSWER_CACHE_TTL_MS=900000
PATIENT_SESSION_CACHE_MAX=200
PATIENT_ANSWER_CACHE_MAX=500

TRAINING_STATE_SECRET=<至少32字节的独立随机密钥>
TRAINING_DEPLOYMENT_TIER=practice

AZURE_SPEECH_KEY=<Azure Speech密钥>
AZURE_SPEECH_REGION=<资源区域，例如eastasia>

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
# 可选；配置后，无 Origin 的服务间调用必须发送 x-agent-api-token
AGENT_API_SERVER_TOKEN=<独立服务间令牌>
TRAINING_API_ALLOWED_ORIGINS=https://niubi1v.github.io
TTS_ALLOWED_ORIGINS=https://niubi1v.github.io
TTS_REQUEST_STORE_MODE=upstash
TTS_SESSION_DAILY_REQUEST_LIMIT=60
TTS_IP_HOURLY_REQUEST_LIMIT=120
TTS_IP_DAILY_REQUEST_LIMIT=500
TTS_PROJECT_DAILY_REQUEST_LIMIT=5000
TTS_PROJECT_DAILY_CHAR_BUDGET=1000000
TTS_TUPLE_LEASE_SECONDS=30
```

这些预算使用`AGENT_REQUEST_STORE_MODE`选择的持久store，并与training attempt store复用同一组服务端Upstash凭据；原始session与IP只用于本地计算SHA-256摘要，不作为Redis键明文。项目token预算按输入字符上界与服务端最大输出token预留，只是成本熔断上界，不得写成真实供应商账单统计。

TTS由`TTS_REQUEST_STORE_MODE`选择同一组Upstash凭据，原子执行session/IP/项目预算和跨实例tuple短租约。Redis不保存音频、原始session、IP或朗读文本。Preview/Production缺少持久store时云TTS fail-closed，客户端按既有安全路径降级到同语言浏览器语音或文字模式。

`chat_completions`默认使用供应商SSE流并在服务端聚合为原有JSON响应，同时通过非敏感`Server-Timing`返回`firsttoken`耗时。仅当兼容供应商明确不支持SSE时才将`LLM_STREAMING_ENABLED=false`；非流式路径不会伪造首Token指标。DeepSeek的SSE合同以官方[`Create Chat Completion`](https://api-docs.deepseek.com/api/create-chat-completion)文档为准。

密钥只能存在于 Vercel 服务端变量中，不得使用 `NEXT_PUBLIC_` 前缀，不得写入仓库、浏览器日志或截图。变量修改后必须重新部署 Vercel 项目。

## 健康检查

部署后访问 `https://hematuria-training-system.vercel.app/api/health/`。该接口只返回布尔配置状态、部署层级、短提交号和 API 版本，不返回密钥。启用 Patient Agent 与签名训练状态时，期望 `patientServiceConfigured`、`trainingStateConfigured` 和 `allowedOriginConfigured` 为 `true`。只有实际配置 Azure Speech 后才期望 `cloudTtsConfigured=true`；未配置时必须为 `false`，并在冒烟测试中明确记为 `SKIP`，不能冒充云语音通过。

`session/init` 使用本地病例事实快速建立会话，不再同步等待大模型补全。会话默认 30 分钟失效，回答幂等缓存默认 15 分钟失效；部署 SHA 或 API 版本变化后，浏览器会自动丢弃旧会话。页面中的“重新连接AI”只更新 AI 会话，不会清空学生的训练记录。

## 无模拟生产冒烟测试

```bash
pnpm run smoke:production
```

若仅配置 DeepSeek、尚未配置 Azure Speech，可先验证真实会话与中英文 AI 问答：

```powershell
$env:SMOKE_REQUIRE_TTS="false"
pnpm run smoke:production
```

该模式会明确将云语音标记为 `SKIP`，不会使用模拟音频冒充生产测试。

测试会真实请求生产环境，验证健康接口、连续 10 次会话初始化、中文/英文各 5 次 Patient Agent、签名训练状态，以及中文男女声和英文男女声四种 Azure MP3。脚本会输出初始化与回答延迟、成功率、P50/P95、规则库降级次数及常见上游错误计数。任何 3xx 重定向、CORS 缺失、服务未配置、非 `audio/mpeg` 或空音频都会失败。

## 故障表现

- 网络错误、502、503、504：前端最多重试两次，并保留同一幂等键。
- 404：显示后端尚未部署。
- 429：提示稍后重试，不进行无节制重试。
- 云 TTS 失败：自动降级到匹配语言的浏览器语音；浏览器无可用音色时保留文字模式。
- 健康检查失败：不阻断文字练习，但页面会显示简短状态提示。

## 当前教学边界

42 个病例仍为 `needs_revision`。医学审核队列包含572条审核追踪项，不代表病例库全部结构化事实：其中153条来源追踪项待具名来源核对，419条模拟补充事实已完成AI内容预审但仍待持证专家逐条终签。GitHub Pages 不可用于正式 OSCE、教师阅卷或正式 RCT 数据采集。

## 当前生产复核状态（2026-07-12）

- 本地目标仓库、`origin/main` 和 GitHub API compare 均指向 `5a3ad11`；这只证明提交指针一致，不证明部署内容已完成验收。
- GitHub connector 仅显示该提交的 Vercel status 为 success；GitHub Actions、Pages 部署、Pages live alias 与 Vercel live alias 仍待独立核验。
- 普通与提权环境运行 `pnpm run smoke:production` 均因 `fetch failed` 未能连接生产 API。`/api/health/`、连续10次 session init、中文5次和英文5次真实请求均为“待验证”，不得登记为通过。
- Azure Speech 尚未在本轮验证；未配置时应保持浏览器语音或文字降级，并将云TTS标为 `SKIP`。

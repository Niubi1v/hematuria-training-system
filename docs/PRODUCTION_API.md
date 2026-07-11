# 生产 API 与云语音部署检查

公开 GitHub Pages 仅承载练习界面；Patient Agent、训练状态和 Azure TTS 由 Vercel API 提供。前端只配置一个公开来源：

```text
NEXT_PUBLIC_API_BASE_URL=https://hematuria-training-system.vercel.app
```

所有接口路径由 `src/lib/apiConfig.ts` 生成，并统一使用尾斜杠。不要再分别配置 Patient、Session、Training 或 TTS URL。

## Vercel 服务端变量

在 Vercel 项目的 `Settings -> Environment Variables` 中为 Production 和 Preview 配置：

```text
LLM_PROVIDER=deepseek
LLM_API_KEY=<DeepSeek密钥>
LLM_API_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-v4-flash
LLM_ENDPOINT_TYPE=chat_completions
LLM_ENABLE_AI_AGENTS=true
LLM_ENABLE_AI_PATIENT=true
LLM_REQUEST_TIMEOUT_MS=15000

TRAINING_STATE_SECRET=<至少32字节的独立随机密钥>
TRAINING_DEPLOYMENT_TIER=practice

AZURE_SPEECH_KEY=<Azure Speech密钥>
AZURE_SPEECH_REGION=<资源区域，例如eastasia>

AGENT_API_ALLOWED_ORIGIN=https://niubi1v.github.io
TRAINING_API_ALLOWED_ORIGINS=https://niubi1v.github.io
TTS_ALLOWED_ORIGINS=https://niubi1v.github.io
```

密钥只能存在于 Vercel 服务端变量中，不得使用 `NEXT_PUBLIC_` 前缀，不得写入仓库、浏览器日志或截图。变量修改后必须重新部署 Vercel 项目。

## 健康检查

部署后访问 `https://hematuria-training-system.vercel.app/api/health/`。该接口只返回布尔配置状态、部署层级、短提交号和 API 版本，不返回密钥。期望 `patientServiceConfigured`、`trainingStateConfigured`、`cloudTtsConfigured` 和 `allowedOriginConfigured` 均为 `true`。

## 无模拟生产冒烟测试

```bash
pnpm run smoke:production
```

测试会真实请求生产环境，验证健康接口、中文/英文 Patient Agent、签名训练状态，以及中文男女声和英文男女声四种 Azure MP3。任何 3xx 重定向、CORS 缺失、服务未配置、非 `audio/mpeg` 或空音频都会失败。

## 故障表现

- 网络错误、502、503、504：前端最多重试两次，并保留同一幂等键。
- 404：显示后端尚未部署。
- 429：提示稍后重试，不进行无节制重试。
- 云 TTS 失败：自动降级到匹配语言的浏览器语音；浏览器无可用音色时保留文字模式。
- 健康检查失败：不阻断文字练习，但页面会显示简短状态提示。

## 当前教学边界

42 个病例仍为 `needs_revision`，572 条程序或 AI 补充事实仍待医学专家确认。GitHub Pages 不可用于正式 OSCE、教师阅卷或正式 RCT 数据采集。

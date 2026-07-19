# Agent C 安全、Session/Attempt 与 API 工程审阅

审阅日期：2026-07-20  
审阅范围：`api/**`、`server/**`（未修改 `server/canonicalFacts.js`、`server/structuredFacts.js`）、`src/server/**` 及安全/API/attempt 专项测试。  
医学治理：未修改 `data/**`、医学真值、审核状态、360 分医学规则或病例事实。

## 结论

- 未发现未解决的 P0/P1 工程安全问题。
- 发现并修复 1 个 P2 公共 API 输入边界问题（`AUTO-SEC-001`）。
- 已有门禁确认：训练状态签名密钥与 LLM Key 分离；token 过期、陈旧 token 重放、跨病例、跨语言、跨模式、阶段绕过、重复计分和重复请求均被拒绝或幂等收敛；生产/Serverless 缺少共享 Redis 时 attempt、Agent 请求和 provider circuit fail-closed。
- Patient Agent 公共接口使用字段白名单，客户端不能指定 Agent 角色、model、system prompt、provider key、base URL、unlocked data 或工具；相关拒绝发生在 provider 调用之前，测试断言 `providerCalls === 0`。
- provider 只读取服务端环境配置；API Key 未进入客户端响应。日志只记录随机 requestId、状态、耗时、重试数、fallback 原因和截短部署 SHA，不记录 Authorization、问题正文、session capability 或 Redis 凭据。
- Preview 输出安全模块对 stdout、stderr、递归 Error、HTML/report/trace/截图文件名及临时日志执行 fail-closed 脱敏扫描；测试关闭 trace、screenshot、video，并验证 bypass canary 不输出。

## 缺陷 AUTO-SEC-001

- 优先级：P2
- 页面/API：`POST /api/session/init`
- 病例：任意（使用 P001 复现）
- 语言：中文、英文均受影响
- 操作步骤：取得合法 training state 后，请求体附加 `model`、`systemPrompt`、`tools` 或 `apiKey`；另以 201 字符 `X-Idempotency-Key` 请求。
- 预期：公共 session API 仅接受声明字段；高风险控制字段应明确拒绝；超长幂等键应拒绝而非规范化成另一个键。
- 实际（修复前代码审阅与定向测试基线）：额外字段被静默忽略；幂等键通过 `.slice(0, 200)` 静默截断。
- 复现次数：4 个高风险字段各 1 次；超长幂等键 1 次；不支持语言 1 次。
- 根因：session init 缺少请求字段白名单与严格类型/语言校验，并在验证前截断幂等键。
- 证据：`scripts/test-agent-api-security.ts::verifySessionRequestBoundary`；修复后 6 条定向断言均通过。
- 是否能自动修复：是。
- 是否需要医学专家：否。
- 修改：为 session init 加入字段白名单；严格校验 `language/mode/debug/forceRefresh`；超过 200 字符的幂等键返回 400；不再静默截断。
- 回归范围：session 初始化、attempt claim 绑定、Agent API 安全、CORS、限流、幂等、provider fallback。
- 截图/trace/日志：纯 API 缺陷，无 UI 截图；命令输出见下方。安全测试刻意不生成 trace。

## 其余审阅证据

### Session / attempt

- HMAC token 使用专用 `TRAINING_STATE_SECRET`，要求至少 32 字节、拒绝占位值、拒绝与 `LLM_API_KEY` 复用。
- attempt token 包含 case、attempt、mode、language、nonce、序列、阶段、过期时间；API 同时校验签名 claims 与权威 attempt store 状态。
- Redis Lua 脚本原子执行 register/load/commit；current token hash 防止陈旧 token 重放；请求 ID + 请求摘要防止同一幂等键换载荷。
- score 只允许阶段 8；第一次成功后 attempt 完成且 token 更新，非同一幂等重试无法重复计分。
- Serverless/production 未配置可写 Redis REST 凭据时 fail-closed；只读 token 不被当作写凭据。

### CORS、大小和限流

- Agent/session API 对显式不可信 Origin 返回 403，不返回 `Access-Control-Allow-Origin`；允许配置 allowlist 或精确同源 Preview。
- 无 Origin 的服务端调用可选 `AGENT_API_SERVER_TOKEN`；显式恶意 Origin 不能借 server token 绕过。
- Agent 64 KiB、session 16 KiB、training 96 KiB、TTS 16 KiB；单条 Patient 输入 2000 字符，历史及问法数组有数量和单项长度上限。
- 内存限流键数量有上限；Agent durable admission 同时原子约束 session、attempt、字符、IP 小时/日、项目日请求/token 预算及 probe 次数。

### Provider、fallback 与日志

- provider 配置完全来自服务端环境；重试只针对 timeout/network/408/425/429/5xx，最多 2 次；非重试错误不盲重试。
- provider circuit 在生产要求共享 store；开启后单 probe；错误回退为规则回答并过滤 provider 错误正文。
- 安全边界、字段验证、Origin、capability、配额和并发拒绝均发生在 provider executor 之前。
- Preview bypass 安全扫描不打印命中值或文件路径；精确 canary、敏感键值和嵌套错误均 fail-closed。

## 测试命令与退出码

使用工作区外已安装的 `tsx` 启动器执行当前 worktree 脚本；未写入依赖或修改 lockfile。

| 命令 | 退出码 | 结果 |
|---|---:|---|
| `tsx scripts/test-agent-api-security.ts` | 0 | capability、幂等、CORS、限流、providerCalls=0、session 新边界通过 |
| `tsx scripts/test-training-security.ts` | 0 | 密钥分离、阶段授权、重放拒绝、过期门禁通过 |
| `tsx scripts/test-training-attempt-store-config.ts` | 0 | Redis/KV 可写凭据与 fail-closed 通过 |
| `tsx scripts/test-attempt-isolation.ts` | 0 | 病例/模式/语言/participant/API origin 隔离通过 |
| `tsx scripts/test-api-recovery.ts` | 0 | 重试、幂等、非重试错误和超时通过 |
| `tsx scripts/test-llm-streaming.ts` | 0 | SSE、首 token、有限重试、circuit recovery 通过 |
| `tsx scripts/test-tts-api.ts` | 0 | capability、Origin、provider 前拒绝、配额、缓存隔离通过 |
| `node scripts/test-preview-output-security.mjs` | 0 | 10 类错误路径、5 类 artifact 渠道 canary 拒绝通过 |
| `node scripts/scan-repository-secrets.mjs` | 0 | 333 个 tracked/candidate 文件、历史与压缩元数据扫描通过 |
| `node scripts/test-secret-scanner.mjs` | 1 | 环境阻塞：当前 worktree 无 `node_modules/xlsx`；非产品/断言失败 |
| `git diff --check -- api/session/init.js scripts/test-agent-api-security.ts` | 0 | 无 whitespace error（仅 Git CRLF 提示） |

## 未执行/权限边界

- 未主动探测第三方或 Production；未使用或输出 Preview Automation Bypass 值。
- 未修改或验证 Production 环境变量。
- `test-secret-scanner.mjs` 需完整 worktree 依赖后复测；仓库静态 secrets 扫描与 Preview 输出 canary 测试已分别通过。
- 未提交、未 push（由主 Agent 统一集成）。

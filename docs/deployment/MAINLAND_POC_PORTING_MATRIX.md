# POC 选择性移植矩阵

来源 POC：`b753dca077881e5692fc44c7665b88fdb5054579`
初始 Production 来源：`141f5bb64dc7a74e83f9bc1d9615197eb543d970`
当前绿色 Production 基线：`c4ac9b5a59021bed10dc2d94c4ebf4d8f97badd2`
merge-base：`70ea9b3c7b31e11a84878de5c277cac60f35481c`

| POC 内容 | 状态 | 本分支处理 |
|---|---|---|
| `.dockerignore` | PORTED | 重写为大陆构建上下文，排除环境文件和测试产物。 |
| `.env.mainland.example` | PORTED | 改为纯变量/占位符合同；增加 APP_ORIGIN、TRUSTED_ORIGINS、REDIS_KEY_PREFIX、SESSION_TTL_SECONDS、LOG_LEVEL。 |
| `Dockerfile` | PORTED | 保留 Node 22 多阶段、非 root、health；从最新 Production 构建。 |
| `docker-compose.mainland.yml` | PORTED | 腾讯云 managed 与本地 Redis/safe_mock profile；Redis/Node 不发布端口。 |
| `nginx.conf.example` / `nginx.local.conf` | PORTED | 同域代理、必要头、CSP、TLS、限流、内部 Node。 |
| `server/standardRedisClient.js` | PORTED | 标准 Redis/TLS/私有 CA、重连、超时、无凭据日志；支持 REDIS_KEY_PREFIX。 |
| `server/trainingAttemptStore.js` Redis 分支 | PORTED | 保留 Upstash；新增显式 `redis`、原子 Lua、namespace、TTL、重放/并发语义。 |
| `server/providerCircuitStore.js` Redis 分支 | PORTED | provider circuit 使用同一标准 Redis namespace。 |
| `api/health.js` | PORTED | Redis 断线及生产必要配置不完整返回 503；不泄露变量值。 |
| `server/mainlandServer.js` | PORTED | Next.js + 现有 API 的同进程同域 runtime，body/timeout/脱敏访问日志。 |
| safe mock 与标签 | PARTIALLY_PORTED | 仅移植 provider 元数据和 `safe_mock` 标签；未覆盖 Patient Agent 路由、canonical intent 或安全过滤。 |
| `next.config.mjs` / `src/lib/apiConfig.ts` | PARTIALLY_PORTED | 只增加 Mainland runtime 和同源分支；Vercel Preview 同源合同保持不变。 |
| 部署脚本 | PORTED | PowerShell/Shell，拒绝占位符，构建后深 health；不操作 DNS/备案/云购买。 |
| 备份与回滚脚本 | PORTED | 在 POC 基础上补充无密钥 manifest 与不可变镜像回滚脚本。 |
| 腾讯云 Runbook | PORTED | 首发 CVM + Redis、同地域/VPC、白名单、安全组和人工控制台步骤。 |
| 阿里云 Runbook | PARTIALLY_PORTED | 仅保留未来可移植性，不作为首发方案或已验证环境。 |
| 安全/备案/域名清单 | PORTED | 合并 Production 新安全门禁并明确人工责任。 |
| POC health/Redis/20 轮/browser 脚本 | PORTED | 增加 live/safe_mock 严格区分、并发重复提交与统计。 |
| 真实 DeepSeek 验收 | PORTED | 新增 20 session、中英文 10/10 统计脚本及人工故障矩阵。 |
| 地域性能对照 | PORTED | 新增相同窗口双目标脚本与三地执行合同，不预设结论。 |
| POC 对 `api/agent-chat.js` 的旧上下文整体变更 | REJECTED | 只手工加入生成来源元数据，保留 5 个 Production 后续修复。 |
| POC 对 `server/patientSession.js` 的旧版本覆盖 | REJECTED | 未移植旧文件；只在当前 Production 行上增加 safe_mock 元数据和 SESSION_TTL_SECONDS 别名。 |
| POC 对 canonical intent/session capability/attempt token/第一阶段/360 分/医学治理/日志脱敏/安全拒绝的任何旧实现 | ALREADY_SUPERSEDED | 以 `c4ac9b5` Production 应用树为准，无 POC 覆盖。 |
| POC 分支整体 merge/cherry-pick | REJECTED | 未执行。 |

## Production 自 merge-base 的保留修复

- `871cc70`：自然 Patient intent 路由缺口。
- `3fb6e00`：live patient 上下文追问。
- `04d572f`：未审核 Data Agent 输出 fail-closed。
- `86f5ad9`：复合问句中的独立疼痛意图。
- `141f5bb`：QA P1 修复证据。
- `6c1d42c`：精确依赖审计修复。
- `c9f7807`：依赖审计恢复证据。
- `77df23d`：Preview 英文纠错与上下文追问黑盒回归。
- `c4ac9b5`：QA P1 远端验证收口。

上述提交全部位于专项分支祖先链中。

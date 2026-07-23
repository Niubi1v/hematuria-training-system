# 大陆预发布架构与环境合同

## 首发拓扑

`Internet -> Tencent Cloud security group -> Nginx :443 -> Next.js :3000 -> Tencent Cloud Redis (private VPC)`

Next.js 只从服务端调用 DeepSeek。浏览器只访问 `https://预发布域名/` 和同源 `/api/**`。Node 3000、Redis 6379 与 safe mock 8787 不得暴露到公网。

## 隔离边界

- 大陆预发布、Vercel Preview、未来 Production 使用不同 `TRAINING_STATE_SECRET`、`LLM_API_KEY`、Redis namespace 和域名。
- 大陆明确设置 `TRAINING_ATTEMPT_STORE_MODE=redis`；不得依赖 Upstash 自动探测。
- `REDIS_KEY_PREFIX` 必须是大陆预发布专用值，例如 `mainland-staging:<environment-id>`；adapter 会在外层加入 `hematuria:`。
- `TRAINING_STATE_SECRET` 负责训练状态签名，`LLM_API_KEY` 只负责 provider 鉴权，二者不得相同。
- 所有密钥只在 CVM 保存，不进入镜像、前端变量、日志、health 或仓库。

## 同域与代理合同

- 前端构建设置 `MAINLAND_RUNTIME=1`，客户端 API base 为空字符串。
- Nginx 传递 `Host`、原始 `Origin`、`X-Forwarded-Proto`、`X-Real-IP`、`X-Forwarded-For` 与 `X-Request-Id`。
- 本地模拟通过 `docker-compose.mainland.local.yml` 只绑定 `127.0.0.1:8080`；managed 配置仍由主 Compose 发布 80/443。
- CSP `connect-src 'self'` 阻止浏览器访问 github.io、vercel.app 或 provider。
- 不使用 wildcard CORS；三个应用 allowlist 与 `APP_ORIGIN` 保持一致。
- 语言切换与刷新只可复用同 origin、同 attempt 的 token。

## Redis 与失败语义

- 首选腾讯云 Redis 私网标准协议；按实例能力选择 `redis://` 私网或 `rediss://` TLS。
- `REDIS_URL` 与分字段配置二选一。私有 CA 通过只读挂载和 `REDIS_CA_FILE` 提供。
- attempt 的创建、token 消费、幂等缓存与状态提交由 Lua 原子执行。
- Redis 不可达时 attempt 操作 fail-closed；`/api/health/` 返回受控 503，不包含 endpoint、密码或 key。
- Redis 恢复后客户端重连，health 回到 200，已有 TTL 内 attempt 可继续。

## 单实例限制

首发 Compose 只有一个 app 容器。agent 与 TTS admission 仍可使用进程内存并由 Nginx 提供外层 IP 限流。横向扩容前必须实现并验证它们的标准 Redis 共享 adapter，否则各实例配额和幂等状态不一致。

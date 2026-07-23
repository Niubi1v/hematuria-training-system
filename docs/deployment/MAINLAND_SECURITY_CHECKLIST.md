# 中国大陆部署安全清单

## 构建和供应链

- [ ] 从已验证绿色 SHA 构建，镜像 tag 包含 Git SHA。
- [ ] `pnpm install --frozen-lockfile`，审阅新增依赖。
- [ ] 运行 typecheck、lint、测试、bundle 扫描、仓库 secret 扫描。
- [ ] 镜像不含 `.git`、`.env`、docs、测试产物或真实 secret。
- [ ] 容器使用非 root 用户，设置 `restart: unless-stopped` 和健康检查。

## 同域/API

- [ ] `MAINLAND_RUNTIME=1`，不设置 `NEXT_PUBLIC_API_BASE_URL`。
- [ ] 浏览器仅请求当前域 `/api/**`。
- [ ] DevTools/自动化证明确无 GitHub Pages → Vercel 跨域。
- [ ] Origin allowlist 是最终 HTTPS 域名，无 wildcard。
- [ ] session capability、attempt token、stage gate、幂等键和重放拒绝测试通过。
- [ ] Nginx 与 Node 请求上限均不超过 128 KiB。
- [ ] Nginx 外层和应用内层限流均生效，429 有验证。

## Secret 和 AI

- [ ] DeepSeek/Azure/Redis/签名 secret 只在服务器受限文件或 secret manager。
- [ ] 所有 secret 均无 `NEXT_PUBLIC_` 前缀。
- [ ] `TRAINING_STATE_SECRET`、Redis 密码、server token 互不复用。
- [ ] 示例值全部替换，文件权限 `0600`。
- [ ] mock 明确标记为 mock，不记录为真实 AI 通过。

## Redis

- [ ] 明确 `TRAINING_ATTEMPT_STORE_MODE=redis`。
- [ ] 每个环境独立 `REDIS_NAMESPACE`。
- [ ] Redis 私网、认证、最小白名单；不映射公网端口。
- [ ] 按实例能力启用 TLS/CA 校验。
- [ ] 写、读、TTL、幂等消费、改变重放拒绝、旧 token 拒绝、断线、恢复、跨环境隔离通过。
- [ ] 自动备份和发布前手动备份启用，恢复到新实例演练完成。

## Nginx/TLS/Cookie

- [ ] 80 跳转 443；TLS 1.2/1.3；证书链和续期正常。
- [ ] HSTS、nosniff、frame deny、referrer、permissions、COOP、CSP 已验证不破坏页面。
- [ ] 所有应用 cookie（如未来引入）强制 `Secure; HttpOnly; SameSite=Lax`；跨站需求需单独威胁建模。
- [ ] `/nginx-health` 不泄露内部配置。

## 日志和隐私

- [ ] Node 访问日志仅 method、path、status、duration、脱敏 request ID。
- [ ] Nginx 不记录请求体；查询参数不得承载敏感信息。
- [ ] 不记录 Prompt、师生输入/回答、session/attempt token、Authorization、API key、Redis URL/密码。
- [ ] 日志轮转、留存期、访问权限和删除策略明确。

## 运维

- [ ] 监控 CPU、内存、磁盘、容器重启、健康、5xx/429、Redis、证书、备份和 DeepSeek 延迟。
- [ ] 回滚与 Redis 恢复演练有时间戳证据。
- [ ] 安全组只开放 22（受限）、80、443。
- [ ] ICP 完成前不正式公网开放。

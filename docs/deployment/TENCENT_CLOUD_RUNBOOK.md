# 腾讯云大陆 POC 人工运行手册

本手册不自动购买资源、不改 DNS、不提交备案、不部署现有 Vercel Production。所有控制台操作由有权限的用户完成。

## 1. 控制台准备

1. 完成腾讯云中国站账号和主体实名认证。
2. 选择靠近主要教师用户的中国内地地域；轻量服务器与 Redis 必须同地域。
3. 购买满足备案资格的轻量实例。腾讯云当前文档说明中国内地轻量实例用于备案通常需购买至少 3 个月，执行时以控制台最新规则为准。
4. 创建腾讯云分布式缓存数据库（兼容 Redis/Valkey），启用认证、自动备份；不申请公网地址。
5. 规划不冲突的 VPC 网段，将轻量 VPC 与 Redis VPC 关联到同地域云联网。
6. Redis 访问控制仅允许轻量服务器私网网段或最小私网地址。
7. 安全组/轻量防火墙入站仅允许：
   - `22/tcp`：仅管理员固定 IP，完成后可关闭；
   - `80/tcp`：公众，用于跳转和证书验证；
   - `443/tcp`：公众。
   Redis 6379/自定义端口不得对公网开放。

官方参考：[轻量 Docker](https://cloud.tencent.com/document/product/1207/60423)、[内网互联](https://cloud.tencent.com/document/product/1207/56847)、[Redis 连接](https://cloud.tencent.com/document/product/239/30877)、[Redis SSL](https://cloud.tencent.com/document/product/239/75865)、[Redis 备份](https://cloud.tencent.com/document/product/239/30901/)。

## 2. 服务器准备

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
# 按 Docker 官方/腾讯云镜像说明安装 Docker Engine 与 Compose plugin。
sudo install -d -m 0750 /opt/hematuria-mainland
sudo chown "$USER":"$USER" /opt/hematuria-mainland
```

仅克隆本专项分支或上传经审阅的归档。不要在服务器保存个人 GitHub PAT；私库优先使用只读 deploy key。

```bash
git clone --branch codex/hematuria-mainland-deployment-poc --single-branch <approved-repository-url> /opt/hematuria-mainland
cd /opt/hematuria-mainland
cp .env.mainland.example .env.mainland
chmod 600 .env.mainland
```

## 3. 环境变量

- 将三组 Origin 都改为最终 `https://<审阅子域名>`，不得使用 `*`。
- 独立生成 `TRAINING_STATE_SECRET` 和 `AGENT_API_SERVER_TOKEN`。
- `TRAINING_ATTEMPT_STORE_MODE=redis`。
- `REDIS_NAMESPACE=mainland-staging`；正式环境必须换成不同值。
- 建议使用分离变量指向私网端点；开启云 Redis SSL 时设置 `REDIS_TLS=true` 并按腾讯云要求安装/信任 CA。
- DeepSeek key 只写入服务器 `0600` 文件或合规 secret manager，不进入 Compose YAML、镜像、Git、浏览器变量。
- 大陆部署不要设置 `NEXT_PUBLIC_API_BASE_URL`。

在服务器 Compose 环境文件中另设 `NGINX_TEMPLATE_PATH=./nginx.conf.example`、`MAINLAND_HTTP_PORT=80`、`MAINLAND_HTTPS_PORT=443`、`MAINLAND_DOMAIN=<审阅子域名>`、`TLS_CERT_DIR=<证书目录>`。证书目录应只含 `fullchain.pem` 和权限受限的 `privkey.pem`。

## 4. 部署与验证

备案完成、DNS 和证书均人工准备后：

```bash
cd /opt/hematuria-mainland
./scripts/deploy-mainland.sh managed .env.mainland https://<审阅子域名>
docker compose --env-file .env.mainland -f docker-compose.mainland.yml ps
docker compose --env-file .env.mainland -f docker-compose.mainland.yml logs --tail=100 app nginx
```

本地安全 mock 仅由 Compose `local` profile 启动。托管环境必须设置
`MAINLAND_SAFE_MOCK_LLM=false` 并使用经批准的服务端 DeepSeek 配置；若仍需云上
mock 验收，应单独审批，并保持 API/报告中的 `safe_mock` 标签。

日志审阅只允许路由、状态、耗时和 request ID。发现 Prompt、问题正文、回答、token、Authorization 或连接 URL 时立即停止发布。

## 5. 必做验收

- `/`、`/cases/`、当前全部 42 病例（P001–P012 与 HX-ADD-001–030）。
- 第一阶段、完整七阶段、360 分、中文/英文。
- session/attempt/history-log，20 轮，双击、刷新、旧 token 重放拒绝。
- Nginx 同域 `/api/**`；浏览器 Network 面板中不得出现 Vercel 或 GitHub Pages API。
- Redis 重启前后 attempt 可恢复；停机期间 API fail-closed，恢复后可继续。
- DeepSeek 安全 mock 的结果标记为 mock；真实模型另行受控验证。
- `pnpm test`、`pnpm run build`、bundle/secret 扫描。

## 6. 备份和运维

- Redis 每日自动备份，发布前手动备份；按月演练恢复到新实例。
- 每次发布记录 Git SHA 和镜像 tag，保留至少前两个健康镜像。
- 轻量实例发布前创建快照；应用本身无状态，不把 attempt 备份混入镜像。
- 监控 5xx/429、Redis 连接、内存、CPU、磁盘、证书到期、备份失败和 DeepSeek 延迟。
- 回滚遵循 [MAINLAND_ROLLBACK.md](./MAINLAND_ROLLBACK.md)。

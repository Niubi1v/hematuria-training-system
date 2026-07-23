# 中国大陆 POC 回滚手册

## 回滚原则

应用容器无状态，attempt 状态保存在 Redis。回滚应用镜像时不得清空 Redis，不得复用其他环境命名空间，也不得回滚医学数据文件到未经审核的版本。

## 发布前

1. 记录当前 Git SHA、镜像 tag、Compose 文件校验值和 `.env` 变量名清单（不记录值）。
2. 确认当前镜像深度健康检查通过。
3. 触发 Redis 手动备份并记录备份 ID。
4. 保留当前及前一版镜像，创建轻量服务器快照。
5. 检查 schema：当前 attempt key/version 未迁移；若未来改变，必须先提供双读/迁移方案。

## 应用回滚

```bash
export MAINLAND_IMAGE_TAG=<last-known-good-tag>
docker compose --env-file .env.mainland -f docker-compose.mainland.yml pull app
docker compose --env-file .env.mainland -f docker-compose.mainland.yml up -d --no-deps app
node scripts/healthcheck-mainland.mjs --base-url=https://<审阅子域名>
```

若镜像在本机构建，先切到已批准 tag/SHA 再构建带唯一 tag 的镜像；不要 `git reset --hard` 覆盖服务器上的未归档配置。

## Nginx/证书回滚

1. `nginx -t` 通过后才 reload。
2. 配置失败时恢复上一份只读模板和证书符号链接。
3. 先在容器内验证，再 `docker compose up -d --no-deps nginx`。
4. 不通过临时开放 3000 或 Redis 公网端口绕过故障。

## Redis 故障

- 连接短暂中断：应用健康变为 degraded/503，训练写入 fail-closed；等待托管实例恢复后重跑 adapter 与深度健康检查。
- 数据误删/损坏：停止训练写入，保全日志和备份 ID，从备份恢复到**新实例**，验证命名空间和 TTL 后切换私网端点。
- 不执行 `FLUSHALL`、`FLUSHDB` 或批量删除作为普通回滚。
- 本地 POC Redis AOF volume 只用于测试，不替代云备份。

## 回滚验收

- 首页、P001、health、session、attempt、history-log。
- 旧 attempt 可继续，旧 token 重放仍拒绝。
- Nginx 同域且无跨域请求。
- 5xx/401/403/429 恢复到基线。
- 日志无 Prompt、回答、token、密钥或 Redis URL。

若回滚仍失败，关闭大陆预发布入口并保留 Vercel Production 不变；本专项分支无权修改现有 Production。

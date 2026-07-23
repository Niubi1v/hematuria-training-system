# 腾讯云大陆预发布 Runbook

1. 人工创建同地域、同 VPC 的 CVM 与腾讯云 Redis。
2. Redis 白名单只放行应用私网地址/子网；验证公网无法连接。
3. 安全组只放行固定运维源的 SSH 和公众 80/443；拒绝 3000/6379/8787。
4. 在 CVM 安装受支持的 Docker Engine/Compose，启用安全更新与时间同步。
5. 创建专用低权限部署用户；限制 `.env.mainland` 为该用户可读。
6. 从 `.env.mainland.example` 创建真实文件，替换全部占位符并执行配置同行复核。
7. 设置 `REDIS_URL` 为腾讯云私网 endpoint，设置唯一 `REDIS_KEY_PREFIX`。
8. 设置 `MAINLAND_HTTP_PORT=80`、`MAINLAND_HTTPS_PORT=443`、`NGINX_TEMPLATE_PATH=./nginx.conf.example`、真实域名和证书目录，再启动 managed profile。
9. 执行 `healthcheck:mainland`、Redis adapter、浏览器、20 轮和真实 DeepSeek 验收。
10. 配置腾讯云监控、Redis 备份、CVM 快照、证书与备案告警。
11. 部署前运行 `backup-mainland` 保存无密钥 manifest；故障时按回滚 Runbook 切换不可变镜像。

严禁在命令行历史、工单、截图、日志或本文记录真实 key、Redis 密码、完整连接串或证书私钥。

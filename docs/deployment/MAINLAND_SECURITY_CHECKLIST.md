# 大陆预发布安全清单

- [ ] `.env.mainland` 未跟踪，文件权限最小化，镜像与 bundle 无秘密。
- [ ] 无秘密使用 `NEXT_PUBLIC_`；前端只能获得非敏感构建元数据。
- [ ] 训练签名 secret、DeepSeek key、Redis 密码、服务器 token 各自独立。
- [ ] 缺少签名、Redis、namespace 或 live provider 配置时 fail-closed。
- [ ] Redis 仅私网，不分配公网入口，白名单最小化。
- [ ] 安全组不开放 3000/6379/8787；SSH 只允许固定源。
- [ ] HTTPS、HSTS、CSP、frame 拒绝、MIME sniffing 防护生效。
- [ ] CORS 无 `*`，allowlist 与唯一预发布 origin 一致。
- [ ] Nginx 与应用均限制 body、超时和速率。
- [ ] 日志只含事件、路径、状态、耗时和脱敏 request id。
- [ ] health 不显示环境值、endpoint、namespace、密码或 key。
- [ ] safe_mock/fallback/live_ai 标签不可混淆，mock 不计入真实 AI 证据。
- [ ] Actions 高危依赖审计、secret scan、bundle scan 全绿。
- [ ] Redis 备份恢复、旧 token 重放拒绝、并发重复提交已演练。
- [ ] 回滚镜像不可变且经过 health 验证。

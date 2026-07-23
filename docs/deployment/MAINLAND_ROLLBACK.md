# 大陆预发布备份与回滚

## 部署前

1. 确认上一版本不可变镜像仍在本机/受控镜像仓库。
2. 执行 `backup-mainland.ps1` 或 `.sh`，保存 Git SHA、镜像标签和镜像 ID；脚本不导出环境变量。
3. 在腾讯云控制台确认 Redis 自动备份成功，必要时创建人工备份并记录恢复点 ID。
4. 执行深度 health，记录当前基线。

## 应用回滚

执行 `rollback-mainland.ps1 -ImageTag <approved-tag>` 或对应 shell 脚本。脚本只切换已有镜像并执行 health，不修改 DNS，不恢复 Redis。

若 health 失败：停止继续发布，保留日志与 manifest，人工恢复上一已知健康镜像。不要删除新镜像或 Redis 数据，直到事故复盘完成。

## Redis 恢复

Redis 恢复是独立的高风险控制台操作。先确认故障属于数据损坏而非网络/白名单/密码问题；由两人复核恢复点、预计丢失窗口和影响 namespace 后，在腾讯云控制台恢复。恢复后验证 health 200、session/attempt 继续、已消费 token 仍拒绝、namespace 无交叉污染。

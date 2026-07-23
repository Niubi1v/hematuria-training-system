# 阿里云备选运行手册

当组织已有阿里云合同、备案接入、VPC、Tair 或运维团队时，方案 B 可替代腾讯云，应用代码和镜像不变。

## 选择轻量还是 ECS

- 单机审阅 POC：轻量应用服务器，需设置与 Tair VPC 的同账号、同地域内网互通。
- 已有 VPC、需要更明确的安全组/扩容/监控：ECS 直接放入 Tair 所在 VPC，优先于轻量。
- 轻量首次开通内网互通可能发生短暂停机，必须在空载窗口执行。

官方参考：[轻量内网互通](https://help.aliyun.com/zh/simple-application-server/user-guide/manage-service-interconnection/)、[Tair 连接准备](https://help.aliyun.com/zh/redis/user-guide/connection-preparation)、[TLS](https://help.aliyun.com/zh/redis/user-guide/configure-ssl-encryption)、[备份恢复](https://help.aliyun.com/zh/redis/user-guide/backup-and-restoration-solutions)。

## 人工控制台步骤

1. 完成阿里云账号和域名主体准备。
2. 购买中国内地轻量/ECS；与 Tair 选择同地域。
3. 创建 Tair/Redis 实例，不申请公网端点。
4. 轻量：配置 VPC 对等内网互通；ECS：放入同 VPC/可路由交换机。
5. 将应用私网 IP/网段加入 Tair 白名单，拒绝 `0.0.0.0/0`。
6. 核对产品版本是否支持 TLS；需要时下载 CA 并用 `rediss://` 或 `REDIS_TLS=true`。
7. 设置自动备份与保留期，发布前手动备份。
8. 安全组只开放管理员来源的 22，以及公众 80/443。
9. 在阿里云完成 ICP 接入/备案后再解析并开放审阅子域名。

## 应用部署

服务器安装 Docker Engine/Compose 后，与腾讯 runbook 相同：

```bash
cp .env.mainland.example .env.mainland
chmod 600 .env.mainland
# 填写 Tair 私网端点、独立 secret、正式 Origin 和环境命名空间。
./scripts/deploy-mainland.sh managed .env.mainland https://<审阅子域名>
```

环境差异仅应是 Redis 端点/CA、域名、地域和云控制台策略。不得为了 Tair 改写医学数据或浏览器 API 地址。

## 备案提醒

阿里云说明使用中国内地节点时须在实际接入商完成备案；ECS 等备案资源有地域、计费时长和公网带宽要求，执行时以最新控制台校验为准：[阿里云 ICP 流程](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-application-overview)、[备案服务器检查](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-server-access-information-check)。

# 中国大陆同域部署 POC 架构

## 决策摘要

首个 POC 选择 **腾讯云轻量应用服务器 + Docker Compose + 腾讯云分布式缓存数据库（兼容 Redis）**。仓库中没有发现既有阿里云合同、代金券、备案主体或专有网络资产，因此遵循任务默认优先级。腾讯云轻量应用服务器提供 Docker 场景，中国内地轻量实例需要备案；轻量实例与云数据库默认不互通，需在同地域通过云联网关联 VPC。参考：[腾讯云 Docker 环境](https://cloud.tencent.com/document/product/1207/60423)、[轻量服务器内网互联](https://cloud.tencent.com/document/product/1207/56847)、[Redis 内网连接](https://cloud.tencent.com/document/product/239/30877)。

这只是工程推荐，不代表已购买资源、已完成备案或已证明腾讯云在所有地域更快。若组织已有阿里云企业合同、备案接入、VPC、Tair 运维能力或折扣，应切换方案 B；应用镜像和 `REDIS_URL` adapter 无需改代码。

## 两家云方案比较

| 维度 | 方案 A：腾讯云轻量 + Redis | 方案 B：阿里云轻量/ECS + Tair |
|---|---|---|
| 首次 POC | 轻量实例上手快，符合默认选择 | 轻量同样可用；已有 VPC 时优先 ECS |
| 容器 | Docker CE 应用模板可用 | 轻量或 ECS 安装 Docker Compose |
| 托管 Redis 私网 | 轻量 VPC 与 Redis VPC 需同地域并关联云联网；避免网段冲突 | 轻量与 Tair 默认不互通，需同账号同地域设置 VPC 对等互通并配置白名单；ECS 同 VPC 更直接 |
| TLS | Redis/Valkey 支持 SSL 通道与 CA | Tair/Redis 支持 TLS，但需核对实例类型和版本 |
| 备份 | 自动/手动 RDB，备份存入 COS | RDB/AOF 等策略；默认每日 RDB，按产品支持恢复到新实例 |
| 备案 | 中国内地轻量实例需备案；备案资源通常需购买至少 3 个月 | 中国内地服务器在阿里云接入备案；ECS 备案资源需满足地域、时长与公网带宽条件 |
| 迁移成本 | Docker 镜像、环境变量、标准 Redis 协议 | 同一镜像；只替换私网端点、CA 和运维步骤 |
| 当前仓库合同证据 | 未发现 | 未发现 |

阿里云相关依据：[轻量内网互通](https://help.aliyun.com/zh/simple-application-server/user-guide/manage-service-interconnection/)、[Tair 连接准备](https://help.aliyun.com/zh/redis/user-guide/connection-preparation)、[Tair 备份恢复](https://help.aliyun.com/zh/redis/user-guide/backup-and-restoration-solutions)。

## 目标拓扑

```text
教师浏览器
  HTTPS https://review.example.cn
           |
           v
  Nginx :80/:443
  - 80 -> 443
  - TLS 终止、安全头、128 KiB、外层限流
  - / 和 /api/** 均代理到 app:3000
           |
           v
  Next.js Node + Vercel API compatibility server
  - 完整页面，不做大陆静态导出
  - DeepSeek/Azure 仅服务端调用
  - attempt/session/stage capability 验证
  - 脱敏结构化访问日志
           |
           v（仅私网）
  腾讯云 Redis / 阿里云 Tair
  - 标准 Redis 协议、AUTH、可选 TLS
  - 无公网地址/公网白名单
  - 24 小时 attempt TTL、原子 Lua、环境命名空间
```

本地 POC 使用 Compose `local` profile 启动 Redis 7.4 AOF；云上 `managed` 模式不启动本地 Redis，而连接托管私网端点。Redis 不经 Nginx、没有宿主机端口映射。

## 与现有 Production 的隔离

- 大陆专用构建设置 `MAINLAND_RUNTIME=1`，仅此时关闭 `output: "export"`。
- Vercel/GitHub Pages 默认构建、Upstash REST 变量和 `hematuria:attempt:v1:*` 键保持原状。
- 大陆浏览器的 `NEXT_PUBLIC_API_BASE_URL` 留空，所有请求使用 `/api/**`。
- 大陆 Redis 键为 `hematuria:<REDIS_NAMESPACE>:attempt:v1:*`；预发布、生产、测试必须使用不同命名空间。
- 本分支不包含云密钥，不修改 `data/**`，不修改医学审核状态，不触发 Vercel Production。

## Redis adapter 选择

| 明确模式 | 所需变量 | 行为 |
|---|---|---|
| `upstash` | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`，或 Vercel KV REST 写凭据 | 保留现有 REST/Lua 实现 |
| `redis` | `REDIS_URL`，或 `REDIS_HOST/PORT/USERNAME/PASSWORD/TLS`；还需 `REDIS_NAMESPACE` | 腾讯云 Redis、Tair、本地 Redis |
| `memory` | 无 | 仅显式本地开发；生产健康检查不认为其训练状态就绪 |
| 缺失/未知 | 无 | Production fail-closed，训练 API 返回不可用 |

标准 Redis adapter 设置连接和命令超时、有限指数退避；错误日志不打印 URL、用户名、密码、命令参数、Prompt、token 或训练内容。

## 云资源清单（人工购买）

- 1 台中国内地腾讯云轻量应用服务器，建议起步 2 vCPU / 4 GiB / SSD，Ubuntu 24.04 LTS 或受支持的 Docker CE 镜像。
- 1 个同地域腾讯云 Redis/Valkey 实例，POC 可用最小主从规格；禁止公网地址。
- 1 个 VPC、轻量 VPC 到 Redis VPC 的同地域云联网关联；网段不得冲突。
- 1 个已实名且完成 ICP 备案的审阅子域名。
- 1 张该子域名 HTTPS 证书。
- 快照/镜像与 Redis 自动备份策略；日志轮转和基础监控告警。
- 可选：镜像仓库。首个 POC 也可在服务器从专项分支本地构建，避免把密钥放入镜像。

最终规格必须在大陆教师压测后调整；当前不提供价格承诺。

## 性能验证计划

同一提交、相同病例、相同安全 mock 或相同 DeepSeek 模型参数，对大陆预发布与 Vercel Preview 分别测试，不主观预设胜负：

| 指标 | 地域/方法 |
|---|---|
| 首页及病例页加载 | 北京、上海、广州，记录 DNS/TCP/TLS/TTFB/LCP/总资源 |
| session | 预热后各 30 次，报告 P50/P95、错误率 |
| 中文/英文回答 | 各 30 次，分别记录端到端 P50/P95、DeepSeek 首 token/总耗时 |
| 20 轮会话 | 每地域至少 10 组，成功率、重复/超时/恢复 |
| 稳定性 | fallback 率，401/403/429/5xx，Redis 重连，刷新与双击 |
| 冷/热 | 容器重启后的首请求与稳定热请求分开报告 |

服务端只记录计时、状态码、路由模板、request ID 和 fallback 原因枚举；不记录问题正文、回答、Prompt、训练 token 或密钥。测试结果应包含样本数、时间窗、网络条件和置信限制。

## 预发布就绪门槛

代码具备开始“资源准备和内网 POC”的条件，只有全部满足下列项才可开始公网大陆预发布：

1. 用户完成账号/域名实名认证、资源购买、同地域私网、白名单和 ICP 备案。
2. 证书安装，80 仅跳转 443，Redis 无公网入口。
3. 服务器 `.env.mainland` 通过双人审阅，所有 secret 独立生成。
4. 本地 Compose 深度检查、Redis 停机恢复、当前全部 42 病例（现有 ID 为 P001–P012 与 HX-ADD-001–030）七阶段/双语/20 轮 E2E、bundle 与 secret 扫描全绿。
5. 备份恢复演练和镜像回滚演练有记录。
6. 医疗教育内容是否涉及前置审批由备案顾问/法务确认。

## 本地 POC 验证记录（2026-07-23）

以下是本专项分支的本地证据，不是云上或真实 DeepSeek 性能结论：

- Node 22.14 多阶段镜像构建成功；大陆动态构建与原静态导出构建均成功，82 个页面路径生成。
- Compose 的 Nginx、Next.js、Redis 7.4 AOF、内部安全 LLM mock 四个服务健康。
- HTTP 与本地自签 HTTPS 深度检查均通过：首页、病例目录、P001、health、attempt、session、history-log、幂等和改变重放拒绝。
- 标准 Redis adapter 集成检查通过：写、读、24 小时 TTL、幂等消费、旧 token/改变重放拒绝、命名空间隔离、客户端重连。
- Redis 容器重启后原 attempt 可继续；Redis 停止时 health 为 503，恢复后为 200。
- 中英文各 20 轮成功：中文 `safe_mock=12 / rule_fallback=5 / safety_boundary=3`；英文 `safe_mock=10 / rule_fallback=7 / safety_boundary=3`；`live_ai=0`。
- 无头 Chrome 通过：页面渲染、全部 API 同域、`safe_mock` 标记、刷新保留 attempt、双击只产生一次 stage-feedback。
- 本地 TLS 检查通过 HSTS、CSP、nosniff、frame deny；使用的是一天有效的自签证书，只证明配置路径，不能替代正式 CA 证书。
- 完整非浏览器回归通过，包括 42 病例、84 个双语七阶段旅程、588 次阶段提交、84 份 360 分报告；repository secret 扫描和静态 bundle 扫描通过。

未验证项：真实 DeepSeek、腾讯云/阿里云托管 Redis、ICP 后正式域名证书、大陆多地域 P50/P95、真实教师 20 轮体验。安全 mock 的输出只计为 `safe_mock`，不计为真实 AI 通过。

## 推荐 Production Goal 选择性引入

在大陆 POC 验证完成后，可独立评审并选择性 cherry-pick：

1. 标准 Redis adapter 与配置/隔离测试。
2. 健康检查中的 durable store 可达性字段。
3. 脱敏 Node 访问日志和 Redis 超时/重连策略。

Docker、Nginx、大陆 runbook 和 `MAINLAND_RUNTIME` 应先保留在专项分支，不应直接引入当前 Vercel Production Goal。

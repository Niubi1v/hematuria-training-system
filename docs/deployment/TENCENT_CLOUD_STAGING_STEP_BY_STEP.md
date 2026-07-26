# 腾讯云大陆预发布人工操作清单

适用架构：腾讯云 CVM + 腾讯云分布式缓存数据库（兼容 Redis）+ Docker Compose + Nginx。CVM 与 Redis 必须同地域、同 VPC，并位于同一子网或具备明确的内网互通路径。本文不授权自动购买、部署 Production、修改 DNS 或提交备案。

## 购买前固定边界

- 预发布与 Vercel、未来 Production 使用不同的域名、Redis namespace、签名密钥、DeepSeek key 和备份。
- Redis 只使用私网地址，不开通公网地址或 CLB 外网转发。
- DeepSeek 只由服务端调用；任何 key 都不得使用 `NEXT_PUBLIC_` 前缀。
- 浏览器只访问同域相对路径 `/api/**`；Nginx 只向内部 `app:3000` 转发。
- `safe_mock`、`rule_fallback`、`safety_boundary` 与 `live_ai` 必须分开统计；本地 mock 不能作为真实 DeepSeek 验收。
- 不在聊天、工单、截图、Git、命令历史或部署清单中粘贴密码、完整连接串、私钥、Cookie、Authorization 或 API key。

## 资源建议

本地 Compose 功能验证的空闲样本约为：应用 75 MiB、Nginx 31 MiB、本地 Redis 10 MiB、safe mock 20 MiB，合计约 136 MiB；应用镜像约 191 MB。该样本只支持购买前估算，不是并发容量证明。

| 项目 | 最低受控试运行 | 推荐预发布 | 说明 |
|---|---|---|---|
| CVM | 2 vCPU / 4 GiB | 4 vCPU / 8 GiB | 推荐规格为构建、日志、滚动重启及真实 AI 验收留余量 |
| 镜像 | Ubuntu Server 22.04 LTS 64 位 | 同左 | 不选择应用市场镜像 |
| 系统盘 | 50 GiB 高性能云硬盘 | 80 GiB 高性能云硬盘 | 开启快照；构建缓存和旧镜像需受控清理 |
| 公网带宽 | 3 Mbps | 5 Mbps；多人验收可选 10 Mbps | 按流量或按带宽由预算决定；购买后以真实 P95 调整 |
| Redis | Redis 7.0、标准架构、1 主 1 副本、1 GiB；若该地域不可售则选控制台最小容量 | Redis 7.0、标准架构、1 主 1 副本、2 GiB，多可用区 | 开启自动备份；内存达到 60% 前评估扩容 |

地域不写死：优先选择主要教师网络时延低、CVM 与 Redis 均有目标规格、备案和运维团队可支持的同一地域；购买后再从主要教师所在地采集真实网络与 AI P95。安全组入站仅允许固定运维源 IP 的 TCP 22，以及业务需要的 TCP 80/443；不向公网开放 3000、6379、8787 或 Docker daemon。

## 控制台顺序

### 1. 完成账号实名认证

- 控制台入口：账号中心 → 账号信息/实名认证。
- 用户选择：与备案主体一致的个人或企业认证类型。
- 推荐值：计划以单位提供培训服务时使用单位主体；备案负责人信息与证件保持一致。
- 敏感记录：主体证件、负责人身份信息、手机号码、认证订单；只保存在腾讯云受控流程，不能发进聊天。
- 完成标准：账号显示实名认证已通过，主体名称与预期备案主体一致。

### 2. 创建 VPC

- 控制台入口：私有网络控制台 → 私有网络 → 新建。
- 用户选择：尚未确认的目标地域、VPC 名称、IPv4 CIDR。
- 推荐值：使用与现有网络不重叠的 RFC1918 网段，例如从 `10.0.0.0/8` 中规划一个 `/16`；创建前由网络负责人复核。
- 敏感记录：VPC ID、CIDR、账号/项目归属；ID 可用于内部部署记录，不发外部聊天。
- 完成标准：VPC 状态可用，并能看到默认路由表。腾讯云说明同一 VPC 下子网默认可内网互通：[私有网络产品概述](https://cloud.tencent.com/document/product/215/20046)。

### 3. 创建子网

- 控制台入口：私有网络控制台 → 子网 → 新建。
- 用户选择：上一步 VPC、目标可用区、子网 CIDR、路由表。
- 推荐值：在 VPC 内划分一个不重叠 `/24`，使用默认路由表；CVM 与 Redis 优先放同一子网，或确保跨子网默认路由未被 ACL 阻断。
- 敏感记录：子网 ID、CIDR、可用区。
- 完成标准：子网可用，所属 VPC/地域正确，CIDR 不与现有子网重叠。参见[创建子网](https://cloud.tencent.com/document/product/215/36517)。

### 4. 购买 CVM

- 控制台入口：云服务器控制台 → 实例 → 新建/购买云服务器。
- 用户选择：计费模式、地域、可用区、VPC/子网、实例规格、系统盘、公网带宽。
- 推荐值：短期验收可按量计费；最低 2 vCPU/4 GiB，推荐 4 vCPU/8 GiB；选择上一步 VPC/子网，不启用不需要的额外公网服务。
- 敏感记录：实例 ID、公网 IP、私网 IP、订单和账单信息。
- 完成标准：实例为运行中，私网 IP 属于目标子网，公网 IP/带宽与预算一致。

### 5. 选择 Ubuntu 22.04

- 控制台入口：CVM 购买页 → 镜像 → 公共镜像。
- 用户选择：Ubuntu Server 22.04 LTS 64 位。
- 推荐值：选择当前可售的最新安全补丁镜像，不选“应用市场”预装栈；首次登录后启用安全更新和时间同步。
- 敏感记录：镜像 ID和实例初始化时间；不记录登录凭据。
- 完成标准：登录后 `lsb_release -a` 或 `/etc/os-release` 显示 Ubuntu 22.04，系统时间正确。

### 6. 确认 CVM 规格

- 控制台入口：CVM 购买页 → 实例规格/机型。
- 用户选择：满足预算的通用型实例。
- 推荐值：受控试运行 2 vCPU/4 GiB；预发布 4 vCPU/8 GiB；系统盘分别 50/80 GiB。
- 敏感记录：实例规格代码、单价、计费周期和预算审批号。
- 完成标准：规格与购买审批一致，磁盘和带宽不低于上表，未误购 GPU/裸金属等无关资源。

### 7. 配置 SSH 密钥

- 控制台入口：云服务器控制台 → SSH 密钥 → 新建密钥；购买页选择“密钥登录”并绑定。
- 用户选择：创建或导入专用预发布公钥。
- 推荐值：一环境一密钥；禁用共享密码登录，私钥由批准的密码库或受控终端保存。
- 敏感记录：私钥文件、私钥口令和任何可登录信息；腾讯云提示私钥只能下载一次，必须妥善保存。参见[SSH 密钥](https://intl.cloud.tencent.com/document/product/213/6092)。
- 完成标准：批准的运维终端可用 `ubuntu` 用户通过密钥登录；未授权终端不能登录。

### 8. 配置 CVM 安全组

- 控制台入口：云服务器控制台 → 安全组 → 新建/规则管理。
- 用户选择：自定义安全组并绑定 CVM。
- 推荐值：入站 TCP 22 仅固定运维公网 CIDR；TCP 80/443 按预发布访问范围放行；显式不开放 3000、6379、8787；出站只保留系统更新、官方依赖源、DeepSeek 和必要腾讯云服务。
- 敏感记录：安全组 ID、运维源 IP/CIDR 和规则审批记录。
- 完成标准：公网端口扫描只看到获批的 22/80/443；安全组未使用“放通全部端口”。参见[创建安全组](https://cloud.tencent.com/document/product/213/112613)。

### 9. 购买腾讯云 Redis

- 控制台入口：腾讯云分布式缓存数据库（兼容 Redis）控制台 → 新建/立即购买。
- 用户选择：与 CVM 相同地域、相同 VPC，优先相同子网；Redis 版、兼容 Redis 7.0、标准架构、1 主 1 副本。
- 推荐值：试运行 1 GiB（或目标地域可售最小容量），预发布 2 GiB、多可用区；按量计费便于购买前期控制成本。
- 敏感记录：实例 ID、内网 endpoint、端口、账号和密码；完整连接串不能发进聊天。
- 完成标准：实例为运行中，网络类型为私有网络，VPC 与 CVM 一致。腾讯云明确要求 CVM 与 Redis 选相同地域才能直接内网通信：[快速创建实例](https://cloud.tencent.com/document/product/239/30871)。

### 10. 配置 Redis 白名单/安全组

- 控制台入口：Redis 实例详情 → 安全组（若控制台同时提供访问白名单，则进入访问管理/白名单）。
- 用户选择：绑定 Redis 专用安全组，只允许 CVM 安全组或 CVM 私网 IP 访问实例端口。
- 推荐值：TCP 6379（或购买时选择的自定义端口）仅从应用私网来源放行；不要放行 `0.0.0.0/0` 或整个公网。
- 敏感记录：Redis 安全组 ID、CVM 私网 IP、账号和密码。
- 完成标准：CVM 内网可连接；非 VPC/非白名单来源不能连接。参见[绑定安全组](https://cloud.tencent.com/document/product/239/41260)。

### 11. 确认 Redis 仅内网访问

- 控制台入口：Redis 实例详情 → 网络信息/连接管理。
- 用户选择：只保留自动分配的内网地址，不开通外网地址，不创建 Redis 的 CLB 外网监听。
- 推荐值：CVM 和 Redis 同账号、同地域、同 VPC；如需跨子网，仅使用受控 VPC 路由。
- 敏感记录：内网 endpoint 和完整认证信息。
- 完成标准：控制台无公网地址；公网无法连接；CVM 使用内网地址 `PING` 成功。腾讯云文档说明 Redis 默认提供内网地址：[Redis 外网服务说明](https://cloud.tencent.com/document/product/239/100541)。

### 12. 上传部署包

- 控制台入口：CVM 控制台 → 实例 → 登录；文件传输使用批准的 SCP/SFTP 或腾讯云文件上传能力。
- 用户选择：本任务生成的带 SHA256 清单的干净部署包。
- 推荐值：在服务器创建专用低权限部署用户和版本目录；上传后先核对归档 SHA256，再解压；不在 CVM 保存 GitHub 凭据。
- 敏感记录：CVM 地址、用户名和私钥路径；私钥不能进入部署包。
- 完成标准：归档 SHA256 与交付值完全一致，解压目录无 `.git`、`node_modules`、`.next`、真实 `.env`、QA 大证据或本机绝对路径。

### 13. 写入服务器环境变量

- 控制台入口：通过 SSH 登录 CVM，在版本目录基于 `.env.mainland.example` 人工创建 `.env.mainland`。
- 用户选择：唯一预发布 origin、Redis 私网配置、Redis namespace、训练签名、DeepSeek 服务端配置及限流。
- 推荐值：`TRAINING_ATTEMPT_STORE_MODE=redis`、唯一 `REDIS_KEY_PREFIX`、`MAINLAND_SAFE_MOCK_LLM=false`（真实验收时）；文件权限 `0600`，所有秘密分别生成且不复用。
- 敏感记录：`.env.mainland` 全部真实秘密、完整 `REDIS_URL`、DeepSeek key、签名 secret、证书私钥；不得粘贴到聊天或命令参数。
- 完成标准：无 `<...>` 占位符；无 `UPSTASH_*`、`KV_*`、Vercel Automation Bypass；所有 allowlist 等于唯一预发布 origin；secret scan 不输出值。

### 14. 启动 Docker Compose

- 控制台入口：CVM SSH 终端。
- 用户选择：仓库既有 `docker-compose.mainland.yml`、`Dockerfile`、`nginx.conf.example` 和 `scripts/deploy-mainland.sh`。
- 推荐值：先安装腾讯云 Ubuntu 22.04 支持的 Docker Engine 与 Compose plugin；运行 `bash scripts/deploy-mainland.sh managed .env.mainland https://<预发布域名>`。备案/证书未完成时，只在受控网络内使用临时 health 方式，不对公众开放。
- 敏感记录：不要把任何环境变量值或认证头写入命令、日志或截图。
- 完成标准：`docker compose ps` 中 app/nginx 健康，Node 3000 和 Redis 端口未发布到公网。

### 15. 检查 health

- 控制台入口：CVM SSH 终端和受控浏览器。
- 用户选择：运行 `node scripts/healthcheck-mainland.mjs --base-url=https://<预发布域名>`。
- 推荐值：同时检查 `/api/health/`、首页、病例页、attempt 幂等和 session；再执行 Redis 停止/恢复演练。
- 敏感记录：只记录状态码、布尔配置状态、Git SHA 和耗时；不记录 endpoint、namespace、token 或训练正文。
- 完成标准：正常时 health 200 且 durable store configured/reachable；Redis 断线时 503，恢复后 200，原 attempt 可继续。

### 16. 完成备案、域名、DNS 和 HTTPS

- 控制台入口：ICP 备案控制台 → 我的备案；DNSPod/云解析 DNS 控制台；SSL 证书控制台 → 我的证书。
- 用户选择：独立预发布子域名、首次备案或接入备案、指向 CVM 公网 IP 的解析、与域名一致的证书。
- 推荐值：先完成域名实名认证和所需备案，再人工添加 DNS；申请 RSA 证书，Nginx 使用完整链和私钥；验证 TLS 1.2/1.3、续期和到期告警。
- 敏感记录：备案主体材料、DNS 控制权限、证书私钥和验证记录。
- 完成标准：备案状态符合当地要求，域名解析正确，HTTPS 链完整，HTTP 跳转 HTTPS。参见[备案限制](https://cloud.tencent.com/document/product/243/18911)和[SSL 证书申请](https://cloud.tencent.com/document/product/400/6814)。

### 17. 执行真实 DeepSeek 验收

- 控制台入口：CVM 服务端环境配置、应用受控验收页面和腾讯云日志/监控；不在浏览器配置 key。
- 用户选择：批准的 DeepSeek 账号、模型和受控测试时间窗。
- 推荐值：执行中英文各 20 轮、P001 英文纠错/澄清、P037/P038 多轮、history-log、第一/七阶段、双击和刷新；来源必须为 `live_ai`/DeepSeek 且 `isFallback=false`。
- 敏感记录：DeepSeek key、请求/响应正文、训练 session/attempt 标识；仅保存脱敏统计。
- 完成标准：真实调用和日志同步达到验收阈值；任何 `safe_mock`、fallback 或本地结果都不计为真实 DeepSeek 通过。

### 18. 验证回滚

- 控制台入口：CVM SSH 终端；Redis 控制台 → 备份恢复（仅数据确实损坏且经双人复核时）。
- 用户选择：上一个已批准不可变镜像标签，以及对应的 Redis 恢复点（如确需恢复数据）。
- 推荐值：部署前运行既有 `backup-mainland.sh` 生成无密钥 manifest；应用故障用 `rollback-mainland.sh <approved-tag> .env.mainland https://<预发布域名>`；不要默认回滚 Redis。
- 敏感记录：镜像仓库认证、Redis 恢复点、故障日志中的潜在敏感内容。
- 完成标准：旧镜像启动后 deep health 通过；Redis 恢复若执行，必须再验证 token 重放拒绝、namespace 隔离和 attempt 连续性。

## 用户购买后只需回传的非敏感信息

- 已选择的地域和可用区名称；
- CVM 规格、系统盘大小和公网带宽；
- VPC ID、子网 ID、安全组 ID；
- CVM 私网 IP和是否已分配公网 IP（无需提供登录信息）；
- Redis 实例规格、VPC/子网归属、端口和是否仅内网（不要提供 endpoint、账号、密码或完整 URL）；
- 计划使用的预发布域名，或暂未确定；
- 备案状态、证书状态、备份策略状态；
- 允许的运维源 CIDR 是否已配置（无需在公开聊天发送具体家庭/个人 IP，可只回答“已配置”）。

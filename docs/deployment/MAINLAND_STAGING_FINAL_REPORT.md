# 大陆预发布集成最终报告

状态：本地集成与绿色门禁已完成；专项分支推送和 GitHub Actions 结果仍须作为购买前的最后确认。不得据此自动购买资源或开始公网预发布。

## 来源与 Git 边界

- 初始 Production 来源 HEAD：`141f5bb64dc7a74e83f9bc1d9615197eb543d970`
- 更新后的绿色 Production 基线：`c4ac9b5a59021bed10dc2d94c4ebf4d8f97badd2`
- POC 来源 HEAD：`b753dca077881e5692fc44c7665b88fdb5054579`
- merge-base：`70ea9b3c7b31e11a84878de5c277cac60f35481c`
- 专项分支：`codex/hematuria-mainland-staging-integration`
- 最终 HEAD：以本文件所在专项分支的推送 HEAD 为准；精确 SHA 记录在任务最终回执中。

没有 merge/cherry-pick 整个 POC，没有修改或推送 Production Goal/main，没有创建 PR，没有部署、购买资源、修改 DNS 或保存真实云密钥。

## 基线核验

2026-07-23 初始 Production HEAD 的 Vercel 状态为成功，但 GitHub Actions run `30008877764` 失败在 `pnpm audit --audit-level high`。随后 Production 更新到绿色基线 `c4ac9b5`，包含精确依赖修复、审计证据、Preview 上下文追问黑盒测试和 QA P1 远端验证收口；专项分支已用普通 merge 合入，没有整体 merge 旧 POC。专项保留 `redis@6.1.0`，并与 Production 一致固定 Next.js/相关 ESLint 包 `15.5.21`、`sharp@0.35.0`、`brace-expansion@1.1.16`/`5.0.7`。

合入后 `pnpm audit --audit-level high` 退出码为 0，当前为 0 high、0 critical、1 moderate。剩余项是 Next.js 内嵌 `postcss@8.4.31` 的 `GHSA-qx2v-qp2m-jg93`；风险场景需要攻击者控制传入 PostCSS stringify 的 CSS 并构造未转义 `</style>`。本系统运行时不接收、解析或 stringify 用户 CSS，CSS 仅来自受控仓库构建输入，因此当前应用路径不可达。直接覆盖 Next 内嵌构建依赖可能破坏 Production 兼容性，本专项不为追求 audit 全零进行无依据替换；继续跟随 Next.js 官方兼容升级。

依赖下载只使用 `registry.npmjs.org` 与 `cdn.sheetjs.com`。SheetJS 继续使用既有固定 tarball `xlsx-0.20.3.tgz`，完整性仍为 `sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==`；没有改用 `latest`，也没有改变其锁文件完整性。

## 实施结果

- Docker/Nginx：多阶段非 root 镜像、Compose、同域代理、TLS 模板、CSP、限流、内部端口合同已实现。
- Redis：标准协议、TLS/私有 CA、显式 adapter、namespace、TTL、Lua 原子提交、幂等缓存、重放拒绝和重连已实现；Upstash 分支保留。
- Health：生产必要配置或 Redis 不可达返回 503，恢复后可返回 200；响应不含变量值。
- 同域：Mainland runtime 使用相对 `/api/**`，Vercel Preview 逻辑保持同源；Nginx 传递 Host/Origin/协议/IP/request-id。
- safe_mock：provider 返回带独立标记，不能计为 live_ai。
- 部署/回滚：部署脚本拒绝占位符；备份脚本只写无密钥 manifest；回滚脚本只切换已有不可变镜像。
- 云与合规：购买清单、腾讯云 Runbook、阿里云备选、VPC/安全组、ICP备案、DNS 与 HTTPS 人工清单已提供。
- AI/性能：真实 DeepSeek、20 轮、browser、三地域 Vercel 对照脚本和统计合同已提供。

## 当前本地证据

- PASS：`pnpm install --frozen-lockfile`、高危 audit、TypeScript、ESLint、全量行为与医学治理测试。
- PASS：最新 Patient Agent 为 840/840 自然问法、1428/1428 canonical checks、3150/3150 矩阵；HEM-P1-051 英文纠错、澄清、P037/P038 多轮、provider fallback 与下一轮恢复通过。
- PASS：Data Agent 新展示合同为 28 个待审 metadata、23 个英文不可用 order name、英文 API CJK 信号 0，且 `dataChanged=false`。
- PASS：标准构建生成 82 个静态页面；bundle 扫描覆盖 25 个 JavaScript 资产；repository secret scan 通过。
- PASS：Playwright 共 82 项，80 passed、2 个预期矩阵跳过；42 例中英文七阶段流程通过。
- PASS：Docker 多阶段 Node 22.14 镜像、Compose、HTTP Nginx、应用、Redis、safe_mock 均健康；只有 Nginx 绑定 `127.0.0.1:8080`，Node、Redis、mock 未暴露公网端口。
- PASS：深度 health 覆盖页面、health、attempt、幂等、session；中英文各 20 轮全部成功，safe_mock、rule_fallback、safety_boundary 标签可区分，未将 mock 计为 live AI。
- PASS：Redis 写入、读取、TTL、并发幂等、重放拒绝、旧 token、namespace 与重连；真实 stop/restart 演练得到 health `503 -> 200`、API 故障期 503，恢复后原 attempt token 可继续。
- PASS：浏览器同源 API、刷新、双击提交与来源标签；限流 429 已实际触发，相关恢复逻辑另有行为测试覆盖。
- PASS：仓库 secret scan；`data/**` 零差异；`git diff --check`。
- PARTIAL：HTTPS Nginx 模板具备 TLS/CSP 配置，但真实证书链、自动续期与公网域名只能在用户购买资源并完成备案后验收。
- NOT RUN：真实 DeepSeek、三地域公网对照、云 Redis 备份恢复；这些需要用户后续提供资源和授权，不能由 safe_mock 代替。

本地 Windows 工具链当前由受管 Node 24 提供，因此本地行为/Playwright结果不能单独声称为 Node 22 完整门禁；Docker 构建、82 页生成与 Redis adapter 已在固定 `node:22.14.0` 镜像内通过。最终 Node 22 完整门禁以专项分支 push 后的 GitHub Actions 为准。

## 规格

空闲本地 Compose 实测：应用约 75 MiB、Nginx 约 31 MiB、Redis 约 10 MiB、safe_mock 约 20 MiB，总计约 136 MiB；应用镜像 191 MB。该数据是空闲/功能验证样本，不是并发峰值容量证明。2 vCPU/4 GiB 仅作为小规模受控试运行下限，4 vCPU/8 GiB 作为更稳妥的预发布候选；扩容按 CPU/内存/5xx/health/Redis/20 轮成功率门槛触发。横向扩容前必须把 agent/TTS admission store 迁移到共享 Redis。

## 用户必须人工完成

选择地域、创建 VPC/子网/CVM/腾讯云 Redis、设置 Redis 白名单与安全组、购买/备案域名、DNS、HTTPS 证书、监控告警和备份、在服务器写入真实环境变量、授权并执行真实 DeepSeek、三地发起对照测试、批准部署和回滚。

## 绿色门禁与购买结论

以下均通过后，才具备购买小规格资源并开始受控大陆预发布的条件：

- [x] 依赖安装与高危 audit 通过。
- [x] TypeScript、ESLint、全量测试、42 例双语七阶段、Playwright、构建通过。
- [x] bundle/secret scan 通过，`data/**` 零差异。
- [x] Docker Compose safe_mock：Nginx、Redis、同域、20 轮、双击、刷新通过。
- [x] Redis stop/restart：health 503 -> 200，已有 session/attempt 继续。
- [ ] 当前分支普通推送，并以 workflow_dispatch 取得绿色 Actions。
- [ ] 购买后真实 DeepSeek 与三地域对照按计划执行。

当前购买结论：**本地工程条件已具备，须等待专项分支普通 push 后的 GitHub Actions 绿色结果，再由用户决定是否购买最小受控预发布资源**。即使 Actions 绿色，真实 DeepSeek、三地域公网对照、证书、备案和云 Redis 恢复仍是购买后的上线前门禁；不得用 safe_mock 的 `live_ai=0` 结果替代。

## 推荐回集成 Production Goal 的提交

待专项分支验证通过后，建议按小步提交选择：

1. 标准 Redis adapter + attempt/circuit/health 与单元测试；
2. Mainland runtime + Docker/Compose/Nginx；
3. 部署、备份、回滚、live AI/地域测试脚本；
4. 大陆购买、安全、备案与 Runbook 文档；
5. 独立的依赖安全升级提交。

不要回合并整个专项分支，也不要把大陆环境值带入 Vercel 或正式 Production。

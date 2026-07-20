# 教师验收版本差异矩阵

更新时间：2026-07-20 CST

## 可审计结论

导师测试的公开入口是 `https://niubi1v.github.io/hematuria-training-system/`。GitHub Pages 配置为 `workflow`，发布来源为 `main`；最新公开 deployment `5410354110` 对应 `5a3ad1199ae5e591160f12e410260287f0051875`，创建于 2026-07-12 06:26 UTC。页面自身页脚同样显示代码版本 `5a3ad11`、构建时间 `2026-07-12T06:25:40Z`。

导师截图中的 `/cases/HX-ADD-004/index.html?mode=random` 在公开站点实际打开当前显示病例 P016，证明其使用旧内部路由映射。该旧构建的 `api/training-action.js` 只允许 `Content-Type, X-Training-State`，没有允许浏览器实际发送的 `X-Request-Id`，所以从 `https://niubi1v.github.io` 到旧 Vercel Production API 的 OPTIONS 预检被浏览器阻止。这是 CORS 合同缺陷，不是“国外网站慢”。

## 版本矩阵

| 目标 | SHA | Patient intent | 病例路由 | 浏览器 API origin | 第一阶段提交 | 当前 canonical 优化 |
|---|---|---|---|---|---|---|
| 公开 GitHub Pages | `5a3ad1199ae5e591160f12e410260287f0051875` | 旧 Patient Engine / 平铺匹配 | P001–P012 为当前 ID；P013–P042 仍由 `HX-ADD-*` 内部 ID 生成 | 绝对跨域 Production API | `X-Request-Id` 未列入允许头，导师路径可稳定触发预检失败 | 否 |
| `main` | `5a3ad1199ae5e591160f12e410260287f0051875` | 同公开 Pages | 同公开 Pages | 静态站显式 Production API | 与公开 Pages 同基线 | 否 |
| Vercel Preview（审计时最新 Production Goal） | `657ba5da8fc6460ad7d0deea882a010c40938b40` | 15 canonical intents / 190 aliases | P001–P042 当前 ID | 相对 `/api/**` 同源 | 既有 Preview 黑盒已通过；须由本轮新部署重新验证 | 是，但不含本轮四个专项提交 |
| Production Goal 远程（集成前） | `657ba5da8fc6460ad7d0deea882a010c40938b40` | 15 canonical intents / 190 aliases | P001–P042 当前 ID | Vercel 同源；Pages 构建时显式受控 API | 当前实现包含 session/attempt 恢复与精确 CORS | 是 |
| 自主优化专项 | `02ac49925a517cfd7f847eac0b2297cd8113f3ba` | 扩展自然问法，3150/3150 + 1008/1008 | 当前 ID | 继承 Production Goal 同源合同 | 继承并补 session API 边界 | 是 |
| 本轮本地候选 | 以本文件所在提交为准 | 已选择性引入四个专项提交；另有白名单受限语义分类 fallback | 当前 ID | Vercel 同源；Pages 精确跨域白名单 | 保留所有 session、签名、attempt 和恢复校验 | 是 |

## 自主优化提交处理

| 原提交 | 状态 | 本分支提交 | 审查结果 |
|---|---|---|---|
| `43d6535` Patient Agent 自然问法 | CHERRY_PICKED | `79fd6fa` | 不修改 `data/**` 或医学极性；1008 自然问法门禁加入 |
| `ae58b3d` 患者语言、病例目录和英文开场 | CHERRY_PICKED | `db28ef8` | 修复等待 attempt ready 与英文开场恢复；不覆盖重连/日志同步 |
| `8ac5721` session API 边界 | CHERRY_PICKED | `f9976f1` | 只接受公开字段并拒绝过长幂等键；保留签名与绑定 |
| `6ec6c8b` 跨平台报告门禁 | CHERRY_PICKED | `b116dc0` | 仅调整测试对 CRLF/LF 的可靠识别 |

四项均为逐提交引入，没有整体 merge 自主优化分支，没有修改医学事实、419 条审核决定、`needs_revision`、Redis 凭据、360 分算法或 Production 环境变量。

## 仍需部署后验证

- 本轮外部 OPTIONS 请求因执行环境到 Vercel 连接超时，未取得线上响应头；本地 handler 合同通过不能替代线上结果。
- Draft PR 新 HEAD 的 Node 22、Actions、Vercel Ready SHA 和真实 Preview 第一阶段提交必须重新记录。
- GitHub Pages 只有 `main` 合并后才会产生新正式构建；当前禁止以手工部署或修改已通过的当前路由来掩盖旧 Pages 基线。

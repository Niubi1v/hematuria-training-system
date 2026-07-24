# 依赖、供应链与 CI 审计

## 基线与工具限制

- `packageManager`: pnpm 11.7.0；`engines.node`: `>=22.14 <23`。
- 本机仅有 Node 24.14.0，因此所有本地门禁均带 engine warning，不能替代规定 Node 22.14 CI。
- `pnpm audit --prod --audit-level moderate` 于 2026-07-13 查询 registry，退出 1，报告 2 high + 1 moderate。公告命中不等同已证实利用；以下结合仓库输入面分级。

## DCI-P1-001：SheetJS 0.18.5 命中两条 high 且存在工作簿解析输入面

- 级别：P1
- 位置：`package.json:72`（`xlsx`）；解析入口包括 `scripts/apply-medical-review-candidate.ts:349-351`、多个 `scripts/convert-*.ts`，以及未公开但仍保留的 `src/components/RctResearchClient.tsx:209`、`TeacherClient.tsx:128`。
- 风险：audit 报告 GHSA-4r6h-8v6p-xvw6（prototype pollution，`<0.19.3`）和 GHSA-5pgg-2g8v-p4x9（ReDoS，`<0.20.2`）。
- 触发条件：CI/开发者/未来教师端解析恶意或未经信任的 xlsx；公开 practice 当前构建未导入 RCT/Teacher client，降低浏览器直接利用面。
- 后果：转换/CI 拒绝服务、对象污染引起后续逻辑异常；不能仅凭公告断言远程代码执行。
- 外部利用：当前公开站不可直接上传；恶意 PR/工作簿供应链或未来启用上传时可触发。
- 医学安全：是；转换结果污染可能影响病例/评分数据。
- 隐私/密钥：间接；CI runner 或导入数据可能受影响。
- 最小修复：迁移到维护且包含修复的分发版本/替代库；解析放入资源受限隔离进程，限制文件大小/公式/工作表/单元格并校验输出 schema。
- 推荐测试：公告 PoC 的安全化回归、超大 regex 工作簿超时、prototype key 拒绝、恶意 PR CI 隔离。
- 权限/裁决：依赖升级后需重新验证 42 例/572 事实/419 状态/360 分；医学事实不应自动变化，若变化需人工裁决。

## DCI-P2-002：Next 内嵌 PostCSS 8.4.31 命中 moderate

- 级别：P2
- 位置：`pnpm-lock.yaml` 中 `next@15.5.19 -> postcss@8.4.31`；直接 dev dependency 为 8.5.15，不会替换 Next 内嵌副本。
- 风险：GHSA-qx2v-qp2m-jg93 描述 CSS stringify 对 `</style>` 未转义导致 XSS。
- 触发条件：不可信 CSS/AST 内容进入受影响 stringify 并被内联到 HTML；当前仓库 CSS 为受控源，未发现运行时用户 CSS 输入。
- 后果：条件满足时构建产物可注入脚本。
- 外部利用：当前较低；恶意 PR/供应链内容可触发。
- 医学安全：间接。
- 隐私/密钥：XSS 成功后可读取同源 localStorage。
- 最小修复：升级 Next 到解析到修复 PostCSS 的受支持版本，或使用官方确认的 override（需完整构建回归）。
- 推荐测试：含 `</style>` 的安全 fixture 构建后不得生成可执行标签。
- 权限/裁决：不需医学裁决。

## DCI-P1-003：所谓幂等性脚本成功后仍改写生成基线

- 级别：P1
- 位置：`package.json:35,63`；`scripts/test-conversion-idempotency.ts:1-23`；工作流补充检查 `deploy.yml:40-44`。
- 风险：`pnpm run test:idempotency` 从当前文件取 first hash、执行转换、再取 second hash，只证明“一次转换前后”相等的内部定义；本次命令退出 0 并打印 69 文件通过，但工作树随后有 CASE_DATA_QC_REPORT 和大量 `data/**` 修改。
- 触发条件：提交的生成基线与转换链输出漂移。
- 后果：本地开发者被 exit 0 误导；CI 只有后续 `git diff --exit-code -- data` 才会失败，而且 `CASE_DATA_QC_REPORT.md` 不在该 diff 范围。
- 外部利用：否。
- 医学安全：是；生成病例/审核/评分数据出现不可解释漂移。
- 隐私/密钥：否。
- 最小修复：测试开始前记录 Git 基线或使用临时目录，转换后直接对 HEAD 比较全部受控输出（包括根报告）；无论成功失败都清理工作树副作用。
- 推荐测试：故意使一个 committed JSON 和根报告漂移，脚本自身必须非 0；运行后工作树必须保持原状。
- 权限/裁决：修复脚本不需医学裁决；任何数据差异需按既有 419/needs_revision 流程人工审查。

## DCI-P2-004：Pages workflow 权限、触发与供应链约束过宽

- 级别：P2
- 位置：`.github/workflows/deploy.yml:4-16,24-35,111-127`。
- 风险：`pages:write` 和 `id-token:write` 位于 workflow 全局，使 PR build job 也申请不需要的权限；Actions 用可移动 major tag 而非完整 SHA；push `master` 也可部署；所有 PR/push 共用 `concurrency.group=pages` 且不取消旧运行。
- 触发条件：同仓库 PR、被移动/劫持的 action tag、意外 master 推送或大量 PR 构建。
- 后果：最小权限不足、供应链可复现性降低、main/master 发布混淆、排队阻塞发布。
- 外部利用：取决于 GitHub fork 权限降级、环境保护和分支保护；这些外部配置未验证。
- 医学安全：间接，错误分支可发布旧/未审医学内容。
- 隐私/密钥：workflow 未引用 secrets；OIDC 权限仍应只给 deploy job。
- 最小修复：build job `contents:read`；deploy job 单独 `pages:write/id-token:write`；Actions pin SHA；只保留权威发布分支；分离 PR 与 deploy concurrency。
- 推荐测试：fork PR 权限审计、master/main 触发表、并发队列和 Pages environment approval 测试。
- 权限/裁决：需仓库管理员验证分支/环境保护；不需医学裁决。

## DCI-P1-005：CI 没有依赖漏洞门禁，测试覆盖会把安全绕过当成功

- 级别：P1
- 位置：`.github/workflows/deploy.yml:22-109`；`scripts/test-training-api.ts:58-69,122-127`；`scripts/test-agent-api-security.ts` 只导入新版两个 handler。
- 风险：CI 不运行 dependency audit/SBOM/license/来源检查；安全测试未枚举旧 API、不测历史 token 回放、阶段前结果释放或 session 强制，反而断言 practice 复用 LLM key 和直接下单成功。
- 触发条件：存在已知漏洞或安全边界回归但既有正向测试全部通过。
- 后果：绿色 CI 对发布安全产生错误保证。
- 外部利用：是，具体利用见 SRA-P1-001 至 006。
- 医学安全：是。
- 隐私/密钥：间接。
- 最小修复：加入锁定策略、审计/SBOM；新增全路由矩阵和反向安全测试；将 practice 密钥复用、无阶段下单从“期望行为”改为拒绝。
- 推荐测试：见安全缺陷各项；CI 还应在构建后扫描全部静态文本、source map、artifact 和历史新增。
- 权限/裁决：dependency policy 需仓库维护者；不需医学裁决。

## CI/发布事实

- PR 会运行 build，但 `Upload Pages artifact` 和 deploy job 均通过 `github.event_name != 'pull_request'` 跳过；从仓库 YAML 看，Draft PR 不会由此 workflow 部署 Pages Production。
- push main 或 master 会部署 Pages；Vercel 的 Preview/Production 触发、环境变量 scope、Draft 行为、Deployment Protection、回滚和 alias 均不在仓库 YAML 中，标记“外部配置未验证”。
- workflow 使用 Node 22.14/pnpm 11.7，与 package engines 一致；本地 Node 24 不一致。
- artifact 路径只上传 `out/`；本次 out 无 source map/trace，bundle 未匹配隐藏诊断样本。GitHub artifact 保留期与访问控制未验证。

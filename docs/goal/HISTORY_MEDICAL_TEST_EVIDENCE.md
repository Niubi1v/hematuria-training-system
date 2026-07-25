# P001–P042 病史医学协调测试证据

- 基线：`1566f7c21aabbd30eff2e30abf9924e214d1b7a4`
- 生成时HEAD：`fbe39d724fcad84d3757a7cfffc5398f418c1e89`
- 运行日期：2026-07-25（Asia/Shanghai）。
- 运行时提示：仓库声明 Node `>=22.14 <23`；本地Codex bundled runtime为 Node 24.14.0，因此pnpm会给出engine warning，但下列定向测试、TypeScript、ESLint与构建结果以实际退出码为准。

## 定向回归

| 范围 | 命令 | 预期／已验证证据 |
|---|---|---|
| 42例中英文病史矩阵 | `pnpm test:history-medical-reconciliation` + `pnpm test:history-matrix` | PASS — 42例；37个双语槽；blocked canonical zh/en隔离 |
| 医学极性／双语隔离 | `pnpm test:bilingual-conflict-quarantine` + `pnpm test:clinical` | PASS — HEM-P0-023 18项隔离；419 author_added事实保持待审 |
| 572事实／419审核约束 | `pnpm test:medical-review` + `pnpm test:medical-review-queue` | PASS — 572 = 153 source + 419 simulation；8张工作表；无伪造批准 |
| canonical intent | `pnpm test:patient-intents` + `pnpm test:patient-semantic-classifier` | PASS — 3150个改写问题命中率100%，0极性错误；语义分类器通过 |
| Patient Agent | `pnpm test:patient` + history routing/safe projection/compound history/chief complaint | PASS — 786个compound场景；被阻塞项目不进入确定性回答、收集或评分 |
| 360分 | `pnpm test:scoring-v3` + `pnpm test:adversarial` | PASS — 42例360分、单调性、同义词、反摘要投机及对抗评分 |
| 工程门禁 | `pnpm typecheck` + `pnpm lint` + `NEXT_PUBLIC_API_BASE_URL=https://api.example.test next build` | PASS — TypeScript、ESLint、82/82静态页production build |
| bundle／secret | `pnpm test:bundle` + `pnpm test:secrets` + scanner自测试 | PASS — 25个JS资产；359个tracked/candidate文件；无秘密值输出 |
| data差异 | `pnpm test:idempotency` + `git diff -- data/**` | PASS — clean HEAD隔离worktree中78个受控输出首轮与基线一致、第二轮无漂移；差异清单限定为19个授权数据文件 |

## 核心不变量

- 事实总数：572；source 153；author_added_for_simulation 419。
- 本专项阻塞：14；HEM-P0-023：18；HEM-P0-001 source标记冲突：151。
- HEM-P0-023原始18项值不被生成脚本覆盖。
- 所有被阻塞canonical slot在中英文提问下均返回自然不确定表达，`collectableSlotIds=[]`、`collectableFacts=[]`。
- 42例 `medicalReview.status` 保持 `needs_revision`；没有工程生成的 `expert_approved`。

# Hematuria AI Clinical Interview Training System 生产目标

状态：执行中，尚未达到生产验收。
基线日期：2026-07-12；最新工程检查点：2026-07-19（Asia/Shanghai）。
目标分支：`codex/hematuria-production-goal`，起点 `5a3ad11`。

## 唯一目标

在不改变既有42例医学内容、七阶段训练流程、360分唯一总分和公开练习边界的前提下，建立可复现、可审计的工程基线；修复经证据确认的稳定性、安全和数据契约缺陷；专项分支普通push和Draft PR已完成，是否转Ready、合并或进入生产验收仍由负责人另行决定。

## 当前已确认基线

- 本轮完成度审计从已同步且工作树干净的`3a16f9314d1b3cf50e30bc41dcfeaf19f4fa77a8`开始，ahead/behind为`0/0`；已验收应用代码树为其父提交`51f9c6fc8543ac0b6a5907fc65974cd72027f67b`，后续仅更新审计文档时不得改变该应用证据边界。
- Draft PR #1保持Open/Draft；最终Actions run `29547532678`在Node 22.14下completed/success，完整72项Playwright步骤用时8分06秒，82页build、bundle、repository secret scan和clean gate均通过，Pages deploy按Draft规则skipped。
- 42例均保持 `needs_revision`、`formalUseAllowed=false`。
- 医学审核队列为572条审核追踪项：153条来源追踪项和419条模拟补充事实。419条不得自动 approved；42例不得批量解除 `needs_revision`。
- 151条 `source` 记录的辅助字段“是否程序或AI补充”为“是”，与153/419来源分离口径冲突。主 provenance、queue 和审批状态当前未被自动改变，但该冲突是正式签署与发布前的P0阻断。
- HEM-P0-023的18条双语医学极性冲突已从确定性Patient上下文和评分隔离，裁决包已生成但医学真值、审核人和日期仍为空；不得自动翻转或批准。
- 当前行为/安全/医学治理链、42例×双语七阶段、15-intent/190-alias Patient矩阵、69 JSON幂等、82页双环境构建、25个JS资源bundle扫描及323个tracked/candidate repository扫描均有可重复证据；`data/**`零差异。
- 受保护Vercel Preview已在应用HEAD `51f9c6f`完成health、P003零轮、P001中英文、双向切换、刷新、双击、history-log、10次session及中英文各5次真实DeepSeek；安全runner 8/8且专用输出扫描后删除。Production正式alias、Production 10+5+5和公开Pages新基线仍未获授权或部署，Preview证据不得替代Production。

## 不可回退边界

- 不自动批准医学事实，不伪造审核人、日期、依据或签名。
- 不把模拟事实改成 `source` 或 `expert_approved`，不静默补充影响诊断、分流、治疗、禁忌或评分的正常值。
- 不删除42例、七阶段、教师演示边界或RCT原型；公开 GitHub Pages 仍为 practice-only。
- 学生提交前不得泄露疾病标签、完整病史、检查结果、病例特异漏项、评分点或标准答案。
- Patient Agent 只自然化当前允许事实；LLM不能独立决定数值评分。
- 唯一终末总分为360；只读取服务端验证事件。
- 禁止 force push、历史改写、未知改动的 reset/rebase，以及未经批准的生产部署或环境变量修改。

## 完成条件

以下条件全部满足前，项目状态只能是“执行中”或“阻断”，不得宣称完成：

1. P0缺陷清零，包括151条 source 辅助标记冲突获得具名医学负责人的语义裁决并以受控迁移处理。
2. 42/572/153/419及191/148/80口径不漂移，419条保持人工终签要求，42例继续遵守病例级审批。
3. TypeScript、ESLint、完整行为测试、幂等性、医学审核合同、构建、静态扫描和Playwright在拟发布提交上通过。
4. GitHub Actions、Pages、Vercel SHA/live alias、`/api/health/`、10次session初始化、中文5次和英文5次真实冒烟均有当次证据。
5. Azure未配置时明确 `SKIP`；配置后四种音色必须真实返回 `audio/mpeg`。
6. `TEST_EVIDENCE.md` 记录精确命令、时间、退出码、计数与失败复现；`DEFECT_LOG.md` 无未处置P0。
7. 完成 diff、密钥、PII、静态答案和回滚审查；普通push已获授权并完成，转Ready、合并及生产部署仍须负责人明确授权。

## 权威执行记录

- 计划：`docs/goal/EXECUTION_PLAN.md`
- 进度：`docs/goal/PROGRESS.md`
- 缺陷：`docs/goal/DEFECT_LOG.md`
- 测试：`docs/goal/TEST_EVIDENCE.md`
- 回滚：`docs/goal/ROLLBACK_PLAN.md`
- 交付状态：`docs/goal/FINAL_REPORT.md`

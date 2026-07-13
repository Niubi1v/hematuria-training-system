# 回滚计划

## 原则

- 回滚必须可审计、非破坏性并保留用户与其他Agent改动。
- 禁止`git reset --hard`、force push、rebase或删除未知文件。
- 医学数据不通过手工改生成JSON回滚；必须从不可变源、受控审校输入和生成脚本重建。
- 医学审批状态不能通过回滚脚本批量批准或解除`needs_revision`。

## 当前阶段回滚

当前专项分支`codex/hematuria-production-goal`已普通push，Draft PR #1保持Open/Draft，尚未合并main或执行正式生产部署。若本阶段变更不获接受，最安全处置是保持PR为Draft并在专项分支创建普通revert提交；不得删除worktree、改写历史或影响main及其他工作树。

本轮工程变更包含formal gate、签名secret/health、请求安全、participant key、评分版本、Playwright readiness及CI门禁，必须作为同一受审变更集处理。不能只回滚测试或CI而保留失去门禁的生产实现，也不能只回滚生产实现而保留误导性的通过断言。

UI集成增量的可审计逆序为：证据提交`cdfa51f`、日志重试竞态`789243d`、双层重试`853d819`、手动幂等恢复`2283f19`、工作区UI`6cc1e2a`、视觉Token/目录`dec4e74`、UI审计`c1bdc4a`。回滚时逐项普通revert并在每一步检查依赖关系；此清单是顺序说明，不授权自动执行生产回滚。

## 提交后、部署前

1. 记录拟撤销commit、父commit、文件清单和原因。
2. 使用普通`git revert <commit>`生成可追踪反向提交；不得改写共享分支历史。
3. 在revert提交上重跑typecheck、lint、行为测试、医学合同、构建和静态扫描。
4. 按本任务既有授权，在fetch、diff、测试与密钥扫描通过后普通push专项分支；保存Actions链接和SHA，不push或合并`main`。

回滚复验还必须确认：formal-attempt仍fail-closed；签名secret与LLM key不混用；health不高估配置；Origin/限流/非泄露测试通过；participant key不串线；评分仍为360-event-v1/reportVersion3；generated data diff和repo secret scan没有被绕过。

## GitHub Pages回滚

1. 确认上一个已独立验证的Pages commit SHA；历史声明的`941b7b5`只能作为候选，必须先核对实际部署记录。
2. 优先revert问题commit并让GitHub Actions重新构建，而不是手工覆盖`out/`。
3. 验证base path、42个病例路径、刷新、桌面/移动入口和24 JS安全扫描。
4. 记录Pages deployment ID、目标SHA、开始/结束时间和验证结果。

## Vercel回滚

1. 不修改或导出Secrets；先核对当前live alias和上一个已知良好deployment SHA。
2. 经生产权限批准后，在Vercel将上一个已验证deployment重新提升为live，或部署已通过门禁的revert commit。
3. 回滚后执行health、10次session init、中文/英文各5次；Azure未配置则TTS明确SKIP。
4. 若Pages与Vercel SHA不一致，保持发布阻断并在UI/报告中说明，不伪装一致。

## 数据与医学审核回滚

1. 修改前保存不可变输入文件名、SHA256、生成脚本SHA和69个受控JSON校验和。
2. 生成脚本与生成物由同一owner在独立worktree处理，连续运行两次确认幂等。
3. 对比42/572/153/419、191/148/80、419条`teacherReviewRequired`及42例`needs_revision`。
4. HEM-P0-001在医学负责人裁决前不得“回滚式”批量改为是或否；裁决后迁移必须同时增加153/419分离测试。
5. 任一计数、provenance、审批状态或医学语义漂移立即停止合并。

## 回滚完成条件

- Git、Pages与Vercel目标SHA清晰且一致，或差异被明确阻断。
- 全部门禁在回滚SHA上重新通过。
- 无密钥、PII、标准答案或完整病例进入静态bundle。
- 医学治理计数与状态未被放宽。
- `PROGRESS.md`、`DEFECT_LOG.md`和`TEST_EVIDENCE.md`记录回滚原因、命令、退出码、部署ID和最终状态。

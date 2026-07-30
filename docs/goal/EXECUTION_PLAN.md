# 执行计划

状态：第一阶段审计与本地基线已完成；生产验收未完成。所有阶段按门禁串行推进，P0未清零前不发布。

## 阶段与门禁

1. **仓库与文档基线**：确认HEAD/远程、未提交内容、架构入口、医学口径和测试命令；建立本目录长期记录。已完成，远程 fetch 挂起和生产网络不可达已留证。
2. **医学数据治理裁决**：只读定位151条 source 辅助标记冲突，由具名医学负责人决定辅助字段语义和迁移规则。未获裁决前禁止批量修改、批准或正式发布。
3. **API、会话和恢复**：formal fail-closed、独立签名secret/health、Origin/限流/非泄露和participant命名key已在本地实施并通过专项测试；仍待CI与生产Origin验证。
4. **Patient Agent与语音**：执行42例中英文矩阵、边界/泄露对抗、规则降级和TTS四象限。Azure未配置时只验证浏览器/文字降级。
5. **临床数据契约**：验证查体、检验、影像、内镜、病理、前置条件、重复医嘱和MDT边界；坚持精确 `caseId + orderId -> resultId`。
6. **评分与OSCE**：评分标识已在本地统一为`360-event-v1`/`reportVersion: 3`；仍需CI验证八维360分、服务端事件证据、标准/空/错误/危险/过度检查轨迹及OSCE中途不泄题。
7. **独立QA**：本地专项6/6、行为28/28、Playwright22/22、build52、secret/bundle扫描通过；仍须在拟发布SHA由CI运行generated data diff、仓库secret扫描及全部门禁。
8. **生产验收**：取得授权后才可普通push；等待Actions，核对Pages和Vercel SHA/live alias，再执行health、10+5+5和可选TTS smoke。失败则停止发布并按回滚计划处理。

## 直接子Agent所有权方案

子Agent不得生成下一级Agent。调查可以并行；生产代码写入使用独立worktree或由主线程串行集成。

| Agent | 默认允许范围 | 禁止范围 | 精确测试命令与交付 | 初始模式/写入方式 |
|---|---|---|---|---|
| A 架构与数据流 | `src/lib/trainingContracts.ts`、`attemptState.ts`、`apiConfig.ts`、路由/配置、架构文档 | 病例数据、Patient/TTS、评分核心 | `pnpm run typecheck`、`pnpm run test:attempts`、`pnpm run build`；交付架构图、数据边界和attempt隔离报告 | 先只读；修改用独立worktree |
| B 会话/API/恢复 | `api/health.js`、`api/session/**`、`api/agent-chat.js`、`api/training-action.js`、`server/trainingState.js`、`apiClient.ts`、`aiRecovery.ts` | 病例医学内容、Patient prompt、评分规则 | `pnpm run test:health`、`pnpm run test:session`、`pnpm run test:api-recovery`、`pnpm run test:ai-recovery`、`pnpm run test:training-api`；交付错误分类、恢复和延迟报告 | 先只读；`training-action.js`独占锁 |
| C Patient/语音 | Patient reply主链、`llmClient`、过滤器、`tts.ts`、`api/tts.js`，以及获锁后的客户端对应区域 | 医学审核状态、评分核心、病例批量数据 | `pnpm run test:patient`、`pnpm run test:history-matrix`、`pnpm run test:bilingual`、`pnpm run test:language`、`pnpm run test:agent`、`pnpm run test:tts`、`pnpm run test:tts-api`；交付42例双语、泄露、降级和TTS报告 | 先只读；`ClinicalTrainingClient.tsx`独占锁 |
| D 临床数据契约 | case schema、生成脚本、查体/医嘱/MDT数据及医学审核导入测试 | 自动批准、伪造专家证据、新增病例 | `pnpm run test:idempotency`、`pnpm run test:product`、`pnpm run test:clinical`、`pnpm run test:exam-qc`、`pnpm run test:orders`、`pnpm run test:e2e-contract`、`pnpm run test:medical-review`、`pnpm run test:medical-review-queue`、`pnpm run test:medical-review-import`、`pnpm run test:release-v14`；交付42例合同、69 JSON和医学待裁决清单 | 先只读；脚本与生成物由同一独立worktree owner串行处理 |
| E 评分/OSCE | event/full-process scoring、rubric生成及评分对抗测试 | 直接改`training-action.js`、医学审批状态 | `pnpm run test:scoring-v3`、`pnpm run test:adversarial`、`pnpm run test:history`、`pnpm run test:stage-flow`、`pnpm run test:attempts`；交付标准/空/危险/过度检查轨迹和360分解释 | 先只读；API改动只提交建议，由B或主线程集成 |
| F 独立QA/红队 | `scripts/test-*`、`tests/e2e/**`、测试与安全报告 | 降低断言、修改生产核心实现 | `pnpm test`、`pnpm run typecheck`、`pnpm run lint`、`pnpm run test:e2e`、`pnpm run build`、`pnpm run test:bundle`；交付完整回归、Playwright、安全与失败复现 | 生产代码只读；测试修改用独立worktree |

共享文件处理：`ClinicalTrainingClient.tsx`、`api/training-action.js`、Patient reply主链、评分核心、数据生成脚本与生成JSON必须串行。`package.json`、workflow和本目录文档由主线程最终整合。

## 当前建议顺序

1. 医学负责人裁决151条辅助标记语义。
2. B/A在CI复核独立签名密钥、formal gate、Origin/限流和participant隔离修复。
3. F在CI环境复核移动端offline reconnect、generated data diff和repo secret scan。
4. 完成42例数据、Patient、临床契约和评分回归。
5. 所有无需人工裁决的P0/P1工程项完成且push前门禁通过后，按既有授权普通push `codex/*`专项分支并创建PR；医学/生产阻塞可保留为PR阻断项，不得自动合并或部署。

# 发布前静态安全、隐私、可靠性与工程质量审计

## 1. 实际基线

- 当前工作树：detached HEAD（独立 worktree）
- 目标远程分支：`origin/codex/hematuria-production-goal`
- 实际完整 HEAD：`41b3830a9095c692b3fdbe65a3dbf95b7ece5a37`
- 远程专项分支完整 SHA：`41b3830a9095c692b3fdbe65a3dbf95b7ece5a37`
- 预期 SHA 与远程最新 SHA 完全一致；`git fetch --prune` 后无远程增量。
- 审计开始时工作树干净。门禁会生成数据/QC 文件，均已明确恢复到 HEAD；最终业务代码、医学数据和既有 Draft PR 均未修改。

## 2. 审查范围

审查 `origin/main...HEAD` 的 93 个变更文件（3744 additions / 324 deletions）及其依赖路径，包括全部 `api/`、`server/`、前端训练状态/恢复/存储、数据公开边界、测试、构建、lockfile、GitHub Actions、文档、截图和新增 Git 历史。未攻击外部服务，未读取或输出任何真实密钥，未修改 Vercel/GitHub 设置。

## 3. 总体结论

- 新增 P0：0。
- P1：安全/认证 6 项，依赖/CI 3 项（其中部分交叉）；P2：安全可靠性 3 项、隐私 4 项、依赖/CI 2 项。
- 静态 bundle 没有直接包含抽样诊断、标准小结或检查结果，也没有 source map/trace；这项边界通过。
- 公开 API 仍可绕过阶段锁逐项取得隐藏结果，旧端点和无 session Patient Agent 可脚本化枚举隐藏事实；签名状态可回放重复计分。因此“bundle 不泄露”不等于“隐藏答案安全”。
- TypeScript、ESLint、完整行为链、构建和 bundle scan 在 Node 24 辅助环境通过；规定 Node 22 本地不可用。Playwright 40/40 用例均显示 ok，但命令因 runner/dev server 未退出在 240 秒被工具终止，退出码 124。
- 结论：Draft PR 必须继续保持 Draft；不得发布 Production 或启用 formal assessment。

## 4. 运行命令与退出码

| 命令 | 退出码 | 证据/限制 |
|---|---:|---|
| `git fetch --prune` | 0 | 远程专项 SHA 与预期相同 |
| `git status; git branch --show-current; git rev-parse HEAD; git log --oneline -15` | 0 | detached、干净、HEAD 如上 |
| `git diff origin/main...HEAD --stat/--name-status` 及源码 diff | 0 | 93 files；已人工审查关键路径 |
| bundled `node --version` / `pnpm --version` | 0 | Node 24.14.0 / pnpm 11.7.0；Node 不符合 engines |
| `pnpm install --frozen-lockfile` | 0 | 锁文件安装；Node engine warning |
| `pnpm audit --prod --audit-level moderate` | 1 | 2 high（xlsx）+ 1 moderate（Next 内嵌 PostCSS） |
| `pnpm run typecheck` | 0 | Node 24 辅助证据 |
| `pnpm run lint` | 0 | Node 24 辅助证据 |
| `pnpm run test:secrets` | 0 | 287 文本文件；不覆盖历史/二进制/out |
| `test:agent-api-security`, `test:training-api`, `test:api-recovery`, `test:performance-timing` | 0 | 现有合同通过，但存在反向覆盖缺口 |
| `pnpm run test:idempotency` | 0 | 打印 69 JSON passed，但随后工作树出现大量生成差异；已恢复 |
| `pnpm test` | 0 | 42 例、双语、572、419、360、Patient Agent 等完整链通过 |
| 首次 build 命令 | 1 | 审计命令使用了不存在的 pnpm 路径；非产品失败 |
| `NEXT_PUBLIC_BASE_PATH=... NEXT_PUBLIC_API_BASE_URL=... pnpm run build` | 0 | 52 静态页，`/cases/[id]` 153 kB First Load JS |
| `pnpm run test:bundle` | 0 | 25 JS assets；未发现抽样隐藏答案/密钥 |
| out 全文本隐藏样本扫描、map/trace 枚举 | 0 | hidden-sample-files `[]`；map/trace 0 |
| `pnpm run test:e2e` | 124 | 输出显示 desktop/mobile 40/40 全部 ok；240s 后 runner 未退出 |
| 新增 Git 历史高置信 secret 模式扫描 | 0 | `[]`；二进制历史未内容扫描 |
| 本地 API 只读探针 | 0 | 旧 token 再 score=200；前置 order=200/有报告；旧 CORS=`*`；无 session agent=200 |

## 5. P0/P1/P2 发现摘要

| ID | 级别 | 摘要 | 发布影响 |
|---|---|---|---|
| SRA-P1-001 | P1 | 旧签名状态可回放、分支和重复计分 | 阻止 formal/Production |
| SRA-P1-002 | P1 | 无服务端阶段锁，可提前枚举检查结果 | 隐藏答案阻断 |
| SRA-P1-003 | P1 | 旧 API wildcard CORS、无限流/无界缓存 | 安全/费用/泄露阻断 |
| SRA-P1-004 | P1 | Patient Agent 不强制 session | 隐藏病史可枚举 |
| SRA-P1-005 | P1 | practice 复用 LLM key 签名且无强度校验 | 凭据与完整性耦合 |
| SRA-P1-006 | P1 | Agent 服务端无幂等，重试可重复计费 | 费用/竞态阻断 |
| DCI-P1-001 | P1 | xlsx 两条 high 且转换链解析工作簿 | 供应链阻断 |
| DCI-P1-003 | P1 | idempotency exit 0 仍改写生成基线 | 发布可重复性阻断 |
| DCI-P1-005 | P1 | CI 不审依赖且安全绕过被测试为成功 | 绿色门禁不足 |
| SRA-P2-001/002/003 | P2 | 状态/header 无界、内存限流、timer 清理 | 可靠性/DoS |
| PRV-P2-001..004 | P2 | 本地长期存储、第三方数据流、TTS 碰撞、扫描盲区 | 隐私治理 |
| DCI-P2-002/004 | P2 | PostCSS、workflow 最小权限/分支/Action pin | 供应链/CI |

完整字段、触发条件、最小修复和测试见 `STATIC_SECURITY_DEFECTS.md`、`PRIVACY_AND_LOGGING_AUDIT.md`、`DEPENDENCY_AND_CI_AUDIT.md`。

## 6. 安全、认证与隐藏答案

- 签名验证、case/attempt/mode 绑定和客户端伪造 events 不直接进入 score 的正向设计有效。
- 但状态完全由客户端携带，缺乏权威最新版本，故防篡改不等于防重放。
- 结果 API 精确绑定 `caseId + orderId`，但没有阶段授权；公开 catalog 使全量遍历可行。
- bundle/RSC/HTML 未直接发现长隐藏样本；`cases_public.json` 路由只下发公开字段，teacher/RCT 路由为锁定说明页。
- fallback 来源分类把安全边界与 `live_ai` 分开，专项测试通过；未发现 fallback 冒充 live_ai 的当前路径。

## 7. 隐私与日志

- 服务端/前端 console 日志未见完整问答、Authorization、Cookie、签名、密钥或内部 prompt；隔离日志只含病例/槽位 ID。
- 完整训练问答和作答存在 localStorage，无过期；AI/TTS 会把用户原文发给第三方但缺少公开隐私告知。
- 截图抽样未见身份信息或凭据。现有 scanner 跳过所有截图、xlsx 和 zip，未验证不能写成“全部脱敏”。

## 8. 前后端可靠性

- AbortController、online/offline listener、voiceschanged、OSCE interval 和主要请求 cleanup 已实现；双击锁和 training action queue 有测试。
- 部分 timer 未清理；签名 header 随事件增长；服务端幂等/全局限流不足；旧 cache 可无界增长。
- SSE 的 first-token 指标只在真实 streaming event 到达时记录，非流式不伪造；`Server-Timing` 白名单通过。

## 9. 测试完整性

- 优点：42 例、双语、572 事实、419 pending、360 分、反伪造、刷新恢复、双击、移动端和 axe 均有覆盖。
- 缺口：Playwright 大量 route mock；真实 API 安全边界未被 E2E 覆盖。没有旧 token 回放、阶段前结果拒绝、旧路由矩阵、session 必需、跨实例限流、超大 body/header、第三方隐私 payload 测试。
- `scripts/test-training-api.ts` 将直接下单和 practice LLM key fallback 明确断言为成功，造成错误安全合同。
- `test:idempotency` 自身通过但生成基线漂移；工作流后置 data diff 能发现部分差异，脚本单独运行会误报。

## 10. 外部配置阻塞

- GitHub：branch protection、required checks、fork 权限、Pages environment approval、artifact 保留、force-push 权限均未验证。
- Vercel：Preview/Production 项目绑定、Draft 部署行为、环境变量名称/值/scope、Deployment Protection、Runtime Logs、限流、回滚和 live alias 未验证。
- 第三方：DeepSeek/Azure 数据保留、区域、零保留/训练用途和实际密钥轮换未验证。
- 本地：规定 Node 22.14 不可用；Node 24 结果只能作为辅助。

## 11. 医学人工裁决阻塞

- 419 条审核约束仍为 pending/needs_revision；本审计未改变任何状态。
- HEM-P0-001、HEM-P0-023 及 18 条双语冲突继续按既有文件阻塞；本审计不裁决、不翻译、不批准、不解除隔离。
- 任何 xlsx/转换升级造成的数据差异必须由既有医学审核流程确认，不能以测试通过自动接受。

## 12. 推荐修复顺序

1. 下线旧 API；强制签名 session/attempt；加服务端阶段授权，阻断隐藏结果枚举。
2. 将 attempt 最新 sequence/完成状态和幂等结果放入权威持久存储，修复旧 token 回放与重复计分。
3. 所有环境启用独立强 secret，取消 LLM key fallback；共享限流和 server-side agent single-flight。
4. 升级/隔离 xlsx 解析，修复生成基线幂等门禁并在 CI 加 dependency/SBOM policy。
5. 加 body/event/header 上限、TTL/清除、隐私告知与第三方数据最小化。
6. 收敛 workflow 权限/分支/action pin；用 Node 22.14 重跑全门禁和真实 Preview 安全回归。
7. 工程 P1 关闭后，仍需独立完成既有医学和外部配置验收。

## 13. 可交给 Production Goal 的结构化摘要

```yaml
baseline: 41b3830a9095c692b3fdbe65a3dbf95b7ece5a37
new_p0: 0
release_blocking_p1:
  - stateless_training_token_replay_and_duplicate_scoring
  - missing_server_stage_authorization_and_hidden_result_enumeration
  - legacy_public_api_without_modern_controls
  - patient_agent_session_not_enforced
  - llm_key_reused_for_practice_state_signing
  - agent_request_idempotency_not_enforced
  - vulnerable_xlsx_parser_on_conversion_input_path
  - conversion_idempotency_false_green_against_committed_baseline
  - ci_security_coverage_and_dependency_gate_gap
passed_with_node24_only:
  - typecheck
  - lint
  - full_behavior_suite
  - production_static_build_52_pages
  - bundle_scan_25_js_assets
partial:
  - playwright_40_of_40_test_results_ok_but_process_exit_124
blocked:
  - required_node_22_local_runtime
  - github_and_vercel_external_configuration
  - real_preview_provider_and_logging_validation
  - existing_medical_adjudication
recommendation: keep_draft_do_not_production_deploy
```

## 14. Draft 建议

必须继续保持 Draft。即使没有新增 P0，多个可由外部用户触发的 P1 会破坏隐藏答案、attempt 完整性、重复计分和供应链门禁；外部配置与既有医学裁决也仍未完成。

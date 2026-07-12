# 执行进度

本文件为追加式事实记录。状态词仅使用：通过、失败、待验证、阻断；历史声明不得覆盖当次实测。

## 2026-07-12 第一阶段

- 已核对原目标仓库：`main`、本地HEAD和`origin/main`均为`5a3ad11`；GitHub API compare显示main与`5a3ad11`一致。
- `git fetch --prune` 首次运行挂起约30秒后被终止，未登记为成功。未执行merge、rebase、reset、push或部署。
- 原仓库tracked diff为clean；八份交接文档及审核产物为未跟踪内容，未被误提交。
- 已完整审计交接文档、架构、package scripts、CI、医学审核数据和主要API入口。
- 已建立隔离worktree，分支为`codex/hematuria-production-goal`，起点`5a3ad11`；尚未push、尚未创建PR。
- 已完成本地基线：typecheck、lint、27/27行为门禁、69 JSON幂等、52页build、24 JS bundle扫描、4/4医学审核合同测试通过。
- Playwright全量21/22；移动端offline reconnect失败。随后同一失败场景定向重跑1/1通过，故登记为“存在波动，CI全量待复核”，而不是无条件通过。
- 普通和提权环境运行生产smoke均为`fetch failed`。健康接口、10次session init、中文5次、英文5次以及live alias均为待验证。
- GitHub connector仅确认`5a3ad11`的Vercel status为success；Actions、Pages、Pages live alias和Vercel live alias未独立确认。
- 发现P0数据治理阻断：572条追踪项交叉统计为`author_added_for_simulation|是=419`、`source|否=2`、`source|是=151`。现有测试反而要求旧工作簿572行辅助字段全部为“是”，未验证153/419分离。未修改任何医学数据或审批状态。
- 已修正文档中的572术语、五个前端主API入口、Node/pnpm CI版本和生产待验证表述。

## 2026-07-12 工程加固实施

- formal-attempt门禁新增`formalUseAllowed === true`要求；这只是fail-closed准入条件，没有把任何病例的`formalUseAllowed`改成true。当前42例仍禁止正式使用。
- 正式状态签名改为只接受独立`TRAINING_STATE_SECRET`；health也只在该独立secret存在时报告`trainingStateConfigured=true`，不再用LLM key冒充配置完成。
- 评分标识统一为`360-event-v1`，报告版本统一为`reportVersion: 3`。
- `/api/agent-chat`与`/api/session/init`增加Origin白名单、速率限制和非泄露响应约束；错误响应不返回secret、prompt或内部患者资料。
- attempt storage/pointer key增加participant命名隔离，并保留case、mode、language、attempt和schema边界。
- 修复Playwright启动readiness竞态；offline reconnect桌面/移动重复6/6，全量Playwright随后22/22。
- CI新增生成数据diff门禁和仓库级secret扫描；Node/pnpm固定到CI版本，并通过Next legacy ESLint直接插件避免隐式解析差异。
- 工程专项6/6、typecheck/lint、完整行为28/28、69 JSON幂等、Playwright22/22、clean build52、235候选文件仓库secret扫描及24 JS bundle扫描均通过本地门禁。
- lockfile-only frozen offline安装检查退出码0。生成文本归一化后与基线69/69一致；唯一53字节hash差异已确认为CRLF/LF行尾，不是生成内容漂移。
- 上述工程P1均为“本地已修复、待CI确认”。未push、未创建PR、未运行成功的生产smoke，不能宣称远程或生产已完成。

## 下一检查点

- 等待具名医学负责人对151条source辅助标记冲突作出裁决。
- 等待CI复核新增安全、生成数据和Playwright门禁，并在具备生产网络的环境复跑production smoke。
- 所有无需医学裁决的P0/P1工程项和push前门禁完成后，可普通push专项分支并创建PR；HEM-P0-001继续阻断PR合并、正式模式和生产部署。

## 2026-07-12 Git写入权限阻塞与解除

- 尝试按小步提交计划暂存Goal/证据文档时，命令在执行前被权限审查器拒绝；原因是当前Codex提权用量额度耗尽，不是Git冲突或差异审查失败。
- 未绕过权限限制，未改用远程API创建提交，未push、未建PR；`git diff --cached`需在权限恢复后再次确认。
- 本地worktree源码、测试和文档改动仍完整保留；继续完成所有只读Git审计和本地门禁。
- 15:48再次通过GitHub API compare核对：远程`main`仍与`5a3ad11`identical，ahead/behind均为0；当前未发现未知远程提交，但push前仍必须成功执行`git fetch --prune`。
- 15:48只读检查确认`git diff --cached`为空、`data/**`无差异；21条status记录均来自本任务的代码/文档/测试候选改动。
- 20:48权限恢复后，`git fetch --prune origin`在20:48:31–20:48:33成功，exit0；HEAD与`origin/main`比较仍为0/0，无未知远程提交。
- 已创建小步提交：`2bc3305`（运行时安全、状态门禁与专项测试）和`58f456e`（CI生成数据/密钥门禁及Playwright稳定性）。未push、未建PR、未部署。

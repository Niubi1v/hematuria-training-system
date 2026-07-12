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

## 2026-07-12 20:55 状态恢复与拟push复验

- 真实项目仓库使用`main`；`master`引用不存在，`origin/HEAD -> origin/main`。Goal worktree附着在`codex/hematuria-production-goal`，不是detached HEAD。
- Codex界面显示`master`来自外层工作区`C:\Users\admin\Documents\血尿问诊项目\.git\HEAD`指向的独立、未创建提交的`refs/heads/master`；该外层仓库不是血尿项目仓库。这解释了从错误仓库解析项目引用时的`invalid reference`，没有修改全局`safe.directory`。
- 两个真实项目worktree分别为原仓库`main@5a3ad11`和Goal worktree`codex/hematuria-production-goal@c3c18d3`。
- 20个工程文件及7份Goal文档全部存在；工作树干净。20:55再次fetch成功，无未知远程提交或冲突。
- 对拟push SHA `c3c18d3`完成隔离快照复验：typecheck、lint、28/28行为、69 JSON、52页build、24 JS bundle、Playwright22/22、235文件secret扫描和frozen lockfile均通过。

## 2026-07-12 21:01 远程发布阻塞与PR CI加固

- 对`codex/hematuria-production-goal`执行两次普通push，均因无法连接`github.com:443`失败（exit 128）；没有force push、main写入、远程分支变更或Git冲突。
- 为满足“PR可验证、PR不得部署生产”的约束，工作流新增`pull_request`到`main`的验证触发，并对Pages artifact上传及deploy job增加`github.event_name != 'pull_request'`保护。
- GitHub网络恢复后仍须重新执行fetch、diff、测试与secret门禁，再普通push专项分支并创建draft PR；HEM-P0-001继续阻止合并、正式模式和生产发布。

## 2026-07-12 21:05 专项分支已推送

- 第三次联网核验成功：`origin/main=5a3ad11`，本地`dbc819e`相对main领先5、落后0；diff、`data/**`零改动和235文件secret扫描均通过。
- 已普通push `codex/hematuria-production-goal`并建立远程跟踪；没有force push、没有写入main、没有部署。
- draft PR创建受本机缺少GitHub CLI `gh`阻塞；GitHub发布技能要求`gh --version`和认证检查通过后才能继续。PR与CI仍未产生，不得声称远程验证通过。

## 2026-07-12 21:21—21:26 验收矩阵与遗漏测试修复

- 主工作树中的`ACCEPTANCE_MATRIX.md`确认是未跟踪交接文件，且包含把历史生产结果登记为PASS等过时状态；专项分支现已纳入按当前证据校正的矩阵。
- 首次直接运行`test:llm`和`test:agent`均失败，证明原`test`链遗漏两个已声明入口。审查确认断言仍依赖旧profile envelope实现和旧前端端点字面量，而当前实现已改为本地权威profile及`publicApiConfig.patientAgent`。
- 已更新两项契约断言，并把它们加入完整`test`链；随后完整30项行为链exit0，42例中文42×17、英文42×6、临床Agent、恢复、TTS和360评分均通过本地回归。
- TypeScript与ESLint随后exit0。生产DeepSeek 5+5、生产10次session、PR CI与live alias仍为PENDING，不得由本地fixture替代。

## 2026-07-12 21:28—21:31 生产只读冒烟复跑

- 对公开Vercel API执行`node scripts/smoke-production.mjs`，169.2秒后exit1。
- health、10次session初始化、中文5次、英文5次、training action及四个TTS音色均为`fetch failed`或因session失败而跳过；成功样本0，真实AI=0，fallback=0。
- 独立网页访问通道也无法直接打开health URL，搜索无结果；现有证据不能区分服务不可达与执行环境出口限制，因此继续登记PENDING/阻塞，不得宣称生产失败已定位或生产通过。

## 2026-07-13 PR #1与CI

- Draft PR #1已创建，base=`main`、head=`codex/hematuria-production-goal`；PR保持Draft、未合并、mergeable=true。
- GitHub Actions run #42已完成success；build job所有质量步骤成功，PR的Pages artifact上传与deploy job按安全条件跳过。
- 外部Vercel提交状态实际为failure；“Vercel Preview Comments”与部署状态不是同一检查。Vercel bot评论显示Deployment Error且没有preview URL。
- 当前无法访问Vercel部署日志，故未修改代码；只有取得可重复失败日志后才允许实施针对性修复。
- docs证据提交`10a2782`后的Actions run #43亦完成success，全部质量步骤通过、Pages部署步骤跳过；Vercel deployment `14bJLhnhGaJcGuxE56udffnckoLe`再次failure，确认失败可重复但根因日志仍不可见。

## 2026-07-13 Vercel Preview修复

- 用户提供真实Build Log后定位首条根因：生产模式预渲染P001时缺少`NEXT_PUBLIC_API_BASE_URL`并抛错。
- 新增失败测试并实施Vercel同源相对API最小回退；非Vercel生产构建继续要求显式HTTPS origin。
- 专项测试、TypeScript、ESLint、完整31项行为链及Vercel等价52页构建均通过；待普通push后观察PR #1新一轮Actions与Vercel Preview。
- 修复提交`3190b27`已普通push；Vercel Preview转为success，GitHub Actions run #44全绿。PR仍为Draft，Pages artifact和deploy均按设计跳过。

## 2026-07-13 00:54—02:24 Preview实测阻塞专项

- 用户在`cbdc4cf`对应Draft Preview实测到AI状态反复切换、规则库降级、旧失败提示叠加及日志验证不计分；这些问题登记为发布阻塞，PR #1继续保持Draft。
- 匿名复现请求被Vercel Deployment Protection截获：`GET /cases/P001/`返回保护页HTTP 200/3228ms，`GET /api/health/`返回保护页HTTP 200/1732ms，`POST /api/session/init/`返回HTTP 401/302ms。当前执行环境无法取得登录态Preview的真实AI网络时间线；未把保护页当作应用成功。
- 代码根因证据：health effect缺少取消、session init受health结果再次触发、每轮问答把连接状态改为checking、AI回答同步等待history-log、多个警告独立渲染、训练动作并发可竞争签名state、动态Preview同源Origin不在静态默认白名单。
- 已实施：health取消、session初始化单飞与服务端幂等、旧请求/退避可取消、有限连接状态事件、问答不再触发checking、日志异步持久队列/幂等重试/训练动作串行化、单一同步提示、动态Preview严格同源校验、回答生成来源与事实来源分离、英文患者prompt及6轮上下文。
- 本里程碑唯一一次完整门禁通过：完整行为链、24 JS bundle、246文件secret扫描均exit0；桌面/移动Playwright 24/24；Vercel等价生产构建52/52。随后英文retry文案和幂等缓存上限的小改仅运行相关专项、TypeScript与ESLint，均exit0，未重复全量门禁。
- 已按Codex官方当前项目级格式创建`.codex/config.toml`及6个Agent定义；TOML解析、必填字段、唯一name、模型/推理/sandbox约束验证exit0。当前会话无法热重载新Agent清单，实际识别需新会话确认。
- 仍需人工/外部权限的验收：核对Vercel Preview作用域中的变量名称是否齐全并重新部署；在可登录Preview执行真实DeepSeek中文/英文、20轮、日志10/10、P95和自然度人工抽查。未读取、输出或修改任何变量值。
- 已创建两个可回滚提交：`28b82d7`（项目级Agent配置）与`3792980`（AI恢复、日志同步、来源标识及专项测试）；push前fetch确认远程专项分支仍为`cbdc4cf`，无未知远程提交。
- 证据提交`a9ace13`连同前两项已普通push到专项分支；Draft PR #1保持open/draft/mergeable，base仍为main。
- PR head `a9ace13`的GitHub Actions run #46（id `29203919549`）completed/success，build全部步骤通过；Pages artifact与deploy按PR规则skipped。Vercel deployment `7miajb1rg8DuVXPMHB1bG6fFpM8y`及Preview Comments均success。
- 新Preview仍受Deployment Protection影响；in-app浏览器导航在20秒内未取得可交互DOM并超时。没有使用或输出bypass凭据，真实AI验收继续登记为权限阻塞。

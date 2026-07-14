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

## 2026-07-13 02:31—02:55 自主验收循环

- 新增并通过日志503后自动恢复测试：desktop/mobile 2/2；同一history requestId重试，AI回答不被替换。提交`af896d0`，Actions run #48 success，Vercel success。
- 新增快速双击发送与20轮会话稳定性测试：desktop/mobile各2项通过。20轮测试首次因主动中英切换合法地产生两个language session而断言失败，修正基线后证明活跃英文session在20轮内未重复初始化。提交`fde34a2`，Actions run #49 success，Vercel success。
- 新增刷新后pending history-log恢复测试：desktop/mobile 2/2，同一requestId恢复且聊天记录保留。提交`a821200`，Actions run #50 success，Vercel success。
- 用失败测试证明复合问题安全边界被误标`rule_fallback`，最小修复后分类为`safety_boundary`；API安全、AI恢复、Agent Chat、TypeScript及项目Lint入口通过。提交`96d0990`，Actions run #51 completed/success，Vercel success。
- CI持续出现官方Action Node20弃用注释，当前未导致失败，登记为P2；没有在用户体验P0/P1之前扩展修复范围。
- 随后只读自然度抽查发现HEM-P0-023重大双语医学矛盾：严格18条相反陈述、11例、全部待审核。按医学治理规则停止自动数据修复并请求具名负责人裁决。

## 2026-07-13 Spark reasoning summary 兼容修复

- 只读核对项目 `.codex/config.toml`、6份项目 Agent 配置及用户级 `~/.codex/config.toml`；修改前均未显式设置 `model_reasoning_summary`、`model_supports_reasoning_summaries` 或 `reasoning.summary`，用户级配置未修改。
- 三个 Spark 专属角色新增 `model_supports_reasoning_summaries=false`，并统一保留 `model_reasoning_effort="medium"`；Sol、Terra及其他角色未改变。
- 当前安装版本 `codex-cli 0.144.0-alpha.4`；官方配置参考确认该布尔键用于强制不发送 reasoning metadata。
- `scripts/test-codex-agent-config.mjs` 通过，7份项目 TOML 解析通过；`codex doctor` 返回 configuration loaded、0 fail。
- 实际远程 Spark Agent 启动被当前安全审查器拒绝：私有仓库上下文会发送到尚未建立信任的外部服务。未绕过该限制；因此“真实请求不再返回 unsupported parameter”仍需在已批准的受信任会话中复验。

## 2026-07-13 HEM-P0-023 安全工程隔离

- 未修改`data/**`：18条冲突事实的当前值、provenance、`teacherReviewRequired=true`及11例`needs_revision`保持不变。
- 新增固定18项隔离清单；命中冲突字段时不进入确定性Patient Agent上下文、不调用上游AI、不参与评分，仅按会话语言返回自然不确定表达并记录固定reason。
- 修复未匹配fallback泄露与跨语言兜底：中文未知问题不再返回病例摘要；英文未知问题返回自然英文；单字段onset回答不再泄露整段结构化摘要。
- 新增隔离专项、LLM fallback和签名训练状态集成断言；完整32项行为链、TypeScript、ESLint、252文件secret扫描及Vercel等价52页构建全部exit0。
- 生成18行双语医学专家裁决表和说明文档；专家最终值、决定、依据、审核/复核人、日期及导入状态全部留空。HEM-P0-023医学真值仍阻断PR Ready/合并/发布。
- 两个小步提交`ff02d76`与`0d60a90`已普通push；Draft PR #1 head更新为`0d60a90`。Actions run `29206516554` completed/success，Vercel Preview success，Pages deploy按PR规则skipped；PR仍为Draft且未合并。
- 证据提交后当前HEAD `558fadd`的run `29206657625`及Vercel再次success；据此关闭仅缺CI的HEM-P1-002/004/005/010/011/012工程项，生产权限部分继续保持PENDING/BLOCKED。
- 按裁决人反馈扩充HEM-P0-023工作簿：主表新增病种与原始病历索引，并新增11例“原始病历”工作表；内容直接来自`data/cases.json.raw`，未修改病例或专家空白字段。

## 2026-07-13 12:40—12:55 周末自主改进：连接提示收敛

- 恢复检查确认分支`codex/hematuria-production-goal`、HEAD与远程专项分支均为`d9f6c4d`，工作树开始时干净；根目录`ACCEPTANCE_MATRIX.md`继续作为唯一矩阵，未创建重复的`docs/goal/ACCEPTANCE_MATRIX.md`。
- 受保护Preview P001标签页约50秒内未返回DOM，继续归HEM-P1-020权限/可访问性阻塞；没有读取Cookie、Authorization或任何密钥。
- 同一提交的本地P001在1280×720稳定复现两个连接提示叠加；初始化后页面宽度1265/1265，无横向溢出，控制台出现两次脱敏`api_request_failed`。
- 新增失败场景Playwright断言，并以单条件修复让泛化health提示在`sessionInitError`存在时让位；没有修改业务数据、医学事实、审批或`needs_revision`。
- TypeScript、ESLint、AI recovery、API recovery均exit0。本机CI Chromium未安装；本机Chrome Playwright进程未在180秒内完成，因此新增浏览器断言必须由Draft PR Linux CI确认，当前不得提前登记为远程通过。
- 提交`bde01a0`普通push后，Vercel Deployment与Preview Comments通过；Actions run `29225138570`在Playwright阶段失败，32项通过、2项失败，Pages deploy跳过。
- 首条真实失败不是产品末端exit code，而是测试fixture语义不一致：HTTP 503不能满足“网络连接失败”精确文案。已把health/session fixture改为`route.abort("failed")`真实网络中断，保留精确文案及“泛化提示为0”断言，待下一轮CI。
- 修正提交`2520645`已普通push；Actions run `29225349342` completed/success，Playwright、52页构建、类型、Lint、行为、医学合同与安全扫描全部通过；Vercel Deployment及Preview Comments通过，Pages artifact/deploy跳过。PR保持open/draft且mergeState=CLEAN。

## 2026-07-13 UI/UX专项安全集成

- 集成前Production Goal为`74c140fb77844ee557c739112c68076113375e25`；远程UI专项为`a6630a3547c50ec16ddf4dc68ce61578f3e10f62`；merge-base等于`74c140f`，左右提交计数为`0/3`。
- 完整审查UI三项提交后确认其不修改`data/**`、API/server/scripts、医学事实或审批状态、Patient Agent医学语义、连接状态机、签名日志安全、360分算法、环境变量或密钥。关键评分/恢复/Patient服务文件相对基线哈希不变。
- 采用逐项cherry-pick，得到`c1bdc4a`、`dec4e74`、`6cc1e2a`；三次均无冲突，没有用旧分支覆盖Production Goal。
- 集成审查发现UI提交移除了history-log重试耗尽后的手动恢复操作。新增失败场景并恢复同一`requestId`的“重新同步/Retry sync”按钮；不绕过签名、不重复计分、不替换AI回答。
- 本地TypeScript、ESLint、32项完整行为链、专项连接/日志/Patient/临床Agent/360评分、Vercel等价52页构建、25个JS bundle扫描及281文件敏感信息扫描均exit0。
- 69 JSON幂等命令在当前Windows运行环境连续两次无输出挂起（分别约5分钟和7分钟后终止），两次均未产生`data/**`差异；按同一根因两次无效规则停止本机重试，等待Draft PR Linux CI复核。
- 集成后的Playwright在本机浏览器启动阶段超时，未到断言；新增手动同步用例及desktop/mobile完整结果必须以Draft PR Linux CI为准。UI专项既有1280、360、390截图仅作为布局审查证据，不能替代集成后浏览器CI。
- 首轮远程run `29231277833`：69 JSON、generated diff、医学合同、完整行为、TypeScript、ESLint、secret scan及Playwright安装均通过；Playwright 38/40，只有新增手动同步用例desktop/mobile失败。Vercel Deployment与Preview Comments通过，Pages deploy跳过。
- 失败日志证明history-log存在通用请求层与持久队列的双层重试；前三个503后第4次自动成功，未进入失败UI。已将history-log收敛为仅由持久队列三次有界重试，其他训练动作保持原恢复策略；等待相关回归及新一轮CI。
- 修复后TypeScript、ESLint、training API签名/幂等、API recovery与AI recovery专项均exit0；原Playwright断言没有放宽，下一轮由Linux CI直接复跑。
- 第二轮run `29231718708`仍为Playwright 38/40且同一断言失败，Vercel通过。代码追踪确认pending attempts的state写回会立即重启effect并绕过退避，第三次失败后自动第4次成功覆盖failed提示。
- 已为history-log退避加入单一waiting锁；三次失败后effect稳定停止，人工按钮重置队首attempt计数再以原requestId重试。原测试继续要求3次失败、按钮可见、第4次成功与回答唯一。
- 第三轮head `789243d`的Actions run `29232093193` completed/success：Playwright 40/40；69 JSON、generated diff、42例/572/419医学合同、32项行为、360评分、TypeScript、ESLint、281文件secret、52页build及23 JS bundle均通过。Vercel Deployment `YStbn7Yhk3gQPaCdUbF7wWzgmvpT`与Preview Comments通过；Pages artifact/deploy按PR规则跳过。
- Draft PR #1保持open/draft，base=`main`、head=`codex/hematuria-production-goal`、mergeState=`CLEAN`；未转Ready、未合并、未部署Production。

## 2026-07-13 15:40 继续完成审计

- 最终UI证据提交`cdfa51f`的Actions run `29232460170`、Vercel Deployment与Preview Comments全部success；Pages deploy skipped，PR保持Open/Draft/CLEAN，本地与远程专项分支0/0。
- 修正DEFECT_LOG中的陈旧状态：HEM-P1-015已有`gh auth status`、Draft PR及多轮CI证据，HEM-P1-016已有最终完整行为/类型/Lint CI证据，二者均改为已解除；没有改变历史失败记录。
- Chrome可枚举目标Preview P001标签，但两次接管后的DOM/最小标题探针分别在30秒和60秒超时；未读取任何会话凭据或存储。HEM-P1-020继续作为外部权限/连接阻塞，真实DeepSeek、日志10/10、首Token/P95与自然度仍不可验证。
- 更新ROLLBACK_PLAN以反映专项分支已push、PR为Draft及UI七项提交的普通revert逆序；未执行revert、reset、force push、main写入或生产操作。

## 2026-07-13 性能遥测最小增量

- 先建立失败基线：`node node_modules/tsx/dist/cli.mjs scripts/test-performance-timing.ts`因缺少`server/performanceTiming.js`退出1；随后实现固定指标白名单与稳定解析/格式化合同。
- session init、Patient Agent、provider、history-log及score现通过`Server-Timing`暴露非敏感毫秒数；缓存回答不复用旧provider耗时，API JSON不新增内部计时字段。
- 此性能遥测里程碑的production smoke采集session、完整回答、真实provider、history-log、score耗时；当时非流式协议的首Token明确登记为unsupported，后续SSE增量已补齐采集，且从未用完整回答耗时冒充首Token。
- 本地专项与完整32项行为链通过，Vercel等价构建52/52、bundle 25 JS与repo secret 283候选文件通过，`data/**`零差异。TypeScript退出0；项目Lint因当前Codex仅提供Node 24.14而仓库要求Node 22、Rushstack补丁拒绝该运行时，本机退出1，待PR的Node 22 CI复核。
- 未修改医学事实、419审核决定、42例`needs_revision`、360分算法、环境变量或密钥；PR继续保持Draft。

## 2026-07-13 性能增量首轮CI

- `d9155b8`已普通push；Vercel Deployment与Preview Comments通过，Actions run `29234298382`的TypeScript、Lint、完整行为、安全及医学门禁通过。
- Actions唯一失败为Playwright mobile英文切换用例39/40：测试没有等待英文session初始化就发送。已增加对`language=en` session响应的确定性等待，未延长或放宽回答断言。
- 本机定向Playwright因webServer启动条件超时未形成通过证据；新提交必须由Linux CI完整40/40确认。PR保持Draft，Pages deploy继续按设计跳过。
- 修复HEAD `f052d7e`远程复核完成：Actions run `29235062395` build success（3分31秒，Playwright 40/40），Vercel Deployment与Preview Comments success，Pages deploy skipped；HEM-P1-026解除。

## 2026-07-13 首Token SSE工程增量

- 失败基线：`tsx scripts/test-llm-streaming.ts`在旧实现上exit1，首个`data:`触发`response.json()`解析错误，证明非流式实现不能产生真实首Token证据。
- 依据DeepSeek官方`/chat/completions`合同实现SSE：默认仅对`chat_completions`启用，可用`LLM_STREAMING_ENABLED=false`显式兼容非SSE供应商；不修改任何实际环境变量。
- 服务端聚合`delta.content`为原JSON回复；首个`reasoning_content`或`content`只记录时间，思维内容不保存、不返回。live_ai的smoke现在强制要求`provider`与`firsttoken`指标，cache/fallback不冒充真实provider样本。
- 本地33项完整行为链exit0（10.3秒），专项SSE/API/恢复/计时与TypeScript exit0；Vercel等价52/52、25 JS bundle及284候选文件secret扫描exit0（合计16.4秒），`data/**`零修改。等待新HEAD的Node 22 Lint、Playwright 40/40及Vercel远程复核。
- 远程复核完成：`d2c2eb0`对应run `29236606930` completed/success，build 3分35秒，Node 22 TypeScript/Lint、33项行为、Playwright 40/40、52页构建与扫描全部通过；Vercel Deployment及Preview Comments通过，Pages deploy跳过，PR保持Draft/CLEAN。

## 2026-07-13 16:58—17:06 最新Preview黑盒复核

- 最终证据HEAD `98e35b1`对应Vercel deployment `93ejmrajShA85o5fv1cSVq462jNv`为Ready，分支域名仍指向该部署；资源页确认`agent-chat`、`health`、`session/init`、`training-action`、`tts`等7个Node 22函数存在。
- Chrome及Codex应用内浏览器均可打开P001，但约5秒后两次`api_request_failed`并进入降级。手动重连未恢复；一次中文问诊约22.4秒返回自然中文fallback，输入焦点保持、聊天未丢失、单一主连接提示未堆叠，但评分停在pending。
- 只读环境名称核验发现AI供应商变量已覆盖Production and Preview，但未看到`TRAINING_STATE_SECRET`；未读取或修改任何值。部署启用Standard Vercel Authentication且OPTIONS allowlist关闭，跨源预检风险待实际请求路径证据确认。
- Runtime Logs在上述窗口无对应函数调用，直接health导航又被浏览器客户端阻止，因此尚不能给出失败API的HTTP状态或唯一根因。真实AI、日志10/10、首Token/P95仍为外部配置/保护层阻塞；未因此修改生产/Preview环境。

## 2026-07-14 静态发布审计安全里程碑（本地候选）

- `git fetch --prune`成功；远程Production Goal仍为`41b3830`，静态审计报告分支为`70fb5a3`。四份报告只含文档，已以fast-forward方式纳入本地Production Goal；没有引入未知代码或`data/**`变更。
- 已复现旧token回放、并发重复评分、阶段提前枚举、无session Agent调用及旧API绕过。训练状态改为v3能力声明，权威attempt状态由服务端存储；每次变更执行原子CAS和幂等消费，旧token返回409，重复同一请求返回同一已存响应。
- Vercel/serverless不再把进程内Map宣称为持久防重：没有Upstash REST存储时训练attempt/session/Agent路径安全失败503。Preview需要人工配置变量名称`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`、`TRAINING_ATTEMPT_STORE_MODE=upstash`及独立强`TRAINING_STATE_SECRET`并重新部署；没有读取、生成或输出值。
- Patient session改为签名能力并绑定attempt/case/language/mode/有效期；`agent-chat`强制session与幂等键，重复并发provider请求单飞。旧`patient-reply`和`session/complete-profile`生产路径收敛为严格CORS的410，不能再创建session或调用LLM。
- 全服务端阶段锁覆盖history、查体/医嘱、诊断、会诊、治疗、围术期、复盘和score；第一阶段枚举全部医嘱目录、查体、MDT或未来feedback均返回4xx且不泄露结果。重新提交早期阶段会撤销其后提交并回到相应阶段。
- `TRAINING_STATE_SECRET`不再回退到`LLM_API_KEY`；缺失、弱值、示例值或与provider key相同均安全失败。health仅输出布尔配置状态，不泄露值。
- SheetJS从npm `xlsx@0.18.5`切换到官方固定`0.20.3`tarball；七个审核/转换读取入口增加32MB、32 sheet、每sheet 10万行/512列、总100万单元格限制。浏览器端不再解析不可信XLSX；生产依赖审计high门槛exit0，仅余1项moderate。
- 幂等验证器改为隔离临时worktree两次生成并比较，默认不会覆盖当前黄金基线。它真实发现56个受控输出与提交基线不一致并exit1；当前工作树`data/**`保持零差异。该问题不得通过自动更新病例/审核数据解决，继续作为P1治理阻塞。
- CI改为Node 22、最小权限、官方Action SHA固定、high级生产依赖审计、安全专项和最终工作树clean门禁；PR事件仍不执行Pages deploy。
- 本地门禁：聚合行为测试exit0；TypeScript exit0；ESLint exit0；生产构建52/52；bundle 25 JS、仓库secret 294候选文件通过；生产依赖high审计exit0（1 moderate）；桌面/移动Playwright修正安全夹具后40/40并在33.8秒自行退出。
- Playwright首次真实运行34/40，6个失败均来自旧夹具未先初始化训练状态或试图绕过新阶段锁；没有放宽断言。补充训练状态mock、幂等键与七阶段合法推进后专项6/6、全量40/40。
- Draft PR #1在本轮push前仍为Open/Draft，远程HEAD `41b3830`的GitHub build、Vercel Deployment和Preview Comments为success，Pages deploy skipped。新安全候选尚未push/未获CI，不能把旧绿灯记到新代码。
- HEM-P0-001、HEM-P0-023医学裁决继续阻塞；42例`needs_revision`、419条未批准事实、360分算法及双语冲突隔离均未改变。

## 2026-07-14 静态发布终审增量

- 两个独立只读终审均未发现新增P0。安全终审复现三项P1：重复初始化可取回最新bearer、阶段关闭后仍可回填评分证据、session语言/模式可由客户端覆盖权威attempt；供应链终审复现幂等脚本只验证`HEAD`但未拒绝脏候选的证据缺口。
- 初始化幂等重放现只返回原始响应token，不再从权威存储泄露最新token；原始token在状态推进后保持stale。权威存储不再额外保存明文current token。
- 除已提交阶段的显式`stage-feedback`重交外，history/exam/order/mdt/score只允许在其精确当前阶段执行；关闭阶段后的history/order/mdt回填均返回409且权威状态零变化。
- session初始化将语言和规范化模式绑定到权威attempt；capability内部签署`public-practice`/`formal-attempt`，客户端旧显示值仍保持兼容。跨语言或跨模式初始化返回409，Agent校验使用相同规范化规则。
- 幂等验证器现在先对全仓脏状态fail-closed，并明确只验证已提交HEAD；这样不会把未提交候选误报为已验证。56个生成基线漂移仍是独立真实阻塞，未修改`data/**`。
- 新增/补强回归均exit0：`test-training-security.ts`、`test-training-api.ts`、`test-agent-api-security.ts`、`test-dynamic-patient-session.ts`、`test-ai-recovery.ts`、`test-llm-adapter.ts`；TypeScript、ESLint和294文件secret扫描exit0。
- 已创建两个可回滚本地提交：`47a7c58`（权威训练状态/session/阶段/防重放）和`e6cb5b2`（SheetJS、工作簿限制、只读幂等/QC与CI）。尚未push；完整门禁与新HEAD CI仍待本检查点后执行。

### 已提交HEAD完整门禁

- `pnpm run test:idempotency`在干净HEAD上7.7秒exit1，准确列出`CASE_DATA_QC_REPORT.md`与55个`data/*.json`（合计56个）黄金基线漂移；临时worktree自动清理，主工作树和`data/**`保持干净。
- `pnpm run test`在30.7秒exit0，覆盖完整行为链、42例、572项、153/419严格分离、419零批准、18项双语隔离和360分评分。
- 直接Next生产构建18.7秒exit0、静态页52/52。最初的pnpm包装命令和`CI=1` Playwright自动webServer因沙箱拒绝pnpm供应链attestation访问npm registry而等待重试，不是Next或测试open handle；保留超时证据。
- 为复核CI精确入口，授予仅registry访问后运行`pnpm run build`：28.8秒exit0，pnpm供应链策略通过，随后Next 52/52构建通过；没有修改锁文件或tracked文件。
- 显式启动并验证`GET /cases/P001/` HTTP 200后，Playwright desktop/mobile 40/40，42.3秒自行退出；包括axe无serious、双击发送、20轮无重复初始化、离线重连、日志重试、刷新恢复、状态提示与P008评分防伪。
- 最终门禁：bundle 25个JS、secret 294个文件、API origin、production dependency high阈值均exit0；依赖审计仍有1项moderate。`git status`干净、受保护数据零diff。

### Push/PR检查点

- GitHub API只读确认Draft PR #1仍Open/Draft/CLEAN，远程专项分支HEAD仍为`41b3830a9095c692b3fdbe65a3dbf95b7ece5a37`；本地候选在证据提交`cbe5f3d`时领先5、落后0，无未知远程提交。
- `git fetch --prune origin`重试两次均因`github.com:443`连接超时失败；GitHub API对同一ref的实时读取成功并确认SHA未变。
- 两次普通push均未写入远程：首次连接被重置，第二次HTTP/1.1在21秒后连接超时。没有force push、main写入、PR状态变化或部署。
- 当前PR检查仍属于旧HEAD `41b3830`：build success、Vercel success、Preview Comments success、Pages deploy skipped；这些旧绿灯不得登记为本地安全候选CI通过。

### 远程CI与Windows幂等假红修正

- 网络恢复后fetch成功并确认远程为已知祖先；`6fcd325`已普通push。Draft PR #1始终保持Draft，未合并、未部署Production。
- 新head的Actions run `29287786411` completed/success：Node 22.14、生产依赖审计1 moderate/0 high、幂等75受控输出、完整行为、TypeScript、ESLint、secret、Playwright 40/40、52页build、25 JS bundle和最终clean gate均通过；Pages deploy skipped。Vercel Deployment与Preview Comments均success。
- CI绿灯与本地56文件红灯的差异经`git ls-files --eol`定位为Windows系统`core.autocrlf=true`：提交对象`i/lf`被临时worktree检出为`w/crlf`，转换器写LF后产生纯行尾假漂移；不是56个医学/评分基线变化。
- `scripts/test-conversion-idempotency.ts`现仅对隔离worktree的checkout设置`core.autocrlf=false/core.eol=lf`，直接比较提交LF字节与转换LF字节，不规范化JSON、不忽略语义差异。提交`bb130c1`后本地75受控输出、baseline与第二次生成均exit0（11.6秒），主工作树和`data/**`零改动。
- `DCI-P1-003`据此从“阻塞”修正为“已修复，待`bb130c1`新CI确认”；旧证据保留但不再错误描述为真实医学基线漂移。

### 跨平台幂等修复远程验收

- `bb130c1`及证据提交组成head `9d405fd`并已普通push；Draft PR #1未转Ready、未合并。
- Actions run `29288294002` / build job `86945910258` completed/success（4分03秒）：75输出baseline/二次幂等、294文件secret、Playwright 40/40、52页build及最终clean gate真实执行通过；production dependency audit仍为1 moderate/0 high。
- Vercel Deployment `7kTocPAWKiyWiRHd1XEVmLFzmASk`与Preview Comments success；Pages deploy skipped。`DCI-P1-003`工程项正式关闭。
- 仍未通过且不得由CI绿灯替代：Preview Upstash/独立签名变量作用域、真实DeepSeek 10/10与P95/自然度，以及HEM-P0-001/HEM-P0-023具名医学裁决。

### 当前HEAD与Preview增量复验（2026-07-14 06:12—06:18）

- Preview证据提交`30b0d455d276a24ddb77ebfb77c06219e1871e45`已普通push，Draft PR #1保持Open/Draft/CLEAN；GitHub Actions run `29289645684` build success（4分09秒），Vercel Deployment和Preview Comments success，Pages deploy skipped。
- 浏览器实测的代码等价部署URL为`https://hematuria-training-system-dsafq1pj5-niubi1vs-projects.vercel.app`（`10fe60d`）；后续仅文档变化的`30b0d45`部署URL为`https://hematuria-training-system-l0upihrnu-niubi1vs-projects.vercel.app`。P001静态页面可加载，但初始化后稳定显示`回答来源：降级模式`和单一网络失败提示；输入区、聊天记录与重新连接按钮保留，未复现重复提示堆叠。
- 匿名`GET /api/health/`返回HTTP 200但类型为`text/html`，正文是Vercel Authentication/Deployment Protection页面而非应用health JSON。当前可审计根因边界是API链被保护层截获；不能据此判断DeepSeek、Upstash或训练签名handler内部状态。
- 浏览器控制台读取通道两次超时，未取得可归因于应用的console/network事件；没有把浏览器工具自身网络告警记作产品缺陷，也没有伪造请求状态、首Token或P95。
- 本轮仅追加验收证据，不改业务、医学数据、审批状态或环境变量；代码基线仍为`9d405fd`，`10fe60d`为其文档后代。所有安全可执行的静态发布P1已关闭；剩余是Preview权限/变量、生产只读证据和具名医学裁决。

### PRV-P2-003 TTS缓存隔离（2026-07-14）

- 从静态审计剩余P2中选择无需隐私保留期、第三方权限或医学裁决的TTS缓存碰撞。固定碰撞对在旧实现中真实复现：第二个不同文本返回`X-TTS-Cache: HIT`，测试exit1。
- `api/tts.js`改用Node内置SHA-256索引规范化`origin/voice/rate/pitch/text` tuple；缓存项再次保存并严格比较tuple、音频Buffer和过期时间。默认1小时TTL、100项FIFO上限保持，旧Buffer格式缓存会被拒绝并删除。
- 专项覆盖四音色、旧FNV碰撞、精确命中、Origin/语速/音调隔离、TTL、预热并发命中和容量淘汰。代码提交`91b2b23`可独立普通revert。
- 本地证据：TTS/API恢复、TypeScript、ESLint通过；完整行为门禁33.4秒exit0；Vercel等价build 52/52、bundle 25 JS、secret 294文件通过；干净HEAD幂等75项12秒exit0。`data/**`、审核状态、360评分和环境变量零修改。
- 推送前状态：本项当时仍待GitHub Node 22、Playwright和Vercel新Preview确认；Azure未配置，真实四音色继续按目标标记SKIP/PENDING，不能用mock音频冒充。

#### 远程验收

- head `96fcf80`的Actions run `29291035332` completed/success（4分00秒）：Node 22.14实际输出TTS SHA-256 tuple/Origin/参数/TTL/并发/淘汰专项通过，75项幂等、294文件secret、Playwright 40/40、静态页52/52、23个CI bundle资产和最终clean gate均通过。
- Vercel Deployment与Preview Comments success，Pages deploy skipped；PR #1保持Open/Draft，未转Ready、未合并、未部署Production。`PRV-P2-003`工程项关闭；Azure真实音色仍为未配置SKIP/PENDING。

### PRV-P2-004 Secret Scanner覆盖扩展（2026-07-14）

- 旧scanner只读取当前文本并静默跳过xlsx/zip/PDF/图片/音频，也不检查Git历史；静态审计据此把“全仓脱敏”判定为证据不足。
- `25ad0a9`把scanner重构为可测试的非泄露引擎：新增JWT、Authorization/Cookie及常见云凭据规则；受限扫描Office ZIP/gzip文本、二进制ASCII/双对齐UTF-16可见元数据和可达Git文本历史。所有finding只含规则、路径/提交和行号，不含命中值。
- 新专项动态构造假值，覆盖文本、PNG、奇数偏移UTF-16、压缩XLSX、placeholder、已删除历史及不回显；真实仓库295候选文件、36个二进制/Office归档、112提交扫描exit0。
- TypeScript、ESLint及包含新专项的37段完整行为门禁exit0（35.4秒）；已提交HEAD上的scanner专项、真实扫描和75项幂等均exit0。`data/**`、审核状态、医学语义和评分零修改。
- `DCI-P2-002`同时完成可达性复核：唯一moderate是Next稳定版内部PostCSS；无用户CSS处理路径，官方稳定版尚未升级，因此不强制override，保留监控与1 moderate真实状态。

#### 远程确认与当前原子里程碑

- head `52c24325ddd28262458f5eff4f37fe2866d53305`的Actions run `29292415307` completed/success（3分39秒）：Node 22.14、pnpm 11.7、75个受控输出、完整行为、安全专项、295文件repository scan、Playwright 40/40、52/52构建、23个bundle资产和最终clean gate均通过；Vercel Deployment与Preview Comments通过，Pages deploy按PR规则跳过。
- 独立复核确认静态审计九项P1在该HEAD无可复现残余；init重放、关闭阶段回填及session语言/模式绑定的本地专项亦再次exit0。PR继续Draft，Vercel绿灯不替代真实AI、Upstash、签名变量、P95或医学裁决。
- 选择两个直接相关且无需外部权限的P2完成原子修复：`e94721e`在`XLSX.read`前限制ZIP条目、路径、加密/ZIP64、压缩方法、单项16MB及总展开64MB，并补齐row/column/cell测试；`d895e28`让浅Git历史扫描fail-closed、CI checkout完整历史、全依赖high审计、未跟踪文件clean gate、main-only Pages手工发布和按ref并发隔离。
- 失败基线均真实保留：旧工作簿helper忽略`maxExpandedBytes`导致专项exit1；旧workflow静态合同在仅`--prod`审计处exit1。修复后相关专项、医学工作簿/导入、TypeScript、ESLint、完整行为、全依赖high审计、已提交HEAD 75项幂等及295文件全历史secret扫描均exit0。
- `data/**`、医学审核工作簿内容、419条决定、42例`needs_revision`、18条双语冲突和360评分零修改。按用户指令，当前原子里程碑push/CI后不再启动新的静态P2，转入长期QA的HEM-P1-034。

#### 远程验收与QA切换

- 三个原子提交已普通快进push：`e94721e`、`d895e28`、证据提交`04c2a0b`；远程专项分支与本地HEAD均为`04c2a0b0bd61f32d7621651223d10ed0d780ba55`，工作树干净，未force、未写main。
- GitHub Actions run `29294906265` / build job `86966184595` completed/success：Node 22依赖安装与全依赖high审计、75项幂等、医学/行为/评分合同、TypeScript、ESLint、完整历史repository scanner、Playwright、52页构建、bundle扫描和最终clean gate全部success。Pages artifact/deploy在PR分支按策略skipped。
- Vercel Deployment与Vercel Preview Comments均success；PR #1仍Open/Draft，HEAD精确为`04c2a0b`。这些结果只确认工程候选，不宣称真实DeepSeek、Preview日志签名、P95或医学裁决通过。
- 已正式fetch QA分支并确认HEAD `4e3b3b1d107d34e2027229b835e2cbd21ddc61d4`、merge-base `52c24325ddd28262458f5eff4f37fe2866d53305`；仅选择性审查测试/报告，不整体merge。其余静态P2暂停，下一项为HEM-P1-034。

### HEM-P1-034 双语切换attempt token竞态（2026-07-14）

- QA证据先被独立复现：等待中文session 200后切换英文，英文请求header存在但同时与新`attemptId`和`language=en`不匹配，受控session fixture正确返回401 `invalid_attempt_token`；未关闭或放宽服务端校验。
- 根因是客户端用单一token/promise ref保存能力，语言切换的session effect早于清理effect读取旧中文token。`d8c30be`将token和single-flight promise按`attemptId`键控，并在语言切换的同步转换内取消旧session、清空旧能力/队列；旧响应继续受generation/AbortController保护。
- 浏览器专项在desktop/mobile 2/2通过，覆盖中文→英文、刷新恢复、英文→中文、在途英文session后快速反向切换、每attempt仅一次初始化及最终语言不被旧响应覆盖；完整practice回归40/40。
- 受影响合同均exit0：agent/session安全、attempt隔离、training API/security、API recovery、TypeScript、ESLint及295文件secret扫描；`data/**`、医学审核/审批、18条冲突和360评分零修改。
- 提交`d8c30beea1e2fa8085bd42d1a78b64354bc61be8`已普通push。Actions run `29296603010` / build job `86971396465` completed/success，Vercel Deployment与Preview Comments success，Pages deploy skipped；PR #1保持Open/Draft。该HEAD交由长期QA独立复测HEM-P1-034。

### HEM-P1-029 英文会话中文开场（2026-07-14）

- 独立失败基线在现有动态会话合同中命中：`P001`的`language=en`初始化返回“医生您好，我是因为小便颜色变红3月余来看病的。”，42例循环在首例以CJK断言exit1；不是provider或浏览器翻译问题。
- 根因是`initSession`没有把`language`传入patient-facing profile构建，且开场白只调用中文简化主诉并硬编码中文问候。`24054cf`仅增加语言感知的安全简化主诉/问候，英文不读取完整英文病历，也不暴露疼痛、血尿时相、血块、诊断或评分点。
- 修复后42例英文开场均非空、无CJK并含自然英文问候；中文主诉合同、42例×6英文Patient Agent、训练API/恢复/安全合同和TypeScript均exit0。repository scanner覆盖295个候选文件及历史/有界归档，scanner合同均exit0；受保护医学路径零diff。
- 本地Node 24无法加载Next 15的ESLint patch，未把该运行时兼容失败记作源码失败；远程Node 22权威门禁中Lint success。Actions run `29297252637` / build job `86973354237` completed/success，Playwright、52页build、bundle/secret及clean gate全部success；Vercel两项success，Pages deploy skipped，PR继续Open/Draft。下一项转入HEM-P1-033。

### HEM-P1-033 canonical教师元语言与隐藏覆盖（2026-07-14）

- 直接规则链真实复现P004血块、P005/P006血尿时相：回答分别命中`未主动诉/需追问`，但仍返回`clots`或`hematuria_phase`。桌面浏览器失败基线进一步证明可见文本被替换后，localStorage仍保存`askedSlots=["clots"]`与`colorClots=true`。
- `36061ad`在provider调用和公开返回前统一过滤deterministic/fallback；不安全回答只返回对应语言的自然不确定表达，清空matched facts/slots，并以`unsafe_deterministic_answer`记录非敏感原因。客户端同时只为实际通过安全检查并展示的回答更新覆盖；安全边界fallback不再误判为AI断连。
- 修复后P004/P005/P006专项、desktop/mobile 2/2和完整practice 42/42通过；Patient/Agent/LLM、18冲突隔离、TypeScript、52/52生产构建、25 JS bundle及295文件repository scan均exit0。`data/**`、419决定、42例`needs_revision`、18冲突原值和360评分零修改。
- 当前GitHub API实时确认远程仍为`0b066dc`，但`github.com:443` smart-HTTP多次连接重置/超时；本地提交`36061ad`暂未push，远程CI不得登记为通过。网络恢复后必须重新fetch、普通push并补Node22/PR/Vercel证据。

### HEM-P1-027 移动composer遮挡复核（2026-07-14）

- 当前Production静态构建独立复现QA基线：360×800/中文开场底边`661`、composer顶边`654`，稳定遮挡7px；390×844/中文通过。扩展双语矩阵还发现360×800/英文开场底边`809`对composer`662`、390×844/英文`757`对`706`，说明按中文像素压缩不能覆盖英文换行高度。
- 两轮边界修复均未同时满足现有门禁：压缩移动composer 8px只修复360中文；移动端改正常文档流可让8个视口/语言几何断言通过，却使既有390×844多行输入底边从视口内回归到`879–888 > 844`。聚焦scrollIntoView补丁仍未恢复门禁。
- 按无人值守“两轮无效即换项”规则，本轮没有继续大改布局。所有027实验代码和测试均用逐行补丁撤回；`git diff --quiet`与cached diff均为0，033安全提交保持完整。HEM-P1-027继续OPEN，建议独立设计固定高度的移动问诊workspace/visualViewport策略后再做，不以隐藏断言或牺牲44px触控目标制造通过。
- 同一构建命令后P008直接handler失败已定位为测试进程继承`VERCEL=1`、无Upstash时按设计503；无该环境污染的此前完整practice 42/42中P008通过，不登记为评分回归。

### Preview 404与配置差异专项（2026-07-14 09:39—10:30 CST）

- `536996601cff7f9db034bcba37b013acae4c25bc`已普通push；Actions run `29299085374`从`2026-07-14T01:39:06Z`至`01:43:21Z` completed/success。Node 22的完整行为、TypeScript、ESLint、repository scanner、Playwright、52页build、bundle和clean gate通过；Vercel与Preview Comments success，Pages deploy skipped，PR #1保持Draft。
- Vercel Ready部署`Cam5bt2qVLcLwPYC36HuzKWwtPXY`明确绑定上述SHA，分支别名为`hematuria-training-system-git-codex-he-a06e54-niubi1vs-projects.vercel.app`，不可变部署域名为`hematuria-training-system-jo9v2suvu-niubi1vs-projects.vercel.app`。已登录浏览器可加载分支别名P001；匿名系统Chrome被Standard Vercel Authentication重定向到登录页，该保护行为不记作病例404。
- 部署资源清单显示42例真实runtime ID为`P001–P012`加`HX-ADD-001–030`；用户可见编号为`P001–P042`。旧构建只生成runtime路径，故`/cases/P013/`没有静态产物，而目录卡片P013实际链接`/cases/HX-ADD-001/index.html`。新增浏览器失败测试稳定收到该旧href；这解释了复制、直达或按可见编号刷新P013–P042时的404，不是随机丢失静态文件。
- 最小修复为可见编号生成兼容静态别名，目录与随机入口统一使用display ID，客户端收到的`caseData.id`仍为原runtime ID。没有修改病例数据、Patient Agent语义、session/token、日志签名、医学审核或360评分。代码提交`79d1083`与证据提交`00531d5`已普通push；本地专项2/2、完整Playwright44/44、TypeScript、ESLint、82/82 build、72个病例route ID库存、25 JS bundle及295文件secret扫描均exit0。
- Preview环境变量只读取名称和作用域、从未读取值：LLM供应商变量覆盖Production与Preview；`TRAINING_STATE_SECRET`、`TRAINING_API_ALLOWED_ORIGINS`、`AGENT_API_ALLOWED_ORIGIN`、`TRAINING_DEPLOYMENT_TIER`与`NEXT_PUBLIC_DEPLOYMENT_TIER`目前只覆盖Production。部署runtime log可见`GET /api/health/`为200，但已登录P001仍进入degraded；结合签名模块缺少`TRAINING_STATE_SECRET`时fail-closed，这些作用域缺口与会话/日志失败高度一致，但在取得失败请求状态/错误码前仍不写成唯一根因。需要用户在Preview或分支专用Preview配置并重新部署，Codex不读取、生成或修改值。
- 远程确认：Actions run `29301467610` / build job `86985933644` completed/success（4分14秒），Node 22.14、完整行为、44/44 Playwright、82/82 build、23 JS bundle、295文件扫描和最终clean gate通过；依赖真实状态仍为1 moderate。Vercel Ready部署`CwbEAU3RcmH9PGpZCQuSnt9J7ag3`绑定`00531d5`；分支别名`/cases/P013/`初次直达及刷新均显示唯一P013、工作区和输入框，Next 404标记为空。HEM-P1-035工程项关闭，PR继续Draft，Pages deploy skipped。

### HEM-P1-036 Patient Agent角色与请求边界（2026-07-14）

- 先建立真实失败合同：合法Patient session把`agentId`改为`diagnostic_reasoning`和stage改为diagnosis，旧实现返回200；这证明session虽绑定attempt/case/language/mode，却没有阻止公开端点进入其他LLM角色。
- 最小修复固定公开`agent-chat`为`standardized_patient/history`，并在provider前执行字段白名单、`application/json`、2000字符问题、8项历史和有界asked列表检查；model、Prompt、API key、base URL、`unlockedData`等客户端控制字段统一拒绝。
- 失败合同修复后exit0，Agent角色越权、五种模型/Prompt/隐藏上下文字段、超长输入和错误Content-Type均为`providerCalls=0`；Agent/Patient/动态会话/LLM/18条冲突隔离回归、TypeScript、ESLint及295文件secret扫描exit0。TypeScript首次在受限junction下误报`xlsx`缺失，允许只读junction后同一命令exit0，不登记为源码失败。
- `docs/goal/AI_ABUSE_THREAT_MODEL.md`记录全部端点和开放P1：实例内限流不是全局配额、probe仍无独立低额度、TTS仍需能力/body/single-flight。当前尚未push/CI，不把本地结果写成远程通过；`data/**`、医学审核、419决定、18条冲突和`needs_revision`零修改。

### HEM-P1-039 不同幂等键的session并发（2026-07-14）

- 失败基线用同一合法session并发两个不同幂等键的`probe`：旧实现两项均200，`providerCalls=2`。这不属于相同请求幂等失效，而是缺少session级provider租约。
- 最小修复在幂等owner进入provider前申请按session摘要键控的单一租约；生产通过现有Upstash `SET NX EX`跨实例原子化，本地用内存合同。第二项返回429、`Retry-After: 1`且`providerCalls`保持1；首项结束后第三项200并使计数变2，证明租约释放和合法恢复。
- 异常会撤销processing幂等claim，租约有30秒崩溃TTL；相同幂等键原有single-flight合同继续通过。Agent/Patient/动态会话/AI恢复、TypeScript、ESLint及296文件scanner均exit0。当前本地提交链仍因Git smart-HTTP受阻尚未push。

### HEM-P1-037 持久多维Agent预算（2026-07-14）

- 失败基线把session预算设为2，三个不同IP、不同幂等键的顺序probe仍全部200，第三次进入provider；证明旧实例内IP Map不是跨实例session预算。
- 单一原子准入现检查session/attempt请求、attempt输入字符、IP小时/日、项目日请求、项目日保守token预留、probe和session并发。客户端不能指定模型/token；默认session 60次不阻塞20轮验收，服务端变量可收紧。
- 八个独立低阈值场景均在429时保持provider计数；模拟Upstash合同验证9个哈希键、owner完整顺序和quota撤销claim，Redis命令不含原始session/IP。六项Agent/Patient/session/恢复回归exit0。
- 工程本地候选完成，真实Preview仍需HEM-P1-020所列持久store与签名/origin配置后验证跨实例429、TTL和日窗口；不得把模拟Redis写成真实Preview通过。provider错误率自动熔断/告警另记开放P1。

### HEM-P1-038 TTS冷并发与资源边界（2026-07-14）

- 失败基线：同一未缓存tuple的并发请求产生2次Azure调用；旧handler也会解析含20 KiB padding的请求并在短text合法时进入provider。
- 最小修复增加16 KiB JSON、Content-Type、畸形JSON和字段白名单；同一完整tuple进程内single-flight，成功才写缓存，最多100个不同冷请求并发。origin、voice、rate、pitch或text不同绝不共享。
- TTS API/voice两项回归exit0；冷并发providerCalls=1，超大body 413，method/Origin/text/voice/字段/rate-limit/JSON拒绝均不调用provider。session capability、跨实例单飞与持久TTS预算继续作为独立开放边界，未把本地single-flight写成全局成本保护。

### HEM-P1-041 TTS Patient session能力（2026-07-14）

- 失败基线在Azure stub已启用时直接调用TTS且不携带session，旧实现返回200并调用provider。
- 前端现发送当前sessionId/attempt/case/language/runtime mode；服务端复用签名session校验。缺失、伪造、过期、跨病例、跨语言、跨mode均401，voice语言不一致400，全部providerCalls=0。
- cache/single-flight tuple加入session摘要；同文本不同session均MISS，Redis/缓存/日志不保存原始签名。TTS API/voice 2项、TypeScript、ESLint、296文件scanner通过；桌面/移动Playwright云失败降级2/2（4.6秒），本地Next服务已停止。
- 跨实例TTS配额仍开放，不把进程内single-flight和session鉴权写成全局成本熔断；真实Azure仍因未配置而按浏览器语音降级。

### HEM-P1-042 持久TTS预算与tuple租约（2026-07-14）

- 失败基线把session日预算设为1：同一合法Patient session换IP、换文本的第二项旧实现仍200并再次调用Azure stub，证明实例内IP窗口与Promise合并不能形成全局成本边界。
- 最小修复在Azure前原子检查session日、IP小时、IP日、项目日请求和项目日字符预算，并取得按session隔离tuple摘要的短租约。生产/Vercel无Upstash时503 fail-closed；同进程相同tuple仍合并为一项成功Promise，不把音频写入Redis。
- 五类低阈值预算均429且provider不增加；模拟Upstash合同验证6个哈希键、owner acquire→provider→release、quota/in-progress零provider调用，命令不含原始session/IP。TTS API/voice、API recovery、TypeScript、ESLint及297文件scanner均exit0。
- 当前只是本地工程合同；真实Azure、配置后的Preview跨实例429/425、TTL恢复和日窗口仍待HEM-P1-020人工配置后验收。`data/**`、医学事实、419审核、18条隔离、`needs_revision`、评分和真实环境变量零修改。

### HEM-P1-040 provider熔断与恢复探测（2026-07-14）

- 失败基线：4个连续逻辑请求各收到provider 503；旧客户端虽把单请求重试限制为最多2次，跨请求仍调用provider 4次，没有短时熔断。
- 最小修复在公开Patient runtime客户端前加入持久熔断：默认连续3次可计数失败后打开30秒，冷却后只允许一个探测；租约动态覆盖timeout/重试上界，半开探测不重试。恢复成功清除失败状态；瞬时网络和全部5xx只走有限退避，不对400/422等客户端错误盲目重试或计入全局熔断。
- 阈值2合同把provider调用4降为2；两个并发恢复请求仅1个到达provider。模拟Upstash验证2键准入/失败/open合同及摘要键，serverless缺store时fail-closed；9项LLM/Agent/Patient/恢复回归9/9、24.3秒exit0。
- 2026-07-14核对DeepSeek官方Chat Completion文档，当前允许模型为`deepseek-v4-flash`和`deepseek-v4-pro`；仓库默认`deepseek-v4-flash`仍有效，因此没有在缺少真实双语/自然度/P95基准时擅自换模。
- 本里程碑最终门禁：TypeScript、ESLint、82/82生产静态页、25个JS bundle隐藏信息扫描和298文件敏感信息扫描均exit0。构建使用本地bundled Node 24并明确出现仓库要求Node22的engine warning，故仍须远程Node22 CI，不能用本地构建替代。
- 提交前独立安全复核发现并阻止了“400请求级错误毒化全局熔断”的P1；新增连续400、500有限重试和损坏200 JSON合同后修正为显式错误类别。live provider probe另固定为单次、5秒timeout，避免超过前端8秒探测窗口后仍在后台重试。
- 修正后同一只读安全复核确认无残余P0/P1；剩余P2仅为Upstash命令mock不等于真实Redis跨实例/Lua TTL验收，继续归HEM-P1-020外部配置后验证。
- 前一HEM-P1-042提交为本地`d1fe177`；push前GitHub API确认远程/PR仍`00531d5`且Draft，但普通push因`github.com:443`连接失败，远程未变化。未使用API改ref或force；该外部阻塞不妨碍本地继续P1。

### HEM-P1-040 远程确认（2026-07-14 12:27 CST）

- 443连通性恢复后，重新`fetch --prune`确认远程专项分支仍为`00531d5`；本地仅领先8、落后0，工作树干净且无未知远程提交。8个本地小步提交已普通push，分支/PR head更新为`87cb4f57d2fd548b5e68be7bb1d1dff75238fdad`。
- Draft PR #1保持Open/Draft。Actions run `29305846597`的`build`在Node 22完成并success（4分06秒）；Vercel deployment `51WtprQAFvjLBqhAXV2kJFduV9mB`及Preview Comments均success，Pages正式`deploy`按PR规则skipped。
- 远程绿灯证明代码门禁与Preview构建通过，不等于Preview已配置持久Upstash、签名/origin、真实DeepSeek/Azure，也不等于跨实例熔断、日志10/10、双语真实AI 10/10或P50/P95验收通过。PR继续Draft。

### HEM-P1-027 移动问诊workspace结构修复（2026-07-14）

- 主分支失败测试复现长期QA同一几何：360×800中文`opening bottom=661 / composer y=654`，exit1；确认原因为页面级`sticky bottom`可在聊天容器尚未进入视口时被拉到其上方，英文头部换行会进一步放大覆盖，固定padding或压缩触控区不能解决。
- 最小结构修复在小于640px时让composer回归正常文档流；用户聚焦/输入及`visualViewport`变化时，只按实际超出像素滚动根页面。640px以上保留sticky，并用`ResizeObserver`测得的composer高度加显式内容spacer与safe-area合同，避免Chromium忽略overflow末尾padding。
- 新矩阵覆盖360×800、390×844、1280×720、1440×900中英文、safe-area标记、无横向溢出及640px模拟视觉视口；2/2、17.6秒exit0。既有390多行输入2/2、10.9秒；20轮后手动上翻、新消息入口、末条消息完整滚动2/2、12.6秒。
- 本里程碑唯一完整Playwright为46/46、69.3秒exit0，含会话/重连/fallback/日志/快速双击/刷新/TTS/临床数据/评分与axe。TypeScript、ESLint、82/82构建、25 JS bundle及298文件scanner均exit0；`data/**`、医学事实、审核状态和360评分零修改。当前待小步提交、普通push、Node22 CI与独立QA复测。

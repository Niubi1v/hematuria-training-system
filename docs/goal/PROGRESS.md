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
- `f37309f`普通push后Vercel两项success；Actions run `29309491866`在Playwright 45/46失败。首条真实错误为移动20轮测试把“手动上翻”错误写成`scrollTop===0`，CI稳定得到40px但仍距底部超过72px并未自动回底；其余依赖/数据/医学/行为/类型/lint/scanner均已通过。
- 测试合同改为直接断言上翻后及新消息到达后“距底部>72px”，并继续要求新消息入口、回到底部、末条回答不被覆盖。按CI相同2 workers重复桌面/移动各3次6/6、23.2秒；6 workers压力跑曾因Next dev解析中断仅4/6，未误记为产品通过。
- 测试合同修正提交`4fed0764e9894b34da1d3f7620df00468ff4f9bb`已在fetch确认本地仅领先1、落后0且工作树干净后普通push。Draft PR #1保持Draft；Actions run `29309939497` completed/success（build 4分24秒），Node22下完整行为、TypeScript、ESLint、repository scanner、Playwright、82页build、bundle及最终clean gate全部success。Vercel deployment `DTHT4KnLh6Eyz8NnkecexSqLFeE3`和Preview Comments success，Pages deploy按PR策略skipped。
- HEM-P1-027工程门禁由“待CI”推进为“工程关闭、独立真机QA待复测”。推荐长期QA从`4fed0764e9894b34da1d3f7620df00468ff4f9bb`或本证据提交的后代，在真实360/390设备复测软键盘升降、safe-area、开场白、手动上翻和末条消息；不能用CI仿真冒充真机验收。

### HEM-P1-043 第一阶段提交失败（2026-07-14，本地候选）

- 从`ff1a932785d891749ae8e73130bde8857062e194`建立真实`training-action` handler浏览器合同。修正测试fixture的响应头暴露后，P001中文、英文、双向切换、进入第二阶段和刷新恢复均成功，证明配置齐全时服务端stage/token/session绑定没有拒绝首次合法提交。
- 失败基线稳定复现两个工程缺陷：快速双击在desktop/mobile各发出2个`stage-feedback`请求；`training_attempt_store_unavailable`虽已分类为永久配置错误，仍在catch路径按503重试，一次点击最多发出3次请求，且UI只显示通用“阶段提交失败，请重试”。
- 最小修复增加阶段提交单飞锁和提交中禁用态；把attempt store/签名配置错误列为不可重试，并显示不含敏感值的明确双语管理提示。过期、跨病例、跨语言、stage锁及签名校验全部保持fail-closed，没有在前端伪造阶段推进。
- 本地专项、完整行为链、42例结构化回归、572事实/419审核合同、360评分、TypeScript、ESLint、82页构建、bundle和secret扫描通过。新增浏览器合同复用受控本地server与已安装Chrome，desktop/mobile 6/6、13.7秒exit0；此前自动webServer在断言后不退出及CI通道缺专用Chromium均作为运行环境失败保留，不冒充产品失败。Node22完整门禁仍待push后CI。
- 当前执行环境无法取得登录态Vercel Preview的console/network；既有只读作用域证据显示Preview缺少训练签名/持久attempt store配置，服务端在Vercel缺共享store时明确503 fail-closed，因此这是用户实测“无法提交”的高可信外部根因，但在获得当前失败请求HTTP/error code前仍标记为待直接确认。未读取、生成或修改任何变量值。
- 代码与测试已形成仅本地原子提交`3cb22cd`；尚未push，PR #1继续Draft。下一步为证据提交、普通push、Node22 CI/Vercel观察，再给长期QA准确HEAD。
- 本地最终HEAD现为`972405a`（代码/测试`3cb22cd`、首轮证据`c4c2f25`、浏览器补证`972405a`），工作树干净。一次成功fetch确认远程`ff1a932`且落后0/领先3；随后普通push连接重置，重试fetch又因`github.com:443`不可达失败。`api.github.com:443`可达且PR API确认远程未部分更新、仍Open/Draft；未使用API改ref、force或不验host的SSH替代。
- 完整Playwright desktop/mobile在本地Node24运行器下到242秒超时并以EPIPE结束，未返回可审计总计，不能登记为通过；超时后3000端口无残留listener。新增第一阶段专项仍为明确6/6 exit0，完整浏览器门禁待Git网络恢复后由CI规定的Node22执行。

### HEM-P1-043 远程工程门禁（2026-07-14 16:29—16:34 CST）

- 网络恢复后成功fetch确认远程未变化，本地落后0/领先5；`ff1a932..cade64e`已普通push，未force、未写main。Draft PR #1 head更新为`cade64e19868c1b72667c642eff3ba709f2bd7e4`，仍Open/Draft/CLEAN。
- Actions run `29318216424` / build job `87037030905` completed/success（4分38秒）：Node22完整行为、TypeScript、ESLint、52/52 Playwright desktop/mobile、75输出幂等、42例/572/419医学治理、360评分、82/82构建、23 JS bundle、298文件scanner和最终clean gate均通过；Pages deploy按PR规则skipped。
- Vercel deployment `CNzPNsqzCi21UkqF65bpu88My89S`及Preview Comments success。该绿灯只证明新head构建/部署成功；登录态Preview第一阶段真实POST、持久attempt store/签名变量作用域仍未直接验证，HEM-P1-020外部阻塞不因CI关闭。
- HEM-P1-043工程修复可交长期QA从`cade64e`复测。PR继续Draft；未转Ready、未合并、未部署Production、未改医学事实/审核状态或环境变量。

### QA 490fdd8 选择性复核、HEM-P2-043与HEM-P2-028（2026-07-14 17:23 CST）

- `git fetch --prune`后核对Production本地/远程均为`3541a706040cd9e0f5c9f9f6b3cff92149896a4a`，QA远程为`490fdd842b277bada645047a65a3bc448ee014f4`，merge-base为`ff1a932785d891749ae8e73130bde8857062e194`。逐份读取四个QA报告/证据索引并审查QA-only diff；没有整体merge、没有引入约433.96 MB本机证据，也没有覆盖Production业务代码。
- 当前Production的P001中英第一阶段、双向语言切换、刷新恢复、进入第二阶段及延迟响应下快速双击均在真实`training-action` handler浏览器合同通过；一次操作稳定为1个`stage-feedback`请求、1个request ID、1个timeline submit事件。故用户历史故障在本地当前HEAD不可复现，且HEM-P2-028确认为旧`ff1a932`上的真实重复training-action调用（非provider调用、非单纯遥测），已由`3cb22cd`的同步单飞锁修复并在本轮补足证据。
- 最新Preview别名为`https://hematuria-training-system-git-codex-he-a06e54-niubi1vs-projects.vercel.app`，对应本轮开始时PR head `3541a706`。匿名GET病例/API均返回Vercel登录HTML，安全合成POST返回401 Unauthorized；浏览器控制启动又遇到工具级`Cannot redefine property: process`。因此Preview第一阶段应用请求仍为`BLOCKED_PREVIEW_AUTH`，未把保护页401或本地fixture冒充Preview结论。
- HEM-P2-043失败测试先稳定命中42个目录href均为`/cases/Pxxx/index.html`；根因是目录把静态文件实现细节编码进公开URL，而Next dev/Preview的动态route合同是`/cases/Pxxx/`。新增集中式basePath-aware目录路由构造器，目录、随机和反馈重试统一使用目录URL；静态测试服务支持GitHub Pages basePath且真实404返回404，未硬编码域名或catch-all吞错。
- 修复后本地Next dev专项desktop/mobile 8/8；root静态导出2/2；`/hematuria-training-system` Pages模拟2/2；两个生产构建均82/82。完整行为、类型、lint、bundle与secret门禁通过。唯一完整本地Playwright在不受支持的Node24/Next dev缓存异常下49/52，随后清缓存的受影响专项8/8；按“一里程碑一次完整门禁”规则不重复昂贵全跑，以push后Node22 CI为最终完整浏览器门禁。
- `data/**`零差异，医学事实、419审核、18条冲突、`needs_revision`、Patient医学语义、签名安全与360评分均未修改。下一步为原子代码/证据提交、普通push、Draft PR CI；QA报告中的HEM-P1-030/031/032继续保留为后续P1，不在本P2路由补丁中顺带重构。
- 本地原子提交已形成：`f1d7f62`为路由/测试，`39aad56`为首轮证据。三次fetch及两次普通push均因`github.com:443`连接重置/超时失败；GitHub连接器在push后再次确认远程仍为`3541a706`、PR仍Open/Draft，故没有部分push或未知远程提交。当前本地领先2，待smart-HTTP恢复后必须重新fetch再普通push，不能用API改ref绕过。

### 4aa96d5远程确认与HEM-P1-030本地候选（2026-07-14 17:57 CST）

- GitHub网络和CLI认证恢复后，`fetch --prune`确认本地领先3、远端领先0；`3541a70..4aa96d5`已普通push，随后远程精确为`4aa96d5ff20a1f4e637529d6ede46720b428c5ef`且0/0。Draft PR #1保持Open/Draft。
- Actions run `29322763481` / build job `87051751710` completed/success（4分35秒）：Node 22.14下完整Playwright 52/52（2.2分钟），完整行为、TypeScript、ESLint、医学治理、构建、bundle/scanner与clean gate通过；Vercel和Preview Comments success，Pages deploy skipped。此前EXT-GIT阻塞已解除。
- 下一P1 HEM-P1-030失败合同先收到中文`prior_care`空slot；QA准确基线为378/6216路由失败。根因为canonical缺prior-care及英文retention改写、structured缺中英常见历史表达，并且诊断/报告边界早于可证明的既往史路由。
- 最小候选仅对白名单`PAST_MALIGNANCY`/`PAST_URINARY_PROCEDURE`且明确历史语境放行；含“结果/报告/诊断”等细节意图仍走安全边界。42例×7自然问法与4个边界通过；P001三个不安全来源仍`unsafe_deterministic_answer`且空slot，不削弱HEM-P1-033或161个来源阻塞。
- 相关Patient/session/Agent/API/18冲突隔离回归通过；完整`pnpm test`在只读依赖junction权限下33.2秒exit0。首次普通沙箱运行只因已安装`xlsx` junction不可读而失败，权限核对后`xlsx 0.20.3`正常解析；TypeScript、ESLint通过。当前候选尚未提交/push，HEM-P1-031/032继续OPEN。

### HEM-P1-031 疼痛特异性路由（2026-07-14，本地候选）

- QA基线为252个路由错配，并把5个`pain`冲突病例的直接隔离144次扩大到204次；最小失败合同稳定复现英文`flank pain`实际`[flank_pain,pain]`。
- 最小修复在canonical matcher最终集合中应用特异性：命中flank/renal-colic/radiating时抑制词面附带的通用`pain`；若问题明确包含`any other pain`、其他痛或一般痛意图，则保留合法compound集合。
- 42例×6问法合同通过；5个pain冲突病例×4特异问法均不再因通用pain扩大quarantine，而P001真正`any pain`仍以`medical_bilingual_conflict_pending_review`隔离。
- Patient、dynamic session、18冲突隔离、TypeScript和ESLint通过。未修改18条冲突表、数据、审核状态或医学真值；当前尚未提交/push，HEM-P1-032继续OPEN。

### HEM-P1-032 非空事实被长度保护压成unknown（2026-07-14，本地候选）

- 失败合同在P001英文泡沫尿稳定得到generic unknown；根因是确定性路径先用“总长≤80”判断，而外层安全合同本来允许总长≤180、每行≤80。安全英文slot常见81–106字符，因此已有内容被技术性抹除但slot仍匹配。
- 最小修复不摘要、不截断、不生成医学语义：无禁词且总长在安全界内时只按空格/标点换行，标准化空白后与获准单slot原文完全相同；含禁词、项目符号或超过总安全界限的非onset来源交给外层显式安全阻断并清空slot，不再伪装为已收集unknown。
- 42例×glomerular/triggers/occupation共126个公开回复逐字语义保持、每行≤80且无generic unknown。P004/P005/P006不安全来源仍`unsafe_deterministic_answer`，18条冲突隔离不变。
- 三个Patient路由P1里程碑最终完整`pnpm test`34.3秒exit0；相关历史/疼痛/session/Agent/冲突、TypeScript和ESLint也通过。当前032尚未提交/push；030/031已有本地原子提交，GitHub 443暂时不稳定。

### HEM-P1-030/031/032 独立矩阵复核与发布阻塞（2026-07-14 18:23 CST）

- 三项代码与证据已形成六个本地原子提交，当前HEAD为`25ef0cba76e77c4cffd8e9caac1b4733ab83015b`；工作树在复核报告清理后干净，`data/**`零差异。
- 选择性读取QA分支的`patient-session-matrix.mjs`并以UTF-8、禁用provider的本地rule模式复核：42例×37槽位×中英双语×2改写，`routeChecks=6216`、`repeatChecks=6216`、`failureInstances=0`、`failureGroups=0`；144/144直接医学冲突隔离事件命中，`providerCalls=0`。首次错误启动产生的3192项`llm_error_fallback`已证明是PowerShell参数/编码失真，不登记为产品失败。
- `gh auth status`与GitHub API成功，API确认远端专项分支仍为已知`4aa96d5ff20a1f4e637529d6ede46720b428c5ef`；但三次正式`git fetch --prune`（含一次性HTTP/1.1）均在约21秒因`github.com:443`不可达失败。
- 因push前fetch强制门禁未通过，没有绕过为API改ref或直接push。六个本地提交尚未进入远端，新HEAD没有Node22 CI/Vercel结论；网络恢复后必须重新fetch，确认远端领先0，再普通push并观察Draft PR #1。

### HEM-P1-043-R2 第一阶段丢失attempt记录恢复（2026-07-14 22:45 CST，本地候选）

- 在当前本地Production HEAD `7898120001eeb15ac8c3ee2caca0b7dcfd9ea48b`稳定复现与用户文案一致的失败：浏览器保留有效签名训练token、服务端attempt记录丢失后，首次`stage-feedback`返回401 `attempt_not_found`，页面显示“阶段提交失败，请重试。”且不能进入第二阶段。
- 最小修复只允许`history`首阶段在精确收到`attempt_not_found`时清除旧浏览器token、通过原`init-attempt`安全初始化同一attempt，再用同一幂等requestId重试一次。过期、签名无效、跨病例、跨语言、跨模式及stage不匹配仍按原规则拒绝。
- 为避免服务端记录丢失后评分证据消失，客户端仅提交本次真实学生问句；服务端用现有`matchHistoryQuestion`与HEM-P0-023隔离规则重新匹配、去重后写入事件。客户端不能声明slot或分数；18条双语冲突仍不计分。
- 失败测试在修复前命中401和通用错误；修复后desktop/mobile恢复2/2、相关双语/刷新/双击/缺store矩阵8/8、完整Playwright 54/54。训练API、安全、attempt、恢复、stage flow、双语冲突、完整行为、类型、lint、82页构建、25 JS bundle及303文件secret扫描均exit0。
- Vercel Preview仍受Standard Authentication保护，未取得登录态应用POST，故不把本地修复写成Preview已通过；PR远端仍是`4aa96d5`，旧CI不归属于本地候选。未修改`data/**`、医学事实、419审核、18条裁决、`needs_revision`、360评分或环境变量。
- 代码/测试已保存为可回滚本地原子提交`610eacf`。按上一检查点“完成安全收尾后暂停、不要再普通push新代码”的边界，不自动发布包含既有七个未推送提交的分支；等待用户明确恢复push门禁或长期QA复测安排。

### HEM-P1-043-R3 第一阶段初始化竞态（2026-07-14，本地候选）

- 用户新截图发生在“人工智能患者正在准备中/状态确认中/0问0答”。真实Chromium失败基线确认：本地`attemptReady`仅表示浏览器记录已恢复，服务端`init-attempt`尚未完成时“提交本阶段”仍可点击；初始化HTTP 502 `network_error`后未发`stage-feedback`，但共享Promise错误被统一显示成“阶段提交失败，请重试”。
- 最小修复将训练attempt状态独立为`initializing/ready/failed`并在本地记录恢复后立即单飞初始化。未ready时提交按钮禁用并显示“正在初始化训练会话”；失败显示分类提示和“重新初始化训练会话”。自动AI session、React重复effect及永久配置失败复用同一次初始化结果，不重复请求；仅用户显式重试或精确`attempt_not_found`恢复可清除失败并重试。
- AI处于preparing/degraded或session初始化失败不等于训练attempt失败：只要签名训练attempt ready，0轮、1轮fallback和正常问答均可合法提交。重新开始现在删除旧attempt对应的sessionStorage签名token；刷新继续恢复同一合法attempt。
- desktop/mobile初始化竞态矩阵14/14、restart 2/2、永久配置/单飞6/6通过；生产构建82/82。生产静态Playwright完整运行63/64，唯一失败为既有多行输入测试在既定rAF滚动执行前读取几何；保持844px阈值并改为等待下一帧后focused desktop/mobile 2/2。完整行为、类型、lint、25 JS bundle与303文件secret扫描均exit0；Node22干净64项仍待push后CI。
- `data/**`、42例、572事实、419审核、18条冲突、`needs_revision`与360评分零修改。现有Preview是否命中新竞态需新提交部署后按真实网络时间线复测；不把本地结果冒充Preview通过。
- 代码/测试已保存为原子提交`c069abf`；证据文档独立提交后再执行fetch/普通push门禁。

### HEM-P1-043-R3 远程门禁（2026-07-15 CST）

- 修复与本地证据已普通push至`codex/hematuria-production-goal`，远程HEAD为`6b41d334106a988a1cbc85b89792f6271be3b597`；代码提交`c069abf`，首轮证据提交`6b41d33`。push前fetch确认远端领先0，未force push、未写main。
- Draft PR #1保持Open/Draft。GitHub Actions run `29348368936` / build job `87137895749` completed/success：Node `22.14.0`，完整Playwright `64/64`，类型、lint、行为、scanner、82页build、bundle及最终clean gate均通过；Pages deploy按PR规则skipped。
- Vercel Deployment与Preview Comments均success；部署记录为`F9pbrhZo1sEQBsxSrQ4jXhJwHZHC`。该绿灯确认候选可构建，不替代登录态P001立即提交的真实网络复测；in-app Browser运行时故障仍使该黑盒步骤待人工/长期QA执行。
- 未修改生产环境、医学事实、419审核、18条冲突、`needs_revision`或360评分；PR未转Ready、未合并、未部署Production。

### HEM-P1-043-R4 Preview跨部署状态与P003零轮提交（2026-07-15，本地候选）

- 用户在最新Preview的P003截图再次显示“状态确认中”、0问0答和“阶段提交失败，请重试”。当前代码的真实训练handler以P003、中文、0轮和病史小结`1`直接执行`init-attempt`及`stage-feedback`均为HTTP 200，排除P003数据和0轮提交规则本身。
- 根因证据由两层组成：Preview客户端继承了`NEXT_PUBLIC_API_BASE_URL=https://hematuria-training-system.vercel.app`，但浏览器看不到非公开的`VERCEL_ENV`，因此把当前Preview UI路由到健康信息仍为`gitSha=5a3ad11`的旧生产API；旧`sessionStorage` v3 token又未经服务端验证即被标为ready。跨部署的CORS、签名和attempt-store命名空间因此失配。
- 最小修复只公开非敏感的Vercel部署作用域，使Preview bundle强制使用自身同源API；训练token改为按有效API origin隔离的v4 key，并以新增只读`validate-attempt`在ready前校验。响应缺少`X-Training-State`时保持fail-closed，旧token只允许在未提交的第一阶段按既有安全初始化流程恢复一次。签名、case、language、mode、stage及幂等校验全部保留。
- 同源切换后的真实失败测试进一步发现公共请求封装用`new URL(relativePath)`在发请求前抛`ERR_INVALID_URL`。现只为日志路径解析提供不可路由基址，实际fetch仍保持相对同源URL；没有硬编码Preview域名或绕过网络/签名检查。
- Vercel等价构建82/82；P003旧token/零轮desktop+mobile 2/2、受旧跨域bundle影响的同步/重连矩阵12/12、完整desktop+mobile Playwright 68/68。API配置/恢复、attempt、训练API、TypeScript、ESLint、25个JS bundle和303个候选/历史文件敏感信息扫描均exit0。
- `data/**`零差异；未修改医学事实、419审核、18条冲突、`needs_revision`、Patient医学语义或360评分。当前仍是本地候选，须原子提交、fetch后普通push，并以Node22 Actions和新Vercel部署SHA复核；PR继续Draft。
- 代码/测试提交`656816d`与首轮证据提交`8a31711`已本地保存。13:22—13:26 CST发布门禁中，`gh auth status`报告默认CLI token失效；标准`git fetch --prune origin`约22秒后连接重置，命令级HTTP/1.1重试约41秒后无法连接`github.com:443`。因此没有绕过成功fetch而push；本地tracking ref显示2/0仅为陈旧缓存，不能据此证明远端无新提交。

### HEM-P1-043-R4 CI同源合同恢复（2026-07-15，本地候选）

- 起始HEAD为`6ba9d29f73a3feea72ba80b0cb78d7030e82a5f0`；仓库外bundle `production-before-ci-fix-6ba9d29.bundle`验证为完整历史，SHA256 `EB3C6DC1FA17C0A87DC3F365343A84BEEEF91D547E3E43EDE9EC11B6A8BDE75A`。
- Actions run `29397429743`的14项失败为7个用例×desktop/mobile：P003两项直接暴露页面`:3000`与隐式API fallback `:3001`不同源；其余12项在跨源下读不到`X-Training-State`，正确触发`training_state_token_missing` fail-closed后级联失败。CI实际没有启动`:3001`完整API，E2E一直由`page.route`提供测试适配。
- 删除隐式`:3001`fallback；本地默认、Vercel Preview与Vercel Production统一使用相对`/api/**`，GitHub Pages继续显式注入HTTPS API origin。新增配置合同与静态bundle禁止测试端口门禁，未修改token、签名、attempt、stage或CORS安全规则。
- 修复前Node 22目标矩阵稳定14/14失败；修复后目标14/14、完整Playwright 68/68通过。TypeScript、ESLint、完整行为/安全/医学治理、Vercel与Pages两次82页构建、两次25 JS bundle扫描、303文件/历史secret扫描均exit0；`data/**`零差异。
- 代码/测试提交为`d1c20de0ad3b96ca992c8be679df23cbf9facb28`。独立只读复核无P0/P1；本地纯`next dev`若需外部API必须显式配置开发origin，该P2不改变生产安全合同。待证据提交、fetch门禁、普通push及新HEAD Actions/Vercel复核；PR继续Draft。

### HEM-P1-043-R4 CI同源合同远程验收（2026-07-15）

- 证据HEAD `bd3bff5e2400a51d9b4f16f78eefb6895a781c1b`已普通push；Actions run `29405290154` / build job `87319150250` completed/success。Node `v22.14.0`、Playwright 68/68（2.8分钟）、TypeScript、ESLint、完整行为/医学合同、82页构建、23 JS bundle扫描、secret扫描及clean gate全部通过；Pages artifact/deploy按PR规则skipped。
- Vercel Deployment `HdHGBhcwFXybfHe6weLVswR6vqew`及Preview Comments均success，状态查询绑定精确HEAD。PR #1仍为Open/Draft，base=`main`，未Ready、未合并、未部署Production。
- Preview根路径与`/cases/P003/`匿名请求均最终到`vercel.com/login`（HTTP 200登录页）；浏览器控制两次导航也未在20—30秒内取得应用DOM。因此P003/P001真实提交冒烟继续标记`BLOCKED_PREVIEW_AUTH`，未绕过保护、未把CI或本地结果冒充线上交互通过。

### Preview自动化保护绕过黑盒基础设施（2026-07-15，远程已确认）

- 新增独立`playwright.preview.config.mjs`与`test:e2e:preview`入口。凭据只从测试进程的`VERCEL_AUTOMATION_BYPASS_SECRET`读取，缺失时明确输出`BLOCKED_PREVIEW_AUTH`；不接受URL传参，不写源码、fixture、trace、截图或日志。
- bypass请求头通过Playwright路由仅附加到当前分支Preview origin。纯配置合同证明localhost、GitHub Pages和Production origin均不附加该头；Preview专用配置关闭trace、截图和video，运行器对生成物按内存中的实际值做字节扫描，若发现即删除专用输出目录并失败。
- 真实Preview首个导航记录`sameOriginRequests=1`、`crossOriginRequests=0`，说明目标origin请求已注入保护头；Vercel仍返回302到`vercel.com/sso-api`并最终停在`vercel.com/login`。没有任何`/api/**`响应，P003/P001应用流程按串行门禁未运行，状态仍为`BLOCKED_PREVIEW_AUTH`，不是应用层错误。
- Node 22.14.0配置合同、测试发现、TypeScript和ESLint均通过；生成物凭据扫描通过。下一步需在Vercel项目侧核对Automation Bypass凭据是否属于`niubi1vs-projects/hematuria-training-system`且对当前受保护Preview生效，然后原命令复跑；不得关闭Vercel Authentication。
- 基础设施提交`449e5c6`与首轮证据提交`0b34c84`已普通push。精确HEAD `0b34c84`的Actions run `29414668790` / build job `87349710998` completed/success：Node 22.14.0、Playwright 68/68、82/82构建、23个JS bundle扫描和clean gate通过；Pages deploy按Draft规则skipped。Vercel deployment `DYo7Ex4RYAy1TfieMTJEEesW98GK`成功；新部署完成后再次复跑仍被重定向到Vercel登录页，故外部阻塞结论不变。

### Preview Automation Bypass生效与训练状态配置阻塞（2026-07-16）

- 本机重启后仅确认`VERCEL_AUTOMATION_BYPASS_SECRET`存在且长度32，未输出或持久化值。Preview路由同时发送保护头；`x-vercel-set-bypass-cookie: true`仅在每个页面首次同源请求发送一次，`x-vercel-protection-bypass`只发送到目标Preview origin，跨origin计数0。
- 根路径与`/cases/P003/`不再302到Vercel登录页，最终origin保持目标Preview；`/api/health/`返回HTTP 200，API 2.6.0，部署SHA `08b2843b0ee582b4b0fd5ab379b39c94476faaf9`。这关闭了`EXT-PREVIEW-AUTH-20260715-02`的保护层阻塞。
- health真实配置为`patientServiceConfigured=true`、`trainingStateConfigured=false`、`durableAttemptStoreConfigured=false`。P003/zh零轮的首个`init-attempt`到达应用handler后返回HTTP 503 `training_state_secret_missing`；测试现直接报告该错误，不再等待按钮超时。
- P001一轮、中英文、双向切换、刷新、双击和第二阶段按串行门禁未运行。需项目管理员在Vercel **Preview** 作用域配置既有`TRAINING_STATE_SECRET`，并配置`TRAINING_ATTEMPT_STORE_MODE=upstash`及对应`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`后重新部署；不得生成假值、使用客户端变量或关闭fail-closed。
- 两个保护头、首请求cookie bootstrap、严格origin断言、直接应用错误报告和生成物清理已保存为测试提交`6e6b90c`；未修改应用业务代码。

### Vercel Marketplace KV兼容与真实Preview闭环（2026-07-16）

- attempt持久层新增服务端兼容顺序：URL优先`UPSTASH_REDIS_REST_URL`、后备`KV_REST_API_URL`；可写token优先`UPSTASH_REDIS_REST_TOKEN`、后备`KV_REST_API_TOKEN`。只读token、`KV_URL`和`REDIS_URL`不参与解析；URL/token不完整继续fail-closed。health仅公开`upstash_rest`、`vercel_kv_rest`、`mixed_rest`或`none`，不公开值或片段。
- Preview首次复测证明attempt store已配置，但随后真实暴露Agent admission和provider circuit仍只识别旧命名；两者均复用同一安全解析器，未关闭预算、幂等、provider circuit或签名校验。原子提交为`a405f71`、`ec74d16`、`3fe409f`。
- `3fe409f` Preview health HTTP 200，`trainingStateConfigured=true`、`durableAttemptStoreConfigured=true`、来源`vercel_kv_rest`。P003零轮提交成功进入第二阶段；P001中文/英文均取得`live_ai`、DeepSeek、非fallback和`history-log=200`；刷新后`validate-attempt=200`，快速双击仅观察到1个`stage-feedback`；中英双向切换后合法提交成功。
- 完整套件多次被Preview导航层间歇性`ERR_TIMED_OUT`/`ERR_CONNECTION_CLOSED`打断，但失败时无应用API响应；同一部署的逐场景零retry复测补齐5/5业务证据。生成物凭据扫描通过，仅保留`.last-run.json`，未保留截图、trace、Cookie、Authorization或任何变量值。
- Actions run `29499921918`在Node 22完成并通过，Vercel deployment `64SACrqWNGNuhtcM22gnQsZBE7tD`及Preview Comments通过；PR #1保持Draft，Pages deploy按规则skipped，未部署Production，`data/**`零差异。

### Preview 10+5+5稳定性与性能补证（2026-07-17）

- 失败基线证明Vercel Preview没有透传handler本地已设置的标准`Server-Timing`。保持标准头不变，同时增加只含`app/provider/firsttoken/session/history/score`白名单毫秒值的`X-Hematuria-Timing`；不写入JSON，不含病例内容、request/session ID、token或凭据。Vercel官方文档允许自定义响应头，实测新头可读。
- 新增`test:e2e:preview:stability`，每个样本零自动retry并只记录caseId、HTTP状态、回答来源及允许的时间指标。测试基础设施先修复三个自身问题：失败页面未结算promise导致browser级联关闭、英文复用context后的语言偏好污染、把Playwright点击调度等待误算为AI请求耗时。没有修改产品session/token/AI状态逻辑，也没有放宽3秒门槛。
- 当前`8e7d148e3459f3b960161903fba9214998661635` Preview：P001–P010 session一次性10/10，端到端P95=2504ms、服务端P95=100ms；中文P001–P005 live DeepSeek 5/5，回答P95=1623ms、provider P95=1210ms、首Token P95=878ms、history P95=6ms；英文5/5，回答P95=1377ms、provider P95=1060ms、首Token P95=877ms、history P95=11ms、UI dispatch P95=43ms。
- 变体问法基线曾在P003返回`compound_question_preserves_all_facts`、P004返回`unsafe_deterministic_answer`，两者history-log仍200；这是既有安全边界而非provider失败。稳定性门禁改用仓库`smoke-production.mjs`既有单slot onset问法，并以不同病例避免缓存；没有把安全fallback冒充live AI。
- Actions run `29532192980`、Vercel deployment `6X9d21RfowZJWvBMSpbSzTfRvvHb`和Preview Comments均success；Pages deploy按Draft规则skipped。当前下一强制缺口为42例×双语完整七阶段，而Production 10+5+5仍需生产权限/正式部署。

### 42例×双语完整七阶段工程矩阵（2026-07-17，本地候选）

- 新增服务端真实handler矩阵：42例中文与英文共84条attempt依次完成7个受签名阶段，得到588次合法`stage-feedback`和84份`max=360`最终报告；token、case、language、mode、阶段锁及幂等均保持服务端权威。
- 新增浏览器矩阵：桌面端P001–P042中英文共84条UI旅程全部完成七阶段并渲染最终360分报告；移动端P001英文代表旅程同样完成。测试仅用明显的训练占位输入满足UI字段完整性，不断言医学答案得分，不把流程通过写成医学正确性通过。
- 专项结果：服务端矩阵exit 0（0.9秒）；桌面浏览器1 passed/1 skip（3.3分钟）；移动端1 passed/1 skip（3.1秒）。完整Playwright为70 passed/2按项目隔离skip/0 failed（3.4分钟，exit 0）。
- 完整行为链33.5秒exit 0，含42例、572事实、153/419严格分离、419零自动批准、18条冲突隔离及360分；TypeScript和ESLint exit 0。沙箱内`xlsx`目录联接不可见造成的两次基础设施失败已在沙箱外以相同命令通过，不登记为产品失败。
- `data/**`、医学事实、419审核决定、18条冲突、42例`needs_revision`和360评分算法均未修改。当前候选仍需小步提交、普通push及Node 22 CI；Production 10+5+5、医学裁决、人工自然度和真实设备键盘验收继续保持阻塞/人工。

### Patient intent normalization首批（2026-07-17，本地候选）

- 失败基线74问：canonical 8/74、错误unknown 37/74、极性错误67/74。根因是server/TypeScript两套平铺正则漂移，dysuria和时相缺口，以及没有query-relative fact value。
- 新增共享canonical catalog，首批4 intent/66 alias：dysuria、whole-stream、initial、terminal。事实值只从既有双语source slot分类且要求中英文一致；否定词不当作病例答案。
- 修复后86/86专项通过；42例840问为840/840命中、595个known零错误unknown、230个正确unknown、15个医学冲突隔离、0极性错误、双语值一致。
- 相关Patient Agent、pain、history、safe projection、session、Agent API、42×17和360评分回归通过。英文复合general pain+dysuria的首轮回归失败已按真实根因修复，旧断言保持。
- 本批未修改`data/**`、医学事实/极性、review状态、419/161、HEM-P0-001/023、`needs_revision`、Redis/session/deploy或评分。其余11个候选intent仍待下一批，不提前登记完成。

### Preview QA输出安全合同（2026-07-17，本地候选）

- 选择性读取QA HEAD `26920ed977f3ae17449cb9ed1af3359b81d165d5`的报告与最小runner diff，没有整体merge QA，也没有引入其业务代码、大体积trace或本机路径。
- 根因证据为Playwright失败路径可能把受保护请求头写入runner stdout；专用旧输出已由QA删除且磁盘扫描命中0。本轮先冻结真实Preview长跑，不读取或输出真实凭据。
- runner现先将stdout、stderr和spawn错误保存在内存，递归检查Error message/cause/stack及嵌套对象，再扫描JSON、HTML、trace、截图文件名和临时文件；任一明文命中、扫描异常、符号链接或超限文件均fail-closed并删除专用输出。
- 合成随机canary覆盖302、401、403、500、超时、DNS、导航、request interception、assertion及未捕获异常共10条错误路径，以及stdout/stderr、JSON、HTML、trace、截图文件名和临时文件通道；全部被拒绝且canary未进入测试输出。
- Preview配置继续关闭trace、video和screenshot，仅允许目标Preview origin注入；缺少环境变量时保持`BLOCKED_PREVIEW_AUTH`。本地配置测试、canary、ESLint和repository secret scan均通过；真实Preview须在该原子提交推送并完成远程门禁后再运行。
- QA对HEM-P2-028给出`1 request / 1 ID / 1 event`本地关闭证据；HEM-P1-030/031/032为6,216/6,216与168/168零失败，均不再修改。161个来源问题仍为`BLOCKED_SOURCE_REVISION`。Pages旧部署差异只登记部署来源，不修改已通过的路由合同。
- 公开GitHub API独立确认Pages来源为`main`/workflow，最新deployment `5410354110`对应`5a3ad1199ae5e591160f12e410260287f0051875`（2026-07-12）。该历史构建的`cases_public.json`仅P001–P012使用显示ID，P013–P042的30张卡仍以`HX-ADD-001`–`HX-ADD-030`作为href内部ID；这解释了QA观察的12当前路由/30旧路由。当前Production Goal `221b22e`未部署到Pages，故保持`BLOCKED_DEPLOYMENT_MISMATCH`，不修改当前路由代码。

### Patient intent normalization首批15项与CI恢复候选（2026-07-17）

- 在保留首批4项的基础上完成11项扩展；共享catalog现有15 intent、190 alias。42例×15 intent×3中文/2英文共3,150问：3,150/3,150 canonical命中，1,370 known错误unknown=0、极性错误=0；1,715 correct unknown不收集；65次医学冲突保持隔离。
- canonical matcher现优先于旧structured matcher；治理slot与可计分slot分离。未知、双语不一致和待审核事实不会因alias命中而被当成negative或收集；已知事实才返回明确有/没有。
- 完整行为/安全门禁、TypeScript、ESLint通过；受控外部Next进程下完整Playwright为70 passed/2互斥skip/0 failed（184.1秒）。root与Pages basePath均82/82静态页，bundle各25个JS资产，repository scan为323个tracked/candidate，`data/**`零差异。
- 安全HEAD `f22dd1a`的Actions run `29541184518`在旧Playwright基础设施中5分钟超时：此前置单元、TypeScript、ESLint和secret scan均通过。当前候选将`next dev`与production static export分离，并让Playwright直接管理Next进程；42个href继续双语全量断言，浏览器direct/refresh覆盖P001/P013/P042，全部物理路由由82页build兜底。尚需新提交/push后的Node 22 run确认。
- P999在公共路由合同中保持未知且不进入静态参数；本机static server未成功启动，因此当前不声称HTTP 404烟测通过，留给新CI/长期QA复核。

### Patient intent、Preview安全与Node 22远程闭环（2026-07-17）

- Patient canonical首批15项已推送：15 intent、190 aliases；3,150/3,150同义问法命中，1,370个known回答中错误unknown=0、极性错误=0；1,715个真实unknown和65个医学冲突继续保持不确定/隔离。`data/**`、医学事实、审核状态、419条决定、`needs_revision`与360分规则均未修改。
- Preview输出安全层已在真实受保护部署复核：Automation Bypass仅注入目标origin，跨origin注入0；完整runner先捕获、扫描、脱敏再输出，8/8通过后扫描1个生成文件并删除专用目录。没有输出或保留Cookie、Authorization、token、完整签名或环境变量值。
- `b46ddd8`对应Actions run `29545158103`的第一条真实失败是72项Playwright在旧5分钟步骤上限被终止；无测试断言失败。新增42例双语七阶段矩阵单项本地约3.3分钟，完整套件本地4 workers为184.1秒，而Actions固定2 workers，因此旧预算与新门禁不匹配。
- 原子提交`51f9c6f`只将Playwright步骤有界预算由5分钟调整为10分钟，并增加静态合同，禁止通过CLI retries或额外test timeout掩盖失败。Actions run `29546344990`在Node 22.14下success：Playwright 8分06秒success，随后82页build、bundle scan、repository secret scan与clean gate均success；Pages upload/deploy按Draft规则skipped。
- Vercel对`51f9c6fc8543ac0b6a5907fc65974cd72027f67b`部署success，Preview health精确返回该SHA、Training State与Durable Attempt Store均configured。黑盒8/8通过：P003零轮、P001中英文真实DeepSeek、history-log、双向切换、刷新、快速双击与进入第二阶段；10次session 10/10，P95 1304ms；中文5/5回答P95 1560ms，英文5/5回答P95 1662ms。云TTS 403继续按设计降级浏览器语音，不影响问诊与计分。
- PR #1保持Open/Draft；Vercel Preview Comments与Vercel deployment success，Pages继续为`main@5a3ad119`的部署基线差异。下一长期QA起始HEAD为`51f9c6fc8543ac0b6a5907fc65974cd72027f67b`。

### 权威Goal/验收矩阵校正与P999补证（2026-07-19）

- 从干净分支`3a16f9314d1b3cf50e30bc41dcfeaf19f4fa77a8`恢复；`git fetch --prune origin`后本地/远端HEAD一致、ahead/behind `0/0`，没有未知远程提交。
- 完成Goal逐项审计后确认：权威`HEMATURIA_PRODUCTION_GOAL.md`与`ACCEPTANCE_MATRIX.md`仍引用旧`8e7d148`候选及“待push/待Node22复核”，与最终run `29547532678`冲突。本轮只校正文档状态和证据，不扩大验收标准，也不把Production/医学/真机证据写成通过。
- P999静态HTTP缺口已补证：受控`serve-static.mjs`在root和GitHub Pages basePath分别验证P001/P013/P042为200、P999为404；basePath外P001为404。没有catch-all或域名硬编码，测试进程已停止。
- 当前可执行工程P0/P1均已有远程闭环；剩余强制项为具名医学裁决、病例/事实人工终签、Production与合并后Pages权限、真机软键盘/safe-area及人工自然度终验。Goal继续保持“执行中”，PR继续Draft。

### P0/P1状态索引收口（2026-07-19）

- 对`DEFECT_LOG.md`逐ID读取最后状态时发现，部分早期条目仍保留“待CI/待push”历史措辞，虽然后续总括及最终run已经关闭。这会让自动完成度审计产生假开放项。
- 新增文件末尾权威索引：医学P0保持OPEN/HUMAN；已修复工程P0/P1集中标记ENGINEERING CLOSED；Production、真机、自然度和正式系统能力单列EXTERNAL/HUMAN。历史失败证据不删除、不重写。
- 状态索引引用此前验收证据HEAD `270c20b`的run `29672230597`及现有Preview证据；不把文档整理冒充新的应用测试，也不改变任何业务或医学数据。

### 教师验收整改候选（2026-07-20）

- 已确认导师访问的是公开GitHub Pages `main@5a3ad119`，不是当前Production Goal。Pages deployment `5410354110`创建于2026-07-12；页脚同样显示`5a3ad11`。旧`HX-ADD-004`路径实际映射到当前显示病例P016，且旧training-action预检未允许`X-Request-Id`，所以截图为可解释的旧版本CORS失败，不是网络速度问题。
- 自主优化分支`02ac499`的四个提交经逐项diff审查后选择性cherry-pick：`79fd6fa`、`db28ef8`、`f9976f1`、`b116dc0`。没有整体merge分支，没有覆盖当前session/attempt/history-log/Redis/安全修复，也没有修改`data/**`、医学事实、审核状态或360分算法。
- 保留15个canonical intent与自然问法门禁：3150/3150、1008/1008，known错误unknown=0、极性错误=0。新增第4层白名单语义分类器仅在前三层和structured matcher均未命中后工作；strict JSON、阈值0.92、2.5秒、0 retry、缓存、singleflight与30/分钟有界限流。分类器不接收病例数据、不生成答案，最终值仍由canonical投影和治理隔离决定；默认需服务端显式启用，不改Preview/Production环境。
- 新增本地专用Prompt审计和统一server logger。`PATIENT_PROMPT_AUDIT_ENABLED=true`在Production或任何Vercel环境均强制无效；只记录白名单元数据，完整Prompt、payload、问答和凭据不进入日志。Provider错误正文不再拼入异常；Error message/stack在logger中不原样输出。
- 新增教师CORS合同：Pages精确origin及同源Preview的OPTIONS均为204，明确允许Content-Type、X-Request-Id、X-Training-State、X-Idempotency-Key，拒绝未知origin且无wildcard。外部Vercel OPTIONS本轮连接超时，故只登记本地合同通过，线上须由新部署复测。
- 本地完整行为链exit0；TypeScript（沙箱外只读，解决xlsx junction访问限制）和ESLint exit0；Playwright受控外部Next服务器下72 passed/2互斥skip/0 failed，209.6秒，exit0。首次Playwright自管服务器的断言同样72/2，但Windows子进程未退出导致10分钟exit124，不作为门禁通过。
- Vercel同源等价与GitHub Pages basePath均生成82/82页面，25个JS bundle扫描通过；repository secret scan覆盖336个tracked/candidate及历史，`data/**`零差异。Node22、Actions、Vercel部署SHA和真实Preview需提交/push后重新验收；PR继续Draft。
- 本轮代码与专项测试已保存为原子提交`0a9a85c`；文档证据单独提交。推送前仍须fetch并确认远端领先0。

### 教师验收整改：Node 22生成基线CI恢复（2026-07-20）

- 新HEAD `4ff2d04`的Actions run `29712230950`在Node 22.14的首个真实失败为`Conversion idempotency`：`data/cases_en.json`、`data/cases_public.json`和`data/patient_slots_bilingual.json`会被重新生成。后续步骤均被跳过，不能登记为测试失败或通过。
- 根因是自然主诉UI改进后的`simplifiedChiefComplaintEn`同时被数据生成器复用，导致展示文案演进意外改变已审计的生成序列化合同；诊断生成还会让P019/P020待复核主诉落入不合适的英文兜底。没有提交这些生成差异，也没有修改任何医学事实或审核状态。
- 原子修复`0b5acb7`将运行时自然展示与稳定生成格式分离；生成器继续复现既有英文基线，UI保留新自然文案。新增P013、红色小便及P019/P020生成合同断言。
- 提交后隔离worktree幂等性门禁为75个受控输出首轮/次轮均通过；主诉、42例资料完整性、42例公开路由、TypeScript、ESLint、Vercel与Pages两种82页构建、两次25 JS bundle和336文件/历史secret scan均通过，`data/**`零差异。新HEAD仍须普通push并由新的Actions/Vercel复核；PR保持Draft。

### 教师验收整改：真实Preview能力会话竞态（2026-07-20）

- `363aa17`的Actions run `29712640050`在Node 22.14完整通过：Conversion idempotency、行为/医学/安全门禁、Playwright 72 passed/2 skipped、82页构建、23 JS bundle与clean gate均成功；Vercel Deployment和Preview Comments成功，PR继续Draft。
- 同一SHA真实Preview黑盒首先通过health、P003零轮提交及进入第二阶段，随后P001中文UI在`init-attempt=200`、`session/init=200`后把首个`agent-chat`发成401 `session_capability_required`。该失败没有被稳定性API样本掩盖；同部署随后中文5/5、英文5/5 live DeepSeek/history-log证明provider、Training State和Redis均已配置。
- 根因是session初始化effect尚未进入loading的短窗口内发送按钮可用，而`aiSessionId`仍为空。最小修复要求能力会话存在后才允许按钮、Enter或语音提交；规则模式也先取得同一安全能力，不关闭/放宽session、attempt、origin或签名校验。
- 新增延迟session浏览器测试：能力签发前按钮禁用且agent-chat请求0，签发后只发1个带能力的请求；desktop/mobile均通过。完整本地Playwright为74 passed/2 skipped，TypeScript、ESLint、Preview输出canary、两种82页build、两次25 JS bundle、336文件/历史secret scan及`data/**`零差异通过。待原子提交、普通push及新SHA Preview复测。

### 教师验收整改：能力会话竞态远程闭环（2026-07-20）

- 修复提交`1aa79c1`及证据提交`296bf7e`已普通push；本地与远程`codex/hematuria-production-goal`均为`296bf7e6f2e797c634c762b67488b279dfe59a37`，ahead/behind为`0/0`，工作树干净。
- Actions run `29719580921`在Node 22门禁完整成功：行为/医学/安全、TypeScript、ESLint、repository secret scan、Playwright、82页build、bundle scan及clean gate全部通过；Pages artifact按Draft规则跳过。Vercel Deployment与Preview Comments均success，PR #1继续Open/Draft。
- 同一SHA的受保护Preview黑盒`8/8`通过：health精确返回`296bf7e`，Training State与Durable Attempt Store均configured；P003零轮提交进入第二阶段；P001中英文首问均携带服务端能力并取得DeepSeek `live_ai`、`history-log=200`，刷新、快速双击和中英双向切换后提交成功。
- Preview稳定性为session 10/10（端到端P95 1699ms）；中文live AI/history-log 5/5（回答P95 1534ms、provider P95 1139ms、首Token P95 864ms）；英文5/5（回答P95 1327ms、provider P95 933ms、首Token P95 727ms）。输出凭据扫描通过，跨origin保护头注入0。
- 英文场景云TTS仍返回403并按既有浏览器语音降级处理，不影响问诊、history-log或阶段提交；该外部语音配置项未被本次竞态修复冒充关闭。HEM-P1-049工程项已关闭，长期QA准确起始HEAD为`296bf7e6f2e797c634c762b67488b279dfe59a37`。

### QA c83c7d5 P1整改本地里程碑（2026-07-23）

- 选择性读取`origin/codex/hematuria-exploratory-qa@c83c7d5db73cb821b8912770dd07927c6807ee14`的四份QA报告和最小复现；其Production基线与本轮起点均为`70ea9b3c7b31e11a84878de5c277cac60f35481c`。没有merge QA分支，也没有引入QA业务代码或大体积证据。
- `HEM-P1-050`：将缺失英文时相、尿急复合表达和否定选择问法纳入共享canonical规则，并把generic pain限定为独立症状。QA自然问法由630/840提升到840/840；canonical intent由1134/1428提升到1428/1428；错误unknown由4降为0，极性错误保持0。完整门禁又发现“Do you have pain, …”被过度收窄，已恢复独立pain且继续排除flank pain、dysuria等特异疼痛的generic扩张。
- `HEM-P1-051`：纠错、澄清和合法上下文追问不再被semantic reject抢先送入rule fallback；P037病程从既有双语主诉作最小投影，P038合法上下文可进入受控provider。合成provider覆盖P001中英文纠错/澄清、P037/P038连续追问、一次401安全fallback及下一轮live恢复；report detail仍不进入provider。真实Preview的live AI来源仍须新部署后复测。
- 最新QA中的Data Agent P1按报告原义处理：28个数值型final检验缺单位/参考范围时显示“等待审核元数据”，不显示正常横线；`final/not_available/not_performed`改为中英文标签，异常信号优先于final；英文查体、目录、匹配医嘱与报告使用已有非CJK别名或明确待审核占位fail-closed。60个医嘱、257个结果和16个查体项保持ID、状态、绑定和数量；23个缺英文别名的医嘱继续阻塞来源修订，没有自动翻译或猜测医学内容。
- 本地完整门禁：`pnpm run test` exit 0；Playwright 80 passed/2按项目互斥skip/0 failed；Vercel同源与Pages basePath各82/82页；两次25 JS bundle扫描、TypeScript、ESLint、repository secret scan均通过；`data/**`零差异。当前本地业务HEAD为`86f5ad9`，Node 22、Actions、Vercel与真实Preview仍待普通push后的精确新HEAD补证。
- 代码提交依次为`871cc70`、`3fb6e00`、`04d572f`、`86f5ad9`。PR必须继续Draft；不得因工程展示层fail-closed而填写28个缺失元数据、23个英文名称、161个来源问题或任何医学审批状态。

### QA P1整改后的依赖审计CI恢复候选（2026-07-23）

- 业务与证据提交推送至`141f5bb`后，Actions run `30008877764`在Node 22.14的第一条真实失败为`Full dependency audit`；后续测试均被跳过。高危项来自Next `<15.5.21`、Sharp `<0.35.0`及两段`brace-expansion`版本范围，不是Patient、Data Agent或Playwright断言失败。
- `pnpm 11`明确忽略`package.json#pnpm.overrides`，因此覆盖规则已迁移到项目级`pnpm-workspace.yaml`。锁文件现固定Next/ESLint Next `15.5.21`、Sharp `0.35.0`、brace-expansion `1.1.16/5.0.7`；没有放宽审计等级或删除审计步骤。
- 本地`pnpm audit --audit-level high` exit 0，仅余1项moderate；依赖安全提交为`6c1d42c`。该提交只包含`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`，不含业务、医学或`data/**`变化。
- 依赖升级后完整行为exit 0；TypeScript、ESLint、受控外部Next下Playwright 80 passed/2互斥skip/0 failed、Vercel同源与Pages basePath各82/82页、两次25 JS bundle、repository secret scan、75受控输出幂等性和`data/**`零差异均通过。Node 22、Actions、Vercel及真实Preview仍须新HEAD推送后补证。

### QA c83c7d5 P1整改远程闭环（2026-07-23）

- 依赖与证据HEAD `c9f780795c2c7ca52c94e0be944a8824e7c5034c`已普通push。Actions run `30011651645`在Node 22.14完整success：高危审计、75输出幂等性、行为/医学/安全、TypeScript、ESLint、repository secret scan、Playwright 80 passed/2 skip、82页build、23 JS bundle及clean gate全部通过；Pages deploy按Draft规则skipped。
- Vercel Deployment与Preview Comments均success；受保护branch alias的health精确返回`c9f7807`，Patient Service、Training State及Durable Attempt Store均configured。基础Preview黑盒8/8通过；扩展后的11/11又直接验证P001英文纠错/澄清三轮、P037两轮和P038两轮均为DeepSeek `live_ai`、非fallback、history-log 200。
- Preview session初始化10/10，P95 1263ms；中文5/5回答P95 1413ms、英文5/5回答P95 1858ms，均低于3秒目标。保护头只注入目标origin，跨origin为0，输出凭据扫描通过。
- HEM-P1-050工程与远程门禁关闭；HEM-P1-051的真实Preview来源缺口关闭。新增黑盒门禁提交`77df23d`只修改测试，不改业务、医学事实或环境。PR #1继续Open/Draft。

### QA 2107b7b P1/P2整改本地里程碑（2026-07-24）

- 选择性读取`origin/codex/hematuria-exploratory-qa@2107b7b5849acbb586c8f715d2b95b05cda27a8f`的052–056报告、最小测试和脱敏聚合；起点为QA使用的Production基线`c4ac9b5a59021bed10dc2d94c4ebf4d8f97badd2`。没有整体merge QA分支，没有引入大体积证据或QA业务代码。
- `HEM-P1-052`：英文未审核医嘱在服务端权威层按既有reviewed alias策略拒绝，不能用内部ID绕过；23/23英文项目被阻断、同23项中文仍可匹配，关联29条评分链均不得分。未审核英文名称仍保持来源修订阻塞，没有自动翻译或批准。
- `HEM-P1-055`：未满足前置条件的目标医嘱不再写入“已开立”状态或事件；补齐前置后同一会话可重新计算并释放一次。58个“先失败后补齐”和58个“先补齐后请求”场景均通过，不重复结果或评分。
- `HEM-P1-054`：canonical与structured病史改为逐子句、按原顺序合并治理投影；786/786复合病史、618/618跨层、42/42既往肿瘤史诊断边界和56/56医学冲突隔离通过。`Have you had a urinary procedure?`继续命中既往尿路操作，当前外伤诱因不再误归既往外伤。
- `HEM-P1-053`：中英文自然主诉均进入canonical；受控provider 42/42保留live来源，普通blood/red urine/pain/burning/clot不触发安全边界，诊断泄露、Prompt、评分点和JSON仍阻断。80字符格式化不再因补标点生成81字符并误杀合法回答。
- `HEM-P2-056`：非终态空result报告不再渲染空段落；结果行和报告卡使用包含`resultId/orderId`的稳定复合key。桌面/移动精确回归4/4、React key错误0。
- `HEM-P2-044`：360×800与390×844的语音设置入口、关闭、试听、暂停/继续、停止和重播均满足至少44×44 CSS px；相邻语音配置和浏览器语音降级回归通过。真机仍为独立人工验收。
- `HEM-P2-028`：第7阶段完成动作增加同步singleflight锁；同步双击仅产生1个debrief request、1个request ID、1个score和1条stage-7 timeline，不再由较晚409覆盖已成功报告。阶段1–6原双击门禁继续通过。
- 五个业务提交为`fe93b0e`、`ad49132`、`d492cea`、`f6c5269`、`cda359e`。本地完整行为门禁exit 0；Playwright 85 passed/3互斥skip/0 failed；TypeScript、ESLint、两种82页构建、两次25资源bundle、343文件/历史secret scan、clean gate和`data/**`零差异均通过。
- 本机使用Node 24.14；权威Node 22、Actions、Vercel及真实Preview仍须本候选普通push后的精确新HEAD补证。PR继续Draft，不合并main、不部署Production。

### 2026-07-24 新PostCSS公告导致的CI恢复候选

- 首次推送HEAD `2e42d64`对应Actions run `30084158980`，在Node setup和frozen install成功后首先失败于`Full dependency audit`；其余测试均被跳过。准确根因是新高危公告`GHSA-6g55-p6wh-862q`命中Next嵌套的PostCSS 8.4.31（受影响`<=8.5.11`），不是Patient/Data Agent/Playwright失败。
- 项目级override新增`postcss@<=8.5.11: 8.5.15`并更新锁文件；没有放宽审计等级或删除步骤。本地同命令由1 high失败恢复为`No known vulnerabilities found`。
- 受影响回归通过：TypeScript、ESLint、82页同源生产构建、25资源bundle、343文件/历史secret scan，以及布局/报告/触控/双击/axe Playwright 11 passed、1互斥skip、0 failed。完整行为与85/3 Playwright因业务代码未变不重复执行。
- 该依赖候选仍须原子提交、普通push和新HEAD Node 22 Actions复核；run `30084158980`不得作为本轮业务门禁结论。

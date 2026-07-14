# 最终报告（执行中草案）

结论：**尚未完成，禁止宣称生产验收通过。**

## 2026-07-13最新检查点

- Draft PR #1仍为open/draft，未转Ready、未合并、未部署生产；当前远程head在本轮提交前为`cbdc4cf`。
- 用户实测的连接抖动、规则库降级、重复警告、日志不计分和模板化回答已列为P0发布阻断。本地已完成单飞/取消/幂等状态链、日志异步安全同步、提示收敛、动态Preview同源校验和双语Patient prompt修复。
- 本里程碑完整门禁真实通过：完整行为链、生产构建52/52、Playwright desktop/mobile 24/24、bundle 24 JS、repository secret 246文件；相关后续小改专项回归、TypeScript和ESLint亦通过。
- 匿名Preview被Vercel Deployment Protection拦截，无法取得登录态真实DeepSeek、签名日志、P95或自然度样本。所需Preview变量只审计了名称，未读取/修改值；真实AI和日志10/10仍为阻塞，不得写成通过。
- 项目级子Agent成本策略已按官方当前格式落盘：最多3线程、深度1、Spark/Terra/GPT-5.6按职责分配；当前会话不能热重载验证显示，需后续新会话确认Codex UI识别。
- 42例仍为`needs_revision`，419条模拟事实未批准，医学数据和审批状态无改动。
- 本轮本地提交为`28b82d7`和`3792980`；证据文档提交及普通push尚在本检查点之后执行，未提前写成成功。
- 随后`28b82d7`、`3792980`和`a9ace13`已普通push；PR head `a9ace13`的Actions run #46与Vercel Deployment均success，Pages部署跳过。PR仍为Draft、未合并。
- 远程绿灯证明构建/确定性门禁通过，不证明受保护Preview中的真实DeepSeek、签名变量、20轮稳定性、P95或人工自然度通过；这些仍为发布阻塞。

### 重大医学风险升级

- 只读自然度抽查确认`patient_slots_bilingual.json`至少18条严格、明确的中英文医学极性相反，涉及11例，全部待人工审核；另有中文onset fallback整段摘要泄露和英文未知回答夹杂中文。
- 该风险使“42例英文流程通过”与“自然度通过”均不成立；既有42×6 fixture测试未覆盖语义极性，不能作为医学一致性证据。
- 未自动修改数据或审批状态。下一步必须由具名医学/双语负责人裁决权威语义，再由工程线程编写受控失败测试和最小迁移；回滚方式为撤销后续专项提交，不得回滚或覆盖他人main工作。

## 当前交付状态

- 仓库基线已核对到`5a3ad11`；专项分支`codex/hematuria-production-goal`当前为`c3c18d3`，包含`2bc3305`运行时安全、`58f456e`CI门禁和`c3c18d3`执行文档三个小步提交，尚未push、未建PR、未部署。
- 已实施formal fail-closed、独立训练签名secret/health、Agent/session Origin与限流防护、participant命名key隔离、统一评分/报告版本、Playwright readiness修复及CI生成数据/仓库secret门禁。
- 工程加固后本地专项6/6、typecheck/lint、完整行为28/28、幂等69、offline reconnect重复6/6、Playwright22/22、clean build52、repo secret 235候选和bundle 24 JS均通过；仍需CI在拟发布commit确认。
- 生产smoke两次均因`fetch failed`失败，health、10+5+5、Actions、Pages/live alias与Vercel live alias仍待验证。
- GitHub connector的Vercel success状态只能作为辅助信号，不能替代live部署与API证据。
- 早前Git写入额度阻塞已于20:48解除；`git fetch --prune origin`成功且远程仍为`5a3ad11`，随后两个小步提交成功。push/PR/CI仍待push前最终复核。
- 实施后再次通过GitHub API compare确认远程`main`仍等于`5a3ad11`；本地候选差异未修改`data/**`，暂存区为空。
- 对拟push SHA `c3c18d3`的最终复验已通过：typecheck、lint、28/28、69 JSON、52页、24 JS、Playwright22/22、235文件secret扫描和frozen lockfile；命令、时间与退出码见`TEST_EVIDENCE.md`。

## 医学治理状态

- 42例全部`needs_revision`、`formalUseAllowed=false`。
- 572条审核追踪项由153条来源追踪项和419条模拟补充事实组成；419条持证专家终签为0，病例级负责人签署为0/42。
- P003 `transfusionHistory`和P005 `coronaryDisease`的旧来源记录已按source对齐，但仍待具名来源核对。
- 151条source辅助标记冲突为P0正式发布阻断；本阶段没有修改医学事实、批准状态或`needs_revision`。

## 本阶段文档交付

- 建立生产目标、执行计划、追加式进度、缺陷日志、测试证据、最终报告草案和回滚计划。
- README与生产API文档统一572审核追踪口径、五个前端主API入口、Node/pnpm CI版本和生产待验证状态。

## 工程实施摘要

- formal-attempt新增病例`formalUseAllowed === true`门禁；42例数据未被改成true。
- `TRAINING_STATE_SECRET`成为正式状态唯一签名secret，health不再用LLM key报告配置完成。
- `agent-chat`与`session init`执行Origin白名单、限流和非泄露错误响应。
- participant进入attempt storage/pointer key命名空间；评分统一`360-event-v1`与`reportVersion: 3`。
- Playwright readiness竞态已修复；CI新增generated data diff与repo secret scan，固定Node/pnpm及ESLint插件解析。
- 这些结论仅代表本地实现与测试，不代表push、PR、Actions、部署或生产冒烟完成。

## 未完成项与批准门

1. 需要具名医学负责人裁决151条source辅助标记语义；该事项不可由AI或脚本代替。
2. 需要CI在拟发布commit复核安全专项、28项行为、69 JSON、generated diff、secret scan、Playwright22项和52页build，并在联网环境完成Actions/Pages/Vercel和生产10+5+5验证。
3. 项目负责人已授权在完成fetch、差异审查、测试和密钥扫描后普通push `codex/*`专项分支；该授权不包括push/合并`main`、自动合并PR或生产部署。
4. Azure未配置时保持SKIP；配置密钥需要单独授权且不得进入仓库。

只有`HEMATURIA_PRODUCTION_GOAL.md`的全部完成条件满足后，才可将本文件状态改为“最终验收完成”。

## 远程交付当前阻塞

- 两次普通push均因`github.com:443`网络不可达失败，专项分支尚未出现在远程，PR与CI尚未创建或运行。
- 本地已补充PR验证触发，并确保PR事件不上传Pages artifact、不执行Pages deploy；网络恢复后需重新完成push前核验、普通push、draft PR及CI记录。
- 该阻塞不改变医学治理门禁：HEM-P0-001仍需具名医学负责人裁决，且禁止自动批准419条模拟事实或解除42例`needs_revision`。

### 最新远程状态

- 网络恢复后，`dbc819e`已普通push到`origin/codex/hematuria-production-goal`；远程main仍为`5a3ad11`，未执行force push、main写入、合并或部署。
- 本机缺少发布技能要求的`gh`，因此draft PR、PR Actions和预览状态仍阻塞；需安装并认证GitHub CLI后继续。

## 最新本地验收增量

- 已将此前未跟踪且状态过时的`ACCEPTANCE_MATRIX.md`纳入专项分支，并按本轮证据区分PASS、PENDING、HUMAN和BLOCKED。
- 发现完整行为门禁遗漏`test:llm`与`test:agent`；更新已漂移的安全架构断言后，将两项纳入聚合门禁。
- 更新后的完整30项行为链、TypeScript和ESLint均exit0；42例中文42×17、英文42×6、临床数据Agent、恢复、TTS和360评分取得本地可重复证据。
- 这些结果不解除医学P0，也不替代PR Actions、生产DeepSeek 5+5、生产session 10/10、Pages/Vercel SHA/live alias或Azure云语音证据。
- 21:28—21:31生产只读smoke再次exit1且所有网络请求无成功样本；当前环境仍无法获取生产health或10+5+5证据，故保持PENDING并列为已知限制。

## PR与CI状态（2026-07-13）

- Draft PR #1：`https://github.com/Niubi1v/hematuria-training-system/pull/1`，open、draft、未合并；base `main@5a3ad11`，检查时head `4d1d36e`。
- GitHub Actions `Deploy to GitHub Pages` run #42成功；build job的全部测试、Playwright、构建和安全扫描步骤通过。Pages artifact及deploy在PR事件均跳过，未发生正式Pages部署。
- 外部Vercel Deployment状态为failure，不是通过；Vercel Preview Comments通过不能替代Deployment状态。错误详情链接需要Vercel访问权限/可用页面，当前未取得真实日志，根因保持未知。
- 因无失败日志，本轮未进行代码修复，也未放宽或隐藏任何测试。PR继续保持Draft。
- 后续head `10a2782`的Actions run #43再次全绿；Vercel再次failure。当前可审计结论是“GitHub Actions通过、外部Vercel失败且日志/权限阻塞”，不是“全部CI通过”。

## Vercel Preview修复状态

- 用户提供日志后确认根因是preview未注入`NEXT_PUBLIC_API_BASE_URL`，导致P001预渲染主动失败。
- 已实现Vercel同源相对API回退，同时保持非Vercel生产构建fail-closed；新增API配置测试并纳入聚合门禁。
- 本地Vercel等价环境52页构建、完整31项行为、TypeScript和ESLint通过。远程Vercel状态必须以修复提交后的新检查为准，PR继续保持Draft。
- 修复提交`3190b27`远程验证完成：Vercel Preview success；GitHub Actions run #44 completed/success。未发生Pages部署、main写入、PR合并或Ready状态变更。

## HEM-P0-023 安全隔离增量（2026-07-13）

- 工程完成：fallback最小披露、双语未知回答、18项冲突事实上下文/评分隔离、固定reason日志、专项与集成测试、专家裁决包。
- 本地门禁：完整32项行为链、TypeScript、ESLint、252文件仓库secret扫描、Vercel等价52页生产构建全部exit0。
- 数据治理：`data/**`零差异；没有翻转、翻译、批准或删除18条事实，没有改变provenance、`teacherReviewRequired`或`needs_revision`。
- 未完成且不可伪造：18条医学最终语义仍需具名专家与复核人裁决；真实Preview DeepSeek、日志10/10、自然度人工验收及性能P95仍须在具有Preview权限/变量的环境复验。
- 回滚：对本增量提交执行普通revert可移除运行时隔离与测试；不得通过修改医学数据或审核状态替代回滚。裁决包仅为待填审核工件，不应导入生产。
- 提交与CI：`ff02d76`（隔离/fallback/测试）、`0d60a90`（裁决包/证据）已普通push到`codex/hematuria-production-goal`；Draft PR #1的Actions run `29206516554`与Vercel均success，Pages deploy skipped。PR未转Ready、未合并、未触发正式生产部署。
- 当前证据HEAD：`558fadd`；Actions run `29206657625` build success，Vercel Preview success，Pages deploy skipped。HEM-P1-002/004/005/010/011/012的工程CI缺口据此解除；其生产权限部分仍归HEM-P1-003/019。

## 周末自主改进检查点（HEM-P1-024）

- 在本地P001真实浏览器复现初始化失败时两条连接提示叠加；已增加浏览器回归并实施单条件UI收敛。
- 专项TypeScript、ESLint、AI/API恢复测试通过；新增Playwright断言因本机浏览器运行条件未执行完成，等待Draft PR Linux CI，不提前宣称通过。
- Preview登录态DOM仍不可访问，真实DeepSeek、日志10/10、P95与人工自然度继续受HEM-P1-019/020阻塞。
- 本增量未修改`data/**`、医学审核状态、环境变量或密钥；回滚方式为普通revert本次专项提交。
- `bde01a0`对应Vercel通过，但Actions run `29225138570`因新增测试fixture语义错误而失败：HTTP 503未产生所断言的网络错误文案，Playwright 32/34。fixture已改为真实请求中断且断言未放宽；当前仍等待下一轮CI，PR保持Draft。
- 修正提交`2520645`远程门禁完成：Actions run `29225349342`全绿，Vercel Deployment与Preview Comments通过，Pages deploy跳过；HEM-P1-024工程项解除。该结果不解除Preview真实AI、性能、密钥作用域或医学人工阻塞。

## UI/UX专项集成检查点（2026-07-13）

- 集成前Production HEAD：`74c140fb77844ee557c739112c68076113375e25`；UI HEAD：`a6630a3547c50ec16ddf4dc68ce61578f3e10f62`；merge-base：`74c140f`。
- 集成方式：在最新Production Goal上逐个cherry-pick三项UI提交，生成`c1bdc4a`、`dec4e74`、`6cc1e2a`；无冲突、无覆盖后续修复。
- 审计确认UI分支没有修改医学数据/审批、Patient Agent医学语义、连接状态机、签名日志规则、360评分算法、环境变量或密钥。
- 集成过程中发现HEM-P1-025：日志自动重试耗尽后手动同步入口被移除。已以最小UI补丁恢复幂等重试并补充失败场景；远程CI前不登记为最终通过。
- 本地通过：TypeScript、ESLint、32/32完整行为、连接/日志/Patient/临床Agent/360评分专项、52/52构建、25 JS bundle及281文件secret扫描。69 JSON本机连续两次挂起但未产生数据差异；集成Playwright本机启动受阻，二者均等待Linux CI。
- UI截图审查覆盖1280桌面及360/390移动；最终axe、desktop/mobile、手动同步回归及Vercel Preview必须以本次集成提交的远程检查为准。
- 医学边界未改变：HEM-P0-001、HEM-P0-023继续阻断Ready/合并/发布；42例`needs_revision`及419条未批准状态保持。
- 建议回滚顺序：先普通revert手动同步修复/证据提交，再按`6cc1e2a`、`dec4e74`、`c1bdc4a`逆序revert；禁止reset或force push。
- 首轮CI并非全绿：head `2283f19`的run `29231277833`在新增Playwright用例失败2项、其余38项通过；此前各工程/医学/幂等/类型/Lint/secret步骤通过，Vercel通过，Pages deploy跳过。
- 失败根因是history-log双层重试使前三个503后仍自动成功，未进入手动恢复态。已把history-log收敛为持久队列唯一的三轮重试，并保持同一requestId、签名验证和其他训练动作恢复策略；最终状态以修复提交的新CI为准。
- 第二轮run `29231718708`仍为38/40；新的代码级证据表明attempts状态写回会重入effect并绕过退避，第三次失败后自动第4次成功。已加入等待锁与三次耗尽停止条件；人工重试显式重置队首计数但继续复用requestId。最终状态仍待下一轮CI，不得提前写为通过。
- UI集成代码验收HEAD `789243d`的run `29232093193`最终success：Playwright 40/40、69 JSON、32项行为、医学合同、360评分、TypeScript、ESLint、281文件secret、52页build与23 JS bundle均通过；Vercel Deployment及Preview Comments通过，Pages deploy跳过。
- PR #1保持Open/Draft、mergeState=CLEAN，未转Ready、未合并、未写main、未正式部署。工程UI集成门禁已解除，但HEM-P0-001、HEM-P0-023、受保护Preview真实AI/性能/签名变量验收仍阻断发布完成声明。

## 2026-07-13继续完成审计结论

- 当前专项分支与远程在`cdfa51f`一致，工作树审计开始时干净；最终head的Actions/Vercel均通过，PR仍为Draft。
- HEM-P1-015与HEM-P1-016的文档状态已按当前事实关闭；它们不再是工程阻塞。ROLLBACK_PLAN已从“尚未push”更新为当前Draft PR和普通revert方案。
- Preview浏览器探针连续两次无法取得可交互状态，因此HEM-P1-020仍为外部权限/连接阻塞。没有把Vercel部署绿灯冒充真实DeepSeek、签名日志、性能或自然度通过。
- 当前剩余强制阻塞均需要外部状态变化：HEM-P0-001与HEM-P0-023需具名医学裁决；HEM-P1-019/020需Preview变量/访问权限；生产health、10+5+5及live alias需生产只读访问。未因这些阻塞修改医学数据、环境变量或生产系统。

## 性能遥测工程增量（待远程CI与Preview复核）

- 新增非敏感`Server-Timing`白名单合同并接入session、Patient Agent/provider、history-log和score；production smoke可输出各阶段样本分布，且明确标记非流式首Token不可测。
- 本地32项行为链、TypeScript、52页Vercel等价构建、25 JS bundle扫描和283文件secret扫描通过；本机ESLint受Node 24与仓库Node 22约束不兼容阻塞，必须以新HEAD的GitHub Actions Node 22结果为准。
- 该增量不改变360分算法、医学事实、HEM-P0-001/023隔离、419审核决定、`needs_revision`、环境变量或密钥。真实AI P95、首Token、日志10/10和自然度仍未通过，PR必须保持Draft。
- 回滚方式：普通`git revert`本次性能遥测提交；不得reset、force push或借回滚修改医学数据。

### 首轮CI状态

- `d9155b8`的Vercel两项检查通过，Actions run `29234298382`因mobile英文切换测试竞态失败（39/40）；TypeScript、ESLint、行为、安全与医学门禁在失败前均通过。
- 已仅修复测试同步点：等待英文session成功后再发送，不改变生产业务逻辑或验收断言；在随后CI完成前没有把Actions提前写为通过。
- 修复HEAD `f052d7e`的run `29235062395`最终success，Playwright恢复40/40；Vercel两项通过，Pages deploy跳过，PR仍为Open/Draft。HEM-P1-026已解除。

## 首Token SSE工程增量（待远程与真实Preview复核）

- 主Patient Agent与通用Agent的`chat_completions`已从固定非流式改为默认SSE，在不改变前端JSON合同的情况下采集真实provider首Token耗时；显式`LLM_STREAMING_ENABLED=false`保留兼容路径且不伪造指标。
- 本地失败测试、SSE/非泄露专项、33项行为、TypeScript、52页构建及扫描均有exit码证据；医学数据、审批状态、360分算法和实际环境变量零修改。
- 工程协议缺口已消除；真实Preview首Token/P95、10/10日志和自然度仍需要登录权限与正确变量作用域，不能写为通过。
- 回滚：普通revert本次SSE增量提交即可恢复非流式provider请求；不得reset、force push或修改医学事实补偿回滚。
- 远程工程门禁：`d2c2eb0`的run `29236606930` completed/success（3分35秒），Playwright 40/40；Vercel Deployment与Preview Comments success，Pages deploy skipped，PR为Open/Draft/CLEAN。该绿灯不替代真实AI首Token/P95样本。

## 2026-07-13 最新Preview结论

- `98e35b1`的Vercel部署Ready且7个API函数均已产出，但Chrome和Codex应用内浏览器都稳定复现P001约5秒后降级；手动重连不恢复，中文问诊约22.4秒才返回fallback并留下评分pending。PR仍不具备发布条件。
- 用户可见修复部分有效：只有一个主要连接警告，fallback为自然中文且不泄露病例摘要，输入清空后仍保持焦点，聊天记录未被重连清空；这些结果不得计作真实AI通过。
- Preview变量名称中AI供应商配置存在，`TRAINING_STATE_SECRET`未见；Standard Deployment Protection开启且OPTIONS allowlist关闭。Runtime Logs无对应函数调用，直接health探针被浏览器客户端阻止，所以当前只能定位到Preview配置/保护边界，不能伪造失败API状态或唯一根因。
- 需要人工操作：在Preview或分支专用Preview补齐`TRAINING_STATE_SECRET`（不得由Codex生成），核对实际API origin与允许源是否一致，并在任何配置变更后重新部署；若API为跨源，再评估OPTIONS allowlist或可信访问方案。随后重跑真实AI中英10/10、日志10/10、20轮稳定性与P95。

## 2026-07-14 静态发布安全里程碑结论（执行中）

- 起始Production Goal远程HEAD为`41b3830a9095c692b3fdbe65a3dbf95b7ece5a37`；审计报告提交`70fb5a38625fc235b09f803faa3da248b37597bf`已安全纳入本地分支。Draft PR #1仍为Open/Draft，未转Ready、未合并、未部署Production。
- SRA六项P1的本地工程边界已实施：v3签名能力、权威attempt CAS/幂等消费、完整服务端阶段锁、签名session、Agent single-flight、旧API 410、严格CORS/请求限制和训练密钥职责分离。
- Serverless安全边界是真实fail-closed：Preview未配置持久Upstash时相关API返回503，而不是回退到进程内Map并声称安全。外部适配器因无凭据尚未集成验证。
- SheetJS high风险已通过官方0.20.3固定依赖和解析资源限制处置；high审计退出0，仍明确保留1项moderate。
- 幂等性测试的假绿已消除，但真实暴露56个生成基线漂移。由于这些输出包含病例、双语、评分和审核派生数据，本轮没有自动重生成或提交；`DCI-P1-003`继续阻断全绿CI，需要权威基线/医学治理决定。
- 本地通过：聚合行为链、TypeScript、ESLint、52页build、25 JS bundle、294文件secret、依赖high门禁；desktop/mobile Playwright最终40/40且33.8秒正常退出。首次34/40失败被保留为证据，修复的是安全夹具而非验收断言。
- 医学边界保持：`data/**`零差异；未批准419条模拟事实、未解除42例`needs_revision`、未修改18条双语冲突事实、未改变360分算法。HEM-P0-001与HEM-P0-023继续需要具名专家。
- 新候选尚未push和CI，不能复用旧HEAD绿灯。推送后预期Actions可能因真实生成基线漂移失败；必须记录真实日志，禁止放宽或跳过该门禁。
- Preview人工阻塞变量名称：`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`、`TRAINING_ATTEMPT_STORE_MODE=upstash`、独立强`TRAINING_STATE_SECRET`。需要Preview/分支专用Preview作用域并重新部署；不得生成、显示或提交值。
- 回滚方式：对后续安全、供应链/CI和证据提交逐项执行普通`git revert`；不得reset、force push、覆盖医学数据或回滚他人提交。回滚权威attempt存储前必须保持PR Draft和正式路径关闭。

## 2026-07-14 终审修订

- 最终只读安全审查在原六项P1实现上又发现三项可重复P1，均已以失败回归固定并最小修复：init重放不再泄露最新bearer、关闭阶段不再允许证据回填、session语言/模式不再接受客户端覆盖。
- 供应链终审发现幂等隔离worktree只取`HEAD`而未明确排除未提交候选；验证器现对任何脏工作树fail-closed，完成提交后才运行。56个基线漂移仍保留为真实失败，不自动写入医学/审核派生数据。
- 本地提交：`47a7c58 security: enforce authoritative training attempts`；`e6cb5b2 security: harden workbook and CI gates`。两者均基于审计报告HEAD `70fb5a3`，可分别普通revert。
- 终审专项、TypeScript、ESLint、敏感信息和受保护数据diff均通过；完整聚合、build、Playwright、bundle、已提交HEAD幂等检查及远程Node 22 CI将在证据提交后执行并按真实退出码登记。
- PR #1继续保持Draft。Preview缺少持久attempt存储/独立签名配置的人工阻塞和HEM-P0-001/HEM-P0-023医学裁决阻塞均未解除。

### 完整门禁结论

- 当前本地候选`ba35c28`：完整行为exit0；TypeScript/ESLint exit0；生产构建52/52；Playwright desktop/mobile 40/40且自行退出；bundle 25 JS、secret 294文件、API配置与dependency high门禁exit0。
- 唯一强制工程红灯仍是`DCI-P1-003`：已提交HEAD的幂等门禁真实exit1并列出56个基线漂移。禁止自动重生成这些病例/评分/双语/审核派生数据；Draft PR不得因其余绿灯转Ready。
- pnpm在受限沙箱的registry attestation EACCES导致的两次超时已与应用构建/Playwright分离：联网精确构建入口通过，显式服务Playwright通过。新HEAD仍需GitHub Node 22 CI确认。
- 推荐后续长期QA起始点必须使用本轮最终证据提交并push后的新HEAD，而不是`41b3830`、`70fb5a3`或当前文档提交前SHA；具体SHA在最终push/CI后补记。

### 当前交接状态（Git网络阻塞）

- 本地安全候选截至`cbe5f3d`含5个尚未远程化提交；远程仍为`41b3830`，PR #1仍Draft。fetch/push因`github.com:443`网络失败，未发生部分push或远程变更。
- 旧HEAD检查全部完成但不能代表新候选。只有网络恢复、重新fetch核对、普通push、GitHub Node 22 CI与Vercel新Preview完成后，才能填写最终推荐QA SHA。
- 网络恢复后的准确顺序：`git fetch --prune origin` → 核对远程仍为已知祖先 → `git status`/range diff/secret扫描 → 普通push当前分支 → `gh pr checks 1 --watch`。保持Draft，不合并、不部署Production。

### 远程验证后的修订结论

- 网络已恢复，`6fcd325`已普通push；Actions run `29287786411`、Vercel和Preview Comments全部success，Pages deploy skipped，PR仍Draft。
- 先前报告的56文件本地红灯已证实为Windows全局autocrlf造成的临时checkout行尾假差异；Linux CI对75输出通过。跨平台修复`bb130c1`不更改任何数据，仅让隔离checkout保持提交对象LF；Windows随后75/75通过。
- 因此`DCI-P1-003`不再是医学治理基线阻塞。`bb130c1`及本次证据提交仍需普通push并取得新一轮CI；真正剩余发布阻塞仍是HEM-P0-001/HEM-P0-023具名医学裁决，以及Preview持久attempt存储/独立签名变量和真实AI验收。

### 最终工程发布检查点

- 代码与完整证据head `9d405fd`已普通push；Actions run `29288294002`、Vercel Deployment和Preview Comments均success，Pages deploy skipped，PR #1保持Draft。
- 本轮所有无需外部权限的静态发布P1工程项已修复并取得本地/远程可重复证据；`DCI-P1-003`跨平台关闭，未更改`data/**`或医学审核状态。
- 推荐长期QA的代码起始HEAD：`9d405fd95c979099a58a90824616c9728360a8f4`。若随后仅追加本节状态文档，可使用其文档-only后代，但行为代码基线仍是`9d405fd`。
- 剩余发布阻塞只应按治理边界处理：HEM-P0-001/HEM-P0-023具名专家裁决；Preview持久Upstash与独立`TRAINING_STATE_SECRET`由用户配置并重部署；真实DeepSeek中文/英文、日志10/10、20轮稳定、P95和自然度人工验收。不得将Vercel部署绿灯写成这些项目通过。

### 当前交接检查点（2026-07-14 06:18）

- Preview证据提交、远程和Draft PR head均为`30b0d455d276a24ddb77ebfb77c06219e1871e45`；PR #1为Open/Draft/CLEAN。Actions run `29289645684` build success，Vercel Deployment及Preview Comments success，Pages deploy skipped。
- `10fe60d` Preview的P001静态页面可加载，但初始化后进入降级模式。UI保持单一网络错误提示、重新连接按钮、现有聊天记录和输入框，说明此前提示收敛修复仍在；它不满足真实AI发布验收。
- 匿名health请求返回Vercel Authentication HTML而不是应用JSON，证实当前API链被Deployment Protection截获。真实DeepSeek、Upstash持久attempt、独立签名、日志10/10、20轮、首Token/P95与自然度均仍BLOCKED，不能由Vercel绿灯替代。
- 当前没有剩余可在无权限条件下复现并修复的P0/P1代码缺陷。需人工处理的下一步：为该分支Preview核对保护访问方式及`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`、`TRAINING_ATTEMPT_STORE_MODE=upstash`、独立强`TRAINING_STATE_SECRET`的作用域并重部署；随后运行真实AI验收。不得由Codex生成、读取或修改密钥值。
- 医学阻塞保持不变：HEM-P0-001与HEM-P0-023需具名医学专家裁决；未批准419条事实，未解除42例`needs_revision`，未改变18条双语冲突或360分算法。推荐长期QA起始HEAD为证据提交`30b0d45`或其仅文档后代，行为代码基线为`9d405fd`。

### TTS缓存安全增量（远程已确认）

- `PRV-P2-003`旧32位FNV缓存碰撞已用固定文本对真实复现并修复；不同文本、Origin、音色、语速和音调不能再共用音频，缓存命中还需原tuple、Buffer和未过期同时成立。
- 提交`91b2b23`仅修改`api/tts.js`与`scripts/test-tts-api.ts`；使用Node内置SHA-256，无新增依赖、密钥或环境变量，默认TTL一小时、容量100项。回滚为普通`git revert 91b2b23`。
- 本地TTS专项、API恢复、TypeScript、ESLint、完整行为、52页build、25 JS bundle、294文件secret及75输出幂等均exit0。测试音频是确定性fixture，不是Azure真实服务通过。
- 未改变医学数据、419审核决定、42例`needs_revision`、18条冲突隔离、Patient Agent语义、连接状态机或360分算法。
- head `96fcf80`的Actions run `29291035332` completed/success（4分00秒），Node 22实际执行新TTS专项；75项幂等、294文件secret、Playwright 40/40、52页build、bundle和最终clean gate均通过。Vercel两项通过，Pages deploy跳过，PR继续Draft。
- 推荐长期QA的新行为起始HEAD更新为`96fcf80f5a825585be53715e65851fbc113a7ab0`；若随后仅追加本节远程证据，可使用其文档-only后代。

### Secret Scanner覆盖增量（待远程CI）

- `25ad0a9`将当前文本扫描扩展到Office ZIP/gzip文本、二进制可见ASCII/双对齐UTF-16元数据和可达Git文本历史，新增JWT、Authorization/Cookie及常见云凭据规则；日志不包含命中值。
- 动态fixture、真实295文件/36二进制归档/112提交扫描、TypeScript、ESLint、37段完整行为和75项幂等均exit0。回滚为普通`git revert 25ad0a9`。
- `PRV-P2-004`显著收敛但不伪造全覆盖：历史压缩二进制、图片像素OCR/隐写、GitHub组织级artifact/日志保留仍需独立工具/权限。
- 唯一moderate仍是Next稳定版内部PostCSS；官方公告要求`>=8.5.10`，但稳定Next仍固定`8.4.31`，且本仓库无用户CSS输入/重串行化路径。本轮不使用未经Next稳定版验证的override，仅保留监控和真实1 moderate状态。

#### 远程确认与后续原子安全里程碑

- `52c24325ddd28262458f5eff4f37fe2866d53305`的Actions run `29292415307` completed/success：Node 22.14、75项幂等、完整行为与安全专项、295文件scanner、Playwright 40/40、52/52构建、23 JS bundle和最终clean gate通过；Vercel两项通过，Pages deploy skipped，PR继续Draft。
- `e94721e`修复工作簿解析前ZIP展开边界；`d895e28`修复浅历史scanner证据、完整依赖high审计、未跟踪clean gate及main-only Pages手工发布。失败测试先于修复命中，相关专项、完整行为、TypeScript、ESLint、全依赖审计、75项幂等和secret扫描本地均exit0。
- 两提交均可分别普通`git revert e94721e`、`git revert d895e28`。未修改业务页面、Patient Agent、连接状态机、医学事实、审批状态、环境变量或密钥。
- `04c2a0b0bd61f32d7621651223d10ed0d780ba55`已普通快进push；Actions run `29294906265` / build job `86966184595` completed/success，Vercel Deployment与Preview Comments success，Pages deploy按PR策略skipped。PR #1保持Open/Draft，工作树干净。
- 当前原子P2工程项已完成，不再扩展新的静态P2。已fetch长期QA分支并确认HEAD `4e3b3b1d107d34e2027229b835e2cbd21ddc61d4`、merge-base `52c24325ddd28262458f5eff4f37fe2866d53305`；下一优先级为HEM-P1-034。真实Preview AI/持久存储/密钥作用域及HEM-P0-001/023医学裁决仍未解除。

### HEM-P1-034

- `d8c30be`修复语言切换时单一token/promise ref复用旧attempt能力的竞态；能力仍严格绑定case/language/mode/attempt，服务端校验未放宽。回滚为普通`git revert d8c30be`。
- 失败基线为中文session 200后英文session 401 `invalid_attempt_token`，且脱敏观察明确指向旧attempt/旧language；修复后desktop/mobile双向切换、刷新、快速反向切换2/2，完整practice 40/40及安全合同通过。
- Actions run `29296603010` completed/success，Vercel两项success，Pages deploy skipped，PR继续Draft。长期QA推荐从`d8c30beea1e2fa8085bd42d1a78b64354bc61be8`复测HEM-P1-034；HEM-P1-029、HEM-P1-033与HEM-P1-027仍开放。

### HEM-P1-029

- `24054cf`修复英文session仍生成中文开场的问题：`language`现在进入profile构建，英文仅由中文公开简化主诉生成自然问候，不引入完整病例摘要、诊断、评分点或隐藏病史。回滚为普通`git revert 24054cf`。
- 失败基线在P001稳定命中中文CJK；修复后42/42英文开场通过，42×6英文Patient Agent、中文主诉、语言纯度、训练API/恢复/安全、TypeScript及secret门禁通过。医学数据、419审核、42例`needs_revision`、18条隔离和360分算法零修改。
- Actions run `29297252637` completed/success，Vercel两项success，Pages deploy skipped，PR继续Draft。长期QA应从`24054cfe836cd977ee82a20ad544b701ae46e335`或其文档后代独立复测HEM-P1-029；HEM-P1-033与HEM-P1-027仍开放，真实DeepSeek/Preview变量/医学裁决阻塞不变。

### HEM-P1-033

- `36061ad`修复canonical教师元语言绕过过滤及“可见回答被替换、隐藏slot仍收集”的不一致：服务端不安全deterministic fact fail-closed，客户端只为实际安全展示的回答更新覆盖。没有清洗后猜测P004/P005/P006医学真值；回滚为普通`git revert 36061ad`。
- 直接失败基线和浏览器失败基线均保留；修复后P004/P005/P006、desktop/mobile、完整practice 42/42、Patient/Agent/LLM/隔离、TypeScript、52页build、bundle和secret扫描通过。医学数据、审核状态、18条冲突与360评分零修改。
- 当前代码提交仅在本地：正式fetch/push因GitHub smart-HTTP连接超时受阻，API实时远程SHA仍为已知`0b066dc`。PR继续Draft且未变化；不得把本地门禁写成PR CI通过。网络恢复后重新fetch、普通push、等待Node22/Vercel，再给长期QA新的准确HEAD。

### HEM-P1-027

- QA的7px残余在当前Production再次精确复现；新增双语矩阵证明英文移动头部换行使page-level bottom sticky覆盖更大，单纯压缩8px或选择390px阈值均不是可靠修复。
- 移动normal-flow方案虽使四视口双语几何8/8通过，却破坏既有390×844聚焦输入可见性；第二次焦点滚动补丁仍失败。按两轮无效规则已全部撤回，当前提交树不含027实验，未牺牲触控目标、删除测试或留下部分修复。
- HEM-P1-027继续为发布阻塞OPEN。建议下一轮从独立移动workspace（chat flex scroller + composer非覆盖层）和`visualViewport`/虚拟键盘合同重新设计，测试须同时覆盖开场、末条消息、输入焦点、手动上翻、新消息入口、safe-area及无异常空白。

### Preview 404与配置差异检查点

- 集成前远程/本地HEAD均为`536996601cff7f9db034bcba37b013acae4c25bc`；对应Actions run `29299085374`、Vercel Ready部署`Cam5bt2qVLcLwPYC36HuzKWwtPXY`均success，PR #1仍Open/Draft。
- 404可重复根因不是当前部署随机漏文件：公开显示P013–P042，内部runtime却为`HX-ADD-001–030`；旧静态路由只生成runtime ID。候选同时保留旧runtime路径并增加display ID别名，目录和随机入口改用display ID，故用户可复制、直达和刷新可见编号而不改变内部会话case ID。
- 本地门禁：失败测试先命中；修复后专项desktop/mobile 2/2、完整Playwright44/44、TypeScript、ESLint、82页production build、42例/72路由库存、25 JS bundle和295文件secret扫描通过。代码提交`79d1083`与证据提交`00531d5`均已普通push；回滚为普通`git revert 79d1083`。
- Preview真实AI仍未验收：LLM变量名称覆盖Preview，但训练签名、训练/Agent origin及deployment tier只覆盖Production；P001静态页可加载而会话进入degraded。需要用户只在Preview或分支专用Preview补齐这些已有变量并重新部署，且按既有要求配置持久attempt store。不得由Codex读取/生成值，也不得用fallback、mock或Vercel绿灯冒充真实AI成功。
- 发布阻塞仍包括HEM-P1-027移动遮挡、HEM-P1-020 Preview配置/真实AI/日志/性能，以及HEM-P0-001/HEM-P0-023具名医学裁决。未批准医学事实、未解除`needs_revision`、未修改生产环境或部署Production。
- HEM-P1-035远程关闭：Actions run `29301467610`在Node22通过44/44 Playwright和82/82 build；Vercel Ready部署`CwbEAU3RcmH9PGpZCQuSnt9J7ag3`绑定`00531d5`。分支Preview P013直达与刷新均显示唯一P013、工作区和输入框，无Next 404标记。PR继续Draft，Pages deploy skipped。

### AI防滥用检查点

- HEM-P1-036失败基线证明有效Patient session能把公开端点越权切换到`diagnostic_reasoning`。本地候选把端点固定为Patient/history并加入严格请求合同；非法角色、客户端model/Prompt/密钥/base URL/隐藏上下文、超长问题和非JSON拒绝均有`providerCalls=0`证据。
- 合法Patient/会话/LLM/双语冲突、TypeScript、ESLint和secret扫描通过，受保护医学路径未改。当前候选尚未普通push，不能写成PR/Preview通过；网络恢复后先fetch核对远程`00531d5`，再普通push并等待CI。
- 防滥用仍有发布前P1：TTS能力/body/single-flight（HEM-P1-038）和provider错误率自动熔断/告警（HEM-P1-040）。HEM-P1-037多维Agent预算已在本地与模拟持久命令合同完成，但真实Preview跨实例仍受HEM-P1-020配置阻塞。真实AI、首Token、P50/P95和10/10双语不以fixture或fallback替代。
- HEM-P1-039本地候选已封闭同session不同幂等键的并发绕过：第二项429且不调用provider，原请求完成后恢复；生产使用现有Upstash原子租约，异常claim清理和30秒TTL防永久锁。该租约本身不等同于完整成本预算，后续HEM-P1-037见下一项。
- HEM-P1-037本地候选随后增加9键原子准入：session/attempt请求、输入字符、IP小时/日、项目日请求/token、probe和并发。八类超限测试均保持provider计数，模拟持久命令不含原始session/IP；远程push/CI及配置后Preview跨实例验收仍未完成。
- HEM-P1-038本地候选把TTS冷并发2次Azure调用合并为1，并增加16 KiB JSON/字段/方法/Origin/参数拒绝门禁；TTS API和voice回归通过。当时未覆盖的session capability随后由HEM-P1-041补齐；进程内single-flight仍不等于全局防滥用。
- HEM-P1-041本地候选随后要求并验证Patient session tuple，缓存按session摘要隔离；能力失败不调用Azure，桌面/移动浏览器降级2/2。跨实例持久TTS预算仍为HEM-P1-042；真实Azure没有配置，未伪报成功。
- HEM-P1-042本地候选现把TTS成本边界扩展为持久session/IP/项目预算和跨实例tuple租约：五类超限及quota/in-progress均不调用Azure，6键Upstash命令无原始session/IP/text且不存音频；生产缺store时fail-closed。TTS、API恢复、TypeScript、ESLint和297文件secret门禁通过。真实Azure与配置后Preview跨实例仍未验证，不能写成发布通过。

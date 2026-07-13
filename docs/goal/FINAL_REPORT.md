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

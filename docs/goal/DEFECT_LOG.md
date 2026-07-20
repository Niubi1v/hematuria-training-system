# 缺陷日志

## 开放缺陷

### HEM-P1-025：UI集成曾移除日志同步失败后的手动恢复入口（已解除）

- 级别：P1，训练日志与评分同步可恢复性；状态：已解除并经Draft PR Linux CI确认。
- 发现证据：UI分支`a6630a3`将`logSyncStatus=failed`与pending共用“评分待同步”静态标签，删除了既有重试按钮；自动重试三次耗尽后用户无法恢复同步。
- 安全影响：AI回答仍可显示，但签名日志可能永久停留失败，用户没有可理解的恢复操作；不得通过绕过签名直接计分。
- 最小修复：失败时显示单一“评分同步已暂停/Scoring sync paused”状态和“重新同步/Retry sync”按钮；按钮只递增现有retry nonce，持久队列继续复用原`requestId`及服务端幂等规则。
- 回归：新增Playwright场景，前三次history-log返回503、手动重试第四次成功；要求4次只有一个requestId、一个AI回答并最终显示评分已同步。TypeScript、ESLint及完整行为链本地通过；本机Playwright未完成启动，远程CI结果尚待确认。
- 首轮远程证据：head `2283f19`的Actions run `29231277833`中前19个步骤通过；Playwright 38/40，新增用例desktop/mobile均因5秒内未出现按钮失败。真实根因是通用HTTP恢复层每轮重试3次，持久history队列又重试3轮，前三个503被单轮内部重试吸收后第4次自动成功，测试没有进入“耗尽”状态。
- CI后最小修复：history-log关闭通用层内部重试，仅由现有持久队列执行三次有界退避；其他训练动作仍保留通用重试。预计总调用从最多9次收敛为3次，手动操作为第4次，requestId与签名验证边界不变。
- 第二轮证据：head `853d819`的run `29231718708`仍为38/40且同一按钮断言失败。进一步审查发现`attempts`写回`pendingHistoryLogs`会立即重新触发effect，绕过退避timer；第三次写回又触发第4次自动请求，成功后覆盖短暂的failed状态。
- 第二次最小修复：退避期间增加单一waiting ref；`attempts>=3`时effect停止自动请求并稳定显示按钮；人工操作只重置队首项的attempts后触发同requestId重试。该修复针对新的状态竞态证据，不放宽断言。
- 解除证据：head `789243d`的Actions run `29232093193` completed/success，Playwright desktop/mobile共40/40；69 JSON、完整行为、医学合同、TypeScript、ESLint、281文件secret、52页build和23个bundle资源扫描全部通过。Vercel Deployment及Preview Comments通过，Pages deploy跳过。
- 数据治理：未修改`data/**`、评分算法、签名验证、医学事实、审批状态或`needs_revision`。

### HEM-P1-024：初始化失败时重复显示连接提示（已解除）

- 级别：P1，用户可见体验；状态：已解除并经Draft PR浏览器CI确认。
- 复现：本地P001、1280×720、中文；health与session init均不可用时，页面同时显示“暂时无法确认后端健康状态，仍可继续文字练习。”和“网络连接失败，请检查网络后重试。”。
- 证据：2026-07-13约12:44真实浏览器DOM同时存在两个`role=status`连接提示；页面无横向溢出，控制台记录两次脱敏`api_request_failed`。
- 根因：泛化health提示仅受`reconnectNotice`抑制，没有在更具体的`sessionInitError`存在时让位。
- 最小修复：`sessionInitError`存在时只显示问诊区的具体错误和重连操作，不再叠加泛化health提示；不改变连接状态机、API、医学数据或评分。
- 回归：新增Playwright用例`session initialization failure shows one specific connection notice`。首次PR CI run `29225138570`执行到断言，但fixture使用HTTP 503却要求网络错误文案，桌面/移动2项失败、其余32项通过；fixture修正为真实请求中断并保留精确文案断言。head `2520645`的run `29225349342`全部通过，含desktop/mobile Playwright、构建与扫描；TypeScript、ESLint、AI recovery及API recovery亦exit0。

### HEM-P0-023：双语患者槽位存在明确医学极性矛盾

- 级别：P0，重大医学风险；阻断英文真实AI、fallback验收、PR Ready、合并与发布。
- 发现方式：对`data/patient_slots_bilingual.json`做只读严格词义核对；没有修改任何病例、事实、provenance、审批或`needs_revision`。
- 严格确认18条相反陈述，涉及11例：`pain` 5条、`dysuria` 3条、`urinary_frequency` 1条、`urinary_urgency` 9条；其中4条标为`source`、14条为`derived_from_case_facts`，18条均`teacherReviewRequired=true`。
- 代表证据：P001中文`pain=无痛性`，英文为`I have pain with it.`；P001中文`dysuria=无痛性`，英文为`It hurts or burns when I urinate.`；P002中文`无明显尿频尿急尿痛`，英文frequency为`I have been urinating more often.`。
- 另有体验/泄露证据：P001中文问“什么时候开始”时rule fallback返回整段病例摘要；英文未匹配既往史问题可返回中文“不太清楚”。
- 粗筛曾得到372条极性差异，但包含长摘要中其他阴性词等假阳性，禁止把372当作迁移清单或自动批量修复。
- 必须由具名医学/双语负责人确定每条权威语义和受控修复范围；AI不得自动翻转极性、批量改数据、批准事实或解除`needs_revision`。
- 工程隔离状态（2026-07-13）：已在运行时以固定18项清单隔离；不进入确定性Patient Agent上下文、不调用上游AI、不参与评分，命中时仅返回同语言自然不确定表达，并记录`reason=medical_bilingual_conflict_pending_review`。
- fallback泄露与语言一致性已修复：未匹配问题不再返回整段病例摘要，英文未知回答不再跨语言返回中文；专项与完整行为门禁通过。
- 医学真值仍为开放P0；配套`docs/goal/HEM-P0-023_ADJUDICATION.md`及18行专家裁决表已生成，所有最终值、决定、审核人、日期和导入状态均为空。

### HEM-P0-018：Preview AI连接、日志同步与回答来源体验失败

- 级别：P0，PR #1发布阻断；状态：本地工程修复完成，待新Preview真实AI复验。
- 用户证据：连接状态反复切换，同时出现规则库、上次AI失败和日志不计分提示，回答模板化且无法确认真实DeepSeek来源。
- 根因：初始化与health生命周期耦合、缺少单飞/旧请求取消、问答过程误用连接checking、AI展示同步等待签名日志、独立警告叠加、动态Preview同源CORS依赖静态白名单、生成来源与事实来源混用。
- 修复：单飞初始化和重连、服务端init幂等、AbortController及可取消退避、脱敏状态转换、history-log持久幂等队列与签名动作串行化、单提示UI、严格同源Preview接受、`generationSource`/`factSource`分离、双语患者prompt改进。
- 本地证据：专项API/恢复/训练测试、TypeScript、ESLint、完整行为链、构建52页、Playwright24/24、bundle24及secret246均通过。
- 关闭条件：登录态Preview连续20轮无意外fallback，真实AI中英各10/10，日志验证10/10且无重复计分，状态无抖动，人工自然度通过；本地fixture不得替代。

### HEM-P1-019：Preview服务端变量作用域待人工核验

- 状态：阻断真实AI/签名远程验收，不阻断本地工程。
- 必须仅核对名称、不得读取或输出值：`LLM_ENABLE_AI_PATIENT`或`LLM_ENABLE_AI_AGENTS`、`LLM_API_KEY`、`LLM_API_BASE_URL`、`LLM_MODEL`、`TRAINING_STATE_SECRET`；按部署需要核对`AGENT_API_ALLOWED_ORIGINS`、`TRAINING_API_ALLOWED_ORIGINS`及相关限流变量。
- 要求：变量须处于Vercel Preview或该专项分支Preview作用域，变更后重新部署；任何密钥不得使用`NEXT_PUBLIC_`前缀。
- 2026-07-13 17:05只读核验（仅名称/作用域）：Preview清单存在`LLM_PROVIDER`、`LLM_API_KEY`、`LLM_API_BASE_URL`、`LLM_MODEL`、`LLM_ENDPOINT_TYPE`、`LLM_TEMPERATURE`、`LLM_MAX_TOKENS`、`LLM_REQUEST_TIMEOUT_MS`、`LLM_ENABLE_AI_PATIENT`、`PATIENT_AGENT_ALLOWED_ORIGIN`，均标记Production and Preview；未看到`TRAINING_STATE_SECRET`。没有展开、读取或修改任何值。
- 同一部署使用Standard Vercel Authentication，OPTIONS allowlist未启用。若客户端实际跨源调用API，该保护配置会拦截不携带登录凭据的预检；当前未取得实际失败请求URL/HTTP状态，故该项只登记为待验证风险，不冒充唯一根因。

### HEM-P1-020：当前执行环境无法访问受保护Preview应用

- 状态：外部权限阻塞；匿名GET被Deployment Protection HTML替代，POST session为401。
- 影响：无法从当前环境采集用户登录态的控制台、API错误码、DeepSeek耗时、首Token、日志签名耗时和真实回答样本。
- 处置：由具备Preview访问权限的会话复跑Playwright/network trace；不得提交或输出bypass token、Cookie或Authorization。
- 最新复验：`a9ace13`对应Vercel Deployment已success，但in-app浏览器直达`/cases/P001/`仍在20秒内无法取得DOM；部署成功与应用登录态体验通过必须分开登记。
- 2026-07-13 15:40复验：Chrome可枚举到标题为“血尿多智能体临床思维训练平台”的Preview P001标签及目标URL；两次接管后，第一次DOM读取超过30秒并重置连接，第二次连标题/URL最小探针在60秒内亦未完成。未读取Cookie、Authorization、localStorage或任何密钥；继续登记为外部访问阻塞，不得据此评价真实AI成功率或性能。
- 2026-07-13 16:58—17:06复验取得页面DOM：Chrome和Codex应用内浏览器均在P001首次加载后约5秒产生两次`api_request_failed`并进入降级模式。Chrome手动重连最终仍回到网络失败；一次“您好，哪里不舒服？”约22.4秒返回自然中文`rule_fallback`并显示“评分待同步”，输入焦点保持且未泄露病例摘要。部署资源确认7个API函数均存在，但部署过滤后的Runtime Logs无对应函数调用；浏览器直接打开health路径被客户端阻止，故请求路径/状态仍不可审计。HEM-P1-020从“页面不可达”收窄为“受保护API链路不可审计/不可用”，不解除发布阻断。
- 2026-07-14 06:12—06:18复验当前`10fe60d` Preview：P001静态页面和应用标题可加载，但DOM初始化后显示`回答来源：降级模式`及唯一的“网络连接失败，请检查网络后重试。”提示/“重新连接AI”按钮；聊天记录与输入框保留。匿名`GET /api/health/`约2.4秒返回HTTP 200、`text/html`和Vercel Authentication页面，而非应用health JSON，证明API请求未到达health handler。控制台读取通道两次超时，故没有伪造API错误码或DeepSeek日志；阻塞仍需Preview访问/保护策略与变量作用域人工处理。

### HEM-P1-021：真实首Token指标当前不可测（工程采集已解除）

- 状态：工程采集已解除并经Draft PR CI确认，真实Preview待验证。主Patient Agent与通用Agent的`chat_completions`现默认使用供应商SSE，在服务端聚合为原有JSON响应，并记录首个非空provider token耗时。
- 安全边界：只累计`delta.content`；`reasoning_content`仅用于确定首Token时点，不保存、不返回、不写日志。客户端只见白名单`Server-Timing:firsttoken`毫秒数，非流式兼容路径不会伪造指标。
- 2026-07-13初始工程增量先新增白名单化`Server-Timing`合同，覆盖session、应用总耗时、真实provider调用、history-log与score；当时非流式smoke明确输出`patient-first-token=unsupported`。当前SSE增量已将该输出替换为真实样本分布，且仍不包含问题、病例、签名、token或密钥。
- 剩余阻塞：真实首Token/P95仍需可登录且具备真实AI/签名变量的Preview环境采样。本增量消除本地协议与采集缺口，但不把外部验收改为PASS。
- 远程证据：`d2c2eb0`的Actions run `29236606930` build success（3分35秒），Playwright 40/40；Vercel Deployment与Preview Comments success，Pages deploy skipped；PR保持Open/Draft/CLEAN。

### HEM-P1-026：移动端英文切换E2E未等待session就绪（已解除）

- 级别：P1 CI阻断；状态：已解除。修复HEAD `f052d7e`的Actions run `29235062395` completed/success，Playwright 40/40。
- 证据：`d9155b8`的Actions run `29234298382`中TypeScript、Lint、行为与安全门禁均通过；Playwright 39/40，唯一失败为mobile英文切换后立即发送，5秒内未出现`I do not have pain or fever.`。
- 根因：测试点击English后未等待请求体`language=en`的session init响应即发送，移动端并行运行暴露初始化竞态。
- 修复：发送前等待英文session响应成功；未延长断言、未改变预期文本、未跳过移动端或放宽业务行为。Vercel Deployment与Preview Comments在该失败HEAD均通过。
- 远程复核：build 3分31秒通过，Vercel Deployment与Preview Comments通过，Pages deploy按PR规则跳过；PR保持Draft。

### HEM-P0-001：151条source记录的辅助来源标记冲突

- 级别：P0，正式签署与发布阻断。
- 状态：阻断，待具名医学负责人裁决。
- 证据：`data/hematuria_release_v14_normalized.json`交叉统计为模拟/是419、source/否2、source/是151。P001 `transfusionHistory`约28758–28767行为冲突示例；P003约29058–29067行为正确修正对照。
- 测试缺口：`scripts/test-medical-review-workbook.ts:29-32`断言旧工作簿572行“是否程序或AI补充”全部为“是”，没有验证153/419严格分离。
- 风险：辅助字段可能误导专家对来源、程序补充和审核责任的理解，污染正式签署证据链。
- 安全现状：主`provenance`、153 sourceTrace、419 queue、`teacherReviewRequired`和审批状态未被自动提升。
- 处置要求：先定义该辅助字段的唯一语义，再由数据owner编写受控迁移和回归；禁止本阶段批量改值、批准事实或解除`needs_revision`。

### HEM-P1-002：移动端offline reconnect全量测试存在波动

- 状态：已解除；本地24/24及当前Actions Playwright E2E均通过。
- 证据：2026-07-12 14:50:19–14:50:44 Playwright全量21/22，移动端offline reconnect失败；14:50:56–14:50:58定向重跑1/1通过。
- 修复与复验：修复启动readiness竞态；15:26:36–15:26:41 desktop/mobile offline reconnect重复6/6，15:26:54–15:27:11全量Playwright 22/22。
- 远程证据：run `29206657625` Playwright E2E success；断言保留。

### HEM-P1-003：本轮生产状态无法验证

- 状态：开放，发布阻断。
- 证据：普通和提权`pnpm run smoke:production`均`fetch failed`；提权运行时间14:51:39–14:53:46。
- 未验证范围：health、10次session init、中文5次、英文5次、Actions、Pages/live alias、Vercel live alias及云TTS。
- 处置要求：在获准且可联网环境按原命令重跑，保存响应版本/SHA、计数、延迟和错误码。
- 最新复跑：21:28—21:31只读smoke再次exit1；health、10次session、5+5 Patient、training action及四音色均无成功样本。独立网页通道也未取得health响应，根因仍未能在当前环境区分。

### HEM-P1-004：训练状态专用密钥声明与实现回退不一致

- 状态：工程缺陷已解除；生产环境配置核验仍归HEM-P1-019权限阻塞。
- 修复：正式状态只使用独立`TRAINING_STATE_SECRET`；health只有检测到该独立secret才报告`trainingStateConfigured=true`。
- 门禁：formal-attempt同时要求病例`formalUseAllowed === true`；未把当前任何病例改成true。
- 远程证据：当前Actions完整行为链success；生产只核验布尔状态，不读取或修改真实secret。

### HEM-P1-005：participant级attempt隔离声明高于当前实现

- 状态：工程key隔离已解除并经CI确认；正式OSCE/RCT仍因医学P0、鉴权、数据库和审计要求禁用。
- 修复：attempt storage/pointer key加入participant命名空间，并继续隔离case、mode、language、attempt和schema。
- 远程证据：当前Actions完整行为链success；该修复不等同于研究级身份鉴权或持久化审计。

### HEM-P1-010：Agent/session公开入口缺少统一请求防护

- 状态：工程缺陷已解除并经CI确认；生产CORS真实Origin仍归HEM-P1-003外部验收。
- 修复：`agent-chat`和`session init`加入Origin白名单、速率限制及非泄露错误响应；专项测试纳入非法Origin、限流和敏感字段检查。
- 远程证据：当前Actions完整行为链及repository secret scan success；生产仍须从GitHub Pages Origin验证允许/拒绝行为。

### HEM-P1-011：评分报告版本标识不统一

- 状态：已解除；本地及当前Actions评分/训练/bundle门禁通过。
- 修复：评分标识统一为`360-event-v1`，结构化报告统一`reportVersion: 3`。
- 远程证据：run `29206657625`完整行为链、adversarial scoring和bundle scan success。

### HEM-P1-012：CI缺少生成数据diff与仓库级secret门禁

- 状态：已解除；当前GitHub Actions实际运行通过。
- 修复：CI新增generated data diff和repo secret scan；运行时固定Node/pnpm，并直接加载Next legacy ESLint插件。
- 本地证据：repo secret scan检查235个候选文件exit0；lockfile-only frozen offline检查exit0。
- 远程证据：run `29206657625`的Generated data matches committed baseline与Repository secret scan均success。

## 已通过文档修订处置

### HEM-P1-014：专项分支曾无法连接GitHub远程（已解除）

- 状态：已解除；第三次联网核验及普通push成功。
- 证据：21:00及21:01两次`git push -u origin codex/hematuria-production-goal`均exit 128，错误为无法连接`github.com`端口443。
- 安全影响：远程分支、PR和CI均尚未产生；本地提交与工作树完整，未发现未知远程提交或冲突。
- 解除证据：重新执行`git fetch --prune`及全部push前门禁后，`dbc819e`已普通push到专项分支；未使用force push或直接写main。

### HEM-P1-015：draft PR创建缺少必需的GitHub CLI（已解除）

- 状态：已解除；GitHub CLI已安装并认证，Draft PR与CI可正常读取和更新。
- 证据：专项分支已成功普通push，但`gh --version`返回命令不存在；发布技能要求先通过`gh --version`与`gh auth status`。
- 解除证据：`gh auth status`显示活动账号具备repo/workflow作用域；Draft PR #1保持Open/Draft，最终审计head `cdfa51f`的run `29232460170` completed/success。未直接写main、未转Ready、未合并。

### HEM-P1-016：完整行为门禁遗漏LLM与统一Agent入口（已解除）

- 状态：已解除并经PR CI确认。
- 发现证据：21:21直接运行`test:llm`和`test:agent`失败；现有`package.json scripts.test`没有执行这两个已声明入口。
- 根因：两个测试仍断言旧DeepSeek profile envelope和前端硬编码端点；生产实现已使用本地权威profile及集中API配置，导致测试契约漂移，同时聚合门禁没有暴露漂移。
- 修复：按当前安全架构更新断言，并将两个入口加入完整行为链。
- 复验：21:25更新后的完整30项行为链exit0；TypeScript与ESLint exit0。不得据此替代PR CI或生产冒烟。
- 远程解除证据：最终审计head `cdfa51f`的run `29232460170`中Unit and behavioral tests、Typecheck与Lint均success；当前聚合链为32项并继续包含LLM adapter与Agent Chat入口。

### HEM-P1-017：Vercel Preview缺少公开API origin导致预渲染失败（已修复并经CI确认）

- 级别：P1，阻断Preview Deployment。
- 首条根因：预渲染`/cases/P001`时`src/lib/apiConfig.ts`抛出`NEXT_PUBLIC_API_BASE_URL is required for production builds.`；末尾ELIFECYCLE仅是结果，不是根因。
- 失败条件：Vercel preview使用production构建，但项目没有向该preview注入`NEXT_PUBLIC_API_BASE_URL`。
- 最小修复：仅当`VERCEL=1`且没有显式origin时使用同源相对`/api/*`；非Vercel production/static export继续fail-closed，显式origin继续要求HTTPS且不得带路径、query或fragment。
- 回归：新增`test:api-config`并纳入完整行为链；Vercel等价无origin环境`next build`成功生成52页，包括P001-P042。
- 远程确认：修复提交`3190b27`的Vercel Preview Deployment成功；GitHub Actions run #44 completed/success。

- HEM-BLK-013：Git写入额度阻塞已解除；20:48成功fetch，随后创建`2bc3305`与`58f456e`两个小步提交。仍须完成push前复核、普通push专项分支、PR与CI。

- HEM-P2-006：将“572条事实总数”统一说明为“572条审核追踪项”。
- HEM-P2-007：README“三个API入口但列出四项”修正为五个前端主入口，并说明兼容路径。
- HEM-P2-008：本地运行版本从Node 20修正为与CI一致的Node 22.14、pnpm 11.7.0。
- HEM-P2-009：生产文档不再把health、10+5+5、Actions/Pages/live alias写成当前已通过。

## 2026-07-14 静态发布审计处置矩阵

### 本地工程修复完成、等待新HEAD远程CI/Preview

- `SRA-P1-001`：签名快照回放与重复计分。以权威attempt状态、token CAS、请求摘要和服务端幂等记录修复；并发相同score只提交一次，旧token重放返回409。Preview持久适配器仍需外部配置后复验。
- `SRA-P1-002`：服务端阶段绕过。所有临床Agent与score均由权威当前阶段授权，非法提前请求4xx且不返回未来结果；合法七阶段、刷新恢复和重新提交失效链已有测试。
- `SRA-P1-003`：旧API安全边界。旧patient reply/profile路径改为严格CORS的410；请求体限制、错误收敛和有界内存键已补齐。
- `SRA-P1-004`：Patient Agent无session。session能力绑定attempt/case/language/mode/有效期；缺失、篡改、跨病例/跨语言session均拒绝。
- `SRA-P1-005`：训练签名复用LLM密钥。已取消fallback并拒绝弱值、示例值和相同值；Preview独立密钥仍需人工配置。
- `SRA-P1-006`：Agent无服务端幂等。增加签名session范围内的claim/complete、请求摘要冲突和并发single-flight；Vercel无持久存储时fail-closed。
- `DCI-P1-001`：`xlsx@0.18.5` high公告。已固定官方0.20.3并限制所有工作簿解析资源；`pnpm audit --prod --audit-level high`退出0，仍有1项moderate另行跟踪。
- `DCI-P1-005`：CI安全门禁不足。工作流已加入production dependency high audit、安全行为聚合、Playwright退出和clean worktree，且权限/Action版本固定；等待新HEAD Actions确认。

### 仍开放的P1

- `DCI-P1-003`：旧幂等脚本假绿的执行逻辑已修复，但新只读验证真实发现56个生成输出与提交基线漂移并exit1。不得自动覆盖`data/**`或审核产物；需要确认权威生成输入/基线并完成医学治理审查后，才能更新黄金基线。CI预期在此项保持红灯，除非基线被合法解决。
- `SRA-EXT-P1-001`：Preview权威存储/签名配置未验证。需仅在Preview或分支专用Preview配置`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`、`TRAINING_ATTEMPT_STORE_MODE`和独立`TRAINING_STATE_SECRET`后重新部署；当前不得宣称真实serverless防重或AI会话通过。

### P2状态

- `SRA-P2-001`请求体/状态总量已增加上限；`SRA-P2-002`的Map有界问题部分修复，但进程内限流仍不是全局配额，后续应迁移到持久存储；`SRA-P2-003`继续由现有timer清理/Playwright覆盖。
- `DCI-P2-004`工作流最小权限、主分支触发和Action SHA固定已完成；`DCI-P2-002`仍是1项moderate，未伪造成零漏洞。registry确认`next -> postcss@8.4.31`命中`GHSA-qx2v-qp2m-jg93`（修复`>=8.5.10`）；官方Next稳定版仍精确固定旧版，仓库搜索无用户CSS解析/重串行化/动态style注入路径，故保留为不可达P2并等待稳定版，不使用未经支持的override制造audit假绿。
- `PRV-P2-001/002`仍需后续隐私设计：localStorage保留期需隐私负责人决定，第三方数据告知需法务/供应商控制台证据。
- `PRV-P2-003`（已修复并经PR CI确认）：旧TTS缓存只用32位FNV键，固定文本`tts-pbfuso-17pa`与`tts-jzkt95-23ce`在相同参数下均为`fc93de32`，第二请求真实命中第一音频。修复为Origin+voice+rate+pitch+text规范化tuple的SHA-256键，缓存项再次保存并核对原tuple，增加1小时TTL、100项上限及旧格式拒绝；head `96fcf80`的run `29291035332`在Node 22实际执行专项并全绿，Vercel两项通过。
- `PRV-P2-004`（本地显著收敛，待PR CI）：scanner新增JWT、Authorization/Cookie、AWS/Google/Azure/Slack及通用敏感赋值规则；以资源上限扫描当前Office ZIP文本条目、gzip和二进制ASCII/双对齐UTF-16元数据，并扫描可达Git文本历史。动态fixture验证已删除历史与压缩XLSX能失败且finding不含值；真实295文件/36个二进制归档/112提交扫描通过。仍不宣称覆盖历史二进制压缩内容、图片像素OCR或组织级artifact/log保留。

### 2026-07-14 终审新增缺陷

- `SRA-P1-006`（已修复，待CI）：相同init请求可从缓存路径取得`record.currentToken`，在无需现有bearer的情况下泄露最新训练token。修复为只重放原始init响应，移除权威记录中的明文current token；回归确认重放所得原始token在推进后返回409 `stale_attempt_token`。
- `SRA-P1-007`（已修复，待CI）：服务端阶段检查仅拒绝未来阶段，允许关闭阶段后的history/order/mdt证据回填并影响最终评分。修复为非反馈动作必须精确匹配`currentStage`；三个晚到动作均409，拒绝前后权威状态深比较一致。
- `SRA-P1-008`（已修复，待CI）：session初始化验证token后仍使用客户端language/mode签发capability。修复为校验权威state、token claims和请求三方一致，并只在capability中签规范化权威模式；跨语言/跨模式均409。
- `DCI-P1-006`（已修复，待已提交HEAD验证）：隔离worktree固定从`HEAD`创建，却可能在调用者存在未提交候选时被误解为验证当前候选。脚本现对全仓脏状态fail-closed，并明确仅验证已提交HEAD。
- `DCI-P1-003`（仍阻塞）：56个受控生成输出与提交黄金基线不一致。安全验证器不得自动更新包含病例、评分、双语和审核派生内容的基线；需权威输入确认及医学治理后另行处理。
- `ENV-P2-001`（本地工具环境，非应用代码）：pnpm 11.7脚本前供应链attestation校验在受限沙箱内访问registry收到EACCES并长时间重试，导致本地`pnpm run build`和Playwright自动webServer入口超时。联网权限下同一`pnpm run build` 28.8秒exit0；显式本地服务下Playwright 40/40且正常退出。新HEAD的GitHub Node 22/开放registry结果仍为最终CI依据。
- `EXT-BLOCK-003`（外部网络阻塞）：`gh api`可读取远程ref/PR，但git smart-HTTP到`github.com:443`连续失败；fetch两次超时，普通push一次connection reset、一次超时，均未写入远程。阻塞新HEAD CI/Vercel Preview；本地提交完整保留，网络恢复后必须重新fetch、比对远程SHA、扫描并普通push。

### 2026-07-14 状态修正

- `EXT-BLOCK-003`（已解除）：443连通性恢复后fetch与普通push成功；未使用force或替代Git API写入。
- `DCI-P1-003`（已修复，待最新CI）：Linux Node 22 CI对75输出通过，证明旧“56基线漂移”不是提交基线缺陷。Windows证据为`i/lf w/crlf`且全局`core.autocrlf=true`；隔离worktree改为按Git对象LF检出后，本地baseline及二次幂等75/75 exit0。比较仍是SHA-256精确字节比较，没有放宽断言或更新数据。
- `DCI-P1-003`（远程确认关闭）：head `9d405fd`的Actions run `29288294002`再次执行75输出幂等并success；本地Windows与Linux Node 22 CI均通过，受保护数据零diff。

### 2026-07-14 当前原子P2处置

- `PRV-P2-004`（工程闭环）：head `04c2a0b`的run `29294906265`以完整checkout执行scanner专项和仓库扫描并success；浅仓库fixture按`history-scan-shallow` fail-closed。仍不宣称覆盖历史压缩二进制、图片像素OCR/隐写或组织级artifact/log保留。
- `DCI-P2-007`（工程闭环）：`safe-workbook`此前在`XLSX.read`后才检查形状，失败fixture证明`maxExpandedBytes`被忽略。`e94721e`增加解析前ZIP中央目录和受限解压检查；本地专项及`04c2a0b`的Node 22完整行为/医学工作簿合同均success。
- `DCI-P2-008`（工程闭环）：`d895e28`增加全依赖high门禁、全未跟踪clean gate、main-only artifact/deploy及按workflow/event/ref并发隔离；run `29294906265`的Full dependency audit、最终clean gate和PR分支deploy skipped行为均符合合同。依赖真实状态仍为1 moderate、0 high。
- 其余静态P2按用户指令暂缓，不在本轮继续扩展；下一优先级为QA复现的HEM-P1-034。

### 长期QA开放P1处置

- `HEM-P1-034`（工程修复完成，待独立QA复测）：旧实现等待中文session成功后切换英文会把中文attempt token发送给英文session，真实失败测试记录`headerPresent=true`、`attemptMatches=false`、`languageMatches=false`并得到401 `invalid_attempt_token`。`d8c30be`把token/promise按attempt键控，并同步取消/清理旧session能力。desktop/mobile双向切换、刷新、快速反向切换2/2及完整Playwright40/40通过；run `29296603010` completed/success，Vercel两项success。服务端跨语言/跨attempt拒绝合同保持不变。
- `HEM-P1-029`（工程修复完成，待独立QA复测）：英文session旧路径稳定返回中文开场，42例失败合同在P001首例exit1。根因是profile构建未接收`language`且问候硬编码中文；`24054cf`只本地化安全简化主诉和开场，不使用完整病例摘要。42例英文开场、42×6英文行为及训练安全合同通过；run `29297252637` completed/success，Vercel两项success，PR仍Draft。医学数据、审核状态和评分算法零修改。
- `HEM-P1-033`（本地工程修复完成，待push/CI与独立QA）：P004/P005/P006 deterministic canonical绕过公开输出过滤；前端替换可见文本却仍收集隐藏slot。`36061ad`增加服务端fail-closed及客户端安全展示/覆盖原子性，桌面失败基线从`clots`已收集修复为零覆盖，desktop/mobile 2/2、完整practice 42/42及相关合同通过。医学真值未改。当前仅因`github.com:443`连接超时尚未push，不能标记远程关闭。
- `HEM-P1-027`（OPEN；两轮最小修复无效后暂停）：360×800中文仍可重复为`opening bottom=661 / composer y=654`。移动间距压缩未覆盖英文，移动normal-flow又使390×844既有输入可见性门禁回归到`879–888 > 844`；实验已全部撤回且工作树无残留。需要把chat/composer改成受visual viewport约束的移动workspace或等价经过设计的结构方案，不能继续叠加像素补丁。

### 2026-07-14 Preview差异增量

- `HEM-P1-033`（工程与远程CI关闭，待独立QA）：`36061ad`、`9b1ffba`与`5369966`已普通push；Actions run `29299085374` completed/success，Vercel两项success，PR仍Draft。旧条目中的Git网络阻塞已经解除。
- `HEM-P1-035`（工程关闭）：可见病例编号P013–P042映射到内部`HX-ADD-001–030`，旧静态参数、目录链接和随机入口使用内部ID，导致按可见ID复制、直达或刷新稳定404。失败测试记录P013卡片href为`/cases/HX-ADD-001/index.html`；`79d1083`增加display ID别名且不改变runtime case ID。run `29301467610` completed/success，Vercel部署`CwbEAU3RcmH9PGpZCQuSnt9J7ag3` Ready；分支Preview P013初次直达和刷新均无404。回滚为普通`git revert 79d1083`。
- `HEM-P1-020`（仍BLOCKED，配置证据更新）：当前Preview部署与分支SHA一致，P001静态页可加载且health runtime请求为200；但训练签名和Agent/training origin变量只覆盖Production，Preview页面仍degraded。需用户将`TRAINING_STATE_SECRET`、`TRAINING_API_ALLOWED_ORIGINS`、`AGENT_API_ALLOWED_ORIGIN`及相应deployment tier配置到Preview/分支Preview并重新部署；持久attempt store变量也须按既有安全方案配置。未读取或修改任何值，真实DeepSeek、日志10/10、20轮和P95仍未通过。

### 2026-07-14 AI防滥用专项

- `HEM-P1-036`（本地工程修复，待push/CI）：Patient session可把公开`agent-chat`的`agentId`改成诊断/检查等其他LLM角色，旧失败合同返回200。现固定Patient-only角色与history阶段，客户端模型/Prompt/密钥/base URL/隐藏上下文和非白名单字段在provider前拒绝；专项断言拒绝路径`providerCalls=0`。
- `HEM-P1-037`（本地工程修复，待push/CI与Preview配置验收）：失败基线第三个session请求仍200；现有Upstash/内存准入原子覆盖session/attempt/IP小时/IP日/项目日请求与token/probe预算，超限providerCalls不变。真实跨实例仍受HEM-P1-020持久store配置阻塞。
- `HEM-P1-038`（本地工程部分修复，待push/CI）：冷并发旧基线`providerCalls=2`，短text+20 KiB padding可调用Azure。现有16 KiB JSON/字段合同及同tuple single-flight，专项通过；session capability和跨实例持久配额拆为HEM-P1-041。
- `HEM-P1-039`（本地工程修复，待push/CI）：同session不同幂等键可同时进入provider，失败基线`providerCalls=2`。新增Upstash/内存session租约后第二项429且零provider调用，首项结束后可恢复；相同键幂等不变。
- `HEM-P1-040`（本地工程修复，待push/CI与Preview配置验收）：失败基线4个连续503逻辑请求实际调用provider 4次。现有持久/内存熔断在阈值2测试中降为2次，冷却后并发恢复仅1个探测，成功闭合；模拟Upstash命令不含provider URL/model明文。真实Preview错误率、P50/P95与外部告警投递仍受HEM-P1-020配置/权限阻塞。
- `HEM-P1-041`（本地工程修复，待push/CI）：TTS旧路径无session也200。现绑定Patient session的attempt/case/language/mode，能力拒绝providerCalls=0，cache按session摘要隔离；桌面/移动降级2/2。跨实例预算拆为HEM-P1-042。
- `HEM-P1-042`（本地工程修复，待push/CI与Preview配置验收）：失败基线中同session换IP/文本的第二次请求仍200并调用Azure stub。现于provider前原子执行session日、IP小时/日、项目日请求/字符预算及跨实例tuple租约；五类超限、quota/in-progress和serverless缺store均保持provider计数。Redis命令仅含6个哈希键，不保存音频、原始session/IP/text。真实Preview跨实例仍受HEM-P1-020配置阻塞。

### 2026-07-14 AI防滥用远程状态修正

- `HEM-P1-036`—`HEM-P1-042`的已完成本地工程提交已普通push至`87cb4f5`；此前“待push/CI”的网络阻塞解除。Actions run `29305846597` build success，Vercel两项success，PR仍Draft。
- `HEM-P1-040`工程P1关闭；配置后Preview真实Redis跨实例/Lua TTL与provider错误率验证仍由`HEM-P1-020`阻塞，外部告警投递和真实性能样本仍待权限/配置，不得因CI绿灯关闭这些验收项。

### 2026-07-14 HEM-P1-027 状态修正

- `HEM-P1-027`（本地工程修复，待push/CI与独立QA）：原QA断言已纳入主Playwright并先稳定失败7px。根因不是composer高度本身，而是移动端页面级sticky能越过尚在视口下方的聊天容器；英文换行证明固定像素补丁无效。
- 当前候选采用移动normal-flow + 聚焦/输入/visualViewport几何校正，桌面sticky使用实际测量高度的显式spacer。四视口双语、既有输入可见性、20轮手动上翻/新消息、完整46项浏览器及构建/扫描均通过。未降低44px触控目标、未隐藏开场、未删除或放宽旧断言。
- 首轮远程CI run `29309491866`为45/46；唯一失败是QA新增断言将上翻语义过度限定为`scrollTop=0`，实际40px仍远离底部且没有强制回底。已改为产品阈值合同（距底部>72px），新消息前后均验证；CI同并发本地6/6，待下一轮远程确认。
- `HEM-P1-027`（工程关闭；独立真机QA待复测）：测试合同修正提交`4fed076`普通push后，Actions run `29309939497` completed/success，Node22 Playwright、完整行为、类型、lint、82页build、bundle/scanner与clean gate全部通过；Vercel两项success，Pages deploy skipped。没有放宽会话、几何、新消息或末条可见性语义。真实360/390设备软键盘与safe-area仍是独立QA项，不因自动化绿灯伪报完成。

### HEM-P1-043 第一阶段提交失败

- **严重度/状态**：P1；本地工程候选完成，待Node22 CI与最新Preview直接复测。PR保持Draft。
- **用户现象**：第一阶段点击提交失败，不能进入第二阶段；页面旧提示仅为“阶段提交失败，请重试”。
- **已证实工程根因**：提交按钮没有同步单飞锁，快速双击产生2个不同幂等请求；永久配置错误`training_attempt_store_unavailable`在客户端catch路径仍按瞬时503重试，单次操作最多3次，并被折叠为通用提示。
- **外部根因边界**：服务端在Vercel/production缺持久Upstash attempt store时按设计返回503。既有Preview作用域审计显示相关训练变量未覆盖Preview，但本轮无法取得登录态Preview网络日志，故当前实际HTTP状态/error code仍为待直接确认，不把代码推断冒充黑盒证据。
- **修复**：阶段提交使用同步ref锁和提交中禁用态；持久store/签名配置错误不可重试；为配置、过期和状态不匹配提供不含token的双语提示。未关闭stage、token、session、case、language或mode校验。
- **回归**：P001中英合法提交、双向切换、刷新、快速双击、过期token、跨病例token、七阶段与刷新阶段保持均有自动化覆盖。快速双击由2请求收敛为1；配置错误由最多3请求收敛为1。
- **仍需人工/外部操作**：在Preview或分支专用Preview核对`TRAINING_STATE_SECRET`、`TRAINING_ATTEMPT_STORE_MODE`、`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`及既有origin/tier变量的名称和作用域后重新部署；不得由Codex读取/生成值。随后用登录态Preview抓取当前失败请求并复测。
- **Git传输阻塞**：本地修复HEAD `972405a`工作树干净；成功fetch后确认远程`ff1a932`、0落后/3领先，但普通push时连接重置。TCP探测为`github.com:443=false`、`api.github.com:443=true`，PR API确认远程仍未更新。网络恢复后必须重新fetch再普通push，不能通过API改ref或跳过主机校验。
- **工程状态修正**：Git网络恢复后按门禁重新fetch并普通push至`cade64e`。Actions run `29318216424`在Node22通过52/52 Playwright及全部工程/医学/扫描门禁，Vercel两项success；HEM-P1-043工程项关闭，交长期QA复测。登录态Preview真实提交与变量配置仍由HEM-P1-020阻塞，不得把部署绿灯写成运行时配置通过。

### HEM-P2-043 病例目录`.html`链接42/42返回404

- **状态**：`RESOLVED_ENGINEERING`；公开Pages仍为旧`main@5a3ad119`，故线上30个旧内部路由继续登记为`BLOCKED_DEPLOYMENT_MISMATCH`，不属于当前源码回归。
- **失败基线**：Production `3541a706`的目录在desktop/mobile均生成42个`/cases/Pxxx/index.html` href；Next dev逐项404，而同一病例的`/cases/Pxxx/`直接访问和刷新可用。
- **根因**：客户端把静态导出文件名当作公开路由合同；这与Next动态目录路由、Vercel无basePath和Pages basePath三种环境不一致。
- **最小修复**：集中生成经校验的目录URL并可选拼接`NEXT_PUBLIC_BASE_PATH`；目录、随机入口和反馈重试复用同一合同。静态测试服务器加入basePath模拟并让404保留HTTP 404；`dynamicParams=false`保持无效病例受控拒绝。
- **证据**：公共路由合同覆盖42例；Next dev desktop/mobile专项中的目录、第一阶段和双击合同通过；最终run `29547532678`在Node 22.14完成72项Playwright与82页build。2026-07-19对当前`out`启动受控静态服务器：root及`/hematuria-training-system` basePath下P001/P013/P042均HTTP 200、P999均404，basePath外P001亦404；服务器在`finally`停止且无残留。
- **边界**：未使用完整域名硬编码、未增加catch-all、未改`data/**`或医学/评分/session安全规则。正式合并后的Pages部署仍须复测42卡、直达、刷新和双语，当前禁止为旧部署修改已通过合同。

### HEM-P2-028 一次操作产生2 requests / 2 IDs / 2 events

- **状态**：工程关闭，待长期QA在新HEAD确认生产/Preview网络时间线。
- **分类**：QA旧基线`ff1a932`上的实际两个`stage-feedback`请求，产生两个request ID与两个timeline submit事件；不是provider调用、浏览器重试或仅遥测重复。
- **既有修复**：`3cb22cd`在任何异步状态更新前用同步ref取得阶段提交单飞锁，并对提交按钮提供提交中状态；没有关闭幂等、session、stage或attempt token校验。
- **本轮回归**：对handler响应人为延迟150ms后同步触发两次DOM click，仍只有1 request / 1 request ID / 1 timeline event；中英文attempt分别绑定对应session且互不复用。

### HEM-P1-043 Preview复测阻塞补充

- **状态**：本地当前Production不可复现；Preview仍被Vercel Standard Authentication阻塞，不关闭HEM-P1-020。
- **证据**：P001中英、双向切换、刷新、第二阶段和双击专项通过。匿名Preview病例与health返回登录HTML，合成session init POST为保护层401，尚未到应用handler；不得把该401归因为attempt token或阶段锁。
- **人工复测需求**：使用有Preview访问权的会话记录实际`session/init`和`training-action`路径、HTTP/error code及脱敏关联ID；不得输出token、Cookie或签名。

### EXT-GIT-20260714-02 GitHub smart-HTTP不可达

- **状态**：RESOLVED；2026-07-14网络与CLI认证恢复。
- **证据**：三次`fetch --prune`（含命令级HTTP/1.1）均连接重置；两次普通push均在`github.com:443`超时。`gh auth status`另报告本机CLI token失效，但GitHub连接器仍可只读并确认PR #1为Open/Draft、远程head仍`3541a706`。
- **影响**：`f1d7f62`与`39aad56`尚未进入远程，不能产生新CI/Preview；本地工作树已提交且不丢失。
- **禁止绕过**：不使用force、API update-ref、直接main、Ready、merge或Production部署。网络恢复后重新fetch，确认0落后后普通push。
- **解除证据**：恢复后fetch得到3/0，普通push成功；远程精确`4aa96d5`并回到0/0。Actions run `29322763481` success，Vercel两项pass，PR仍Draft。

### HEM-P1-030 Patient Session病史路由不完整/安全边界误拦截

- **状态**：本地工程与独立QA矩阵通过，待普通push和Node22 CI。
- **失败基线**：QA `490fdd8`报告378/6216个路由探针失败；本地最小合同首先稳定得到中文`prior_care`实际`[]`、期望`[prior_care]`。
- **根因**：canonical未覆盖既往诊疗和`unable to pass urine`；structured未覆盖`previous cancer`和“导过尿”；诊断/报告边界在明确既往史matcher之前执行。
- **最小修复**：补足精确改写；先分类matcher，但仅对明确历史语境、白名单历史slot且不含结果/诊断细节意图时允许越过过宽边界。安全例外不是通用关键词绕过。
- **红队证据**：纯“以前做过膀胱镜/既往肿瘤史”到达历史matcher；“以前做过膀胱镜，检查结果是什么”“以前的肿瘤诊断是什么”仍分别`report_boundary`/`diagnosis_boundary`且空slot。
- **医学边界**：三个P001来源因教师元语言/诊断词继续`unsafe_deterministic_answer`，不展示、不收集；18条冲突、419审核、42例`needs_revision`、161来源阻塞和医学真值零修改。
- **矩阵复核**：当前HEAD以QA脚本复核42×37双语双改写，6216/6216路由、6216/6216重复一致性均通过，0失败；144/144直接冲突隔离，providerCalls=0。
- **待办**：普通push后由Node22 CI复核；HEM-P1-031/032各自保持独立提交与证据。

### HEM-P1-031 英文特异疼痛额外命中通用pain并扩大隔离

- **状态**：本地工程与独立QA矩阵通过，待普通push/Node22 CI。
- **失败基线**：`Do you have flank pain?`实际命中`flank_pain + pain`；QA报告252个错配、额外60次quarantine。
- **根因**：通用英语`\bpain\b`与flank/radiating/colicky matcher并行累计，没有特异性消歧。
- **修复**：最终slot集合按意图抑制词面附带的通用pain；明确一般疼痛或`any other pain`仍保留general/compound语义。
- **证据**：42×6 matcher合同、5个冲突病例隔离范围及P001真正general pain隔离通过；相关Patient/session/quarantine、类型、lint通过。
- **医学边界**：不翻转或裁决5个pain冲突，HEM-P0-023保持阻塞；只修正问法实际触发的slot范围。

### HEM-P1-032 非空已匹配事实被长度保护降级为通用unknown

- **状态**：本地工程与独立QA矩阵通过，待普通push/Node22 CI。
- **失败基线**：P001英文foamy urine路由正确但公开reply为`I'm not sure about that right now.`；QA报告191个唯一case-slot-language、365探针实例。
- **根因**：`conciseDeterministicReply`使用总长80的前置阈值，比外层“每行80、总长180”更严，导致81–106字符的安全单slot事实被无条件抹除。
- **修复**：对无禁词的当前slot原文做无损换行；标准化后必须与原文相同。不能安全投影的内容进入既有`unsafe_deterministic_answer`并清空slot，不把安全失败计为已询问。
- **证据**：42×3=126个代表安全长回复语义逐字保持且单行≤80；P004/P005/P006不安全来源、18条冲突和历史/疼痛边界回归通过；完整行为、类型、lint通过。
- **医学边界**：不修改原始双语值、审核状态或医学极性，不裁决161来源问题。

### EXT-GIT-20260714-03 GitHub smart-HTTP再次间歇性不可达

- **状态**：BLOCKED_EXTERNAL；本地工程不受影响，远程发布门禁受阻。
- **证据**：2026-07-14 18:20—18:22 CST，`gh auth status`成功且GitHub API读取远程HEAD=`4aa96d5ff20a1f4e637529d6ede46720b428c5ef`；三次`git fetch --prune origin`（默认两次、命令级HTTP/1.1一次）均约21秒后因`github.com:443`连接失败退出128。
- **影响**：本地HEAD `25ef0cb`的六个提交尚未push，不能产生该HEAD的Actions、Node22 Playwright或Vercel证据。
- **处置**：保留干净工作树；网络恢复后重新fetch并确认远端领先0，再普通push。禁止force、API update-ref、main写入、PR Ready/merge或Production部署。

### HEM-P1-043-R2 有效浏览器token对应的服务端attempt记录丢失

- **严重度/状态**：P1；本地工程修复与完整门禁通过，待登录态Preview/长期QA复测及后续明确授权的push。
- **失败基线**：在真实训练handler中初始化P001、完成一轮已验证history log，然后仅清空服务端attempt store；点击“提交本阶段”得到401 `attempt_not_found`，UI显示“阶段提交失败，请重试。”，无法进入第二阶段。
- **根因**：签名token可在其有效期内存活，但Preview无状态实例重启、共享store记录过期或丢失会让服务端找不到对应attempt。客户端把该可安全恢复的精确状态与所有安全拒绝统一处理为永久失败。
- **修复**：仅对`history`阶段的精确`attempt_not_found`重新执行正常`init-attempt`并以原幂等requestId重试一次；恢复时由服务端从受限学生问句重新运行既有matcher、冲突隔离和去重，不能信任客户端slot/score。
- **安全边界**：`expired_attempt_token`、签名、case/language/mode/session/stage错误均不自动恢复；HEM-P0-023冲突提交回归不命中评分。未关闭attempt/token/stage校验，也未在前端伪造成功。
- **证据**：修复前失败测试命中401与原提示；修复后desktop/mobile恢复、stage2推进及刷新保持通过，完整Playwright 54/54，完整行为/类型/lint/build/bundle/secret门禁通过，`data/**`零差异。
- **提交/外部边界**：代码/测试提交为`610eacf`。未取得登录态Preview实际POST，不能断言用户线上故障已关闭；需在新候选进入Draft PR后复测实际status/error code和脱敏关联ID。当前没有push，也不复用远端`4aa96d5`的旧CI。

### HEM-P1-043-R3 页面初始化期间第一阶段提交竞态

- **严重度/状态**：P1；本地修复与专项门禁完成，待提交、Node22 CI和最新Preview复测。
- **失败基线**：训练`init-attempt`被延迟时提交按钮仍enabled；首次初始化返回HTTP 502、`network_error`时，用户即时点击不会发出`stage-feedback`，但UI显示通用“阶段提交失败，请重试”，没有初始化恢复入口。
- **根因**：`attemptReady`是本地持久化恢复标志，不是服务端签名attempt就绪标志；提交按钮未绑定训练token初始化状态。启动effect与AI session effect又可能在快速永久失败后先后各发一次初始化。
- **修复**：独立训练attempt三态、启动即单飞初始化、失败结果按attempt缓存；未ready禁止stage请求，显式恢复按钮快速双击仍只新增一次初始化。AI session失败/fallback与训练attempt解耦，已ready时仍可提交。
- **错误分类**：UI分别处理`attempt_not_found`、`token_expired`、`stage_mismatch`、`network_error`、配置错误和状态不匹配；未关闭任何token/session/stage/case/language/mode校验。
- **缓存安全**：重新开始删除旧attempt的浏览器签名token；刷新继续恢复当前attempt。测试只断言token存在性和storage key，不输出值；临时trace已删除。
- **证据**：初始化专项、0/1轮、AI preparing/degraded、fallback、刷新、restart、双击、丢失attempt和缺store均有desktop/mobile覆盖；完整行为/类型/lint/build/bundle/secret通过，`data/**`零差异。
- **提交**：代码/测试原子提交`c069abf`；待证据提交、普通push和Node22 CI。
- **远程门禁**：已普通push至远程HEAD `6b41d334106a988a1cbc85b89792f6271be3b597`。Actions run `29348368936`在Node 22.14.0完整Playwright 64/64及全部工程门禁通过；Vercel Deployment与Preview Comments通过，PR #1保持Draft。
- **剩余状态**：工程修复与CI门禁关闭；登录态Preview的P001立即提交网络时间线仍待长期QA复测，故不把CI/Vercel构建绿灯冒充用户交互已验证。

### HEM-P1-043-R4 Preview UI与训练API跨部署，旧token被误判ready

- **严重度/状态**：P1发布阻塞；本地工程修复与完整浏览器门禁通过，待普通push、Node22 CI和新Preview真实复测。
- **用户证据**：P003页面显示回答来源“状态确认中”、0问0答，提交后出现“阶段提交失败，请重试”。当前handler对同一病例/语言/零轮合同返回200/200，故不是零轮规则或病例数据拒绝。
- **根因**：Preview继承生产`NEXT_PUBLIC_API_BASE_URL`，而旧客户端依赖浏览器不可见的`VERCEL_ENV`判定Preview，最终把当前UI送往`gitSha=5a3ad11`旧生产API。客户端同时无条件信任旧v3 token；跨部署签名、CORS和attempt store失配后才在提交时失败。改为同源后，`fetchWithRecovery`又不能解析相对URL并在请求前抛错，该失败由浏览器trace中的`request_error`和仅有health、无training-action时间线证明。
- **修复**：构建时仅公开`preview/production`作用域；Preview强制同源。token storage按API origin隔离，旧token必须先经只读`validate-attempt`验证；成功响应无签名token即失败关闭。相对URL只用不可路由基址提取日志pathname，实际请求仍同源。错误提示新增缺token、origin、限流及无效状态分类。
- **安全边界**：`validate-attempt`必须通过既有签名、stored state、case、language和mode检查且不修改状态；高级阶段失效token不自动重建。未关闭session/token/stage校验，未伪造成功或重复计分。
- **证据**：失败单元测试先稳定得到`ERR_INVALID_URL`；修复后相关单元门禁exit0，Vercel等价82页构建通过，Playwright完整68/68，desktop/mobile均验证P003旧token被替换、所有训练/session请求与页面同源、零轮提交进入第二阶段。
- **数据边界**：`data/**`、医学审批、419决定、18条冲突、`needs_revision`和360评分零修改。新Preview部署前不得把本地结果写成线上已关闭。
- **非阻塞后续边界**：只读安全复核未发现P0/P1；高级阶段本地进度与服务端进度不一致时当前仍安全失败并要求刷新/重新开始，`validate-attempt`返回的`status/currentStage`尚未用于自动对齐。该P2不影响本次第一阶段修复，也不得通过自动回退阶段处理。
- **远程门禁**：本地提交为`656816d`和`8a31711`。`gh`默认token失效且两次正式fetch分别被连接重置/443不可达阻塞，故尚未push、无新Actions/Vercel证据；禁止用陈旧`origin/*`缓存或GitHub API改ref绕过fetch门禁。

### HEM-P1-043-R4-CI 隐式跨源开发API导致Node 22 Playwright 14项失败

- **严重度/状态**：P1发布门禁；本地根因修复和完整门禁通过，待新HEAD远程CI确认。
- **失败证据**：Actions run `29397429743`及Node 22本地复现均为54 passed / 14 failed。P003 desktop/mobile在同源断言直接失败；另外6个用例各双视口因签名响应头跨源不可读，随后history/session/reconnect断言级联失败。
- **根因**：`src/lib/apiConfig.ts`把未配置的开发浏览器默认指向`http://127.0.0.1:3001`，但CI只启动`:3000` Next前端，`:3001`并无完整API进程。Playwright `page.route`虽能拦截绝对URL，却不能把它变成浏览器同源响应。
- **修复**：默认使用相对同源API；Vercel所有部署忽略可能指向其他部署的公开API origin；非Vercel生产仍要求显式HTTPS origin。保留缺签名fail-closed、origin/token隔离及非法origin拒绝。
- **证据/提交**：目标14/14、完整68/68、全行为/安全/医学治理、类型、lint、两种82页构建、bundle/secret扫描通过，`data/**`零差异；代码提交`d1c20de0ad3b96ca992c8be679df23cbf9facb28`。
- **远程关闭证据**：HEAD `bd3bff5e2400a51d9b4f16f78eefb6895a781c1b`的Actions run `29405290154`在Node 22.14.0完成Playwright 68/68及全部工程门禁；Vercel Deployment与Preview Comments通过。工程CI阻塞已解除；登录态Preview交互仍为外部权限阻塞，不作为本缺陷复开证据。

### EXT-PREVIEW-AUTH-20260715-02 Automation Bypass未通过Vercel保护层

- **状态**：BLOCKED_EXTERNAL；黑盒基础设施已完成，应用层P0/P1结论仍不可取得。
- **证据**：测试进程确认环境变量存在但从不输出其值。目标Preview首个请求已通过限定origin的路由附加`x-vercel-protection-bypass`；脱敏计数为目标origin 1、跨origin 0。Vercel响应302到`vercel.com/sso-api`，最终页面为`vercel.com/login`，`/api/**`响应数0。
- **排除项**：不是缺少本地环境变量；不是测试把secret放入URL；不是应用handler、Patient Agent、history-log或stage-feedback返回错误，因为请求尚未到达这些层。
- **安全处置**：保持Vercel Authentication开启；Preview配置禁用trace/截图/video并扫描专用输出目录；不记录Cookie、Authorization、认证响应头或完整签名。
- **解除条件**：在Vercel项目侧确认Automation Bypass secret属于当前项目/团队并适用于当前Preview保护配置。凭据生效后复跑`pnpm run test:e2e:preview`，再根据真实应用HTTP状态和非敏感错误码处理可重复问题。
- **2026-07-16关闭证据**：新secret启用且本机重启后，根路径与P003均保持目标Preview origin，health HTTP 200且出现真实应用API请求；保护层阻塞关闭。后续失败归入独立的Preview服务端训练配置缺失。

### EXT-PREVIEW-CONFIG-20260716-01 Preview缺少训练签名与持久化配置

- **严重度/状态**：P1发布阻塞；BLOCKED_EXTERNAL_CONFIG，不修改业务代码。
- **证据**：目标Preview health返回`trainingStateConfigured=false`、`durableAttemptStoreConfigured=false`；P003/zh零轮`init-attempt`进入应用handler后返回HTTP 503 `training_state_secret_missing`。
- **影响**：无法建立签名attempt，P003不能提交第一阶段；P001中英文、语言切换、刷新、双击和history-log/评分流程均不能形成合法验收证据。
- **安全边界**：当前503是正确fail-closed。禁止关闭签名、改用NEXT_PUBLIC变量、前端伪造token、内存store冒充Vercel持久化或生成假secret。
- **解除条件**：Vercel Preview作用域提供既有`TRAINING_STATE_SECRET`；配置`TRAINING_ATTEMPT_STORE_MODE=upstash`、`UPSTASH_REDIS_REST_URL`和`UPSTASH_REDIS_REST_TOKEN`，重新部署后health两项均须为true，再复跑Preview黑盒套件。
- **2026-07-16关闭证据**：Marketplace已提供`KV_REST_API_URL`和可写`KV_REST_API_TOKEN`；兼容层上线后`3fe409f` health两项均为true，P003零轮、P001中英文live AI、history-log、刷新、双击和双向切换均在真实Preview通过。未使用只读token或Redis协议变量。

### EXT-PREVIEW-NETWORK-20260716-02 Preview导航间歇断连

- **严重度/状态**：P2观察项；OPEN_EXTERNAL_NETWORK，不阻断已取得的应用层逐场景证据。
- **证据**：同一`3fe409f`部署在串行黑盒中偶发`ERR_TIMED_OUT`或`ERR_CONNECTION_CLOSED`，对应场景同源请求计数1、应用API响应0；立即以零retry单场景运行可通过。未观察到HTTP应用错误或失败provider调用。
- **处置**：未增加Playwright retry、延长timeout或放宽断言。长期QA应继续记录发生频率、地区与时间；若稳定复现再按网络/CDN层调查。

### HEM-P0-018 / HEM-P1-019 / HEM-P1-020 / HEM-P1-021关闭补证（2026-07-17）

- **状态**：工程与Preview配置阻塞已解除；不等同于Production发布或医学验收。
- **证据**：`8e7d148` Preview health两项配置为true；session 10/10；中文/英文live DeepSeek各5/5；history-log 10/10；回答来源均非fallback；session/回答/provider/firsttoken/history/UI dispatch P95均有白名单响应头证据且满足当前门槛。
- **安全边界**：未读取或输出任何Vercel、Redis、LLM或签名凭据；没有将时间写入JSON；没有关闭Vercel保护、签名、attempt、session、预算、熔断或日志验证。
- **剩余项**：Production 10+5+5和正式live alias需要生产权限；自然度仍需人工样本终验；`EXT-PREVIEW-NETWORK-20260716-02`继续作为P2网络观察；HEM-P0-001/023仍需具名医学裁决。

### HEM-P1-044 Vercel未透传标准Server-Timing（已解除）

- **失败基线**：Preview `/api/session/init/` HTTP 200，但全部响应头名称中没有`server-timing`，导致线上首Token/P95不可审计；本地handler合同通过。
- **修复**：保留标准`Server-Timing`并增加同值`X-Hematuria-Timing`，两者都由同一白名单格式化器生成；CORS只额外暴露该非敏感头。
- **验证**：真实Preview成功读取session/provider/firsttoken/history指标；TypeScript、ESLint、性能/Agent/training合同、Node22 CI、bundle和repository扫描通过。

### ACC-P1-045 42例双语完整七阶段缺少可执行证据（本地工程关闭）

- **原状态**：强制验收矩阵只有局部阶段、单病例和API合同，没有42例×中英文从初始化到最终360分报告的完整可重复证据。
- **补证**：新增服务端真实handler矩阵和桌面浏览器84条完整旅程；移动端补一条完整代表旅程。服务端共588次阶段提交和84份报告，浏览器共84条桌面旅程，均未跳过token、stage、case、language、mode或幂等校验。
- **结果**：专项与完整Playwright均exit 0；完整行为链将该矩阵纳入默认门禁。该关闭仅针对工程流程证据，医学正确性、真实AI自然度、Production服务与真实设备软键盘不在关闭范围。
- **远程状态**：当前为本地候选，Node 22 CI及新Preview构建待普通push后记录；在新HEAD绿灯前不写成远程通过。

### HEM-P1-046 已知Patient事实因口语/同义词返回unknown

- **严重度/状态**：P1发布体验；首批15 intent本地工程关闭候选，待普通push、Node 22 CI、真实Preview及长期QA。
- **失败基线**：74问canonical命中8、错误unknown 37、极性错误67；典型“小便痛不痛、排尿疼、撒尿痛、从头到尾都红、整个排尿过程都红”未命中。
- **根因**：server与TS平铺正则各自维护；未建立问题级whole/initial/terminal intent和fact value；英文未命中不走profile fallback。
- **修复**：共享NFKC/alias catalog；15项先映射canonical intent，再从既有source slot读取并双语一致分类；query-relative自然模板明确有/没有、是/不是；unknown治理与收集分离，旧structured matcher不再抢答已识别canonical问题。
- **治理**：P001等HEM-P0-023 dysuria仍在后置quarantine返回pending-review reason；模糊/双语不一致保持unknown；没有修改事实或审核状态。
- **证据**：86问核心专项和42例3,150问矩阵均0失败；15 intent、190 alias；known错误unknown=0、极性错误=0；相关Patient/安全/评分及完整工程门禁通过。远程Node 22与真实Preview尚待新HEAD，故不标记生产关闭。

### QA-SEC-P1-001 Preview失败输出可能回显受保护请求头

- **严重度/状态**：P1安全发布阻塞；本地安全合同已修复，真实Preview在新HEAD部署前保持`SECURITY_BLOCKED`。
- **证据**：QA在Production `8e7d148`的Preview路由试跑中观察到Playwright失败日志可能把受保护request header写入stdout；该批专用输出已删除，QA磁盘扫描命中0，不能作为Preview验收通过。
- **根因**：旧runner使用`stdio: inherit`，Playwright/Node/fetch的异常在凭据扫描前就可直接写终端；旧artifact扫描也没有覆盖stdout、stderr、Error cause/stack、文件名、HTML/report或扫描器异常。
- **修复**：子进程输出先进入受控内存；对动态canary、凭据字段、URL查询参数和递归错误对象做统一检测与脱敏；生成物统一fail-closed扫描。任何泄露或扫描失败只输出无值的`SECURITY_BLOCKED`并删除专用目录。
- **安全边界**：不读取除运行所需Automation Bypass之外的环境凭据，不输出值、长度、前后缀或哈希；不关闭Vercel Authentication；不改变本地、Pages、Production、Patient Agent、session或医学数据逻辑。
- **本地证据**：10类合成异常与5类artifact通道全部拒绝；配置测试、ESLint和repository secret scan通过。真实Preview长跑必须等待新HEAD远程部署并再次扫描后执行。

### HEM-P2-043 GitHub Pages部署基线不匹配

- **严重度/状态**：P2部署观察；`BLOCKED_DEPLOYMENT_MISMATCH`，不是当前源码路由回归。
- **部署证据**：Pages由`main` workflow发布；公开deployment `5410354110`为`5a3ad1199ae5e591160f12e410260287f0051875`，早于当前Production Goal `221b22e237ec3e142baea5ac760c21e1a14decfd`。
- **30个旧路由来源**：`5a3ad119`的目录直接使用`item.id`生成`/cases/<id>/index.html`；P013–P042显示ID背后的内部ID仍为`HX-ADD-001`–`HX-ADD-030`，因此公开站点只有前12张卡使用当前P编号路由。
- **处理**：不转Ready、不合并main、不手工部署Production、不硬编码Pages域名，也不改动已通过本地/basePath/Vercel合同的路由。正式合并后的新Pages deployment必须重新执行42卡目录、直接URL、刷新和双语验证。

### HEM-P1-046 扩展里程碑更新

- **状态**：15-intent本地工程关闭候选；待新HEAD Node 22 CI、真实Preview和长期QA。
- **范围**：dysuria、三类血尿时相及urinary frequency/urgency、clots、flank pain、fever、foamy urine、edema、weak stream、incomplete emptying、retention、nocturia。
- **证据**：3,150/3,150命中；1,370 known零错误unknown/零极性错误；1,715 correct unknown不收集；65 conflict quarantine。完整行为链、70/72 Playwright、82页双构建和扫描通过。
- **剩余边界**：未覆盖全部37个历史slot和任意自由改写；医学冲突复合问题仍保守整答隔离；真实DeepSeek自然度和人工抽查需长期QA。不得据本地rule结果关闭医学审核。

### CI-P1-20260717 Playwright步骤达到5分钟硬上限

- **失败证据**：Actions run `29541184518`，Node 22.14；步骤1–20全部通过，Playwright启动72项后在5分钟被workflow终止，后续build/bundle/clean gate skipped。首条真实server错误为dev模式错误应用static export并处理P999未知参数，最后失败为步骤超时。
- **根因**：新增42例双语七阶段矩阵后套件由68增至72；Playwright通过`pnpm run dev`管理孙进程，生命周期不稳定；dev同时继承`output: export`，P999未知参数会触发静态参数错误/挂起；目录测试还重复执行42×2 HTTP探针。
- **修复候选**：dev阶段不启用static export，production build仍强制`output: export`；Playwright直接启动Node/Next；42 href保持中英文全量，浏览器direct/refresh改为P001/P013/P042代表，82页build继续覆盖所有静态参数。
- **本地证据**：受控外部server的目录desktop/mobile 2/2（4.4秒）；完整Playwright 70 passed/2 skip（184.1秒）；两个82页build通过。新Node 22 CI前状态为`LOCAL_PASS_REMOTE_PENDING`，不写成远程已恢复。

### CI-P1-20260717远程关闭补证

- **状态**：`RESOLVED_REMOTE_CI`；不等同于PR可转Ready或Production完成。
- **新增证据**：HEAD `b46ddd8`的run `29545158103`仍在Playwright步骤精确达到5分钟硬上限，步骤日志仅显示`Running 72 tests using 2 workers`和workflow timeout，没有断言失败。该结果排除了旧dev/static-export错误后，确认剩余根因是步骤预算低于扩展矩阵实际耗时。
- **最小修复**：`51f9c6f`仅把Actions Playwright步骤预算调整为10分钟；静态测试要求预算不低于10分钟、命令仍为完整`pnpm run test:e2e`，且不得添加`--retries`或`--timeout`。未修改Playwright断言、业务代码、session/token安全或医学数据。
- **远程结果**：run `29546344990` completed/success；Node 22.14前置行为/医学/TypeScript/ESLint/secret门禁全部通过，Playwright用时8分06秒success，82页build、bundle与clean gate继续success。Pages deploy按Draft规则skipped。

### QA-SEC-P1-001远程关闭补证

- **状态**：当前安全runner与当前Preview为`RESOLVED_CURRENT_HEAD`；若未来runner重新启用trace/video/screenshot/HTML报告，必须重新打开审计。
- **真实Preview证据**：HEAD `51f9c6f`上安全runner 8/8、输出凭据扫描通过、专用目录删除；同源保护注入有效且跨origin为0。Preview health报告签名与持久化attempt store均configured；真实中英文回答均为`live_ai`/DeepSeek而非fallback。
- **保留边界**：P003零轮提交成功进入第二阶段后，一个较晚完成的AI session init被服务端以409 `stale_attempt_token`拒绝；该拒绝没有覆盖已成功的阶段提交，也未重复计分，属于fail-closed晚响应证据，不登记为发布失败。

### HEM-P1-046远程工程结论

- **状态**：15-intent确定性工程门禁`REMOTE_PASS_LONG_TERM_QA_PENDING`。
- **证据**：本地3,150/3,150矩阵、治理隔离和完整回归通过；Node 22 run `29546344990`完整行为及Playwright success；同一HEAD真实Preview 10次session和中英文各5次live AI/history-log均成功。
- **剩余验收**：190 aliases不等同于任意自由改写全覆盖；真实自然度、复合已知/冲突问题的保守整答体验及更多37-slot覆盖仍交长期QA。161个来源修订、HEM-P0-001/023与医学审批继续阻塞人工，不得自动修改。

## P0/P1权威状态索引（2026-07-19）

本索引只校正当前状态，不删除前文失败基线、根因、修复或中间阻塞证据。若前文出现“待push”“待CI”“候选”或旧Preview配置描述，当前状态以本索引及`ACCEPTANCE_MATRIX.md`为准。

### OPEN / HUMAN：不得由工程自动关闭

- `HEM-P0-001`：151条source辅助来源标记需要具名医学/数据治理负责人裁决；当前运行时隔离不等于语义真值已决定。
- `HEM-P0-023`：18条双语医学极性冲突需要具名医学与双语负责人裁决；当前不进入确定性Patient上下文或评分，不得自动翻转、翻译或批准。
- 42例病例级`needs_revision`、419条模拟事实终签、161个来源修订及P003/P005具名来源复核继续为人工治理工作，不得计作工程缺陷已修改。

### ENGINEERING CLOSED：最终分支门禁已覆盖

- `HEM-P0-018`以及`HEM-P1-002/004/005/010/011/012/014/015/016/017/019/020/021/024/025/026/029/030/031/032/033/034/035/036/037/038/039/040/041/042/043/044/046`的已确认工程根因均已修复并进入完整行为、Playwright或Preview门禁。
- `HEM-P1-027`的移动布局工程项已关闭；真机软键盘与safe-area属于下节外部验收，不因模拟器通过而自动关闭。
- `SRA-P1-001`至`SRA-P1-008`、`DCI-P1-001/003/005/006`均已有专项合同及后续完整Node 22门禁；早期“待CI”只表示当时快照，不是当前开放状态。
- 此前验收证据HEAD `270c20b`的Actions run `29672230597` completed/success：Node 22 Playwright、82页build、bundle、repository secret scan和clean gate通过；Vercel Deployment与Preview Comments通过，Pages deploy按Draft规则skipped。

### EXTERNAL / HUMAN ACCEPTANCE：不是可自行修复的当前工程缺陷

- `HEM-P1-003`：Production正式alias、health、真实Origin及10+5+5需要生产部署权限；Preview证据不得替代。
- `HEM-P1-027`：360/390真实设备软键盘、visual viewport及safe-area需要真机QA。
- `HEM-P1-046`：真实患者语言自然度、任意自由改写及复合已知/冲突体验需要人工抽查；确定性15-intent工程矩阵已通过。
- 正式教师鉴权、RCT数据库、正式OSCE、合并后Pages与Production发布均需要权限、approved病例或具名签署。

**当前工程结论**：没有仍待实现、待push或待CI的可重复P0/P1工程缺陷；项目仍因上述医学P0和外部验收项保持Draft/执行中，不得标记生产完成。

## HEM-P1-045 教师公开Pages旧构建与CORS合同不一致

- **状态**：CURRENT_CODE_RESOLVED_LOCAL / PUBLIC_PAGES_BLOCKED_DEPLOYMENT_MISMATCH。
- **证据**：导师入口与GitHub deployment均为`main@5a3ad119`；旧`/cases/HX-ADD-004/`显示P016。旧training-action只允许`Content-Type, X-Training-State`，浏览器实际发送`X-Request-Id`，故预检失败。
- **当前修复**：当前Production Goal的Vercel浏览器请求使用相对同源`/api/**`；静态Pages仅精确允许`https://niubi1v.github.io`及实际方法/头，无wildcard。新增`test-teacher-cors-contract.ts`覆盖training/session/agent、同源Preview和恶意origin。
- **未关闭项**：公开Pages仍服务旧main，Draft PR按规则不部署Pages；本轮外部OPTIONS因网络超时未取得线上响应。禁止为旧站改坏当前路由、合并main或手工部署Production。

## HEM-P1-047 教师自然问法与最后一级语义分类边界

- **状态**：RESOLVED_LOCAL_CANDIDATE / CI_PENDING。
- **基线**：Production已有15 intent/190 alias与3150问矩阵；自主优化专项增加24×42优先自然问法。专项引入前等价探针为0/1008，引入后1008/1008。
- **修复**：四个自主优化提交逐个cherry-pick；canonical matcher增加命中alias和层级追踪。只有确定性层完全未命中时，服务端可选白名单分类器才调用provider；它只返回intent/confidence/needsClarification，阈值0.92，不能生成病例答案。
- **安全**：known错误unknown=0、极性错误=0；1715个真实unknown与65个冲突/隔离回答保持不确定。分类器输入不含caseId、诊断、评分、答案或review状态；provider失败、低置信度、非法JSON均安全unknown。
- **门禁**：3150/3150、1008/1008、86/86、42例双语七阶段与18冲突隔离均通过；Node22/Preview仍待新HEAD。

## CI-P1-20260720 教师验收候选生成基线漂移

- **状态**：RESOLVED_LOCAL / REMOTE_RECHECK_PENDING。
- **失败证据**：Actions run `29712230950`，HEAD `4ff2d04`，Node 22.14；首个真实失败为Conversion idempotency，列出`cases_en.json`、`cases_public.json`和`patient_slots_bilingual.json`。
- **根因**：UI专用自然主诉格式化器被数据生成器直接复用，使展示层改动改变已审计生成基线；不是医学数据源变化，也不是测试基础设施误报。
- **修复**：`0b5acb7`新增独立稳定生成格式化器并让normalize脚本使用；UI继续使用自然文案。没有提交生成数据，没有放宽幂等断言。
- **证据**：75个受控输出隔离worktree幂等通过；42例资料/路由、TypeScript、ESLint、两种82页build、两次bundle、secret scan及`data/**`零差异通过。等待新HEAD Node 22远程门禁。

## HEM-P1-049 Patient首问早于能力会话落地

- **状态**：ENGINEERING CLOSED / REMOTE PREVIEW VERIFIED（`296bf7e`）。
- **真实证据**：`363aa17` Preview的P001中文UI先取得`init-attempt=200`和`session/init=200`，但首个`agent-chat`返回401 `session_capability_required`；同部署session 10/10和中英文live AI各5/5通过，排除provider、Redis或Training State整体故障。
- **根因**：自动session effect尚未把`sessionInitLoading`置true前，发送按钮只按loading判断，存在`aiSessionId`为空却可点击的窗口。
- **修复**：按钮、Enter和提交函数均以非空服务端session capability为硬门槛；规则模式同样先初始化安全会话。没有关闭校验、伪造成功或引入客户端token。
- **门禁**：新增延迟session测试在desktop/mobile下均证明签发前0请求、签发后1请求；完整本地Playwright 74/2、两种82页build、secret scan与`data/**`零差异通过。Actions run `29719580921`成功；同SHA Preview黑盒8/8、session 10/10、中英文live AI/history-log各5/5通过，首问不再出现`session_capability_required`。

## HEM-P2-048 Prompt/错误日志可能暴露调试上下文

- **状态**：RESOLVED_LOCAL_CANDIDATE / CI_PENDING。
- **修复**：新增server-only白名单Prompt审计和递归脱敏logger；Production/Vercel强制关闭debug。LLM HTTP错误不再包含provider响应正文，Patient fallback不再把原始error放进返回值。
- **门禁**：随机合成canary覆盖嵌套Error/cause、Authorization、Cookie、token/signature URL；输出命中0。Agent API provider失败日志也断言不含合成secret或patient content。repository scan 336文件/历史通过。

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

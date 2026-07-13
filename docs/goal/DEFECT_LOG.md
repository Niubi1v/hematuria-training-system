# 缺陷日志

## 开放缺陷

### HEM-P1-025：UI集成曾移除日志同步失败后的手动恢复入口

- 级别：P1，训练日志与评分同步可恢复性；状态：本地已修复，待Draft PR Linux CI确认。
- 发现证据：UI分支`a6630a3`将`logSyncStatus=failed`与pending共用“评分待同步”静态标签，删除了既有重试按钮；自动重试三次耗尽后用户无法恢复同步。
- 安全影响：AI回答仍可显示，但签名日志可能永久停留失败，用户没有可理解的恢复操作；不得通过绕过签名直接计分。
- 最小修复：失败时显示单一“评分同步已暂停/Scoring sync paused”状态和“重新同步/Retry sync”按钮；按钮只递增现有retry nonce，持久队列继续复用原`requestId`及服务端幂等规则。
- 回归：新增Playwright场景，前三次history-log返回503、手动重试第四次成功；要求4次只有一个requestId、一个AI回答并最终显示评分已同步。TypeScript、ESLint及完整行为链本地通过；本机Playwright未完成启动，远程CI结果尚待确认。
- 首轮远程证据：head `2283f19`的Actions run `29231277833`中前19个步骤通过；Playwright 38/40，新增用例desktop/mobile均因5秒内未出现按钮失败。真实根因是通用HTTP恢复层每轮重试3次，持久history队列又重试3轮，前三个503被单轮内部重试吸收后第4次自动成功，测试没有进入“耗尽”状态。
- CI后最小修复：history-log关闭通用层内部重试，仅由现有持久队列执行三次有界退避；其他训练动作仍保留通用重试。预计总调用从最多9次收敛为3次，手动操作为第4次，requestId与签名验证边界不变。
- 第二轮证据：head `853d819`的run `29231718708`仍为38/40且同一按钮断言失败。进一步审查发现`attempts`写回`pendingHistoryLogs`会立即重新触发effect，绕过退避timer；第三次写回又触发第4次自动请求，成功后覆盖短暂的failed状态。
- 第二次最小修复：退避期间增加单一waiting ref；`attempts>=3`时effect停止自动请求并稳定显示按钮；人工操作只重置队首项的attempts后触发同requestId重试。该修复针对新的状态竞态证据，不放宽断言。
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

### HEM-P1-020：当前执行环境无法访问受保护Preview应用

- 状态：外部权限阻塞；匿名GET被Deployment Protection HTML替代，POST session为401。
- 影响：无法从当前环境采集用户登录态的控制台、API错误码、DeepSeek耗时、首Token、日志签名耗时和真实回答样本。
- 处置：由具备Preview访问权限的会话复跑Playwright/network trace；不得提交或输出bypass token、Cookie或Authorization。
- 最新复验：`a9ace13`对应Vercel Deployment已success，但in-app浏览器直达`/cases/P001/`仍在20秒内无法取得DOM；部署成功与应用登录态体验通过必须分开登记。

### HEM-P1-021：真实首Token指标当前不可测

- 状态：设计限制，待验证；当前Patient Agent接口为非流式响应，只能测完整请求耗时。
- 处置：若首Token仍为强制指标，需要另行设计不泄露内容的服务端计时或流式协议；不得用完整响应时间冒充首Token时间。

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

### HEM-P1-015：draft PR创建缺少必需的GitHub CLI

- 状态：阻塞PR/CI，不阻塞本地工程；需要安装并认证`gh`。
- 证据：专项分支已成功普通push，但`gh --version`返回命令不存在；发布技能要求先通过`gh --version`与`gh auth status`。
- 安全影响：PR未创建，PR触发的Actions未运行；不得用直接push main或部署规避。
- 解除条件：用户安装`gh`并完成`gh auth login`，随后创建指向`main`的draft PR并记录CI。

### HEM-P1-016：完整行为门禁遗漏LLM与统一Agent入口（已修复）

- 状态：本地已修复，待PR CI确认。
- 发现证据：21:21直接运行`test:llm`和`test:agent`失败；现有`package.json scripts.test`没有执行这两个已声明入口。
- 根因：两个测试仍断言旧DeepSeek profile envelope和前端硬编码端点；生产实现已使用本地权威profile及集中API配置，导致测试契约漂移，同时聚合门禁没有暴露漂移。
- 修复：按当前安全架构更新断言，并将两个入口加入完整行为链。
- 复验：21:25更新后的完整30项行为链exit0；TypeScript与ESLint exit0。不得据此替代PR CI或生产冒烟。

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

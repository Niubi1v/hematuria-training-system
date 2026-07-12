# 缺陷日志

## 开放缺陷

### HEM-P0-001：151条source记录的辅助来源标记冲突

- 级别：P0，正式签署与发布阻断。
- 状态：阻断，待具名医学负责人裁决。
- 证据：`data/hematuria_release_v14_normalized.json`交叉统计为模拟/是419、source/否2、source/是151。P001 `transfusionHistory`约28758–28767行为冲突示例；P003约29058–29067行为正确修正对照。
- 测试缺口：`scripts/test-medical-review-workbook.ts:29-32`断言旧工作簿572行“是否程序或AI补充”全部为“是”，没有验证153/419严格分离。
- 风险：辅助字段可能误导专家对来源、程序补充和审核责任的理解，污染正式签署证据链。
- 安全现状：主`provenance`、153 sourceTrace、419 queue、`teacherReviewRequired`和审批状态未被自动提升。
- 处置要求：先定义该辅助字段的唯一语义，再由数据owner编写受控迁移和回归；禁止本阶段批量改值、批准事实或解除`needs_revision`。

### HEM-P1-002：移动端offline reconnect全量测试存在波动

- 状态：本地已修复，待CI全量复核。
- 证据：2026-07-12 14:50:19–14:50:44 Playwright全量21/22，移动端offline reconnect失败；14:50:56–14:50:58定向重跑1/1通过。
- 修复与复验：修复启动readiness竞态；15:26:36–15:26:41 desktop/mobile offline reconnect重复6/6，15:26:54–15:27:11全量Playwright 22/22。
- 剩余要求：保留断言，在Linux CI全量复跑；本地通过不等于CI已完成。

### HEM-P1-003：本轮生产状态无法验证

- 状态：开放，发布阻断。
- 证据：普通和提权`pnpm run smoke:production`均`fetch failed`；提权运行时间14:51:39–14:53:46。
- 未验证范围：health、10次session init、中文5次、英文5次、Actions、Pages/live alias、Vercel live alias及云TTS。
- 处置要求：在获准且可联网环境按原命令重跑，保存响应版本/SHA、计数、延迟和错误码。
- 最新复跑：21:28—21:31只读smoke再次exit1；health、10次session、5+5 Patient、training action及四音色均无成功样本。独立网页通道也未取得health响应，根因仍未能在当前环境区分。

### HEM-P1-004：训练状态专用密钥声明与实现回退不一致

- 状态：本地已修复，待CI确认和生产环境配置核验。
- 修复：正式状态只使用独立`TRAINING_STATE_SECRET`；health只有检测到该独立secret才报告`trainingStateConfigured=true`。
- 门禁：formal-attempt同时要求病例`formalUseAllowed === true`；未把当前任何病例改成true。
- 剩余要求：CI复跑专项/health/training API测试；生产只核验布尔状态，不读取或修改真实secret。

### HEM-P1-005：participant级attempt隔离声明高于当前实现

- 状态：命名key隔离已在本地修复，待CI确认；正式OSCE/RCT仍因医学P0、鉴权、数据库和审计要求禁用。
- 修复：attempt storage/pointer key加入participant命名空间，并继续隔离case、mode、language、attempt和schema。
- 剩余要求：CI复跑attempt与跨participant测试；该修复不等同于研究级身份鉴权或持久化审计。

### HEM-P1-010：Agent/session公开入口缺少统一请求防护

- 状态：本地已修复，待CI与生产CORS验证。
- 修复：`agent-chat`和`session init`加入Origin白名单、速率限制及非泄露错误响应；专项测试纳入非法Origin、限流和敏感字段检查。
- 剩余要求：CI执行专项测试，生产从GitHub Pages Origin验证允许/拒绝行为；不得在日志中记录密钥、prompt或完整患者资料。

### HEM-P1-011：评分报告版本标识不统一

- 状态：本地已修复，待CI确认。
- 修复：评分标识统一为`360-event-v1`，结构化报告统一`reportVersion: 3`。
- 剩余要求：CI复跑评分、training API和bundle测试，确认没有第二套总分或旧报告版本泄漏。

### HEM-P1-012：CI缺少生成数据diff与仓库级secret门禁

- 状态：本地已修复，待GitHub Actions实际运行。
- 修复：CI新增generated data diff和repo secret scan；运行时固定Node/pnpm，并直接加载Next legacy ESLint插件。
- 本地证据：repo secret scan检查235个候选文件exit0；lockfile-only frozen offline检查exit0。
- 剩余要求：只有远程Actions在拟发布commit全绿后，才能关闭本缺陷。

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

### HEM-P1-017：Vercel Preview缺少公开API origin导致预渲染失败（已修复，待CI）

- 级别：P1，阻断Preview Deployment。
- 首条根因：预渲染`/cases/P001`时`src/lib/apiConfig.ts`抛出`NEXT_PUBLIC_API_BASE_URL is required for production builds.`；末尾ELIFECYCLE仅是结果，不是根因。
- 失败条件：Vercel preview使用production构建，但项目没有向该preview注入`NEXT_PUBLIC_API_BASE_URL`。
- 最小修复：仅当`VERCEL=1`且没有显式origin时使用同源相对`/api/*`；非Vercel production/static export继续fail-closed，显式origin继续要求HTTPS且不得带路径、query或fragment。
- 回归：新增`test:api-config`并纳入完整行为链；Vercel等价无origin环境`next build`成功生成52页，包括P001-P042。仍需Vercel Preview CI确认。

- HEM-BLK-013：Git写入额度阻塞已解除；20:48成功fetch，随后创建`2bc3305`与`58f456e`两个小步提交。仍须完成push前复核、普通push专项分支、PR与CI。

- HEM-P2-006：将“572条事实总数”统一说明为“572条审核追踪项”。
- HEM-P2-007：README“三个API入口但列出四项”修正为五个前端主入口，并说明兼容路径。
- HEM-P2-008：本地运行版本从Node 20修正为与CI一致的Node 22.14、pnpm 11.7.0。
- HEM-P2-009：生产文档不再把health、10+5+5、Actions/Pages/live alias写成当前已通过。

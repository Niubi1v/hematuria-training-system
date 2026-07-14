# AI接口防滥用威胁模型

更新：2026-07-14 11:02 CST。本文只描述可由仓库与测试复核的工程事实；Preview真实密钥值、真实DeepSeek成功率及跨实例配额均未被推定为已验证。

## 资产与信任边界

- `LLM_API_KEY`仅由服务端provider适配器读取；`TRAINING_STATE_SECRET`仅签名训练状态与session capability。两者没有客户端前缀，也不得互相fallback。
- 浏览器是不可信客户端。Origin/CORS只降低浏览器跨站调用面，不能代替attempt/session能力验证。
- Patient session绑定attempt、case、language、mode和有效期；训练动作另外由权威attempt store约束当前阶段、重放和评分幂等。
- 公开`/api/agent-chat`是Patient Agent入口。查体、开单、报告、MDT、history-log与score走签名的`/api/training-action`，不应借Patient token调用任意LLM角色。

## 端点清单

| 端点 | Provider | 当前服务端边界 | 仍需完成 |
|---|---|---|---|
| `/api/session/init` | 无 | POST/OPTIONS、CORS、16 KiB、IP实例限流、权威attempt token、case/language/mode绑定、幂等初始化 | 跨实例session配额与持久限流 |
| `/api/agent-chat` | DeepSeek/配置的LLM | POST/OPTIONS、CORS、64 KiB、签名session、case/language/mode、幂等single-flight；本轮新增Patient-only角色/阶段、请求字段白名单、JSON和问题/历史长度边界、持久session并发lease，以及session/attempt/IP/项目多维预算 | Preview持久store配置与真实跨实例负载验收、provider错误率熔断/告警 |
| `/api/training-action` | 无 | POST/OPTIONS、96 KiB、签名attempt、stage/action、CAS、重放与幂等；history-log和score在此 | 各动作持久多维配额和字段级大小上限 |
| `/api/tts` | Azure TTS | Origin、方法、16 KiB JSON、字段/文本/voice白名单、Patient session能力、session/IP/项目持久预算、跨实例tuple租约、session隔离的100项音频缓存与100项本地冷请求single-flight | Preview持久store配置与真实跨实例负载验收 |
| `/api/patient-reply`、`/api/session/complete-profile` | 无 | 允许Origin也统一410；无旧provider路径 | 保持退役 |

## 已证实攻击路径与处置

### HEM-P1-036：Patient session越权调用其他Agent

失败基线：合法Patient session把`agentId`改为`diagnostic_reasoning`并把stage改为`diagnosis`，旧handler返回200并进入非Patient LLM分支。根因是capability不含Agent action，而handler信任客户端白名单中的七种Agent角色。

修复：公开端点固定为`standardized_patient/history`；拒绝客户端提供的model、system/developer prompt、API key、base URL、unlockedData及其他非白名单字段；仅接受JSON，并限制单问题2000字符、历史8项、asked列表100项。验证发生在session存储与provider之前。

测试：Agent角色越权、五类模型/Prompt/隐藏上下文覆盖、超长问题和错误Content-Type全部断言错误码与`providerCalls=0`。合法Patient/动态会话/双语冲突隔离回归通过。

### HEM-P1-039：不同幂等键绕过并发single-flight

失败基线：同一有效session并发两个`probe=true`请求，使用不同幂等键；旧实现两项均200并产生两次provider调用。根因是request store只合并`sessionId + idempotencyKey`完全相同的请求，没有session级生成租约。

修复：幂等owner在进入provider前取得按session摘要键控的单一租约；生产使用现有Upstash原子`SET NX EX`，本地使用有界生命周期内存记录。第二个不同键请求返回429和`Retry-After: 1`，不调用provider；原请求完成后释放。异常路径同时撤销processing幂等claim，租约还有30秒崩溃TTL，避免永久锁死。

### HEM-P1-037：跨实例多维请求与成本预算

失败基线：把session请求上限设置为2后，三个不同IP、不同幂等键的顺序probe旧实现仍全部200，第三次实际进入provider。旧30/IP/min只存在于单serverless实例，不能形成全局预算。

修复：幂等owner的Upstash准入脚本在取得租约前原子检查并递增9个哈希键：session请求、attempt请求、attempt输入字符、IP小时、IP日、项目日请求、项目日保守token预留、session probe和session并发。项目token按“当前输入字符上界 + 服务端`LLM_MAX_TOKENS`（最大500）”预留；客户端不能提交模型或token上限。默认session 60次支持20轮验收，全部阈值只能由服务端环境变量收紧。

配置名称：`AGENT_SESSION_REQUEST_LIMIT`、`AGENT_ATTEMPT_REQUEST_LIMIT`、`AGENT_ATTEMPT_INPUT_CHAR_LIMIT`、`AGENT_IP_HOURLY_REQUEST_LIMIT`、`AGENT_IP_DAILY_REQUEST_LIMIT`、`AGENT_PROJECT_DAILY_REQUEST_LIMIT`、`AGENT_PROJECT_DAILY_TOKEN_BUDGET`、`AGENT_SESSION_PROBE_LIMIT`、`AGENT_SESSION_LEASE_SECONDS`。本文不记录任何值。

证据：八类低阈值场景均429且超限不增加provider计数；模拟Upstash命令合同验证claim→9键准入→complete→release及quota→abandon，命令不含原始session/IP。真实Preview跨实例仍需持久store变量配置后进行黑盒负载验收，不能以模拟合同代替。

## 开放P1

1. Agent持久预算工程合同已存在，但Preview缺少持久attempt/request store配置时会fail-closed；配置后的真实跨实例429、TTL恢复和日窗口仍待验收。
2. provider连续错误率熔断和异常调用量告警尚未实现；管理员可用现有`LLM_ENABLE_AI_PATIENT/AGENTS`关闭AI，但目前没有自动短时熔断。
3. TTS持久预算和跨实例tuple租约已有本地/模拟Upstash合同；Preview未配置并实测持久store前，不宣称真实跨实例通过。

建议顺序：在配置后的Preview执行Agent/TTS真实跨实例预算验收；本地继续处理provider错误率熔断。任何持久配额配置缺失在Preview/Production应fail-closed，不得退回只靠客户端按钮节流。

### HEM-P1-038：TTS冷并发与请求体资源边界

失败基线：相同完整tuple的两个冷请求在缓存写入前分别调用Azure，`providerCalls=2`；合法短文本附带20 KiB padding也会进入provider。

修复：16 KiB JSON上限、Content-Type、畸形JSON与字段白名单在Azure前执行；相同origin/voice/rate/pitch/text的冷请求共享一个进程内Promise，成功后缓存，失败不缓存。最多100个不同冷tuple并发，超过后429；共享不会跨origin或参数tuple。

测试：冷并发从2次provider降为1；超大body 413，错误方法/Origin/文本/voice/字段/JSON/Content-Type/429均显式断言provider计数不增加。本项当时未覆盖session能力，随后由HEM-P1-041补齐；跨实例single-flight仍未完成。

### HEM-P1-041：TTS缺少Patient session能力

失败基线：在Azure stub已启用时，不带session/attempt/case/language/mode的请求旧实现返回200并调用provider。

修复：前端携带当前Patient session tuple；服务端复用`verifySessionCapability`并绑定attempt、case、language和规范化mode。缺失、伪造、过期或跨tuple能力统一在Azure前401，voice必须与session语言一致。音频缓存与single-flight tuple加入session SHA-256摘要，不保存原始签名，也不跨Patient session复用个性化音频。

证据：全部能力拒绝`providerCalls=0`；不同session同文本均为MISS；桌面/移动浏览器“云语音失败→对应浏览器语音”2/2通过。该证据不代表真实Azure或跨实例配额通过。

### HEM-P1-042：TTS跨实例预算与重复合成

失败基线：仅有进程内IP窗口和Promise合并。相同有效session换IP、换文本可持续调用Azure；两个serverless实例也可同时合成同一tuple。

修复：在Azure调用前通过服务端持久store原子检查session日、IP小时、IP日、项目日请求和项目日字符预算，并取得按session隔离tuple摘要的短租约。生产/Vercel缺少Upstash时fail-closed；本地使用内存适配器。只保存哈希键和计数，不把音频、原始session、IP或文本写入Redis。相同进程继续共享Promise；跨实例同tuple由租约返回可重试的425，配额超限返回429，均不调用Azure。

配置名称：`TTS_REQUEST_STORE_MODE`、`TTS_SESSION_DAILY_REQUEST_LIMIT`、`TTS_IP_HOURLY_REQUEST_LIMIT`、`TTS_IP_DAILY_REQUEST_LIMIT`、`TTS_PROJECT_DAILY_REQUEST_LIMIT`、`TTS_PROJECT_DAILY_CHAR_BUDGET`、`TTS_TUPLE_LEASE_SECONDS`。全部为服务端变量，复用现有Upstash凭据。

证据：五类低阈值配额均在超限时保持provider计数；模拟Upstash合同验证6键原子准入、owner释放、quota/in-progress不调用provider，命令不含原始session/IP。真实Preview跨实例与Azure仍待配置后验收。

## 日志要求

只记录脱敏session摘要、action、case、状态、来源、耗时、token计数、限流命中和provider错误分类。不得记录API key、Cookie、Authorization、完整签名、系统Prompt或无限制问答全文。

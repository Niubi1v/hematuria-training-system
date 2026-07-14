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
| `/api/agent-chat` | DeepSeek/配置的LLM | POST/OPTIONS、CORS、64 KiB、签名session、case/language/mode、幂等single-flight；本轮新增Patient-only角色/阶段、请求字段白名单、JSON和问题/历史长度边界 | 持久多维配额、不同幂等键的session并发lease、probe独立低配额、总轮次/token预算 |
| `/api/training-action` | 无 | POST/OPTIONS、96 KiB、签名attempt、stage/action、CAS、重放与幂等；history-log和score在此 | 各动作持久多维配额和字段级大小上限 |
| `/api/tts` | Azure TTS | Origin、方法、文本1–500、voice白名单、实例限流、缓存 | session/capability、body上限、冷缓存single-flight、持久配额 |
| `/api/patient-reply`、`/api/session/complete-profile` | 无 | 允许Origin也统一410；无旧provider路径 | 保持退役 |

## 已证实攻击路径与处置

### HEM-P1-036：Patient session越权调用其他Agent

失败基线：合法Patient session把`agentId`改为`diagnostic_reasoning`并把stage改为`diagnosis`，旧handler返回200并进入非Patient LLM分支。根因是capability不含Agent action，而handler信任客户端白名单中的七种Agent角色。

修复：公开端点固定为`standardized_patient/history`；拒绝客户端提供的model、system/developer prompt、API key、base URL、unlockedData及其他非白名单字段；仅接受JSON，并限制单问题2000字符、历史8项、asked列表100项。验证发生在session存储与provider之前。

测试：Agent角色越权、五类模型/Prompt/隐藏上下文覆盖、超长问题和错误Content-Type全部断言错误码与`providerCalls=0`。合法Patient/动态会话/双语冲突隔离回归通过。

## 开放P1

1. Agent限流仍为单serverless实例内IP Map。不同幂等键可并行进入provider；跨实例、每session/attempt和每日成本熔断尚无可审计的持久实现。不能把当前30次/分钟写成全局配额。
2. `probe=true`会调用真实provider，尚无独立低配额或跨实例缓存；可被有效session重复消耗。
3. TTS没有session能力、明确body字节上限或冷缓存single-flight。相同冷请求并发可能产生多次Azure调用。

建议顺序：先为Agent request store增加持久的session/attempt/IP窗口和并发lease，并补不同幂等键provider计数失败测试；再处理probe；随后给TTS增加请求上限、single-flight与能力边界。任何持久配额配置缺失在Preview/Production应fail-closed，不得退回只靠客户端按钮节流。

## 日志要求

只记录脱敏session摘要、action、case、状态、来源、耗时、token计数、限流命中和provider错误分类。不得记录API key、Cookie、Authorization、完整签名、系统Prompt或无限制问答全文。

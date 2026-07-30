# 静态安全缺陷清单

- 审计基线：`41b3830a9095c692b3fdbe65a3dbf95b7ece5a37`
- 日期：2026-07-13（Asia/Shanghai）
- 结论：未发现新增 P0；发现 6 项 P1、3 项 P2。P1 修复并回归前不建议解除 Draft。

## SRA-P1-001：客户端签名快照可回放并重复计分

- 级别：P1
- 位置：`server/trainingState.js:35-70,73-84`；`api/training-action.js:245-247,302-308`
- 风险：HMAC 只证明快照由服务器签发，不证明它是该 attempt 的最新状态。服务端没有持久化最新 sequence、完成状态或已消费 nonce。
- 触发条件：保留初始化或任一旧的 `X-Training-State`，之后重复提交 `score` 或从旧快照继续提交动作。
- 后果：同一 attempt 可产生多条状态分支；已完成后仍可用旧 token 再次计分，幂等日志和“completed”只对当前快照有效。
- 外部利用：是；本地 handler 探针中第一次计分为 200，复用初始化 token 再计分仍为 200。
- 医学安全：是；正式模式一旦启用，会破坏考试记录和 360 分报告完整性。
- 隐私/密钥：不直接泄露密钥；token 中状态仅签名、未加密。
- 最小修复：在服务端持久化 attempt 最新 sequence/status 和已消费请求 ID，原子 compare-and-swap；计分使用一次性终态事务，拒绝低于最新 sequence 的 token。
- 推荐测试：保存 `token0`，提交动作得到 `token1` 后重放 `token0`；完成后重放所有历史 token；并发两次 score 只能一个成功。
- 权限/裁决：需要后端持久化设施与部署权限；不需要医学裁决。

## SRA-P1-002：服务端未执行阶段锁，可枚举隐藏检查结果

- 级别：P1
- 位置：`api/training-action.js:237-247,263-300`；公开目录导入见 `src/components/ClinicalTrainingClient.tsx:34-38`。
- 风险：除 formal 总开关外，API 不校验当前阶段或前序阶段提交状态。初始化 attempt 后可立即调用 `exam`、`order`、`mdt`、任意 `stage-feedback`。
- 触发条件：从公开前端获得病例 ID 和医嘱名称，调用 `init-attempt` 后遍历 `order`。
- 后果：在病例选择/问诊阶段提前恢复病例特异检查、影像或病理结果，并可绕过 UI 的七阶段教学顺序。
- 外部利用：是；本地探针在刚初始化后直接下单返回 200 且返回 1 份病例报告。现有 `scripts/test-training-api.ts:58-69` 也把直接下单作为成功路径。
- 医学安全：是；答案泄露污染训练与考核有效性。
- 隐私/密钥：不涉及密钥；若未来载入真实病例，可能扩大患者数据暴露。
- 最小修复：将阶段号和已提交阶段写入权威服务端 attempt，逐 action 校验允许阶段；结果释放必须同时满足阶段、病例、已下单和前置条件。
- 推荐测试：每个 action 在阶段前、阶段中、阶段后各测一次；遍历公开目录时，未解锁项目均不得返回报告正文。
- 权限/裁决：需要工程修复；不改变医学事实，不需医学裁决。

## SRA-P1-003：旧版公开 API 绕过新版 CORS、限流和错误收敛

- 级别：P1
- 位置：`api/patient-reply.js:52,342-408`；`api/session/complete-profile.js:3-25`。
- 风险：两个仍会由 Vercel 部署的旧端点默认返回 `Access-Control-Allow-Origin: *`，没有限流、可选服务端 token、`Cache-Control: no-store` 或统一输入校验；旧 patient cache 还是无上限 `Map`。
- 触发条件：任意网站或脚本直接调用旧端点，使用公开病例 ID 和大量唯一问题/会话初始化。
- 后果：可脚本化提取标准化患者隐藏病史、消耗 LLM 配额、污染/驱逐会话缓存并造成内存或费用型拒绝服务；部分异常信息直接回显。
- 外部利用：是；不可信 Origin 本地探针调用两个端点均返回 200，响应 CORS 均为 `*`。
- 医学安全：是；可批量恢复隐藏病史事实。
- 隐私/密钥：不返回密钥；用户输入可被转发给第三方 LLM。
- 最小修复：删除/下线旧路由，或让其只调用同一受控 handler 并共享 allowlist、鉴权、限流、body 上限、错误模型和缓存上限。
- 推荐测试：对仓库全部 `api/**` 自动枚举 Origin、OPTIONS、方法、限流、超大 body 和错误非披露；旧路径应为 404/410 或与新版合同一致。
- 权限/裁决：需要 Vercel 路由/部署权限；不需医学裁决。

## SRA-P1-004：Patient Agent 不要求有效 session，隐藏事实可被直接枚举

- 级别：P1
- 位置：`api/agent-chat.js:134-178`；`server/patientSession.js:496-559`。
- 风险：`sessionId` 可缺失或任意；服务端每问从 `caseId` 重建权威 patient profile，因此 session 初始化不是访问边界。CORS 和内存限流不是鉴权，且 serverless 实例间不共享计数。
- 触发条件：对公开病例 ID 直接向新版 agent-chat 连续提交覆盖所有槽位的问题，无需先初始化 session 或绑定 attempt。
- 后果：逐问恢复完整隐藏病史；通过冷启动/多实例降低内存限流效果，并持续消耗上游配额。
- 外部利用：是；本地探针无 session 请求返回 200。
- 医学安全：是；训练答案可预先枚举。
- 隐私/密钥：问题和最近对话会发往配置的 LLM；不返回密钥。
- 最小修复：要求短期、签名且绑定 case/language/mode/attempt 的 session capability；服务端校验过期、阶段和请求配额，限流迁移到共享存储。
- 推荐测试：缺失、伪造、过期、跨病例和跨语言 session 全部拒绝；跨 serverless 实例共享配额测试。
- 权限/裁决：需要后端状态与部署权限；不需医学裁决。

## SRA-P1-005：practice 签名复用 LLM 密钥且不校验最低强度

- 级别：P1
- 位置：`server/trainingState.js:6-26`；`.env.example:55-58`。
- 风险：practice 缺少 `TRAINING_STATE_SECRET` 时回退到 `LLM_API_KEY`。供应商凭据泄露即等同训练状态伪造能力，任一密钥轮换也会使所有未完成 attempt 失效；专用 secret 也没有长度/熵校验。
- 触发条件：practice 环境漏配专用 secret，或配置短弱 secret。
- 后果：扩大单一密钥泄露影响面、破坏轮换隔离并可能允许伪造评分状态。
- 外部利用：条件性；攻击者需先获得复用或弱密钥。
- 医学安全：是；可伪造结构化评分证据。
- 隐私/密钥：是；涉及 `TRAINING_STATE_SECRET`、`LLM_API_KEY`，报告未记录任何实际值。
- 最小修复：所有环境 fail closed，仅接受独立且满足最小长度的 secret；加入版本化 key ID 和受控轮换窗口。
- 推荐测试：缺失、短值、与 LLM key 相同均返回 503；轮换期间旧 token 的明确策略测试。
- 权限/裁决：需要 Vercel 环境变量人工权限；不需医学裁决。

## SRA-P1-006：Agent LLM 请求没有服务端幂等，恢复重试可重复计费

- 级别：P1
- 位置：`src/lib/apiClient.ts:96-139,141-156`；`api/agent-chat.js:120-159`；`server/llmClient.runtime.js:103-159`。
- 风险：客户端发送 `X-Idempotency-Key` 并自动重试，但 agent-chat 从未读取或缓存该键。超时、502/503/504 或连接中断时，同一问题可能并发触发多个上游生成；provider 层又有自身重试。
- 触发条件：首个请求已到达服务端/供应商但客户端未收到响应，通用恢复层重试。
- 后果：重复上游费用、配额放大、结果竞态；旧响应可能晚于新请求完成。
- 外部利用：是，可通过制造断连或大量请求放大；CORS 不能限制脚本客户端。
- 医学安全：间接；竞态回答可能造成不一致训练记录。
- 隐私/密钥：相同对话可能重复发送给第三方。
- 最小修复：服务端按受信 session + idempotency key 建立有界 single-flight/结果缓存；统一只在一层重试并传递取消。
- 推荐测试：首请求延迟、客户端超时后重试，断言 provider 仅调用一次且响应一致；多实例场景用共享幂等存储。
- 权限/裁决：需要工程修复；不需医学裁决。

## SRA-P2-001：请求体、事件和签名响应头缺少总量上限

- 级别：P2
- 位置：`api/training-action.js:231-308`；`server/trainingState.js:48-50,73-84`；`server/clinicalAssessment.js:51-125`。
- 风险：仅个别 history 文本截到 240 字；stage submission、events、orders 和 token 总体无上限。全部状态经 base64url 放入 `X-Training-State`。
- 触发条件：提交大字符串/数组或长时间积累事件。
- 后果：CPU/内存放大，响应头超过平台/代理限制后 attempt 无法继续；错误可能表现为不可恢复的同步失败。
- 外部利用：是；受平台 body 限制和内存限流部分约束。
- 医学安全：间接，可能丢失训练和评分连续性。
- 隐私/密钥：签名 token 含学生输入证据，虽不可篡改但可被客户端解码。
- 最小修复：schema 校验并限制字段、数组、事件数和序列化 token 字节；状态正文迁移服务端，客户端只持不透明 ID/capability。
- 推荐测试：边界值、超限 413、20/100 轮 header 大小及代理端到端测试。
- 权限/裁决：不需医学裁决。
## SRA-P2-002：内存限流/缓存并非全局且部分 Map 无界

- 级别：P2
- 位置：`api/training-action.js:18-19,49-56`；`api/tts.js:8-11,27-40,95-96`；`api/patient-reply.js:52,364-403`。
- 风险：training/TTS 请求窗口不清理 key 上限，旧 patient cache 无界；所有限制均为单实例内存状态。
- 触发条件：大量伪造来源键、唯一问题或 serverless 多实例/冷启动。
- 后果：内存增长、限流绕过、上游费用和可用性风险。
- 外部利用：是。
- 医学安全：间接。
- 隐私/密钥：缓存含合成患者回答；不含密钥。
- 最小修复：删除旧 cache，统一使用有 TTL/容量的共享限流和缓存；不要信任可由客户端控制的来源头。
- 推荐测试：超过最大 key 数、TTL 回收、多实例并发和冷启动后的累计限额。
- 权限/裁决：需要共享存储/部署配置；不需医学裁决。

## SRA-P2-003：前端短延时 timer 未全部清理

- 级别：P2
- 位置：`src/components/ClinicalTrainingClient.tsx:926,1310,1370,1440-1446`；统一卸载清理仅见 `1045-1055`。
- 风险：部分提示和模拟报告 timer 未保存在 ref，也未在卸载/病例切换时取消。
- 触发条件：启动 timer 后立即离开病例或切换组件。
- 后果：卸载后状态工作、旧病例结果回调和小规模内存/竞态问题。
- 外部利用：否。
- 医学安全：低；极端竞态可能把旧 UI 更新误认为当前报告。
- 隐私/密钥：否。
- 最小修复：集中 timer registry，并在 effect cleanup、病例/attempt 变化时清理；回调校验 generation/case/attempt。
- 推荐测试：下单后 500ms 内导航、提示显示后卸载，断言无旧状态更新。
- 权限/裁决：不需医学裁决。

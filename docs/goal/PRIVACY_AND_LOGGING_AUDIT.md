# 隐私、日志与浏览器存储审计

## 总结

- 未在当前树或新增 Git 历史中发现高置信真实密钥；任何值均未输出。
- 服务端业务日志主要记录 request ID、状态、耗时、病例 ID、槽位 ID和固定 reason，不记录 Authorization、Cookie、签名、完整 prompt 或患者回答。
- 抽查两张训练截图只含合成病例编号/训练对话和连接状态，未见姓名、证件号、电话、Cookie、签名或密钥；其余二进制截图/工作簿未被现有 secret scanner 内容扫描，不能据此声称全部二进制已脱敏。
- 主要隐私缺口是浏览器长期保存完整训练内容，以及完整问题/最近对话被传给第三方 LLM/TTS，而公开练习页没有数据流与保留期告知。

## PRV-P2-001：完整问答和作答长期保存在 localStorage

- 级别：P2
- 位置：`src/components/ClinicalTrainingClient.tsx:735-806,956-977,1529-1534`；`src/lib/safeStorage.ts:7-53`。
- 风险：messages、answers、exam/order logs、MDT、timeline 和 pending history questions 被写入同源 localStorage，无 TTL、自动过期、容量边界或全局“清除我的数据”入口。
- 触发条件：在共享设备练习，或同源发生 XSS/第三方脚本访问。
- 后果：后续同设备用户可恢复前一用户训练内容；存储持续增长并暴露医学训练输入。
- 外部利用：需同源脚本能力或本机访问。
- 医学安全：间接；旧记录可能混入后续训练。
- 隐私/密钥：涉及学生输入和合成医学内容，不含服务端密钥。
- 最小修复：明确 practice 数据保留期；记录 `expiresAt` 并启动时清理；提供清除全部训练数据按钮；不要在 localStorage 保存不必要的原文。
- 推荐测试：过期清理、共享浏览器退出清理、配额耗尽和清除按钮覆盖所有 `hematuria-*` key。
- 权限/裁决：隐私负责人需确定保留期；不需医学裁决。

## PRV-P2-002：第三方 LLM/TTS 数据流缺少公开告知和最小化合同

- 级别：P2
- 位置：`server/patientSession.js:548-560`；`api/agent-chat.js:199-213`；`api/tts.js:78-91`；说明仅泛称 DeepSeek/Azure，见 `README.md:80-82`。
- 风险：学生原问题、最近 6/8 轮对话、patient persona/allowed answer 或朗读文本会发往配置的第三方。公开 UI 未说明处理方、用途、保留期、地区或禁止输入真实患者信息的操作性提示。
- 触发条件：启用 AI 或云 TTS 并由学生输入自由文本。
- 后果：学生误输可识别信息后会发生境外/第三方处理；供应商保留策略无法由仓库静态确认。
- 外部利用：否，属于数据治理缺口。
- 医学安全：低。
- 隐私/密钥：是；可能包含学生输入的患者信息，不含 Authorization/Cookie。
- 最小修复：页面发送前明确禁止真实患者信息并提供隐私说明；最小化上下文；配置供应商零保留/区域策略并在外部配置清单留证。
- 推荐测试：注入姓名/电话/住院号，验证客户端阻止或脱敏；检查供应商请求 payload 不含超出必要范围的字段。
- 权限/裁决：需要隐私/法务及供应商控制台权限；不需医学裁决。

## PRV-P2-003：TTS 缓存使用 32 位哈希且不校验原始键

- 级别：P2
- 位置：`api/tts.js:36-40,66-72,95-100`。
- 风险：缓存键只有 FNV 风格 32 位值，命中时不比对 text/voice/rate/pitch。可构造碰撞使一个请求取得另一文本的缓存音频。
- 触发条件：同一实例存活期间，攻击者先写入碰撞项或碰撞到已有项。
- 后果：播放错误病例回答；若未来朗读真实敏感文本，可能跨请求披露音频。
- 外部利用：条件性，是；旧/无全局鉴权边界加剧风险。
- 医学安全：是，错误语音可能改变训练事实感知。
- 隐私/密钥：潜在音频内容泄露，不含密钥。
- 最小修复：使用 SHA-256 完整键或 Map 中保存并比较规范化原始 tuple；加入 TTL 和租户/session 隔离。
- 推荐测试：固定碰撞对、跨 voice/rate、缓存淘汰和并发命中测试。
- 权限/裁决：不需医学裁决。

## PRV-P2-004：仓库 secret scanner 覆盖范围不足

- 级别：P2
- 位置：`scripts/scan-repository-secrets.mjs:4-16`；`.github/workflows/deploy.yml:76-77`。
- 风险：扫描只处理当前 tracked/untracked 文本，显式跳过 xlsx、图片、PDF、zip、字体和音频，不检查 Git 历史、构建产物或常见 Authorization/Cookie/JWT/云厂商凭据格式。
- 触发条件：敏感值位于历史、二进制、截图、trace、被 ignore 的 `out/` 或未覆盖的 token 格式。
- 后果：CI 显示“passed”但仍可能提交敏感信息。
- 外部利用：一旦仓库/Pages 可读即可利用。
- 医学安全：否。
- 隐私/密钥：是。
- 最小修复：CI 使用成熟历史扫描器并对新增二进制做 OCR/元数据或人工门禁；构建后扫描 out、map、trace；保留只输出位置/规则不输出值的模式。
- 推荐测试：每类格式放置遮蔽 fixture，确保 scanner 能失败且日志不打印值。
- 权限/裁决：历史发现真实密钥时需密钥轮换权限；不需医学裁决。

## 已验证的日志分类

| 类别 | 证据 | 结论 |
|---|---|---|
| 非敏感性能计时 | `server/performanceTiming.js` 白名单；`scripts/test-performance-timing.ts` | 仅 app/provider/firsttoken/session/history/score 毫秒值；通过 |
| 业务事件 | `src/lib/apiClient.ts:128`、`server/llmClient.runtime.js:151` | request ID、endpoint、status、耗时、重试、固定 fallback；未见原文 |
| 医学训练内容 | `patient_fact_quarantined` / `training_fact_quarantined` | 记录 caseId、slotIds、固定 reason，不记录事实值；通过 |
| 认证信息 | 全仓库 console 搜索 | 未见 Authorization、Cookie、完整签名或 API key 写日志 |
| 调试信息 | `api/agent-chat.js:178`、session init debug | 生产仅可返回部署提交信息和布尔/模型元数据；未返回 prompt/allowedAnswer，但不必要的 full SHA 可进一步收敛 |

## 外部未验证

- DeepSeek/Azure 的实际日志、数据保留、区域和训练用途设置。
- Vercel Runtime Logs、Analytics、日志 drain、保留期和访问角色。
- GitHub artifact/Actions 日志的组织级保留和访问策略。
- 生产环境变量实际值、作用域和轮换状态。

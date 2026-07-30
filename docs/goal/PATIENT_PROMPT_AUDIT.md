# Patient Prompt 安全审计模式

## 启用边界

`PATIENT_PROMPT_AUDIT_ENABLED=true` 仅允许在本地 development/test 进程生效。以下任一条件都会强制关闭：

- `NODE_ENV=production`；
- 存在 `VERCEL`；
- 存在 `VERCEL_ENV`；
- 环境变量未显式设为 `true`。

该变量没有 `NEXT_PUBLIC_` 前缀，浏览器 bundle 不读取它。Preview 和 Production 默认且强制关闭。审计工具不会写浏览器 console。

## 允许输出

- Prompt template 版本；
- caseId、语言；
- canonical intent、命中 alias、matcher 层级和置信度；
- 使用的事实字段名、provenance、reviewerStatus；
- 是否调用 provider、历史条数、估算输入 token；
- maxTokens、temperature、provider 名称；
- 输出过滤结果和 fallback 原因。

## 禁止输出

完整 Prompt、完整问答、隐藏病例答案、诊断、评分点、payload、Cookie、Authorization、session/attempt token、训练签名、Redis/LLM/Vercel 凭据和环境变量值。异常 message、stack 与 cause 在进入 logger 前统一处理；Error message/stack 不原样输出。

## 完整 Prompt 的人工审核

正式代码不提供完整 Prompt 导出。若确需人工审阅，只能另行使用合成病例在本地受控临时目录生成脱敏副本；先执行敏感信息扫描，再人工查看，测试结束后删除，不提交 Git。当前里程碑没有生成或保留完整 Prompt 文件。

## 自动门禁

`pnpm run test:patient-prompt-audit` 使用运行时随机合成 canary 验证：

- Production、Vercel Preview 强制关闭；
- 关闭时不调用输出 sink；
- 未列入白名单的 prompt、payload、patientAnswer 字段被丢弃；
- Error、cause、URL 查询参数、Authorization/Cookie/签名递归脱敏；
- 合成值不会出现在输出。

# 真实 DeepSeek 与地域对照验收

## 真实 DeepSeek

仅在大陆预发布已部署、用户授权使用真实 key 后执行：

```text
MAINLAND_HEALTHCHECK_URL=https://<staging-domain>
MAINLAND_EXPECT_LIVE_AI=1
pnpm run test:mainland-live-ai
pnpm run test:mainland-20-rounds
pnpm run test:mainland-browser
```

证据必须显示 `generationSource=live_ai`、`isSafeMock!=true`、`isFallback!=true`。safe_mock、rule fallback、本地 provider 不计入通过。

除脚本自动完成的 session 20 次、中英文 10/10 与 20 轮外，人工/Playwright 验收还必须覆盖：中文切英文、英文切中文、刷新、快速双击、第一阶段提交、七阶段、history-log、360 分、provider timeout、429、Redis 中断与恢复、fallback 后恢复 live_ai。记录 session/回答 P50/P95、首字、完整回答、成功/fallback、providerCalls、401/403/429/5xx、冷/热请求。

## 地域对照

北京或华北、上海或华东、广州或华南各使用同病例、问题、20 轮、时间窗口和客户端版本，对腾讯云大陆预发布与当前 Vercel Preview 运行：

```text
COMPARISON_LOCATION=<beijing|shanghai|guangzhou>
COMPARISON_TARGETS=mainland=https://<staging>,vercel=https://<preview>
COMPARISON_ROUNDS=20
pnpm run test:mainland-regions
```

同时记录页面加载、session、AI 完整回答、20 轮成功率、fallback、错误率、Redis 耗时、冷启动、总体 P50/P95。不得预设大陆一定更快；结论只依据同窗口实测。

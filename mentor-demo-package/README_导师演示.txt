血尿临床问诊训练系统｜导师演示包

推荐入口
双击 Start-Online-Demo.cmd。在线版使用云端患者服务（live_ai = 云端 DeepSeek），不是本地 AI。
首次访问可能出现 Vercel 登录页；请使用已获授权的账号登录。本包不保存 Cookie、密码、密钥，也不包含 API Key。

用途与边界
本系统用于医学教学和模拟 OSCE，不用于真实诊疗。
本地网页演示版不等于本地 AI 版。真正离线 AI 桌面软件仍在开发。
rule_fallback 是安全规则降级，不是 AI；不得称为 live_ai 或 local_ai。

演示建议
1. 打开病例列表，选择 P001。
2. 在第一阶段询问“哪里不舒服？”，再问“多久了？”。
3. 完成当前阶段后提交，依次完成七个阶段。
4. 最终提交后进入复盘，查看阶段反馈、遗漏项和总报告。

常见故障
1. health 失败或网络不可用：检查网络后重试；不要绕过安全提示。
2. 出现 Vercel 登录页：使用已获授权账号登录；无权限时联系演示包负责人。
3. 页面提示降级：当前回答可能来自 rule_fallback，而非 AI；请如实说明。
4. 页面版本不一致：运行 VERIFY-DEMO.ps1，并停止演示，联系负责人更新包。
5. 本地入口提示未交付：这是预期的安全阻塞；请使用在线版。

版本
Production HEAD: 910d0b3bbcaf8cd22c1a854cba57b2bf50a2203d
Preview: https://hematuria-training-system-k4zt0b0fd-niubi1vs-projects.vercel.app/
打包日期: 2026-07-30（Asia/Shanghai）

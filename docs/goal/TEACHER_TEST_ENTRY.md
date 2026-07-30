# 教师测试入口说明

## 当前入口职责

- 完整审阅入口：`https://hematuria-training-system-git-codex-he-a06e54-niubi1vs-projects.vercel.app/`。该入口可能要求 Vercel 授权；已验证应用代码基线为 `296bf7e6f2e797c634c762b67488b279dfe59a37`，允许页面显示仅追加证据文档的更晚后代SHA。
- `https://niubi1v.github.io/hematuria-training-system/` 当前仍是 `main@5a3ad11` 的历史静态版本，不是最新完整 AI 训练验收入口。
- 不再使用 `HX-ADD-*` 旧内部路径作为当前病例验收依据。当前病例入口使用 `/cases/P001/` 至 `/cases/P042/`。

不得向教师发送 Automation Bypass secret、Cookie、Authorization 或任何带密钥的 URL。如教师需要免项目登录审阅，由项目管理员在 Vercel 界面评估官方 Shareable Link 或授予项目访问权限；不要关闭保护，也不要把凭据放在 URL。

## 建议复测步骤

1. 打开完整审阅入口，记录页面底部或 health 中的部署 SHA。
2. 打开 P003，等待训练会话准备完成；0 轮直接填写病史小结并提交第一阶段，确认进入第二阶段。
3. 打开 P001，至少完成一轮问诊后提交；分别验证中文、英文、双向语言切换、刷新恢复和快速双击。
4. 自然问法至少包括：小便痛不痛、排尿疼吗、没有尿痛吧、全程都是红的吗、从开始到最后都红吗、是刚开始红/最后红/全程红。
5. 若失败，截图应同时记录病例 ID、语言、北京时间、问题原文、页面提示；开发团队再从脱敏 network 证据记录请求路径、HTTP 状态和非敏感错误码。

请勿在截图中包含 Cookie、Authorization、训练 token、签名、环境变量或真实个人信息。

自动化验收已在上述SHA通过P003零轮、P001中英文真实AI、双向语言切换、刷新、快速双击及进入第二阶段。教师复测仍是独立的人机体验验收，不应使用旧GitHub Pages结果替代当前Vercel版本，也不应获得Automation Bypass凭据。

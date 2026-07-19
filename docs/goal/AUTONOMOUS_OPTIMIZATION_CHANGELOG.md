# 自主优化变更日志

## 执行中

| 缺陷 ID | 最小修改 | 测试 | 医学数据影响 | 提交 |
|---|---|---|---|---|
| HEM-AUTO-P1-001 | 已实现：取消无依据“数天”；无血尿标记时保留来源原文；肉眼改为“小便变红”，镜下/潜血与特殊尿色分类展示 | `scripts/test-chief-complaint.ts`（exit 0） | 无；`data/**` 只读 | `ae58b3d` |
| HEM-AUTO-P1-002 | 消息与 AI session 初始化等待 attempt/持久化语言恢复完成 | Playwright 桌面+移动 2/2 | 无 | `ae58b3d` |
| HEM-AUTO-P2-004 | session init 新增公共字段白名单、严格 language/mode/debug/forceRefresh 类型校验，超长幂等键返回 400 | `test-agent-api-security`、`test-training-security`、attempt/API recovery 等专项均 exit 0 | 无 | `8ac5721` |
| HEM-AUTO-P1-005 | 扩展尿频/尿急/夜尿/潴留/尿不尽/颜色/血块/泡沫尿/水肿/尿线、吸烟/职业暴露/抗凝药自然中英文路由 | 1008/1008 优先矩阵；3150/3150 大矩阵；错误 unknown 0；极性 0 | 无；只读取既有 canonical fact | `43d6535` |
| HEM-AUTO-P1-006 | 病例库复用患者化/冲突格式化器；P013 自然英文，P019/P020 显示待医学审核 | Playwright 桌面+移动 4/4 | 不裁决冲突 | `ae58b3d` |
| HEM-AUTO-P2-007 | 报告表比较统一 CRLF/LF；更新开关在显式更新时先写入 | 42 例 profile 门禁 exit 0 | 无 | `6ec6c8b` |

所有修改均不得改变病例事实、审核状态、360 分规则或 `needs_revision`。

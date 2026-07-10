# TEST REPORT

测试日期：2026-07-10

## 审计范围

- 首页、自由训练、OSCE、随机抽题、病例列表和筛选
- 肿瘤、感染、结石、BPH、肾小球疾病、外伤和假性血尿代表病例
- 7-Agent顺序解锁、教师演示、RCT离线原型、中英文数据
- 刷新恢复、重复提交、离开确认、AI失败降级、损坏localStorage
- GitHub Pages `/hematuria-training-system/` basePath和42个动态病例页

## 数据整改

- 保留42例：`P001-P012`、`HX-ADD-001-HX-ADD-030`
- 修正 HX-ADD-005 为药物/凝血相关
- 修正 HX-ADD-016-018 为前列腺疾病
- 修正 HX-ADD-019-023 为肾小球疾病
- 修正 HX-ADD-024 为功能性血尿
- 修正 HX-ADD-025 为假性血尿
- 修正 HX-ADD-026 为外伤
- 修正 HX-ADD-027-028 为肾实质/结构性疾病
- 修正 HX-ADD-029 为血管性疾病
- 统一 `IgA肾病`、`CT KUB`、`eGFR` 等术语
- 拆分既往史、个人史、婚育史和家族史，删除批量重复
- 每例至少3项鉴别诊断；补齐严重错误、处置路径、版本和参考依据
- schema校验：42例，0错误，42条“需临床专家终审”提示

## 自动化测试

```text
Patient Agent tests passed.
History rubric tests passed.
Dynamic Patient Session tests passed.
Chief complaint simplification tests passed.
Product audit tests passed.
Structured history regression passed: 42 cases x 17 questions.
Agent Chat API tests passed.
```

代表病例覆盖：

| 类型 | 病例 |
| --- | --- |
| 泌尿系肿瘤 | P001、HX-ADD-001 |
| 感染 | P006、HX-ADD-007 |
| 结石/感染性梗阻 | P009、HX-ADD-014 |
| BPH | P007、HX-ADD-017 |
| 肾小球疾病 | P011、HX-ADD-019 |
| 外伤 | HX-ADD-026 |
| 假性血尿 | HX-ADD-025 |

关键断言：

- 8个终末评分维度总和自动校验为360
- 未开CTU不返回CTU；开CTU后返回病例配置报告
- 重复CTU被标记为重复医嘱并影响效率评分
- 检查先显示“已开具”，再显示返回时间和报告
- OSCE仅在Agent 7显示终末反馈
- 阶段提交按钮提交后禁用，防止重复记录
- 会诊必须有科室、触发原因、待解决问题和临床证据
- 损坏localStorage自动清理并恢复为空白会话
- RCT校验0-360、0-100范围和participant_id重复
- 中英文病例索引均覆盖42例
- P001高血压回答为肯定、糖尿病/手术史回答为否定，全部长期用药同时返回缬沙坦和阿司匹林
- “抽烟吗，喝酒吗”同时返回两个事实并记录 `LIFE_SMOKING`、`LIFE_ALCOHOL`
- Patient Agent回答无Markdown项目符号、无教师端占位语和检查/诊断泄露
- Agent 6使用独立 `perioperative` 阶段评分；Agent 7仅在点击“完成训练并生成最终报告”后生成360分报告

## 工程检查

```text
npm run lint       通过
npm run typecheck  通过
npm run build      通过
```

生产构建使用：

```text
NEXT_PUBLIC_BASE_PATH=/hematuria-training-system
Next.js 15.5.19
Compiled successfully
Generated static pages: 52
/cases/[id]: 42 paths
```

构建产物包含首页、病例库、42个病例页、随机抽题、教师演示、RCT、旧版阶段反馈兼容页和404页。`trailingSlash: true`，GitHub Pages工作流使用官方 Pages artifact/action。

## 修复前后

| 项目 | 修复前 | 修复后 |
| --- | --- | --- |
| 病例分类 | 多个BPH、肾病、外伤、假性血尿误归结石/感染 | 统一大类和亚类，schema自动校验 |
| 治疗字段 | 部分非结石病例误用碎石路径 | 按肿瘤、感染、结石、前列腺、肾小球、外伤等重建 |
| 评分 | 100/200/230/360文件并存 | 终末评价、教师复核和OSCE统一360 |
| 医嘱 | 立即显示结果、无重复证据 | 记录已开具/返回时间/阶段/重复医嘱 |
| AI状态 | 生产界面显示模型、调试、AI待调用 | 动态显示AI、规则库或降级模式，API返回事实匹配与降级原因 |
| P001问诊 | 已知高血压/缬沙坦丢失，生活史返回“不清楚” | 结构化事实恢复高血压、缬沙坦+阿司匹林，生活史按字段回答 |
| 语音 | 固定音色、固定语速、无暂停重播 | 系统音色筛选、性别偏好、设置弹窗、试听/暂停/继续/停止/重播 |
| RCT | 少量字段、无范围和重复校验 | 完整离线原型字段、校验、导入导出和数据字典 |
| 教师端 | 未说明权限边界 | 明确“演示用教师模式”，显示版本和审核状态 |

## 已知限制

- 已使用本地生产静态构建进行桌面和390×844移动视口浏览器验收：无横向溢出，输入框和主要按钮位于视口内，语音设置弹窗可用。iPhone Safari/Chrome的系统音色和网络策略仍需真机终验。
- 静态GitHub Pages无法安全隐藏教师数据、实现真实身份验证或研究级审计。
- 30个补充病例的英文病例索引已补齐；AI不可用时，部分深层患者槽位仍以中文规则库数据为准，正式双语考核前应由双语医学教师逐项翻译审核。
- 所有病例仍标记为 `needs_revision`，本次为工程与规则审计，不冒充临床专家终审。

线上地址：<https://niubi1v.github.io/hematuria-training-system/>

## P001回答前后

| 问题 | 修复前 | 修复后规则答案 |
| --- | --- | --- |
| 你吸烟吗？ | 不太清楚 | 我不吸烟。`author_added_for_simulation`，待教师复核 |
| 喝酒吗？ | 不太清楚 | 我平时不喝酒。`author_added_for_simulation`，待教师复核 |
| 有高血压吗？ | 不太清楚 | 有高血压。 |
| 有糖尿病吗？ | 不太清楚 | 没有糖尿病。 |
| 做过手术吗？ | 不太清楚 | 我以前没有做过手术。 |
| 平时都吃什么药？ | 长期服用阿司匹林 | 我长期服用缬沙坦（1片 qd）、阿司匹林。 |

## 阶段评分映射

| Agent | StageKey | 提交结果 |
| --- | --- | --- |
| 1 | history | 病史采集阶段评价 |
| 2 | orders | 查体/开单阶段评价 |
| 3 | diagnosis | 诊断与至少3项鉴别评价 |
| 4 | consult | MDT申请与会诊评价 |
| 5 | treatment | 即时处理与确定性治疗评价 |
| 6 | perioperative | 独立围术期评价，不提前生成总报告 |
| 7 | debrief | 点击完成后一次性生成360分终末报告 |

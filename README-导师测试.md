# 血尿临床思维训练系统 - 导师测试说明

## 一、快速运行

推荐 Windows 测试方式：

1. 解压整个项目文件夹。
2. 双击 `start-for-teacher.bat`。
3. 等待命令窗口提示 Next.js 启动完成。
4. 浏览器打开：

```text
http://127.0.0.1:3000
```

## 二、测试流程建议

1. 首页点击“自由训练”“OSCE考核”或“选择病例”。
2. 病例库可按难度、疾病类别、来源、训练重点筛选；病例卡不显示最终诊断。
3. 进入病例后依次完成 8 个阶段：
   - 接诊与问诊
   - 查体
   - 开单检查
   - 诊断与鉴别
   - 会诊/MDT
   - 治疗决策
   - 随访与教育
   - 复盘反馈
4. 每个阶段提交后，系统才显示该阶段教师端标准答案、命中点、漏项和高危提示。
5. 最后生成 360 分评价、时间线、学生记录和标准路径复盘。

自由训练中，病史采集阶段提交前只显示通用框架进度；提交后才显示问诊覆盖度、漏项和标准答案。OSCE模式不显示覆盖度和中途反馈，终末复盘统一查看。学生自由提问后，系统按问诊槽位匹配并返回该病例标准化患者回答。

## 三、语音对话测试

病史采集阶段支持：

- “语音提问”：点击后直接说出问诊问题。
- “患者朗读”：开启后，患者回答会自动朗读。

建议使用最新版 Chrome 或 Edge。浏览器语音识别能力可能依赖浏览器厂商服务，测试时不要输入真实患者隐私信息。

## 四、教师端测试

教师模式支持：

- 本地上传并预览新版 Excel
- 查看隐藏答案字段
- 编辑病例 JSON 草稿
- 新增病例草稿
- 导出学生训练结果 JSON/CSV
- 保存人工修正分数
- 查看训练记录仪表盘、病例级开单结果库、MDT触发规则和RAG护栏

教师端上传只在浏览器本地解析，不会自动写入项目文件。永久修改病例库需要更新 Excel 后重新运行：

```bash
npm run convert:excel
```

## 五、当前病例库

当前项目已内置 47 个全流程血尿病例，来源于：

```text
work/source/v2_only_cases.xlsx
work/source/frontend_order_consult_fix.xlsx
```

并已转换为：

```text
data/cases.json
data/question_slots.json
data/physical_exam_items.json
data/physical_exam_results.json
data/order_packages.json
data/consult_rules.json
data/treatment_pathways.json
data/scoring_template.json
data/interview_slots.json
data/interview_answers.json
data/osce_rubric.json
```

完整验收记录见 `TEST_REPORT.md`，完整运行和 GitHub Pages 部署说明见 `README.md`。

## 六、重要提醒

本项目用于导师测试和医学教学展示，不用于真实诊疗。当前为静态前端版本，项目源码和 JSON 数据中包含教师端标准答案，不建议直接作为高安全防作弊考试系统公开给学生。

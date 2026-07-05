# TEST_REPORT

测试日期：2026-07-05

## 数据源

- 当前病例库版本：`V2-only`
- 唯一病例来源：`work/source/v2_only_cases.xlsx`
- 开单/会诊目录来源：`work/source/frontend_order_consult_fix.xlsx`

## 生成数据

- `data/cases.json`：12 例，`P001` 到 `P012`
- `data/case_cards.json`：444 条病例卡长表字段
- `data/question_answers.json`：300 条问诊槽位答案
- `data/interview_answers.json`：300 条问诊槽位答案
- `data/interview_slots.json`：25 个问诊槽位
- `data/question_slots.json`：25 个问诊槽位镜像
- `data/order_results.json`：192 条病例级开单返回结果
- `data/mdt_triggers.json`：12 条病例级 MDT 触发规则
- `data/physical_exam_results.json`：192 条病例级查体返回结果
- `data/evaluator_rubric.json`：360 分评价规则
- `data/osce_rubric.json`：OSCE 站点评分表

## 数据清理测试

执行数据校验：

```bash
npm run convert:excel
```

结果：

- 病例数 = 12
- `cases.json`、`question_answers.json`、`order_results.json`、`mdt_triggers.json`、`physical_exam_results.json` 的 case_id 均在 `P001-P012`
- 未发现非 V2 病例进入上述数据文件

## 构建测试

命令：

```bash
npm run build
```

结果：通过。Next.js 静态导出成功，生成 12 个病例详情页。

## 防泄题测试

测试页面：

```text
http://127.0.0.1:3000/cases/P001/
```

提交病史采集前检查：

- 不显示具体漏项
- 不显示得分点
- 不显示关键槽位
- 不显示标准答案
- 学生端仅显示脱敏主诉、年龄、性别、当前任务、已获得资料和通用记录

结果：通过。

## Patient Agent 测试

- 学生问题：`有血块吗`
- 返回来源：`问诊槽位答案_逐项` 中当前 `case_id + slot_id`
- 行为：只回答被问到的信息，不主动透露诊断、治疗或未问关键线索

结果：通过。

## Order Result Agent 测试

测试病例：`P001`

- 未开 CTU 前：页面不显示 CTU 结果
- 输入并开立 `CTU` 后：返回病例级 CTU 模拟报告卡
- 其他未开项目不提前显示

结果：通过。

## MDT 与教师端测试

- 会诊页面按外科、内科、辅助/平台、急诊/危重分组
- 会诊目的为空时不能提交
- 教师端可以查看完整病例卡、问诊答案、开单结果、MDT触发规则
- 教师端提供“清空本地训练缓存”按钮

结果：通过。

## 缓存策略

- 浏览器缓存版本号：`V2-only`
- 首次进入新版训练页时自动清理旧训练缓存
- 教师端可手动清空本地训练缓存

## 部署测试

项目类型：Next.js 静态导出。

已配置：

- `next.config.mjs`：`output: "export"`，支持 `NEXT_PUBLIC_BASE_PATH`
- `.github/workflows/deploy.yml`：GitHub Pages 自动部署
- `README.md`：包含 GitHub Pages 设置、更新 Excel 和清理缓存方法

线上链接需要推送到用户自己的 GitHub 仓库后由 GitHub Pages 生成。

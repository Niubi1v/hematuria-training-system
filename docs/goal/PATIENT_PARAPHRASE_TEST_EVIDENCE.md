# Patient Paraphrase Test Evidence

日期：2026-07-17；起始HEAD `8014045d92ae310250baa5299bc424147263a012`。

## 失败基线

命令：`tsx scripts/test-patient-intent-normalization.ts`（修复前）
退出码：1

`totalQuestions=74, canonicalHits=8, canonicalHitRate=0.1081, erroneousUnknowns=37, erroneousUnknownRate=0.5, polarityErrors=67, polarityErrorRate=0.9054, compoundComplete=true, failures=245`

首个真实失败为P005中文“尿痛吗”没有`factValue`；随后“小便痛不痛”完全未命中并返回unknown。失败清单同时覆盖排尿疼、撒尿痛、烧灼、英文hurt/burning、全程/起始/终末及选择问句。

## 修复后专项

命令：`pnpm run test:patient-intents`
退出码：0

- 86个否定、反问、选择、口语及中英文问题：86/86 canonical命中；错误unknown=0；极性错误=0；复合三事实完整。
- 42例×4 intent×5问法：840/840 canonical命中；known=595，correct unknown=230，erroneous unknown=0，polarity errors=0，双语fact value一致，quarantine answers=15，failures=0。

## 15-intent扩展矩阵

- 失败基线：3,150问，canonical 2,478/3,150，错误unknown 600，极性错误711，failures=4,743。
- 最终结果：15 intent、190 alias；3,150/3,150 canonical命中；known=1,370，correct unknown=1,715，erroneous unknown=0，polarity errors=0，quarantine=65，双语值一致，failures=0。
- 复合“尿频尿急尿痛”继续完整；否定问句不改变病例极性；unknown事实保留治理slot但`collectableSlotIds=[]`。旧structured matcher不再抢答已识别canonical intent。

## 相关回归

以下命令均exit 0：

- `test:bilingual`：42例×6英文复合fixture；
- `test:bilingual-conflict-quarantine`：18条冲突不进入provider/context/评分；
- `test:patient-history-routing`：42×7自然历史问法及4个安全边界；
- `test:patient-pain-routing`：42×6疼痛特异性及5例冲突范围；
- `test:patient-safe-projection`：126条公开回复，0个不安全来源放行；
- `test:session`、`test:agent`、`test:history-matrix`；
- `test:scoring-v3`：42例360分同义词及防伪。

里程碑完整门禁：

- 完整行为/安全链全部通过；42例×17历史、42例×6英文、18冲突、42例×7阶段、42例360评分和419审核约束均保持；
- TypeScript、ESLint exit 0；
- Playwright 72项：70 passed、2个互斥项目skip、0 failed，184.1秒；desktop/mobile、42例双语七阶段、双击、刷新、会话恢复、history-log、a11y均通过；
- root与`/hematuria-training-system` basePath均82/82静态页；每次bundle 25个JS资产通过；repository scanner 323个tracked/candidate文件通过；
- `data/**`零差异。P999的dev请求因Next动态参数行为从浏览器suite移除，未知ID仍由公共路由合同拒绝；production静态HTTP 404本机server未启动成功，保持待CI/长期QA复核，不写成通过。

远程边界：安全HEAD `f22dd1a`的Actions run `29541184518`在旧E2E基础设施中因Playwright步骤5分钟超时失败；其前置行为、TypeScript、ESLint和secret scan均通过。当前候选已将dev static-export配置分离、让Playwright直接管理Next进程并去除重复42×2 dev HTTP矩阵，尚需提交/push后的Node 22 run作为权威远程结果。

首轮相关回归曾发现英文复合“pain, frequency, urgency, dysuria”丢失独立pain；新增独立general pain检测后原断言恢复通过，没有删除或放宽该测试。

## 数据与隐私

测试输出只记录病例显示ID、intent和聚合计数，不输出回答样本、session capability、token、Cookie、Authorization或环境变量值。`data/**`没有被修改；HEM-P0-001、HEM-P0-023、419审核、161来源、`needs_revision`及360评分规则均保持。

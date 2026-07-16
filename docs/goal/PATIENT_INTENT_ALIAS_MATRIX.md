# Patient Intent Alias Matrix

版本：首批4 intent，2026-07-17。catalog为`src/lib/patientIntentCatalog.js`；当前共66个显式中英文alias，另有组合语义单元pattern。

| canonical intent | source slot | 中文alias数 | 英文alias数 | 代表中文 | 代表英文 | 易混淆事实 |
|---|---|---:|---:|---|---|---|
| `dysuria` | `dysuria` | 18 | 9 | 尿痛、小便痛/疼、排尿痛/疼、尿的时候痛/疼、解小便时痛、撒尿痛/疼、刺痛、烧灼、烧得慌、小便不舒服 | dysuria, painful urination, pain/burning when urinating, hurt/sting when peeing, pain passing urine | general pain、flank pain、suprapubic pain |
| `whole_stream_hematuria` | `hematuria_phase` | 12 | 7 | 全程血尿、全程都红、从头到尾、从开始到最后、整个过程、整泡尿 | throughout urination, red from start to finish, whole/entire stream | initial、terminal hematuria |
| `initial_hematuria` | `hematuria_phase` | 5 | 4 | 起始血尿、刚开始红、只有一开始红、刚尿出来红 | initial hematuria, blood/red only at beginning, start red then clear | whole-stream、terminal hematuria |
| `terminal_hematuria` | `hematuria_phase` | 6 | 5 | 终末血尿、快尿完红、最后一段/几滴红、只有最后红 | terminal hematuria, red/blood only at end, near the end, last drops | whole-stream、initial hematuria |

## 匹配规则

- NFKC统一全角/半角，英文转小写，标点转空格；中文比较时去空格。
- alias匹配与受限组合pattern并用，不匹配完整句子白名单。
- 问句中的否定词保留，但不作为病例答案；病例值只从source slot读取。
- 选择问句可同时命中多个时相intent，最后按病例明确时相生成一个不重复回答。
- `dysuria`命中时仅在问题没有独立general pain时移除宽泛`pain`；“pain, frequency, urgency, dysuria”仍保留pain和dysuria。
- 低置信度不进行模糊猜测；当前首批只使用置信度1的alias/组合规则。

## 尚未启用的首批候选

`urinary_frequency`、`urinary_urgency`、`blood_clots`、`flank_pain`、`fever`、`foamy_urine`、`edema`、`weak_stream`、`incomplete_emptying`、`urinary_retention`、`nocturia`仍沿用既有canonical slot，需在下一批补齐问题级value与alias审计后再登记。

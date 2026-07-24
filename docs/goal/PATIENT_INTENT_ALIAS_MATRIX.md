# Patient Intent Alias Matrix

版本：首批15 intent，2026-07-17。catalog为`src/lib/patientIntentCatalog.js`；当前共190个显式中英文alias，另有组合语义单元pattern。

| canonical intent | source slot | 中文alias数 | 英文alias数 | 代表中文 | 代表英文 | 易混淆事实 |
|---|---|---:|---:|---|---|---|
| `dysuria` | `dysuria` | 18 | 9 | 尿痛、小便痛/疼、排尿痛/疼、尿的时候痛/疼、解小便时痛、撒尿痛/疼、刺痛、烧灼、烧得慌、小便不舒服 | dysuria, painful urination, pain/burning when urinating, hurt/sting when peeing, pain passing urine | general pain、flank pain、suprapubic pain |
| `whole_stream_hematuria` | `hematuria_phase` | 12 | 7 | 全程血尿、全程都红、从头到尾、从开始到最后、整个过程、整泡尿 | throughout urination, red from start to finish, whole/entire stream | initial、terminal hematuria |
| `initial_hematuria` | `hematuria_phase` | 5 | 4 | 起始血尿、刚开始红、只有一开始红、刚尿出来红 | initial hematuria, blood/red only at beginning, start red then clear | whole-stream、terminal hematuria |
| `terminal_hematuria` | `hematuria_phase` | 6 | 5 | 终末血尿、快尿完红、最后一段/几滴红、只有最后红 | terminal hematuria, red/blood only at end, near the end, last drops | whole-stream、initial hematuria |
| `urinary_frequency` | `urinary_frequency` | 8 | 7 | 尿频、小便次数多、老想上厕所、尿得勤 | urinary frequency, urinate/pee more often, pass urine frequently | urgency、nocturia |
| `urinary_urgency` | `urinary_urgency` | 7 | 6 | 尿急、突然想尿、憋不住、来不及上厕所 | urinary urgency, sudden urge, cannot hold urine | frequency、incontinence |
| `blood_clots` | `clots` | 6 | 4 | 血块、血凝块、凝血块、血疙瘩 | blood clots, clots/lumps in urine | clot shape、urine color |
| `flank_pain` | `flank_pain` | 8 | 5 | 腰痛/疼、腰侧、后腰、肾区疼 | flank/loin pain, side of back/kidney pain | general、abdominal、suprapubic pain |
| `fever` | `fever_chills` | 6 | 4 | 发热、发烧、体温高、烧起来 | fever, feverish, high/running temperature | chills |
| `foamy_urine` | `glomerular_features` | 6 | 4 | 泡沫尿、尿起泡、小便很多泡 | foamy/frothy urine, bubbles in urine | edema、proteinuria |
| `edema` | `glomerular_features` | 7 | 6 | 水肿、眼皮/眼睑/腿脚/下肢肿 | edema/oedema, puffy eyes, swollen legs/ankles | foamy urine、weight gain |
| `weak_stream` | `voiding_difficulty` | 6 | 5 | 尿线细、尿流弱、尿得没劲 | weak/thin/poor urinary stream/flow | hesitancy、retention、incomplete emptying |
| `incomplete_emptying` | `voiding_difficulty` | 5 | 4 | 尿不尽、尿完还有尿、排不干净 | incomplete emptying, bladder not empty, urine left | frequency、retention |
| `urinary_retention` | `retention` | 5 | 5 | 尿潴留、尿不出来、完全排不出 | urinary retention, cannot/unable to pass urine | weak stream、incomplete emptying |
| `nocturia` | `voiding_difficulty` | 5 | 5 | 夜尿、晚上起夜、夜里起来尿 | nocturia, get up/pee at night | frequency |

## 匹配规则

- NFKC统一全角/半角，英文转小写，标点转空格；中文比较时去空格。
- alias匹配与受限组合pattern并用，不匹配完整句子白名单。
- 问句中的否定词保留，但不作为病例答案；病例值只从source slot读取。
- 选择问句可同时命中多个时相intent，最后按病例明确时相生成一个不重复回答。
- `dysuria`命中时仅在问题没有独立general pain时移除宽泛`pain`；“pain, frequency, urgency, dysuria”仍保留pain和dysuria。
- 低置信度不进行模糊猜测；当前首批只使用置信度1的alias/组合规则。

## 当前覆盖边界

15项均已启用问题级value分类与alias审计。当前未把其余历史slot自动纳入本catalog，也未启用低置信度自由语义猜测；新增intent必须继续提供source slot、易混淆事实、双语值分类、unknown治理和42例回归后才能登记。

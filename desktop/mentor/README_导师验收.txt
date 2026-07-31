完整解压后，双击启动血尿训练系统.cmd

“血尿临床问诊训练系统”Windows本地AI测试版，仅用于医学教学模拟，不用于真实诊疗。

使用要求：
1. 必须先完整解压ZIP，不能在压缩软件预览窗口中直接运行。
2. 无需安装Node、Docker、Redis、Python，无需API Key；断网可用。
3. 首次启动会校验约1.28GB模型并显示“正在启动本地患者服务”，请等待服务就绪提示。
4. 本地业务服务和llama-server只监听127.0.0.1随机端口；关闭软件窗口后全部sidecar自动退出。
5. 模型缺失或损坏时，启动器会给出修复提示，不会把rule_fallback标记为local_ai。
6. 可运行VERIFY-PACKAGE.ps1复核关键文件SHA256。

医学内容治理：
- 病例事实仅来自既有病例source、ontology、九态事实模型与answer planner。
- 本地模型只识别intent/topic/slot/context及自然化参数，不生成检查、病理、诊断、治疗或评分事实。
- 未通过医学治理的检查结果保持fail-closed，不会自动补成“正常”。

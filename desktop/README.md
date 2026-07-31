# Windows 真实离线版 POC

本桌面目标保留仓库现有的 Next.js 静态导出、七阶段 API、Patient ontology、
九态事实模型、answer planner 和 360 分规则。桌面专用链路为：

`Tauri v2 → Node 22.14 业务 sidecar → SQLite → llama-server → 现有 Patient Agent`

业务服务和 llama-server 均只监听随机的 `127.0.0.1` 端口。Tauri 在 SQLite
迁移及 sidecar 健康检查完成后，通过一次性握手接收业务端口，再向 WebView
注入启动期 bearer。窗口关闭时 Windows Job Object 会终止整个子进程树。

## 运行时与模型

- Node 22.14.0 和 llama.cpp b10176 由
  [`runtime-manifest.json`](./runtime-manifest.json) 固定版本、归档 SHA-256
  及逐文件大小/SHA-256 白名单；只有 server 所需文件进入安装包，运行时本身
  不进入 Git。
- 提供分离下载的两档模型：默认 `lightweight` 为
  `ggml-org/Qwen3-1.7B-GGUF` / `Qwen3-1.7B-Q4_K_M.gguf`；`standard` 为
  `ggml-org/Qwen3-4B-GGUF` / `Qwen3-4B-Q4_K_M.gguf`。两者都不进入安装包或 Git。
- 默认模型目录：
  `%LOCALAPPDATA%\cn.hematuria.training.desktop\models`
- 默认数据库：
  `%LOCALAPPDATA%\cn.hematuria.training.desktop\hematuria.sqlite3`
- 可在桌面训练页的“本地 AI”设置中修改模型目录；也可在启动前设置绝对路径
  `HEMATURIA_DESKTOP_MODEL_PATH`。
- 设置 `HEMATURIA_DESKTOP_DISABLE_LOCAL_AI=1` 可完全关闭模型；Patient Agent
  会自动使用受治理的 `rule_fallback`。

自动下载并校验模型：

```powershell
pnpm desktop:model:install
```

安装标准 4B 模型：

```powershell
pnpm desktop:model:install -- --model-mode standard
```

手工放置时，文件名必须保持清单中的原名。可用以下命令核对 SHA-256：

```powershell
Get-FileHash "$env:LOCALAPPDATA\cn.hematuria.training.desktop\models\Qwen3-1.7B-Q4_K_M.gguf" -Algorithm SHA256
Get-FileHash "$env:LOCALAPPDATA\cn.hematuria.training.desktop\models\Qwen3-4B-Q4_K_M.gguf" -Algorithm SHA256
```

## 一键命令

首次准备固定版本的 Node 与 llama.cpp：

```powershell
pnpm desktop:prepare
```

开发启动：

```powershell
pnpm desktop:dev
```

构建 NSIS 安装包和便携 ZIP，并自动执行包内容/secret 审计：

```powershell
pnpm desktop:build
```

清理构建缓存（保留已下载运行时）：

```powershell
pnpm desktop:clean
```

连固定运行时一并清理：

```powershell
pnpm desktop:clean:all
```

开发构建需要 Rust/Cargo、MSVC C++ Build Tools 和 WebView2。最终用户无需安装
Node、Docker、Redis 或模型服务；Windows 目标机需要系统 WebView2。

## 专项验收

```powershell
pnpm test:desktop:local-ai
pnpm test:desktop:lifecycle
pnpm test:desktop:packaged-sidecar
pnpm test:desktop:acceptance
pnpm test:desktop:public-boundary
pnpm test:desktop:package
```

`test:desktop:acceptance` 使用 staged 业务 sidecar 和临时 SQLite，覆盖 P001
中英文问诊、P003 零轮提交、第一阶段进入第二阶段、快速双击幂等、sidecar
重启后的状态与 Patient session 恢复。真实 Qwen 模型延迟和内存由
`pnpm benchmark:desktop:model` 单独测量，且不会记录完整问答文本。

## 产物

默认输出到 `D:\HematuriaDesktopArtifacts`：

- `hematuria-desktop-portable-0.1.0-windows-x64.zip`
- `hematuria-desktop-setup-0.1.0-windows-x64.exe`
- `hematuria-desktop-artifacts-0.1.0.json`（上述产物哈希与组件体积收据）

可用绝对路径环境变量 `HEMATURIA_DESKTOP_ARTIFACTS` 修改输出目录。安装包、
便携包和模型都不得 push 到 GitHub。

## 安全边界

本 POC 仅为练习部署。本地模型只返回意图、主题、实体、slot、上下文引用、
clause 和自然化风格等结构化元数据；模型不生成或决定事实、药名/剂量、检查
结果、诊断、治疗或评分。最终回答始终由现有 ontology、来源治理、九态事实模型
和 answer planner 生成。

sidecar 日志只允许状态、错误码、耗时、PID 和端口，不记录完整患者对话、模型
prompt、bearer、训练签名密钥或配置值。由于业务资源安装在用户电脑上仍可被
本机管理员提取，本 POC 不是正式考试或教师数据的安全边界。

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$expectedModelBytes = 1282439264
$expectedModelSha256 = "D2387CA2DBFEE2FFABCE7120D3770DADCA0B293052BC2F0E138FDC940D9BC7B5"
$packageRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$modelPath = Join-Path $packageRoot "Model\Qwen3-1.7B-Q4_K_M.gguf"
$appPath = Join-Path $packageRoot "App\HematuriaTraining-R5.exe"
$nodePath = Join-Path $packageRoot "App\resources\runtime\node\node.exe"
$llamaPath = Join-Path $packageRoot "App\resources\runtime\llama\llama-server.exe"
$mentorData = Join-Path $env:LOCALAPPDATA "HematuriaTraining\MentorLocalAI-R5"

function Stop-WithRepair([string]$message) {
  Write-Host ""
  Write-Host "无法启动：$message" -ForegroundColor Red
  Write-Host "请完整解压导师ZIP后重新双击“启动血尿训练系统.cmd”；仍失败时运行 VERIFY-PACKAGE.ps1。" -ForegroundColor Yellow
  Read-Host "按回车键关闭"
  exit 1
}

function Get-PackageProcesses([string]$name, [string]$expectedPath) {
  return @(Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object {
    try { [System.IO.Path]::GetFullPath($_.Path) -ieq $expectedPath } catch { $false }
  })
}

$appProcess = $null
try {
  if (-not (Test-Path -LiteralPath $appPath -PathType Leaf)) { Stop-WithRepair "应用文件缺失。" }
  if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) { Stop-WithRepair "内置业务运行时缺失；无需另装Node，请重新完整解压。" }
  if (-not (Test-Path -LiteralPath $llamaPath -PathType Leaf)) { Stop-WithRepair "本地患者服务组件缺失；请重新完整解压。" }
  if (-not (Test-Path -LiteralPath $modelPath -PathType Leaf)) { Stop-WithRepair "Qwen3-1.7B模型缺失。模型应位于 Model\Qwen3-1.7B-Q4_K_M.gguf。" }

  $modelFile = Get-Item -LiteralPath $modelPath
  if ($modelFile.Length -ne $expectedModelBytes) { Stop-WithRepair "模型大小不正确，文件可能未完整解压。" }
  Write-Host "正在校验本地模型完整性，请稍候……" -ForegroundColor Cyan
  $modelHash = (Get-FileHash -LiteralPath $modelPath -Algorithm SHA256).Hash
  if ($modelHash -ne $expectedModelSha256) { Stop-WithRepair "模型SHA256不匹配，文件可能损坏。" }

  New-Item -ItemType Directory -Path $mentorData -Force | Out-Null
  $env:HEMATURIA_DESKTOP_MODEL_PATH = $modelPath
  $env:HEMATURIA_DESKTOP_MODEL_MODE = "lightweight"
  $env:HEMATURIA_DESKTOP_DATA_DIR = $mentorData
  Remove-Item Env:HEMATURIA_DESKTOP_DISABLE_LOCAL_AI -ErrorAction SilentlyContinue
  Write-Host "正在启动本地患者服务……首次加载可能需要数十秒。" -ForegroundColor Cyan
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new($appPath)
  $startInfo.WorkingDirectory = Split-Path -Parent $appPath
  $startInfo.UseShellExecute = $false
  $appProcess = [System.Diagnostics.Process]::Start($startInfo)
  if (-not $appProcess) { Stop-WithRepair "应用进程未能创建。" }

  $deadline = (Get-Date).AddMinutes(4)
  $lastProgress = Get-Date
  $ready = $false
  while ((Get-Date) -lt $deadline) {
    if ($appProcess.HasExited) { Stop-WithRepair "应用在本地患者服务就绪前退出。" }
    $node = @(Get-PackageProcesses "node" $nodePath)
    $llama = @(Get-PackageProcesses "llama-server" $llamaPath)
    if ($node.Count -gt 0 -and $llama.Count -gt 0) {
      $runtimePids = @($node + $llama | ForEach-Object { [int]$_.ProcessId })
      $listeners = @(& "$env:SystemRoot\System32\netstat.exe" -ano -p TCP | ForEach-Object {
        if ($_ -match '^\s*TCP\s+(\S+)\s+\S+\s+LISTENING\s+(\d+)\s*$' -and $runtimePids -contains [int]$Matches[2]) {
          [PSCustomObject]@{ LocalEndpoint = $Matches[1]; OwningProcess = [int]$Matches[2] }
        }
      })
      $nonLoopback = @($listeners | Where-Object { $_.LocalEndpoint -notmatch '^(127\.0\.0\.1:|\[::1\]:)' })
      if ($nonLoopback.Count -gt 0) {
        Stop-Process -Id $appProcess.Id -Force -ErrorAction SilentlyContinue
        Stop-WithRepair "检测到本地服务未严格绑定回环地址，已安全停止。"
      }
      $nodeListener = @($listeners | Where-Object { $node.ProcessId -contains [int]$_.OwningProcess })
      $llamaListener = @($listeners | Where-Object { $llama.ProcessId -contains [int]$_.OwningProcess })
      if ($nodeListener.Count -gt 0 -and $llamaListener.Count -gt 0) {
        $ports = @($listeners | Select-Object -ExpandProperty LocalPort -Unique)
        if ($ports.Count -lt 2) {
          Stop-Process -Id $appProcess.Id -Force -ErrorAction SilentlyContinue
          Stop-WithRepair "本地服务端口握手异常，已安全停止。"
        }
        $ready = $true
        break
      }
    }
    if (((Get-Date) - $lastProgress).TotalSeconds -ge 8) {
      Write-Host "正在启动本地患者服务，请继续等待……"
      $lastProgress = Get-Date
    }
    Start-Sleep -Seconds 2
  }
  if (-not $ready) {
    Stop-Process -Id $appProcess.Id -Force -ErrorAction SilentlyContinue
    Stop-WithRepair "本地模型在4分钟内未完成启动。请确认内存充足后重试。"
  }
  Write-Host "本地患者服务已就绪：模型和运行时完整，服务仅监听127.0.0.1随机端口。" -ForegroundColor Green
  Write-Host "关闭软件窗口时，业务服务与llama-server会自动退出。"
  Start-Sleep -Seconds 3
  exit 0
} catch {
  if ($appProcess -and -not $appProcess.HasExited) {
    Stop-Process -Id $appProcess.Id -Force -ErrorAction SilentlyContinue
  }
  Stop-WithRepair "启动检查失败（$($_.Exception.Message)）。"
}

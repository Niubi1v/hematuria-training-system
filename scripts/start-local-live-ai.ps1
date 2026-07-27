[CmdletBinding()]
param(
  [switch]$Stop,
  [switch]$SmokeTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$repoHashBytes = [System.Security.Cryptography.SHA256]::Create().ComputeHash(
  [System.Text.Encoding]::UTF8.GetBytes($repoRoot.ToLowerInvariant())
)
$repoId = ([System.BitConverter]::ToString($repoHashBytes)).Replace("-", "").Substring(0, 12).ToLowerInvariant()
$runtimeRoot = Join-Path ([System.IO.Path]::GetTempPath()) "hematuria-live-ai-$repoId"
$pidFile = Join-Path $runtimeRoot "processes.json"
$frontendUrl = "http://127.0.0.1:3000"
$patientApiUrl = "http://127.0.0.1:9001/api/patient-reply"

function Write-SafeFailure {
  param([string]$Code)
  Write-Host "LOCAL_LIVE_AI_START_FAILED code=$Code"
}

function Stop-RecordedProcesses {
  if (-not (Test-Path -LiteralPath $pidFile)) {
    Write-Host "LOCAL_LIVE_AI_STOP status=not_running"
    return
  }

  try {
    $record = Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json
    if ([string]$record.repoRoot -ne $repoRoot) {
      Write-SafeFailure "pid_file_scope_mismatch"
      return
    }
    foreach ($processId in @($record.frontendPid, $record.patientApiPid)) {
      if ($processId -and (Get-Process -Id ([int]$processId) -ErrorAction SilentlyContinue)) {
        Stop-Process -Id ([int]$processId) -Force
      }
    }
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    Write-Host "LOCAL_LIVE_AI_STOP status=stopped"
  } catch {
    Write-SafeFailure "stop_failed"
  }
}

function Resolve-NodeExecutable {
  $candidates = @()
  if (-not [string]::IsNullOrWhiteSpace($env:HEMATURIA_NODE22_PATH)) {
    $candidates += $env:HEMATURIA_NODE22_PATH
  }
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($command) {
    $candidates += $command.Source
  }
  $candidates += (Join-Path $repoRoot "local-tools\node-v22.14.0-win-x64\node.exe")
  $documentsPath = [Environment]::GetFolderPath("MyDocuments")
  if (-not [string]::IsNullOrWhiteSpace($documentsPath)) {
    $documentsPattern = Join-Path $documentsPath "*\local-tools\node-v22.14.0-win-x64\node.exe"
    $candidates += Get-ChildItem -Path $documentsPattern -File -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty FullName
  }
  foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $candidate)) {
      continue
    }
    try {
      $version = (& $candidate --version 2>$null).Trim()
      if ($version -match "^v22\.14\.") {
        return (Resolve-Path -LiteralPath $candidate).Path
      }
    } catch {
      # Try the next known Node 22.14 location.
    }
  }
  throw "node_22_14_not_found"
}

function Test-TcpPortAvailable {
  param([int]$Port)
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
  try {
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    $listener.Stop()
  }
}

function Wait-ForHttp {
  param(
    [string]$Uri,
    [string]$Method = "GET",
    [int]$ExpectedStatus = 200
  )
  $deadline = [DateTimeOffset]::UtcNow.AddSeconds(60)
  while ([DateTimeOffset]::UtcNow -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Uri -Method $Method -UseBasicParsing -TimeoutSec 3
      if ([int]$response.StatusCode -eq $ExpectedStatus) {
        return $true
      }
    } catch {
      # The local process may still be starting.
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

if ($Stop) {
  Stop-RecordedProcesses
  exit 0
}

$nodePath = $null
$secureKey = $null
$plainKey = $null
$keyPointer = [IntPtr]::Zero
$frontendProcess = $null
$patientApiProcess = $null
$startupSucceeded = $false

try {
  $nodePath = Resolve-NodeExecutable
  $nextCli = Join-Path $repoRoot "node_modules\next\dist\bin\next"
  $tsxCli = Join-Path $repoRoot "node_modules\tsx\dist\cli.mjs"
  $probePath = Join-Path $repoRoot "scripts\probe-local-live-ai.cjs"
  $dependenciesReady = (Test-Path -LiteralPath $nextCli) `
    -and (Test-Path -LiteralPath $tsxCli) `
    -and (Test-Path -LiteralPath $probePath)
  if (-not $dependenciesReady) {
    throw "dependencies_not_installed"
  }
  if (-not (Test-TcpPortAvailable 3000) -or -not (Test-TcpPortAvailable 9001)) {
    throw "local_port_in_use"
  }

  if ($SmokeTest) {
    $plainKey = "local-smoke-placeholder"
  } else {
    $secureKey = Read-Host "DeepSeek Provider key" -AsSecureString
    $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    if ([string]::IsNullOrWhiteSpace($plainKey)) {
      throw "provider_key_empty"
    }
  }

  $env:LLM_PROVIDER = "deepseek"
  $env:LLM_API_KEY = $plainKey
  $env:LLM_API_BASE_URL = "https://api.deepseek.com"
  $env:LLM_MODEL = "deepseek-v4-pro"
  $env:LLM_ENDPOINT_TYPE = "chat_completions"
  $env:LLM_ENABLE_AI_PATIENT = "true"
  $env:PATIENT_SEMANTIC_CLASSIFIER_ENABLED = "true"
  $env:PATIENT_DEEPSEEK_THINKING = "max"
  $env:PATIENT_DEEPSEEK_TIMEOUT_MS = "90000"
  $env:LLM_REQUEST_TIMEOUT_MS = "90000"
  $env:LLM_THINKING_MODE = "enabled"
  $env:LLM_REASONING_EFFORT = "max"
  $env:LLM_STREAMING_ENABLED = "false"
  $env:PATIENT_PROMPT_AUDIT_ENABLED = "true"
  $env:PATIENT_AGENT_API_PORT = "9001"
  $env:PATIENT_AGENT_ALLOWED_ORIGIN = $frontendUrl
  $env:LOCAL_PATIENT_API_URL = $patientApiUrl

  New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
  $frontendProcess = Start-Process `
    -FilePath $nodePath `
    -ArgumentList @($nextCli, "dev", "-H", "127.0.0.1", "-p", "3000") `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $runtimeRoot "frontend.out.log") `
    -RedirectStandardError (Join-Path $runtimeRoot "frontend.err.log") `
    -PassThru
  $patientApiProcess = Start-Process `
    -FilePath $nodePath `
    -ArgumentList @($tsxCli, (Join-Path $repoRoot "scripts\dev-patient-api.ts")) `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $runtimeRoot "patient-api.out.log") `
    -RedirectStandardError (Join-Path $runtimeRoot "patient-api.err.log") `
    -PassThru

  @{
    repoRoot = $repoRoot
    frontendPid = $frontendProcess.Id
    patientApiPid = $patientApiProcess.Id
  } | ConvertTo-Json -Compress | Set-Content -LiteralPath $pidFile -Encoding UTF8

  $frontendHealthy = Wait-ForHttp -Uri $frontendUrl -ExpectedStatus 200
  $patientApiHealthy = Wait-ForHttp -Uri $patientApiUrl -Method "OPTIONS" -ExpectedStatus 204
  if (-not $frontendHealthy -or -not $patientApiHealthy) {
    throw "local_health_failed"
  }

  if ($SmokeTest) {
    Write-Host "LOCAL_LIVE_AI_SMOKE status=ok live_ai_verified=false provider_probe=not_run"
    $startupSucceeded = $true
    Stop-RecordedProcesses
    exit 0
  }

  $probeOutput = & $nodePath $probePath
  $probeExitCode = $LASTEXITCODE
  try {
    $probe = $probeOutput | ConvertFrom-Json
  } catch {
    throw "provider_probe_invalid_response"
  }

  $statusFormat = "LOCAL_LIVE_AI_STATUS patientServiceConnected=true providerConfigured={0} lastAnswerSource={1} thinkingExecuted={2} model={3} providerHttpSuccess={4} durationMs={5}"
  Write-Host ($statusFormat -f
    ([string]$probe.providerConfigured).ToLowerInvariant(),
    [string]$probe.answerSource,
    ([string]$probe.thinkingExecuted).ToLowerInvariant(),
    [string]$probe.model,
    ([string]$probe.providerHttpSuccess).ToLowerInvariant(),
    [int]$probe.durationMs
  )
  if ($probeExitCode -ne 0) {
    throw ([string]$probe.errorCode)
  }

  Write-Host "LOCAL_LIVE_AI_READY pageUrl=$frontendUrl"
  Write-Host "LOCAL_LIVE_AI_READY healthUrl=$patientApiUrl method=OPTIONS"
  Write-Host "LOCAL_LIVE_AI_READY patientApiUrl=$patientApiUrl answerSource=live_ai"
  Write-Host "LOCAL_LIVE_AI_STOP_COMMAND powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local-live-ai.ps1 -Stop"
  $startupSucceeded = $true
} catch {
  $failureMessage = if ($null -ne $_ -and $null -ne $_.Exception) {
    [string]$_.Exception.Message
  } else {
    [string]$_
  }
  $safeCode = switch -Regex ($failureMessage) {
    "^node_22_14_not_found$" { "node_22_14_not_found"; break }
    "^dependencies_not_installed$" { "dependencies_not_installed"; break }
    "^local_port_in_use$" { "local_port_in_use"; break }
    "^provider_key_empty$" { "provider_key_empty"; break }
    "^local_health_failed$" { "local_health_failed"; break }
    "^provider_probe_invalid_response$" { "provider_probe_invalid_response"; break }
    "^(?:semantic|provider|patient)_[a-z_]+$" { $failureMessage; break }
    default { "local_live_ai_start_failed" }
  }
  Write-SafeFailure $safeCode
  exit 1
} finally {
  if (-not $startupSucceeded) {
    foreach ($process in @($frontendProcess, $patientApiProcess)) {
      if ($process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      }
    }
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  }
  $env:LLM_API_KEY = $null
  $plainKey = $null
  if ($keyPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
  }
  if ($secureKey) {
    $secureKey.Dispose()
  }
}

param(
  [string]$TestFile = "tests/e2e/practice.spec.mjs",
  [string]$Config = "playwright.config.mjs",
  [string]$Grep = "",
  [int]$Port = 3010
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$node = Get-ChildItem (Join-Path $env:USERPROFILE "Documents") -Recurse -Filter "node.exe" -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match "node-v22\.14\.0-win-x64" } |
  Select-Object -First 1 -ExpandProperty FullName
$next = Join-Path $root "node_modules/next/dist/bin/next"
$playwright = Join-Path $root "node_modules/@playwright/test/cli.js"
$reportRoot = Join-Path $root "artifacts/exploratory-qa/reports"
$stdoutPath = Join-Path $reportRoot "local-next-$Port.stdout.log"
$stderrPath = Join-Path $reportRoot "local-next-$Port.stderr.log"
$sensitiveNames = @(
  "VERCEL_AUTOMATION_BYPASS_SECRET",
  "TRAINING_STATE_SECRET",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN"
)

if (!$node -or !(Test-Path -LiteralPath $node) -or !(Test-Path -LiteralPath $next) -or !(Test-Path -LiteralPath $playwright)) {
  throw "Bundled Node, Next, or Playwright runtime is unavailable."
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
  throw "Port $Port is already in use; refusing to reuse an unverified server."
}

New-Item -ItemType Directory -Path $reportRoot -Force | Out-Null
foreach ($name in $sensitiveNames) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
$psi = [Diagnostics.ProcessStartInfo]::new()
$psi.FileName = $node
$psi.Arguments = "`"$next`" dev -H 127.0.0.1 -p $Port"
$psi.WorkingDirectory = $root
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true

$process = [Diagnostics.Process]::Start($psi)
$stdoutTask = $process.StandardOutput.ReadToEndAsync()
$stderrTask = $process.StandardError.ReadToEndAsync()
$exitCode = 1
try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    if ($process.HasExited) { break }
    try {
      $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 500 }
  }
  if (!$ready) { throw "Local Next server did not become ready on port $Port." }

  $env:PLAYWRIGHT_EXTERNAL_SERVER = "1"
  $env:PLAYWRIGHT_BASE_URL = "http://127.0.0.1:$Port"
  $env:QA_BASE_URL = "http://127.0.0.1:$Port"
  $arguments = @($playwright, "test", $TestFile, "--config=$Config")
  if ($Config -eq "playwright.config.mjs") { $arguments += "--reporter=line" }
  if ($Grep.Trim()) { $arguments += @("--grep", $Grep.Trim()) }
  & $node @arguments
  $exitCode = $LASTEXITCODE
} finally {
  $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
  }
  if (!$process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  try { $process.WaitForExit(5000) | Out-Null } catch { }
  [IO.File]::WriteAllText($stdoutPath, $stdoutTask.GetAwaiter().GetResult())
  [IO.File]::WriteAllText($stderrPath, $stderrTask.GetAwaiter().GetResult())
}

exit $exitCode

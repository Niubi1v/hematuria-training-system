param(
  [ValidateSet("Local", "Managed")]
  [string]$Mode = "Local",
  [string]$EnvFile = ".env.mainland",
  [string]$BaseUrl = "http://127.0.0.1:8080"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $repoRoot "docker-compose.mainland.yml"
$resolvedEnv = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $EnvFile))

if (-not (Test-Path -LiteralPath $resolvedEnv -PathType Leaf)) {
  throw "Missing $resolvedEnv. Copy .env.mainland.example and replace every placeholder."
}
$rawEnv = Get-Content -LiteralPath $resolvedEnv -Raw
if ($rawEnv -match "replace_with_|your_.*_key") {
  throw "Refusing deployment while placeholder credentials remain in $resolvedEnv."
}

$env:NEXT_PUBLIC_GIT_SHA = (git -C $repoRoot rev-parse --short=12 HEAD).Trim()
$env:NEXT_PUBLIC_BUILD_TIME = (Get-Date).ToUniversalTime().ToString("o")
$arguments = @("compose", "--env-file", $resolvedEnv, "-f", $composeFile)
if ($Mode -eq "Local") { $arguments += @("--profile", "local") }
$arguments += @("up", "-d", "--build", "--remove-orphans")

& docker @arguments
if ($LASTEXITCODE -ne 0) { throw "Docker Compose deployment failed." }

& node (Join-Path $repoRoot "scripts/healthcheck-mainland.mjs") "--base-url=$BaseUrl"
if ($LASTEXITCODE -ne 0) { throw "Mainland deep health check failed." }
Write-Host "Mainland $Mode POC is healthy at $BaseUrl. No DNS, ICP, cloud purchase, or Production action was performed."

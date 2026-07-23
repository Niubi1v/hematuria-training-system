param(
  [Parameter(Mandatory = $true)]
  [string]$ImageTag,
  [string]$EnvFile = ".env.mainland",
  [string]$BaseUrl = "https://staging.example.cn"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $repoRoot "docker-compose.mainland.yml"
$resolvedEnv = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $EnvFile))
$image = "hematuria-mainland:$ImageTag"
& docker image inspect $image | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Rollback image $image is not present; restore the approved immutable image first." }
$env:MAINLAND_IMAGE_TAG = $ImageTag
& docker compose --env-file $resolvedEnv -f $composeFile up -d --no-build app nginx
if ($LASTEXITCODE -ne 0) { throw "Rollback compose operation failed." }
& node (Join-Path $repoRoot "scripts/healthcheck-mainland.mjs") "--base-url=$BaseUrl"
if ($LASTEXITCODE -ne 0) { throw "Rollback started but health validation failed; follow the manual incident runbook." }
Write-Host "Rollback to $image passed health validation."

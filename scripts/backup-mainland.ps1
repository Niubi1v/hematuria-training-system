param(
  [string]$ImageTag = "staging",
  [string]$OutputDirectory = "work/mainland-backups"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$target = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputDirectory))
if (-not $target.StartsWith([System.IO.Path]::GetFullPath($repoRoot), [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Backup directory must remain inside the repository work area."
}
New-Item -ItemType Directory -Force -Path $target | Out-Null
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$image = "hematuria-mainland:$ImageTag"
$imageId = (& docker image inspect $image --format "{{.Id}}").Trim()
if ($LASTEXITCODE -ne 0 -or -not $imageId) { throw "Image $image does not exist." }
$manifest = [ordered]@{
  createdAt = (Get-Date).ToUniversalTime().ToString("o")
  gitSha = (& git -C $repoRoot rev-parse HEAD).Trim()
  image = $image
  imageId = $imageId
  redisBackup = "Use Tencent Cloud Redis automated/manual backup; no credentials or dataset are exported by this script."
}
$path = Join-Path $target "deployment-$timestamp.json"
$manifest | ConvertTo-Json | Set-Content -LiteralPath $path -Encoding UTF8
Write-Host "Wrote secret-free deployment manifest: $path"

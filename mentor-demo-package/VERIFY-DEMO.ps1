[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$versionPath = Join-Path $PSScriptRoot "VERSION.json"
$version = Get-Content -Raw -Encoding UTF8 -LiteralPath $versionPath | ConvertFrom-Json
$failed = $false

foreach ($entry in $version.fileSHA256.PSObject.Properties) {
  $path = Join-Path $PSScriptRoot $entry.Name
  if (-not (Test-Path -LiteralPath $path)) {
    Write-Host "MISSING $($entry.Name)" -ForegroundColor Red
    $failed = $true
    continue
  }
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
  if ($actual -ne ([string]$entry.Value).ToLowerInvariant()) {
    Write-Host "MISMATCH $($entry.Name)" -ForegroundColor Red
    $failed = $true
  } else {
    Write-Host "OK $($entry.Name)"
  }
}

if ($version.includesLocalAI -ne $false) {
  Write-Host "INVALID includesLocalAI must be false" -ForegroundColor Red
  $failed = $true
}

if ($failed) { exit 1 }
Write-Host "Mentor demo package file verification passed." -ForegroundColor Green

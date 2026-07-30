[CmdletBinding()]
param()

$stateFile = Join-Path $PSScriptRoot "runtime\mentor-local-demo.json"
if (-not (Test-Path -LiteralPath $stateFile)) {
  Write-Host "No local process was started by this mentor package."
  exit 0
}

Write-Warning "An unknown or stale state file exists. No process will be stopped by name or port."
Write-Host "This mentor package does not deliver a runnable local web service."
exit 31

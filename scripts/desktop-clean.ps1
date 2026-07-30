param(
  [switch]$IncludeRuntime
)

$ErrorActionPreference = "Stop"
$scriptsDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptsDirectory ".."))
$targets = @(
  (Join-Path $repoRoot ".desktop-cache"),
  (Join-Path $repoRoot "src-tauri\resources"),
  (Join-Path $repoRoot "src-tauri\target")
)
if ($IncludeRuntime) {
  $targets += (Join-Path $repoRoot "desktop-runtime")
}

foreach ($target in $targets) {
  $resolvedTarget = [System.IO.Path]::GetFullPath($target)
  if (-not $resolvedTarget.StartsWith($repoRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clean outside the repository: $resolvedTarget"
  }
  if (Test-Path -LiteralPath $resolvedTarget) {
    Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
  }
}

$portablePattern = Join-Path $repoRoot "outputs\hematuria-desktop-portable-*-windows-x64.zip"
Get-ChildItem -Path $portablePattern -File -ErrorAction SilentlyContinue | ForEach-Object {
  Remove-Item -LiteralPath $_.FullName -Force
}
Write-Output "Desktop build artifacts cleaned$(if ($IncludeRuntime) { ' (including downloaded runtimes)' } else { '' })."

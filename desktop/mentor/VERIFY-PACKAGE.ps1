$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$sumFile = Join-Path $root "SHA256SUMS.txt"

try {
  if (-not (Test-Path -LiteralPath $sumFile -PathType Leaf)) { throw "SHA256SUMS.txt缺失" }
  $checked = 0
  foreach ($line in Get-Content -LiteralPath $sumFile -Encoding UTF8) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) { continue }
    if ($line -notmatch '^([0-9A-Fa-f]{64})  (.+)$') { throw "校验清单格式错误" }
    $expected = $Matches[1].ToUpperInvariant()
    $relative = $Matches[2]
    $target = [System.IO.Path]::GetFullPath((Join-Path $root $relative))
    if (-not $target.StartsWith([System.IO.Path]::GetFullPath($root), [System.StringComparison]::OrdinalIgnoreCase)) { throw "校验目标越界" }
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "文件缺失：$relative" }
    $actual = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
    if ($actual -ne $expected) { throw "文件损坏：$relative" }
    $checked += 1
    Write-Host "通过：$relative"
  }
  Write-Host "导师包完整性验证通过，共检查$checked个关键文件。" -ForegroundColor Green
  exit 0
} catch {
  Write-Host "导师包验证失败：$($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

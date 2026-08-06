param(
  [string]$Version = "0.5.0",
  [string]$ArtifactsDirectory = $env:HEMATURIA_DESKTOP_ARTIFACTS
)

$ErrorActionPreference = "Stop"
$scriptsDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptsDirectory ".."))
$executable = Join-Path $repoRoot "src-tauri\target\release\hematuria-training-r5.exe"
$resources = Join-Path $repoRoot "src-tauri\resources"
$portableRoot = Join-Path $repoRoot ".desktop-cache\portable"
$stage = Join-Path $portableRoot "HematuriaTraining-R5-$Version-windows-x64"
if ([string]::IsNullOrWhiteSpace($ArtifactsDirectory)) {
  $ArtifactsDirectory = "D:\HematuriaDesktopArtifacts"
}
$artifacts = [System.IO.Path]::GetFullPath($ArtifactsDirectory)
$archive = Join-Path $artifacts "hematuria-desktop-r5-portable-$Version-windows-x64.zip"

if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
  throw "Release executable not found: $executable"
}
if (-not (Test-Path -LiteralPath $resources -PathType Container)) {
  throw "Staged desktop resources not found: $resources"
}

if (Test-Path -LiteralPath $stage) {
  Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Path $stage -Force | Out-Null
Copy-Item -LiteralPath $executable -Destination (Join-Path $stage "HematuriaTraining-R5.exe")
Copy-Item -LiteralPath $resources -Destination (Join-Path $stage "resources") -Recurse
Set-Content -LiteralPath (Join-Path $stage "resources\portable.marker") -Value "portable" -Encoding ASCII

$forbiddenDirectories = @("node_modules", "tests", "test", "screenshots", "traces", "logs", "fonts")
$forbiddenExtensions = @(".map", ".pdb", ".lib", ".exp", ".dmp", ".gguf", ".ggml", ".sqlite", ".sqlite3", ".db", ".log", ".woff", ".woff2", ".ttf", ".otf")
foreach ($item in Get-ChildItem -LiteralPath $stage -Recurse -Force) {
  if ($item.PSIsContainer -and $forbiddenDirectories -contains $item.Name.ToLowerInvariant()) {
    throw "Forbidden directory in portable package: $($item.FullName)"
  }
  if (-not $item.PSIsContainer -and $forbiddenExtensions -contains $item.Extension.ToLowerInvariant()) {
    throw "Forbidden file in portable package: $($item.FullName)"
  }
}

New-Item -ItemType Directory -Path $artifacts -Force | Out-Null
if (Test-Path -LiteralPath $archive) {
  Remove-Item -LiteralPath $archive -Force
}
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $archive -CompressionLevel Optimal

$nsisDirectory = Join-Path $repoRoot "src-tauri\target\release\bundle\nsis"
$installer = Get-ChildItem -LiteralPath $nsisDirectory -Filter "*.exe" -File |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if ($null -eq $installer) {
  throw "NSIS installer not found: $nsisDirectory"
}
$installerDestination = Join-Path $artifacts "hematuria-desktop-r5-setup-$Version-windows-x64.exe"
Copy-Item -LiteralPath $installer.FullName -Destination $installerDestination -Force

Write-Output "Portable desktop package: $archive"
Write-Output "NSIS desktop installer: $installerDestination"

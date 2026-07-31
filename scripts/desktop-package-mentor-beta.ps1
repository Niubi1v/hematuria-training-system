param(
  [string]$Version = "0.1.0",
  [string]$ArtifactsDirectory = "D:\HematuriaDesktopArtifacts",
  [string]$ModelPath = "$env:LOCALAPPDATA\cn.hematuria.training.desktop\models\Qwen3-1.7B-Q4_K_M.gguf",
  [string]$ProductHead = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$scriptsDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptsDirectory ".."))
$mentorSource = Join-Path $repoRoot "desktop\mentor"
$outputRoot = Join-Path ([System.IO.Path]::GetFullPath($ArtifactsDirectory)) "MentorLocalAI"
$stageRoot = Join-Path $repoRoot ".desktop-cache\mentor-local-ai-beta"
$portableSource = Join-Path $ArtifactsDirectory "hematuria-desktop-portable-$Version-windows-x64.zip"
$installerSource = Join-Path $ArtifactsDirectory "hematuria-desktop-setup-$Version-windows-x64.exe"
$portableOutput = Join-Path $outputRoot "HematuriaTraining-Mentor-LocalAI-Portable.zip"
$installerOutput = Join-Path $outputRoot "HematuriaTraining-Mentor-LocalAI-NSIS.exe"
$zipOutput = Join-Path $outputRoot "HematuriaTraining-Mentor-LocalAI-Beta.zip"
$modelOutputDirectory = Join-Path $outputRoot "Model"
$modelOutput = Join-Path $modelOutputDirectory "Qwen3-1.7B-Q4_K_M.gguf"
$expectedModelBytes = 1282439264
$expectedModelSha256 = "D2387CA2DBFEE2FFABCE7120D3770DADCA0B293052BC2F0E138FDC940D9BC7B5"

function Assert-File([string]$path, [string]$label) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "$label missing: $path" }
}

Assert-File $portableSource "portable package"
Assert-File $installerSource "NSIS installer"
Assert-File $ModelPath "Qwen3-1.7B model"
$model = Get-Item -LiteralPath $ModelPath
if ($model.Length -ne $expectedModelBytes) { throw "mentor_model_size_mismatch" }
if ((Get-FileHash -LiteralPath $ModelPath -Algorithm SHA256).Hash -ne $expectedModelSha256) { throw "mentor_model_sha256_mismatch" }

$resolvedStage = [System.IO.Path]::GetFullPath($stageRoot)
$resolvedRepo = [System.IO.Path]::GetFullPath($repoRoot)
if (-not $resolvedStage.StartsWith($resolvedRepo, [System.StringComparison]::OrdinalIgnoreCase)) { throw "mentor_stage_outside_repo" }
if (Test-Path -LiteralPath $resolvedStage) { Remove-Item -LiteralPath $resolvedStage -Recurse -Force }
New-Item -ItemType Directory -Path $resolvedStage -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $resolvedStage "App") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $resolvedStage "Model") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $resolvedStage "tools") -Force | Out-Null
Expand-Archive -LiteralPath $portableSource -DestinationPath (Join-Path $resolvedStage "App") -Force
Copy-Item -LiteralPath $ModelPath -Destination (Join-Path $resolvedStage "Model\Qwen3-1.7B-Q4_K_M.gguf")
Copy-Item -LiteralPath (Join-Path $mentorSource "启动血尿训练系统.cmd") -Destination $resolvedStage
Copy-Item -LiteralPath (Join-Path $mentorSource "Start-Mentor.ps1") -Destination (Join-Path $resolvedStage "tools")
Copy-Item -LiteralPath (Join-Path $mentorSource "VERIFY-PACKAGE.ps1") -Destination $resolvedStage
Copy-Item -LiteralPath (Join-Path $mentorSource "README_导师验收.txt") -Destination $resolvedStage
Copy-Item -LiteralPath (Join-Path $mentorSource "KNOWN_LIMITATIONS.txt") -Destination $resolvedStage

if ([string]::IsNullOrWhiteSpace($ProductHead)) { $ProductHead = (& git -C $repoRoot rev-parse HEAD).Trim() }
$versionRecord = [ordered]@{
  schemaVersion = 1
  product = "血尿临床问诊训练系统"
  channel = "mentor-local-ai-beta"
  version = $Version
  productHead = $ProductHead
  model = [ordered]@{
    repository = "ggml-org/Qwen3-1.7B-GGUF"
    fileName = "Qwen3-1.7B-Q4_K_M.gguf"
    bytes = $expectedModelBytes
    sha256 = $expectedModelSha256.ToLowerInvariant()
    thinkingMode = "disabled"
  }
  medicalGovernance = [ordered]@{
    sourceProjectionApplied = 66
    safeSimulatedNormalApplied = 75
    noSpecimenOrNotIndicated = 552
    noReportOrNotIndicated = 952
    caseSpecificMedicalReviewFailClosed = 902
    sourceProjectionMatchFailedFailClosed = 59
    blockedMedicalConflict = 1
  }
}
$versionRecord | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $resolvedStage "VERSION.json") -Encoding UTF8

$criticalFiles = @(
  "App\HematuriaTraining.exe",
  "App\resources\runtime\node\node.exe",
  "App\resources\runtime\llama\llama-server.exe",
  "Model\Qwen3-1.7B-Q4_K_M.gguf",
  "启动血尿训练系统.cmd",
  "tools\Start-Mentor.ps1",
  "README_导师验收.txt",
  "KNOWN_LIMITATIONS.txt",
  "VERSION.json"
)
$sumLines = foreach ($relative in $criticalFiles) {
  $target = Join-Path $resolvedStage $relative
  Assert-File $target $relative
  "{0}  {1}" -f (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant(), $relative
}
$sumLines | Set-Content -LiteralPath (Join-Path $resolvedStage "SHA256SUMS.txt") -Encoding UTF8

$forbiddenDirectories = @(".git", "node_modules", "cache", "traces", "trace", "videos", "screenshots", "logs")
$forbiddenExtensions = @(".map", ".pdb", ".lib", ".exp", ".dmp", ".sqlite", ".sqlite3", ".db", ".log", ".env", ".pem", ".key")
foreach ($item in Get-ChildItem -LiteralPath $resolvedStage -Recurse -Force) {
  if ($item.PSIsContainer -and $forbiddenDirectories -contains $item.Name.ToLowerInvariant()) { throw "mentor_forbidden_directory:$($item.FullName)" }
  if (-not $item.PSIsContainer -and $forbiddenExtensions -contains $item.Extension.ToLowerInvariant()) { throw "mentor_forbidden_file:$($item.FullName)" }
  if (-not $item.PSIsContainer -and $item.Extension.ToLowerInvariant() -in @(".gguf", ".ggml") -and $item.FullName -ne (Join-Path $resolvedStage "Model\Qwen3-1.7B-Q4_K_M.gguf")) { throw "mentor_unexpected_model_binary:$($item.FullName)" }
}

$nodeForScan = Join-Path $repoRoot "desktop-runtime\node\node.exe"
Assert-File $nodeForScan "bundled build Node"
& $nodeForScan (Join-Path $repoRoot "scripts\scan-mentor-package-stage.mjs") $resolvedStage
if ($LASTEXITCODE -ne 0) { throw "mentor_stage_scan_failed" }

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
New-Item -ItemType Directory -Path $modelOutputDirectory -Force | Out-Null
Copy-Item -LiteralPath $portableSource -Destination $portableOutput -Force
Copy-Item -LiteralPath $installerSource -Destination $installerOutput -Force
if (Test-Path -LiteralPath $zipOutput) { Remove-Item -LiteralPath $zipOutput -Force }
Compress-Archive -Path (Join-Path $resolvedStage "*") -DestinationPath $zipOutput -CompressionLevel Fastest

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($zipOutput)
try {
  $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace("\", "/") })
  if ($entries -notcontains "启动血尿训练系统.cmd") { throw "mentor_zip_root_launcher_missing" }
  if ($entries -notcontains "Model/Qwen3-1.7B-Q4_K_M.gguf") { throw "mentor_zip_model_missing" }
  $modelEntry = $archive.Entries | Where-Object { $_.FullName.Replace("\", "/") -eq "Model/Qwen3-1.7B-Q4_K_M.gguf" } | Select-Object -First 1
  if ($modelEntry.Length -ne $expectedModelBytes) { throw "mentor_zip_model_size_mismatch" }
} finally {
  $archive.Dispose()
}

if (Test-Path -LiteralPath $modelOutput) { Remove-Item -LiteralPath $modelOutput -Force }
Move-Item -LiteralPath (Join-Path $resolvedStage "Model\Qwen3-1.7B-Q4_K_M.gguf") -Destination $modelOutput
Copy-Item -LiteralPath (Join-Path $resolvedStage "README_导师验收.txt") -Destination $outputRoot -Force
Copy-Item -LiteralPath (Join-Path $resolvedStage "KNOWN_LIMITATIONS.txt") -Destination $outputRoot -Force
Copy-Item -LiteralPath (Join-Path $resolvedStage "VERSION.json") -Destination $outputRoot -Force
Copy-Item -LiteralPath (Join-Path $resolvedStage "VERIFY-PACKAGE.ps1") -Destination $outputRoot -Force

$artifactSums = foreach ($target in @($zipOutput, $installerOutput, $portableOutput, $modelOutput)) {
  $relative = if ($target -eq $modelOutput) { "Model\Qwen3-1.7B-Q4_K_M.gguf" } else { Split-Path -Leaf $target }
  "{0}  {1}" -f (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant(), $relative
}
$artifactSums | Set-Content -LiteralPath (Join-Path $outputRoot "SHA256SUMS.txt") -Encoding UTF8

Write-Output (ConvertTo-Json -Depth 5 ([ordered]@{
  mentorZip = $zipOutput
  installer = $installerOutput
  portable = $portableOutput
  model = $modelOutput
  productHead = $ProductHead
}))

param(
  [string]$Version = "0.1.0",
  [string]$ArtifactsDirectory = "D:\HematuriaDesktopArtifacts",
  [string]$ModelPath = "$env:LOCALAPPDATA\cn.hematuria.training.desktop\models\Qwen3-1.7B-Q4_K_M.gguf",
  [string]$ProductHead = "",
  [ValidateSet("", "R2", "R3", "R4")][string]$CandidateSuffix = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$scriptsDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptsDirectory ".."))
$mentorSource = Join-Path $repoRoot "desktop\mentor"
$artifactsRoot = [System.IO.Path]::GetFullPath($ArtifactsDirectory)
$candidateName = if ($CandidateSuffix) { "MentorLocalAI-FinalCandidate-$CandidateSuffix" } else { "MentorLocalAI-FinalCandidate" }
$fileSuffix = if ($CandidateSuffix) { "-$CandidateSuffix" } else { "" }
$outputRoot = Join-Path $artifactsRoot $candidateName
$outputStageRoot = Join-Path $artifactsRoot ".$candidateName.partial-$PID"
$stageRoot = Join-Path $repoRoot ".desktop-cache\$($candidateName.ToLowerInvariant())"
$portableSource = Join-Path $ArtifactsDirectory "hematuria-desktop-portable-$Version-windows-x64.zip"
$installerSource = Join-Path $ArtifactsDirectory "hematuria-desktop-setup-$Version-windows-x64.exe"
$portableFileName = "HematuriaTraining-Mentor-LocalAI-Portable$fileSuffix.zip"
$installerFileName = "HematuriaTraining-Mentor-LocalAI-Setup$fileSuffix.exe"
$zipFileName = "HematuriaTraining-Mentor-LocalAI-FinalCandidate$fileSuffix.zip"
$portableOutput = Join-Path $outputStageRoot $portableFileName
$installerOutput = Join-Path $outputStageRoot $installerFileName
$zipOutput = Join-Path $outputStageRoot $zipFileName
$modelOutputDirectory = Join-Path $outputStageRoot "Model"
$modelOutput = Join-Path $modelOutputDirectory "Qwen3-1.7B-Q4_K_M.gguf"
$expectedModelBytes = 1282439264
$expectedModelSha256 = "D2387CA2DBFEE2FFABCE7120D3770DADCA0B293052BC2F0E138FDC940D9BC7B5"

function Assert-File([string]$path, [string]$label) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "$label missing: $path" }
}

Assert-File $portableSource "portable package"
Assert-File $installerSource "NSIS installer"
Assert-File $ModelPath "Qwen3-1.7B model"
if (Test-Path -LiteralPath $outputRoot) { throw "mentor_final_candidate_output_already_exists:$outputRoot" }
$model = Get-Item -LiteralPath $ModelPath
if ($model.Length -ne $expectedModelBytes) { throw "mentor_model_size_mismatch" }
if ((Get-FileHash -LiteralPath $ModelPath -Algorithm SHA256).Hash -ne $expectedModelSha256) { throw "mentor_model_sha256_mismatch" }

$resolvedStage = [System.IO.Path]::GetFullPath($stageRoot)
$resolvedRepo = [System.IO.Path]::GetFullPath($repoRoot)
if (-not $resolvedStage.StartsWith($resolvedRepo, [System.StringComparison]::OrdinalIgnoreCase)) { throw "mentor_stage_outside_repo" }
if (Test-Path -LiteralPath $resolvedStage) { Remove-Item -LiteralPath $resolvedStage -Recurse -Force }
$resolvedOutputStage = [System.IO.Path]::GetFullPath($outputStageRoot)
$artifactsPrefix = "$($artifactsRoot.TrimEnd('\'))\"
if (-not $resolvedOutputStage.StartsWith($artifactsPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw "mentor_output_stage_outside_artifacts" }
if (Test-Path -LiteralPath $resolvedOutputStage) { Remove-Item -LiteralPath $resolvedOutputStage -Recurse -Force }
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
  schemaVersion = 2
  product = "血尿临床问诊训练系统"
  channel = if ($CandidateSuffix) { "mentor-local-ai-final-candidate-$($CandidateSuffix.ToLowerInvariant())" } else { "mentor-local-ai-final-candidate" }
  version = $Version
  productHead = $ProductHead
  uiIntegrationCommits = @(
    "33199f4d8f2a845b5f7d606515b2503a5cc71120",
    "715179368e7b8d8442caa109ea57797713c9761e",
    "99db3a06fdcb01459612c6c1e0713fd4b6755b65",
    "de84b6a913da2b6bc188983ce4669ba97d9e83c1",
    "966129504a3f5dc12f9475561e98cbe5f12965bd"
  )
  model = [ordered]@{
    repository = "ggml-org/Qwen3-1.7B-GGUF"
    fileName = "Qwen3-1.7B-Q4_K_M.gguf"
    bytes = $expectedModelBytes
    sha256 = $expectedModelSha256.ToLowerInvariant()
    thinkingMode = "disabled"
    defaultModelMode = "lightweight"
  }
  medicalGovernance = [ordered]@{
    sourceProjectionApplied = 4
    sourceProjectionWithdrawn = 62
    sourceProjectionRejected = 121
    medicalReviewPending = 1023
    medicalConflict = 1
  }
  runtimeSecurity = [ordered]@{
    cloudRequestAllowed = $false
    listenAddress = "127.0.0.1"
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
  "VERIFY-PACKAGE.ps1",
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

New-Item -ItemType Directory -Path $resolvedOutputStage -Force | Out-Null
New-Item -ItemType Directory -Path $modelOutputDirectory -Force | Out-Null
Copy-Item -LiteralPath $portableSource -Destination $portableOutput
Copy-Item -LiteralPath $installerSource -Destination $installerOutput
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

Copy-Item -LiteralPath (Join-Path $resolvedStage "Model\Qwen3-1.7B-Q4_K_M.gguf") -Destination $modelOutput
Copy-Item -LiteralPath (Join-Path $resolvedStage "启动血尿训练系统.cmd") -Destination $resolvedOutputStage
Copy-Item -LiteralPath (Join-Path $resolvedStage "README_导师验收.txt") -Destination $resolvedOutputStage
Copy-Item -LiteralPath (Join-Path $resolvedStage "KNOWN_LIMITATIONS.txt") -Destination $resolvedOutputStage
Copy-Item -LiteralPath (Join-Path $resolvedStage "VERSION.json") -Destination $resolvedOutputStage
Copy-Item -LiteralPath (Join-Path $resolvedStage "VERIFY-PACKAGE.ps1") -Destination $resolvedOutputStage

$artifactSums = foreach ($target in @(
  $zipOutput,
  $installerOutput,
  $portableOutput,
  $modelOutput,
  (Join-Path $resolvedOutputStage "启动血尿训练系统.cmd"),
  (Join-Path $resolvedOutputStage "README_导师验收.txt"),
  (Join-Path $resolvedOutputStage "VERSION.json"),
  (Join-Path $resolvedOutputStage "VERIFY-PACKAGE.ps1"),
  (Join-Path $resolvedOutputStage "KNOWN_LIMITATIONS.txt")
)) {
  $relative = if ($target -eq $modelOutput) { "Model\Qwen3-1.7B-Q4_K_M.gguf" } else { Split-Path -Leaf $target }
  "{0}  {1}" -f (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant(), $relative
}
$artifactSums | Set-Content -LiteralPath (Join-Path $resolvedOutputStage "SHA256SUMS.txt") -Encoding UTF8

Move-Item -LiteralPath $resolvedOutputStage -Destination $outputRoot
Remove-Item -LiteralPath $resolvedStage -Recurse -Force

$finalZipOutput = Join-Path $outputRoot $zipFileName
$finalInstallerOutput = Join-Path $outputRoot $installerFileName
$finalPortableOutput = Join-Path $outputRoot $portableFileName
$finalModelOutput = Join-Path $outputRoot "Model\Qwen3-1.7B-Q4_K_M.gguf"

Write-Output (ConvertTo-Json -Depth 5 ([ordered]@{
  mentorZip = $finalZipOutput
  installer = $finalInstallerOutput
  portable = $finalPortableOutput
  model = $finalModelOutput
  productHead = $ProductHead
}))

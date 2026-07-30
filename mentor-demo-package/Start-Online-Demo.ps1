[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$previewUrl = "https://hematuria-training-system-k4zt0b0fd-niubi1vs-projects.vercel.app/"
$healthUrl = "${previewUrl}api/health/"
$expectedSha = "910d0b3bbcaf8cd22c1a854cba57b2bf50a2203d"

Write-Host "Hematuria Clinical Interview Training - Online Mentor Demo"
Write-Host "Preview: $previewUrl"
Write-Host "Health:  $healthUrl"
Write-Host "Source: live_ai = cloud DeepSeek. This is not local AI."

try {
  $dns = [System.Net.Dns]::GetHostAddresses(([Uri]$previewUrl).Host)
  if (-not $dns -or $dns.Count -eq 0) { throw "DNS resolution failed" }
} catch {
  Write-Error "Network check failed. Check the connection and retry."
  exit 10
}

$healthOk = $false
$healthNote = ""
try {
  $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 15 -MaximumRedirection 0
  if ($response.StatusCode -eq 200) {
    $health = $response.Content | ConvertFrom-Json
    $reportedSha = [string]$health.deploymentSha
    if (-not $reportedSha) { $reportedSha = [string]$health.gitSha }
    if ($reportedSha -and ($expectedSha.StartsWith($reportedSha) -or $reportedSha.StartsWith($expectedSha))) {
      $healthOk = $true
      $healthNote = "HTTP 200; deployment SHA matches."
    } else {
      $healthNote = "Health is reachable, but deployment SHA does not match this package."
    }
  }
} catch {
  $statusCode = 0
  if ($_.Exception.Response) { $statusCode = [int]$_.Exception.Response.StatusCode }
  if ($statusCode -eq 401 -or $statusCode -eq 302) {
    $healthNote = "Preview is protected by Vercel login. Sign in with an authorized account. This package stores no cookie, password, or secret."
  } else {
    $healthNote = "Health check failed (HTTP $statusCode)."
  }
}

if ($healthOk) {
  Write-Host "Health passed: $healthNote" -ForegroundColor Green
} else {
  Write-Warning "Health did not pass: $healthNote"
  Write-Warning "The browser will still open for authorized sign-in or service inspection."
}

$edgeCandidates = @(
  (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path $env:LOCALAPPDATA "Microsoft\Edge\Application\msedge.exe")
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

if ($edgeCandidates.Count -gt 0) {
  Start-Process -FilePath $edgeCandidates[0] -ArgumentList @("--inprivate", "--app=$previewUrl", "--no-first-run")
  Write-Host "Opened Microsoft Edge in an InPrivate app window."
} else {
  Start-Process $previewUrl
  Write-Host "Microsoft Edge was not found. Opened the default browser."
}

if (-not $healthOk) { exit 20 }

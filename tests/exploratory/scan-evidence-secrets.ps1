param(
  [string]$EvidenceRoot = "artifacts/exploratory-qa"
)

$ErrorActionPreference = "Stop"
$resolvedRoot = (Resolve-Path -LiteralPath $EvidenceRoot).Path
$patterns = [ordered]@{
  "private-key" = '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'
  "api-token" = '\b(?:sk-[A-Za-z0-9_-]{16,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{20,})\b'
  "jwt" = '\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b'
  "aws-access-key" = '\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'
  "google-api-key" = '\bAIza[A-Za-z0-9_-]{30,}\b'
  "azure-account-key" = '\bAccountKey=[A-Za-z0-9+/]{32,}={0,2}\b'
  "authorization" = '\bAuthorization\s*[:=]\s*["'']?(?:Bearer\s+[A-Za-z0-9._~+/-]{20,}|Basic\s+[A-Za-z0-9+/]{16,}={0,2})'
  "cookie" = '\b(?:Cookie|Set-Cookie)\s*[:=]\s*["'']?[A-Za-z0-9_.-]+=[^;\s"'']{16,}'
  "sensitive-assignment" = '(?m)^\s*[A-Z][A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD|CONNECTION_STRING|DATABASE_URL|REDIS_URL|COOKIE)\s*=\s*(?!$|your_|replace_|optional_|example|test-|test_|unit-test|fake|dummy|mock|<|\$\{\{|process\.env|env\.)\S+'
}

$compiled = foreach ($item in $patterns.GetEnumerator()) {
  [pscustomobject]@{
    Name = $item.Key
    Regex = [regex]::new($item.Value, [Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [Text.RegularExpressions.RegexOptions]::CultureInvariant)
  }
}

$findingKeys = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$fileCount = 0L
$entryCount = 0L
$scannedBytes = 0L

function Test-Chunk {
  param([byte[]]$Bytes, [int]$Count, [string]$Label)
  if ($Count -le 0) { return }
  $script:scannedBytes += $Count
  $text = [Text.Encoding]::GetEncoding(28591).GetString($Bytes, 0, $Count)
  foreach ($pattern in $script:compiled) {
    if ($pattern.Regex.IsMatch($text)) {
      [void]$script:findingKeys.Add("$($pattern.Name)`t$Label")
    }
  }
}

function Test-Stream {
  param([IO.Stream]$Stream, [string]$Label)
  $bufferSize = 2MB
  $overlapSize = 512
  $buffer = [byte[]]::new($bufferSize)
  $overlap = [byte[]]::new($overlapSize)
  $overlapCount = 0
  while (($read = $Stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
    $combined = [byte[]]::new($overlapCount + $read)
    if ($overlapCount -gt 0) { [Array]::Copy($overlap, 0, $combined, 0, $overlapCount) }
    [Array]::Copy($buffer, 0, $combined, $overlapCount, $read)
    Test-Chunk -Bytes $combined -Count $combined.Length -Label $Label
    $overlapCount = [Math]::Min($overlapSize, $combined.Length)
    [Array]::Copy($combined, $combined.Length - $overlapCount, $overlap, 0, $overlapCount)
  }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$files = Get-ChildItem -LiteralPath $resolvedRoot -Recurse -File | Sort-Object FullName
foreach ($file in $files) {
  $fileCount += 1
  $relative = $file.FullName.Substring($resolvedRoot.Length + 1).Replace("\", "/")
  $openPath = if ($file.FullName.StartsWith("\\?\")) { $file.FullName } else { "\\?\$($file.FullName)" }
  $stream = [IO.File]::OpenRead($openPath)
  try { Test-Stream -Stream $stream -Label $relative } finally { $stream.Dispose() }

  if ($file.Extension -ieq ".zip") {
    $archive = [IO.Compression.ZipFile]::OpenRead($openPath)
    try {
      foreach ($entry in $archive.Entries) {
        if ([string]::IsNullOrEmpty($entry.Name)) { continue }
        $entryCount += 1
        $entryStream = $entry.Open()
        try { Test-Stream -Stream $entryStream -Label "$relative#$($entry.FullName)" } finally { $entryStream.Dispose() }
      }
    } finally { $archive.Dispose() }
  }
}

if ($findingKeys.Count -gt 0) {
  $findingKeys | Sort-Object | ForEach-Object { Write-Error $_ }
  throw "Evidence scan found $($findingKeys.Count) potential sensitive value location(s); values were intentionally not printed."
}

Write-Output "Evidence scan passed: files=$fileCount zipEntries=$entryCount streamedBytes=$scannedBytes findings=0; no sensitive values were printed."

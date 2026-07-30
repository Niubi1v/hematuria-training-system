param(
  [Parameter(Mandatory = $true)]
  [string]$Archive,
  [Parameter(Mandatory = $true)]
  [string]$Destination
)

$ErrorActionPreference = "Stop"
$archivePath = [System.IO.Path]::GetFullPath($Archive)
$destinationPath = [System.IO.Path]::GetFullPath($Destination)

if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
  throw "Runtime archive not found: $archivePath"
}

if (Test-Path -LiteralPath $destinationPath) {
  Remove-Item -LiteralPath $destinationPath -Recurse -Force
}
New-Item -ItemType Directory -Path $destinationPath -Force | Out-Null
Expand-Archive -LiteralPath $archivePath -DestinationPath $destinationPath -Force


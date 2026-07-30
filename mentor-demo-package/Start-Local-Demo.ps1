[CmdletBinding()]
param()

Write-Host "Hematuria Clinical Interview Training - Local Web Demo"
Write-Warning "The local web runtime is not delivered in this mentor package."
Write-Host "Reason: the existing full-stack launcher requires Docker and Redis. A dependency-free portable package with a durable attempt store cannot be closed safely without violating the package boundaries."
Write-Host "A local web demo is not local AI. The true offline-AI desktop application is still in development."
Write-Host "Use Start-Online-Demo.cmd."
exit 30

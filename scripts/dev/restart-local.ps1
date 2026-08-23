# Restarts the local CartaVault development environment:
# runs stop-local.ps1 then start-local.ps1, keeping their detailed reports
# and aggregating the outcome into .local\logs\restart-local-report.txt.
#
# Usage (Windows):  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev\restart-local.ps1
# Exit codes:       worst of the two phases (0 OK, 1 partial, 2 broken).
# The combined report always ends with a "[DONE] rc=<n>" sentinel line.

[CmdletBinding()]
param(
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173
)

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot '_common.ps1')
$ctx = New-LocalContext -ReportName 'restart-local-report.txt' -BackendPort $BackendPort -FrontendPort $FrontendPort

Add-ReportLine -Context $ctx -Text "=== CartaVault local environment - restart $(Get-Date -Format s) ==="

$stopScript = Join-Path $PSScriptRoot 'stop-local.ps1'
$startScript = Join-Path $PSScriptRoot 'start-local.ps1'

$stopRc = 2
if (Test-Path $stopScript) {
    & $stopScript -BackendPort $ctx.BackendPort -FrontendPort $ctx.FrontendPort
    $stopRc = $LASTEXITCODE
} else {
    Add-Failure -Context $ctx -Text 'phase-stop    : FAILED (stop-local.ps1 not found)'
}
Add-ReportLine -Context $ctx -Text "phase-stop    : rc=$stopRc (details: .local\logs\stop-local-report.txt)"

$startRc = 2
if (Test-Path $startScript) {
    & $startScript -BackendPort $ctx.BackendPort -FrontendPort $ctx.FrontendPort
    $startRc = $LASTEXITCODE
} else {
    Add-Failure -Context $ctx -Text 'phase-start   : FAILED (start-local.ps1 not found)'
}
Add-ReportLine -Context $ctx -Text "phase-start   : rc=$startRc (details: .local\logs\start-local-report.txt)"

$finalRc = [Math]::Max([int]$stopRc, [int]$startRc)
exit (Complete-LocalReport -Context $ctx -Rc $finalRc)

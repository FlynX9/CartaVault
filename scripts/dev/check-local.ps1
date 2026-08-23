# Read-only status check of the local CartaVault development environment.
# Starts nothing, stops nothing, modifies nothing. Safe to run at any time.
#
# Usage (Windows):  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev\check-local.ps1
# Exit codes:       0 everything OK, 1 some checks failed, 2 environment down.
# The report is also written to .local\logs\check-local-report.txt and always
# ends with a "[DONE] rc=<n>" sentinel line.

[CmdletBinding()]
param(
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173
)

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot '_common.ps1')
$ctx = New-LocalContext -ReportName 'check-local-report.txt' -BackendPort $BackendPort -FrontendPort $FrontendPort

Add-ReportLine -Context $ctx -Text "=== CartaVault local environment - check $(Get-Date -Format s) ==="

$vitePort = $FrontendPort
$backendOk = $false
$frontendOk = $false
$proxyOk = $false
$lanOk = $false
$conflict = ''

# --- Backend ----------------------------------------------------------------
$bListener = Get-Listener -Port $BackendPort
if ($bListener) {
    if ((Test-HttpStatus "http://127.0.0.1:$BackendPort/openapi.json") -eq 200) {
        $backendOk = $true
        Add-ReportLine -Context $ctx -Text "backend       : OK - http://127.0.0.1:$BackendPort ($(Get-ProcessDisplayName $bListener))"
    } else {
        $conflict = "backend port $BackendPort owned by '$(Get-ProcessDisplayName $bListener)' but the CartaVault API does not answer"
        Add-Failure -Context $ctx -Text "backend       : KO - $conflict"
    }
} else {
    Add-Failure -Context $ctx -Text 'backend       : KO - nothing listening'
}

# --- Frontend ---------------------------------------------------------------
$fListener = Get-Listener -Port $vitePort
if ($fListener) {
    if ((Test-HttpStatus "http://127.0.0.1:$vitePort/" '@vite/client') -eq 200) {
        $frontendOk = $true
        Add-ReportLine -Context $ctx -Text "frontend      : OK - http://127.0.0.1:$vitePort ($(Get-ProcessDisplayName $fListener))"
    } else {
        $conflict = "frontend port $vitePort owned by '$(Get-ProcessDisplayName $fListener)' which is not Vite"
        Add-Failure -Context $ctx -Text "frontend      : KO - $conflict"
    }
} else {
    # Detect an alternate Vite port from the dev-server logs before declaring KO.
    $logText = ''
    foreach ($logName in @('frontend-dev.stdout.log', 'frontend-dev.stderr.log')) {
        $logText += Get-Content (Join-Path $ctx.LogsDir $logName) -Raw -ErrorAction SilentlyContinue
    }
    $altPort = [regex]::Matches($logText, 'http://[^\s]*:(\d{4,5})/') |
        ForEach-Object { [int]$_.Groups[1].Value } |
        Sort-Object -Unique |
        Where-Object { $_ -ne $FrontendPort -and (Get-Listener -Port $_) } |
        Where-Object { (Test-HttpStatus "http://127.0.0.1:$_/" '@vite/client') -eq 200 } |
        Select-Object -First 1
    if ($altPort) {
        $vitePort = [int]$altPort
        $frontendOk = $true
        Add-ReportLine -Context $ctx -Text "frontend      : OK - http://127.0.0.1:$vitePort (actual port differs from expected $FrontendPort)"
    } else {
        Add-Failure -Context $ctx -Text 'frontend      : KO - nothing listening'
    }
}

# --- API proxy --------------------------------------------------------------
$pLocal = Test-HttpStatus "http://127.0.0.1:$vitePort/api/docs"
if ($pLocal -eq 200) {
    $proxyOk = $true
    Add-ReportLine -Context $ctx -Text 'api-proxy     : OK (/api/docs through Vite)'
} else {
    Add-Failure -Context $ctx -Text "api-proxy     : KO (/api/docs answered $pLocal)"
}

# --- PostgreSQL container (read-only inspection) ----------------------------
if (Test-DockerEngine) {
    $pgState = docker inspect -f '{{.State.Running}}' $ctx.Container 2>$null
    if ($pgState -eq 'true') {
        Add-ReportLine -Context $ctx -Text "postgres      : RUNNING (container $($ctx.Container))"
    } elseif ($pgState -eq 'false') {
        Add-Failure -Context $ctx -Text "postgres      : STOPPED (container $($ctx.Container) exists but is not running)"
    } else {
        Add-Failure -Context $ctx -Text "postgres      : ABSENT (no container named $($ctx.Container))"
    }
} else {
    Add-ReportLine -Context $ctx -Text 'postgres      : UNKNOWN (docker engine not running)'
}

# --- LAN IPv4 + reachability ------------------------------------------------
$lan = Get-LanIPv4 -Context $ctx
$firewallStatus = 'unknown'
if ($lan) {
    Add-ReportLine -Context $ctx -Text "lan-ipv4      : $($lan.Ip) ($($lan.Alias))"
    if ((Test-HttpStatus "http://$($lan.Ip):$vitePort/") -eq 200) {
        $lanOk = $true
        $firewallStatus = 'no'
        Add-ReportLine -Context $ctx -Text "phone-url     : http://$($lan.Ip):$vitePort"
    } elseif ($frontendOk) {
        $firewallStatus = 'likely'
        Add-Failure -Context $ctx -Text "phone-url     : http://$($lan.Ip):$vitePort (not reachable through this adapter)"
        Add-ReportLine -Context $ctx -Text 'firewall      : LAN probe failed while Vite answers locally. Minimum inbound rule needed (run manually if desired):'
        Add-ReportLine -Context $ctx -Text "                New-NetFirewallRule -DisplayName `"CartaVault Vite dev (TCP $vitePort)`" -Direction Inbound -Protocol TCP -LocalPort $vitePort -Action Allow -Profile Private"
        Add-ReportLine -Context $ctx -Text '                This script never changes firewall rules by itself.'
    } else {
        Add-Failure -Context $ctx -Text "phone-url     : http://$($lan.Ip):$vitePort (not reachable - frontend is down)"
    }
} else {
    Add-Failure -Context $ctx -Text 'lan-ipv4      : UNKNOWN (no physical IPv4 adapter found)'
    Add-ReportLine -Context $ctx -Text 'phone-url     : unavailable'
}

# --- Summary ----------------------------------------------------------------
Add-ReportLine -Context $ctx -Text ("summary       : backend=" + $(if ($backendOk) { 'OK' } else { 'KO' }) +
    " frontend=$(if ($frontendOk) { 'OK' } else { 'KO' })" +
    " api-proxy=$(if ($proxyOk) { 'OK' } else { 'KO' })" +
    " lan=$(if ($lanOk) { 'OK' } else { 'KO' })" +
    " firewall-block=" + $firewallStatus)

$nextAction = 'none'
if ($conflict) { $nextAction = "inspect manually: $conflict" }
elseif (-not $backendOk -and -not $frontendOk) { $nextAction = 'environment is down - run scripts\dev\start-local.ps1' }
elseif (-not $proxyOk) { $nextAction = 'run scripts\dev\restart-local.ps1' }
elseif (-not $backendOk -or -not $frontendOk) { $nextAction = 'run scripts\dev\start-local.ps1' }
elseif (-not $lanOk -and $lan) { $nextAction = 'check Windows Firewall inbound rule for the frontend port (see advisory)' }
Add-ReportLine -Context $ctx -Text "next-action   : $nextAction"

$rcOverride = -1
if (-not $backendOk -and -not $frontendOk) { $rcOverride = 2 }
exit (Complete-LocalReport -Context $ctx -Rc $rcOverride)

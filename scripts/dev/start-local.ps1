# Fast, idempotent starter for the local CartaVault development environment.
# Safe to re-run: running services are detected and left untouched.
# Never kills processes, never touches Windows Firewall, never runs migrations.
#
# Usage (Windows):  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev\start-local.ps1
# Exit codes:       0 everything OK, 1 partial failures, 2 broken environment.
# The report is also written to .local\logs\start-local-report.txt and always
# ends with a "[DONE] rc=<n>" sentinel line.

[CmdletBinding()]
param(
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173
)

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot '_common.ps1')
$ctx = New-LocalContext -ReportName 'start-local-report.txt' -BackendPort $BackendPort -FrontendPort $FrontendPort

Add-ReportLine -Context $ctx -Text "=== CartaVault local environment - start $(Get-Date -Format s) ==="

# --- 1. Docker engine -------------------------------------------------------
if (Wait-DockerEngine -Context $ctx -StartIfDown) {
    Add-ReportLine -Context $ctx -Text 'docker-engine : OK'
} else {
    Add-Failure -Context $ctx -Text 'docker-engine : FAILED (unreachable after ~120s)'
}

# --- 2. PostgreSQL/PostGIS container ---------------------------------------
$postgresOk = $false
if (Test-DockerEngine) {
    $envValues = Read-DotEnv (Join-Path $ctx.RepoRoot '.env')
    $pgUser = if ($envValues['POSTGRES_USER']) { $envValues['POSTGRES_USER'] } else { 'poi_user' }
    $pgDb = if ($envValues['POSTGRES_DB']) { $envValues['POSTGRES_DB'] } else { 'cartavault' }

    $state = docker inspect -f '{{.State.Running}}' $ctx.Container 2>$null

    if ($state -eq 'true') {
        $postgresOk = $true
        Add-ReportLine -Context $ctx -Text "postgres      : ALREADY RUNNING (container $($ctx.Container))"
    } elseif ($state -eq 'false') {
        $startOutput = docker start $ctx.Container 2>&1 | Out-String
        if ((docker inspect -f '{{.State.Running}}' $ctx.Container 2>$null) -eq 'true') {
            $postgresOk = $true
            Add-ReportLine -Context $ctx -Text "postgres      : STARTED (existing container $($ctx.Container))"
        } else {
            Add-Failure -Context $ctx -Text "postgres      : FAILED to start the existing container:"
            foreach ($l in $startOutput.Split("`n")) {
                if ($l.Trim()) { Add-ReportLine -Context $ctx -Text ('                 ' + $l.Trim()) }
            }
            Add-ReportLine -Context $ctx -Text '                 The container definition may point to a stale path. Do NOT reset the data volume.'
        }
    } else {
        Push-Location $ctx.RepoRoot
        try {
            docker compose up -d postgres *> $null
            if ((docker inspect -f '{{.State.Running}}' $ctx.Container 2>$null) -eq 'true') {
                $postgresOk = $true
                Add-ReportLine -Context $ctx -Text 'postgres      : STARTED (docker compose up -d postgres)'
            } else {
                Add-Failure -Context $ctx -Text 'postgres      : FAILED (compose did not leave the container running)'
            }
        } finally { Pop-Location }
    }

    if ($postgresOk) {
        $ready = $false
        for ($i = 0; $i -lt 15; $i++) {
            docker exec $ctx.Container pg_isready -U $pgUser -d $pgDb *> $null
            if ($LASTEXITCODE -eq 0) { $ready = $true; break }
            Start-Sleep -Seconds 2
        }
        if (-not $ready) {
            Add-ReportLine -Context $ctx -Text 'postgres      : WARNING (accepting-connections check timed out)'
        }
    }
} else {
    Add-Failure -Context $ctx -Text 'postgres      : SKIPPED (no docker engine)'
}

# --- 3. Backend (uvicorn, loopback only) ------------------------------------
$listener = Get-Listener -Port $BackendPort
if ($listener) {
    $probe = Test-HttpStatus "http://127.0.0.1:$BackendPort/openapi.json"
    if ($probe -eq 200) {
        Add-ReportLine -Context $ctx -Text "backend       : ALREADY RUNNING on port $BackendPort ($(Get-ProcessDisplayName $listener))"
    } else {
        Add-Failure -Context $ctx -Text "backend       : CONFLICT - port $BackendPort owned by '$(Get-ProcessDisplayName $listener)' which does not answer like the CartaVault API"
    }
} else {
    $venvPython = Join-Path $ctx.BackendDir '.venv\Scripts\python.exe'
    if (-not (Test-Path $venvPython)) {
        Add-Failure -Context $ctx -Text "backend       : FAILED (.venv missing - see backend/README.md: python -m venv .venv && pip install -r requirements-dev.txt)"
    } else {
        Start-Process -FilePath $venvPython `
            -ArgumentList '-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', "$BackendPort" `
            -WorkingDirectory $ctx.BackendDir -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $ctx.LogsDir 'backend-dev.stdout.log') `
            -RedirectStandardError (Join-Path $ctx.LogsDir 'backend-dev.stderr.log') | Out-Null
        $ok = $false
        for ($i = 0; $i -lt 20; $i++) {
            Start-Sleep -Seconds 1
            if ((Test-HttpStatus "http://127.0.0.1:$BackendPort/openapi.json") -eq 200) { $ok = $true; break }
        }
        if ($ok) { Add-ReportLine -Context $ctx -Text "backend       : STARTED - http://127.0.0.1:$BackendPort" }
        else {
            Add-Failure -Context $ctx -Text 'backend       : FAILED to answer after startup (see .local\logs\backend-dev.stderr.log)'
        }
    }
}

# --- 4. Frontend (vite, LAN reachable) --------------------------------------
$vitePort = $FrontendPort
$listener = Get-Listener -Port $vitePort
if ($listener) {
    $probe = Test-HttpStatus "http://127.0.0.1:$vitePort/" '@vite/client'
    if ($probe -eq 200) {
        Add-ReportLine -Context $ctx -Text "frontend      : ALREADY RUNNING on port $vitePort ($(Get-ProcessDisplayName $listener))"
    } else {
        Add-Failure -Context $ctx -Text "frontend      : CONFLICT - port $vitePort owned by '$(Get-ProcessDisplayName $listener)' which is not Vite"
    }
} else {
    $npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
    if (-not $npm) {
        Add-Failure -Context $ctx -Text 'frontend      : FAILED (npm.cmd not found in PATH)'
    } else {
        Start-Process -FilePath $npm `
            -ArgumentList 'run', 'dev', '--', '--host', '0.0.0.0' `
            -WorkingDirectory $ctx.FrontendDir -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $ctx.LogsDir 'frontend-dev.stdout.log') `
            -RedirectStandardError (Join-Path $ctx.LogsDir 'frontend-dev.stderr.log') | Out-Null
        $ok = $false
        for ($i = 0; $i -lt 25; $i++) {
            Start-Sleep -Seconds 1
            if (Get-Listener -Port $vitePort) { $ok = $true; break }
        }
        if (-not $ok) {
            # strictPort is set, but report the actual port from the log if Vite moved anyway.
            $logText = ''
            foreach ($logName in @('frontend-dev.stdout.log', 'frontend-dev.stderr.log')) {
                $logText += Get-Content (Join-Path $ctx.LogsDir $logName) -Raw -ErrorAction SilentlyContinue
            }
            if ($logText -match 'http://[^\s]*:(\d{4,5})/') { $vitePort = [int]$matches[1] }
        }
        if (Get-Listener -Port $vitePort) { Add-ReportLine -Context $ctx -Text "frontend      : STARTED - http://127.0.0.1:$vitePort" }
        else {
            Add-Failure -Context $ctx -Text 'frontend      : FAILED to listen after startup (see .local\logs\frontend-dev.stderr.log)'
        }
    }
}

# --- 5. LAN IPv4 ------------------------------------------------------------
$lan = Get-LanIPv4 -Context $ctx
if ($lan) { Add-ReportLine -Context $ctx -Text "lan-ip        : $($lan.Ip) ($($lan.Alias))" }
else { Add-Failure -Context $ctx -Text 'lan-ip        : UNKNOWN (no physical IPv4 adapter found)' }

# --- 6. Verification --------------------------------------------------------
$bDocs = Test-HttpStatus "http://127.0.0.1:$BackendPort/docs"
$fLocal = Test-HttpStatus "http://127.0.0.1:$vitePort/" '@vite/client'
$fLan = if ($lan) { Test-HttpStatus "http://$($lan.Ip):$vitePort/" } else { 0 }
$pLocal = Test-HttpStatus "http://127.0.0.1:$vitePort/api/docs"

foreach ($check in @(
        @{ Label = 'backend /docs'; Value = $bDocs },
        @{ Label = 'frontend local'; Value = $fLocal },
        @{ Label = 'frontend via LAN IP'; Value = $fLan },
        @{ Label = 'vite /api proxy'; Value = $pLocal })) {
    if ($check.Value -eq 200) { Add-ReportLine -Context $ctx -Text ("verify        : " + $check.Label + " OK") }
    else { Add-Failure -Context $ctx -Text ("verify        : " + $check.Label + " FAILED (" + $check.Value + ")") }
}

if ($lan -and $fLan -ne 200) {
    Add-ReportLine -Context $ctx -Text 'firewall      : LAN check failed. Minimum inbound rule needed (run manually if desired):'
    Add-ReportLine -Context $ctx -Text "                New-NetFirewallRule -DisplayName `"CartaVault Vite dev (TCP $vitePort)`" -Direction Inbound -Protocol TCP -LocalPort $vitePort -Action Allow -Profile Private"
    Add-ReportLine -Context $ctx -Text '                This script never changes firewall rules by itself.'
}

$phoneUrl = if ($lan) { "http://$($lan.Ip):$vitePort" } else { 'unavailable' }
Add-ReportLine -Context $ctx -Text "phone-url     : $phoneUrl"
Add-ReportLine -Context $ctx -Text ("summary       : postgres=" + $(if ($postgresOk) { 'OK' } else { 'KO' }) +
    " backend=$(if ($bDocs -eq 200) { 'OK' } else { 'KO' })" +
    " frontend=$(if ($fLocal -eq 200) { 'OK' } else { 'KO' })" +
    " proxy=$(if ($pLocal -eq 200) { 'OK' } else { 'KO' })" +
    " lan=$(if ($fLan -eq 200) { 'OK' } else { 'KO' })")

exit (Complete-LocalReport -Context $ctx)

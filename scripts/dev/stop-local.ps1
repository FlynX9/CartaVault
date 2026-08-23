# Safely stop ONLY the local CartaVault development processes (backend + frontend).
# - Verifies ownership (command line / executable path) before terminating anything.
# - Never touches PostgreSQL, Docker Desktop, containers, or unrelated processes.
# - Graceful termination first, force only if the process does not stop.
#
# Usage (Windows):  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev\stop-local.ps1
# Exit codes:       0 targeted ports freed, 1 conflict or failure, 2 multiple failures.
# The report is also written to .local\logs\stop-local-report.txt and always
# ends with a "[DONE] rc=<n>" sentinel line.

[CmdletBinding()]
param(
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173
)

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot '_common.ps1')
$ctx = New-LocalContext -ReportName 'stop-local-report.txt' -BackendPort $BackendPort -FrontendPort $FrontendPort

Add-ReportLine -Context $ctx -Text "=== CartaVault local environment - stop $(Get-Date -Format s) ==="
Add-ReportLine -Context $ctx -Text 'scope         : dev servers on ports only; postgres/Docker intentionally untouched'

function Get-CimProcessMap {
    $map = @{}
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ForEach-Object { $map[[int]$_.ProcessId] = $_ }
    return $map
}

function Test-OwnedByUs($proc) {
    # Ownership signature: repo path anywhere in the command line / executable path,
    # or well-known CartaVault dev-server markers.
    if (-not $proc) { return $false }
    $hay = ''
    if ($proc.CommandLine) { $hay += ' ' + $proc.CommandLine }
    if ($proc.ExecutablePath) { $hay += ' ' + $proc.ExecutablePath }
    if ($hay -match [regex]::Escape($ctx.RepoRoot)) { return $true }
    if ($hay -match 'app\.main:app|uvicorn|vite|npm(\.cmd)?\s+run\s+dev') { return $true }
    return $false
}

function Get-DescendantIds([int]$RootPid, $map) {
    $ids = New-Object System.Collections.Generic.List[int]
    $queue = New-Object System.Collections.Queue
    $queue.Enqueue($RootPid)
    while ($queue.Count -gt 0) {
        $p = [int]$queue.Dequeue()
        foreach ($kv in $map.GetEnumerator()) {
            if ([int]$kv.Value.ParentProcessId -eq $p) {
                $ids.Add([int]$kv.Key)
                $queue.Enqueue([int]$kv.Key)
            }
        }
    }
    return $ids
}

function Find-KillRoot([int]$OwnerPid, $map) {
    # Walk up while the ancestor is an alive npm/node/cmd/python wrapper that
    # still belongs to this project; the topmost such process roots the tree.
    $killRootId = $OwnerPid
    $current = $map[$OwnerPid]
    $hops = 0
    while ($current -and $hops -lt 6) {
        $parentId = [int]$current.ParentProcessId
        if (-not $map.ContainsKey($parentId)) { break }
        $parent = $map[$parentId]
        if ($parent.Name -notmatch '^(python|pythonw|node|npm|cmd)(\.exe)?$') { break }
        if (-not (Test-OwnedByUs $parent)) { break }
        $killRootId = $parentId
        $current = $parent
        $hops++
    }
    return $killRootId
}

function Stop-DevService([string]$Label, [int]$Port) {
    $listener = Get-Listener -Port $Port
    if (-not $listener) {
        Add-ReportLine -Context $ctx -Text "$Label : nothing listening on port ${Port}"
        return
    }
    $map = Get-CimProcessMap
    $ownerPid = [int]$listener.OwningProcess
    $owner = $map[$ownerPid]
    if (-not (Test-OwnedByUs $owner)) {
        Add-Failure -Context $ctx -Text "$Label : port ${Port} owned by '$(Get-ProcessDisplayName $listener)' which does not look like CartaVault - left running"
        return
    }

    $killRoot = Find-KillRoot -OwnerPid $ownerPid -Map $map
    $victimIds = @(Get-DescendantIds -RootPid $killRoot -Map $map) + @($killRoot) |
        Sort-Object -Unique
    $preview = ($victimIds | ForEach-Object {
            $n = 'unknown'
            if ($map.ContainsKey($_)) { $n = $map[$_].Name }
            "$n($_)"
        }) -join ', '
    Add-ReportLine -Context $ctx -Text "${Label} : stopping $($preview)"

    # Graceful first (console apps usually ignore it), then force with tree.
    taskkill /PID $killRoot *> $null
    Start-Sleep -Seconds 3
    if (Get-Listener -Port $Port) { taskkill /F /T /PID $killRoot *> $null }

    $freed = $false
    for ($i = 0; $i -lt 8; $i++) {
        if (-not (Get-Listener -Port $Port)) { $freed = $true; break }
        Start-Sleep -Seconds 1
    }
    if ($freed) { Add-ReportLine -Context $ctx -Text "${Label} : STOPPED (port ${Port} freed)" }
    else { Add-Failure -Context $ctx -Text "${Label} : still listening after termination attempt" }
}

Stop-DevService -Label 'backend ' -Port $BackendPort
Stop-DevService -Label 'frontend' -Port $FrontendPort

exit (Complete-LocalReport -Context $ctx)

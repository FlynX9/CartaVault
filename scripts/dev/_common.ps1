# Shared helpers for the CartaVault local development scripts.
# Dot-sourced by start-local.ps1, stop-local.ps1, check-local.ps1, restart-local.ps1.
# Windows PowerShell 5.1 compatible. ASCII only.

function New-LocalContext {
    param(
        [Parameter(Mandatory = $true)][string]$ReportName,
        [int]$BackendPort = 8000,
        [int]$FrontendPort = 5173
    )
    $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
    $logsDir = Join-Path $repoRoot '.local\logs'
    New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
    return @{
        RepoRoot     = $repoRoot
        BackendDir   = Join-Path $repoRoot 'backend'
        FrontendDir  = Join-Path $repoRoot 'frontend'
        LogsDir      = $logsDir
        ReportFile   = Join-Path $logsDir $ReportName
        BackendPort  = $BackendPort
        FrontendPort = $FrontendPort
        Container    = 'CartaVault'
        StartTime    = Get-Date
        Lines        = New-Object System.Collections.Generic.List[string]
        Failures     = 0
        VirtualPattern = 'vEthernet|WSL|Docker|Hyper-V|Loopback|VPN|Tailscale|ZeroTier|VirtualBox|VMware|Bluetooth'
    }
}

function Add-ReportLine {
    param($Context, [string]$Text)
    $Context.Lines.Add($Text)
    Write-Host $Text
}

function Add-Failure {
    param($Context, [string]$Text)
    if ($Text) { Add-ReportLine -Context $Context -Text $Text }
    $Context.Failures++
}

function Test-HttpStatus {
    param([string]$Url, [string]$Contains = $null, [int]$TimeoutSec = 5)
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec
        if ($Contains -and ($response.Content -notlike "*$Contains*")) { return 0 }
        return [int]$response.StatusCode
    } catch {
        $response = $_.Exception.Response
        if ($response -and $response.StatusCode) { return [int]$response.StatusCode }
        return 0
    }
}

function Get-Listener {
    param([int]$Port)
    return Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -First 1
}

function Get-ProcessDisplayName {
    param($Connection)
    if (-not $Connection) { return '' }
    $p = Get-Process -Id $Connection.OwningProcess -ErrorAction SilentlyContinue
    if ($p) { return '{0} (pid {1})' -f $p.ProcessName, $p.Id }
    return ('pid ' + $Connection.OwningProcess)
}

function Read-DotEnv {
    param([string]$Path)
    $values = @{}
    if (Test-Path $Path) {
        foreach ($line in Get-Content $Path) {
            if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
                $values[$matches[1]] = $matches[2].Trim('"')
            }
        }
    }
    return $values
}

function Test-DockerEngine {
    try {
        $version = docker info --format '{{.ServerVersion}}' 2>$null
        if ($LASTEXITCODE -eq 0 -and $version) { return $true }
    } catch { }
    return $false
}

function Wait-DockerEngine {
    # Starts Docker Desktop if needed and waits up to ~120 s. Returns $true when ready.
    param($Context, [switch]$StartIfDown)
    if (Test-DockerEngine) { return $true }
    if (-not $StartIfDown) { return $false }
    $dockerDesktopExe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
    if (Test-Path $dockerDesktopExe) {
        Write-Host 'Docker engine is down; starting Docker Desktop...'
        Start-Process -FilePath $dockerDesktopExe -WindowStyle Minimized | Out-Null
    } else {
        return $false
    }
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Seconds 3
        if (Test-DockerEngine) { return $true }
    }
    return $false
}

function Get-LanIPv4 {
    param($Context)
    $adapters = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and
            $_.InterfaceAlias -notmatch $Context.VirtualPattern
        }
    if (-not $adapters) { return $null }
    $preferred = $adapters | Where-Object { $_.InterfaceAlias -match '^Wi-Fi' } | Select-Object -First 1
    if (-not $preferred) { $preferred = $adapters | Where-Object { $_.InterfaceAlias -match '^Ethernet' } | Select-Object -First 1 }
    if (-not $preferred) { $preferred = $adapters | Select-Object -First 1 }
    return @{ Ip = $preferred.IPAddress; Alias = $preferred.InterfaceAlias }
}

function Complete-LocalReport {
    # Appends sentinel, persists the report file, returns the process exit code.
    # Rc override: 0 OK, 1 partial failures, 2 broken/down environment.
    param($Context, [int]$Rc = -1)
    $elapsed = ((Get-Date) - $Context.StartTime).TotalSeconds.ToString('0')
    if ($Rc -lt 0) {
        if ($Context.Failures -eq 0) { $Rc = 0 } elseif ($Context.Failures -le 2) { $Rc = 1 } else { $Rc = 2 }
    }
    Add-ReportLine -Context $Context -Text ("[DONE] rc=$Rc (elapsed ${elapsed}s)")
    Set-Content -Path $Context.ReportFile -Value $Context.Lines -Encoding UTF8
    return $Rc
}

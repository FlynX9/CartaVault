[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$')]
    [string]$Version
)

$ErrorActionPreference = 'Stop'
$composeFile = Join-Path $PSScriptRoot 'compose.yml'

$buildDefaults = @{
    CARTAVAULT_VERSION = $Version
    POSTGRES_DB = 'cartavault_build'
    POSTGRES_USER = 'cartavault'
    POSTGRES_PASSWORD = 'build-only-password'
    DATABASE_URL = 'postgresql+psycopg://cartavault:build-only-password@postgres:5432/cartavault_build'
    FRONTEND_PUBLIC_URL = 'https://build.example.invalid'
    CORS_ALLOWED_ORIGINS = 'https://build.example.invalid'
    EMAIL_FROM_ADDRESS = 'no-reply@build.example.invalid'
    CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
}

foreach ($entry in $buildDefaults.GetEnumerator()) {
    Set-Item -Path "Env:$($entry.Key)" -Value $entry.Value
}

docker compose -f $composeFile config --quiet
if ($LASTEXITCODE -ne 0) {
    throw 'Docker Compose validation failed.'
}

docker compose -f $composeFile build --pull
if ($LASTEXITCODE -ne 0) {
    throw 'Docker image build failed.'
}

Write-Host "Built one version-matched image set:"
Write-Host "  cartavault-postgres:$Version"
Write-Host "  cartavault-backend:$Version (also used by the migration job)"
Write-Host "  cartavault-frontend:$Version"

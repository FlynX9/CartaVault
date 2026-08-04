[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$')]
    [string]$Version
)

$ErrorActionPreference = 'Stop'
$composeFile = Join-Path $PSScriptRoot 'compose.yml'
$postgisImage = 'postgis/postgis:16-3.5@sha256:7d7925e334fceb6079c0a5d150e925f192cde2cf1dd78767ca843e2996d39829'

$buildDefaults = @{
    CARTAVAULT_VERSION = $Version
    POSTGRES_DB = 'cartavault_build'
    POSTGRES_USER = 'cartavault'
    POSTGRES_PASSWORD = 'build-only-password'
    DATABASE_URL = 'postgresql+psycopg://cartavault:build-only-password@postgis:5432/cartavault_build'
    FRONTEND_PUBLIC_URL = 'https://build.example.invalid'
    CORS_ALLOWED_ORIGINS = 'https://build.example.invalid'
    EMAIL_FROM_ADDRESS = 'no-reply@build.example.invalid'
    CARTAVAULT_SESSION_SECRET = 'build-only-session-secret'
    CARTAVAULT_SETUP_TOKEN = 'build-only-setup-token'
    CARTAVAULT_CREDENTIALS_ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
}

foreach ($entry in $buildDefaults.GetEnumerator()) {
    Set-Item -Path "Env:$($entry.Key)" -Value $entry.Value
}

docker compose -f $composeFile config --quiet
if ($LASTEXITCODE -ne 0) {
    throw 'Docker Compose validation failed.'
}

docker pull $postgisImage
if ($LASTEXITCODE -ne 0) {
    throw 'PostGIS image pull failed.'
}

docker compose -f $composeFile build --pull cartavault
if ($LASTEXITCODE -ne 0) {
    throw 'Docker image build failed.'
}

Write-Host "Prepared the CartaVault stack images:"
Write-Host "  cartavault:$Version"
Write-Host "  $postgisImage"

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$')]
    [string]$Version,

    [string]$OutputDirectory = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'
$postgisImage = 'postgis/postgis:16-3.5@sha256:7d7925e334fceb6079c0a5d150e925f192cde2cf1dd78767ca843e2996d39829'
$images = @(
    "cartavault:$Version",
    $postgisImage
)

foreach ($image in $images) {
    docker image inspect $image *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker image not found: $image. Run docker/build.ps1 first."
    }
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$archive = Join-Path $OutputDirectory "cartavault-$Version-images.tar"
$checksumFile = "$archive.sha256"

docker save --output $archive @images
if ($LASTEXITCODE -ne 0) {
    throw 'Docker image export failed.'
}

$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $archive
"$($hash.Hash.ToLowerInvariant())  $([System.IO.Path]::GetFileName($archive))" |
    Set-Content -LiteralPath $checksumFile -Encoding ascii

Write-Host "Archive:  $archive"
Write-Host "Checksum: $checksumFile"

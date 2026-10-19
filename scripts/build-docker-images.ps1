<#
.SYNOPSIS
    Builds all production Otix Docker images locally (frontend, backend, node).
#>
param(
    [ValidateSet("all", "frontend", "backend", "node")]
    [string]$Target = "all"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $RepoRoot

try {
    Write-Host "==> Verifying Docker availability..." -ForegroundColor Cyan
    docker info > $null 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Docker daemon is not running. Please start Docker Desktop."
        exit 1
    }

    if ($Target -eq "all" -or $Target -eq "backend") {
        Write-Host "`n==> Building backend production image (otix-backend:latest)..." -ForegroundColor Cyan
        docker build -t otix-backend:latest -f backend/Dockerfile backend
        docker tag otix-backend:latest otix-api:latest
        docker tag otix-backend:latest otix-worker:latest
        docker tag otix-backend:latest otix-beat:latest
    }

    if ($Target -eq "all" -or $Target -eq "frontend") {
        Write-Host "`n==> Building frontend production image (otix-frontend:latest)..." -ForegroundColor Cyan
        docker build -t otix-frontend:latest -f frontend/Dockerfile frontend
    }

    if ($Target -eq "all" -or $Target -eq "node") {
        Write-Host "`n==> Building node production image (otix-node:latest)..." -ForegroundColor Cyan
        docker build -t otix-node:latest -f node/Dockerfile node
    }

    Write-Host "`nAll requested production Docker images built successfully!" -ForegroundColor Green
}
finally {
    Pop-Location
}

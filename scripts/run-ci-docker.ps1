<#
.SYNOPSIS
    Runs Otix CI test suites hermetically inside Docker, matching GitHub Actions CI (.github/workflows/ci.yml).

.DESCRIPTION
    Replicates the exact GitHub CI pipeline:
    - Frontend: TypeScript check (tsc --noEmit), ESLint, Vitest (1156+ unit tests).
    - Backend: Ruff lint, migration drift check, Django unit & integration tests (1890+ tests with SQLite in-memory).

.PARAMETER Target
    Which suite to run: "all" (default), "frontend", or "backend".
#>
param(
    [ValidateSet("all", "frontend", "backend")]
    [string]$Target = "all"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $RepoRoot

try {
    Write-Host "==> Verifying Docker availability..." -ForegroundColor Cyan
    docker info > $null 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Docker daemon is not running or not accessible. Please start Docker Desktop."
        exit 1
    }

    if ($Target -eq "all" -or $Target -eq "frontend") {
        Write-Host "`n==========================================" -ForegroundColor Cyan
        Write-Host " Building Frontend CI Docker Image..." -ForegroundColor Cyan
        Write-Host "==========================================" -ForegroundColor Cyan
        docker build -t otix-frontend-ci -f frontend/Dockerfile.ci frontend
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Frontend Docker build failed."
            exit 1
        }

        Write-Host "`n==========================================" -ForegroundColor Green
        Write-Host " Running Frontend CI Checks in Docker..." -ForegroundColor Green
        Write-Host "==========================================" -ForegroundColor Green
        docker run --rm otix-frontend-ci
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Frontend CI checks failed."
            exit 1
        }
    }

    if ($Target -eq "all" -or $Target -eq "backend") {
        Write-Host "`n==========================================" -ForegroundColor Cyan
        Write-Host " Building Backend CI Docker Image..." -ForegroundColor Cyan
        Write-Host "==========================================" -ForegroundColor Cyan
        docker build -t otix-backend-ci -f backend/Dockerfile.ci .
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Backend Docker build failed."
            exit 1
        }

        Write-Host "`n==========================================" -ForegroundColor Green
        Write-Host " Running Backend CI Checks in Docker..." -ForegroundColor Green
        Write-Host "==========================================" -ForegroundColor Green
        docker run --rm otix-backend-ci
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Backend CI checks failed."
            exit 1
        }
    }

    Write-Host "`nAll Docker CI checks passed successfully!" -ForegroundColor Green
}
finally {
    Pop-Location
}

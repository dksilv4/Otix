<#
.SYNOPSIS
    Runs the entire Otix stack (Frontend, Backend, Otix Node, and DB/Redis) in Docker with hot reload.
.PARAMETER DownOnExit
    Automatically stop Docker containers when exiting.
#>
param(
    [switch]$DownOnExit
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "         OTIX DOCKER DEV RUNNER (HOT RELOAD)              " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Start full Docker stack
Write-Host "[1/2] Starting all services in Docker..." -ForegroundColor Yellow
docker compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error starting docker compose stack." -ForegroundColor Red
    exit 1
}

# 2. Wait for API to become ready
Write-Host "  -> Waiting for Backend API..." -NoNewline -ForegroundColor Gray
for ($i = 0; $i -lt 30; $i++) {
    try {
        $resp = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/health" -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($resp.status -eq "ok") { break }
    } catch {
        Start-Sleep -Seconds 1
        Write-Host "." -NoNewline -ForegroundColor Gray
    }
}
Write-Host " [Ready]" -ForegroundColor Green

# 3. Print URLs
Write-Host ""
Write-Host "[2/2] All Services Running with Hot Reload:" -ForegroundColor Yellow
Write-Host "  - Frontend (Vite HMR):   http://localhost:5173" -ForegroundColor Green
Write-Host "  - Backend API:           http://localhost:8000" -ForegroundColor Green
Write-Host "  - Otix Node:             http://localhost:8090" -ForegroundColor Green
Write-Host "  - PostgreSQL:            localhost:5433" -ForegroundColor Green
Write-Host "  - Redis:                 localhost:6380" -ForegroundColor Green
Write-Host ""
Write-Host "Streaming logs (frontend, api, node)... Press Ctrl+C to stop following logs." -ForegroundColor DarkGray
Write-Host ""

try {
    docker compose logs -f frontend node api
} finally {
    Write-Host ""
    if ($DownOnExit) {
        Write-Host "Stopping Docker containers (-DownOnExit set)..." -ForegroundColor Yellow
        docker compose down
        Write-Host "All containers stopped." -ForegroundColor Green
    } else {
        Write-Host "Containers continue running in the background." -ForegroundColor Cyan
        Write-Host "To stop them anytime, run: docker compose down" -ForegroundColor DarkGray
    }
}


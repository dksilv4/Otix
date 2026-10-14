<#
.SYNOPSIS
    Builds and packages all Otix binaries on Windows (Desktop client and Node daemon).
#>
param(
    [switch]$DirOnly
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       Otix Complete Windows Binary Packaging Suite       " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Package Otix Node (Windows executable & zip)
Write-Host ""
Write-Host ">>> STEP 1: Building Otix Node Windows Executable & Zip..." -ForegroundColor Yellow
$nodeBuildScript = Join-Path $repoRoot "node\scripts\build-windows.ps1"
if (Test-Path $nodeBuildScript) {
    & $nodeBuildScript -PackageZip
}

# 2. Package Otix Desktop (Electron Client)
Write-Host ""
Write-Host ">>> STEP 2: Packaging Otix Desktop Client..." -ForegroundColor Yellow
$desktopBuildScript = Join-Path $scriptDir "package-desktop.ps1"
if ($DirOnly) {
    & $desktopBuildScript -DirOnly
} else {
    & $desktopBuildScript
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  All Otix Binaries Successfully Packaged!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  • Otix Desktop Releases: $repoRoot\desktop\release" -ForegroundColor Gray
Write-Host "  • Otix Node Binaries:    $repoRoot\node\dist" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Green

<#
.SYNOPSIS
    Packages the Otix Desktop Electron client for Windows.
.DESCRIPTION
    Builds the frontend production bundle, compiles desktop TypeScript,
    ensures native dependencies (better-sqlite3) match Electron,
    and runs electron-builder to produce the Windows installer (NSIS) and portable exe.
#>
param(
    [switch]$DirOnly,
    [string[]]$ExtraArgs
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$frontendDir = Join-Path $repoRoot "frontend"
$desktopDir = Join-Path $repoRoot "desktop"

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "          Otix Desktop Windows Packaging Pipeline         " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Build Frontend
Write-Host "==> [1/4] Building Frontend bundle..." -ForegroundColor Yellow
npm --prefix $frontendDir run build

# 2. Build Desktop TypeScript
Write-Host "==> [2/4] Compiling Desktop TypeScript..." -ForegroundColor Yellow
npm --prefix $desktopDir run build

# 3. Ensure native dependencies are compiled for Electron
Write-Host "==> [3/5] Ensuring native bindings are compiled for Electron..." -ForegroundColor Yellow
Push-Location $desktopDir
try {
    npx electron-builder install-app-deps
} finally {
    Pop-Location
}

# 4. Build embedded Otix Node sidecar binary if Go is available
Write-Host "==> [4/5] Checking for Otix Node companion binary..." -ForegroundColor Yellow
if (Get-Command go -ErrorAction SilentlyContinue) {
    Write-Host "    Building embedded Otix Node companion for Windows..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path (Join-Path $desktopDir "bin") | Out-Null
    Push-Location (Join-Path $repoRoot "node")
    try {
        $env:CGO_ENABLED = "0"
        $env:GOOS = "windows"
        $env:GOARCH = "amd64"
        go build -ldflags="-s -w" -o (Join-Path $desktopDir "bin\otix-node.exe") .
    } finally {
        Pop-Location
    }
} elseif (Test-Path (Join-Path $desktopDir "bin\otix-node.exe")) {
    Write-Host "    Using pre-existing bin\otix-node.exe binary." -ForegroundColor Cyan
} else {
    Write-Host "    Warning: Go not found and no pre-built binary in desktop\bin. Skipping embedded node." -ForegroundColor DarkYellow
}

# 5. Run electron-builder
Write-Host "==> [5/5] Running electron-builder..." -ForegroundColor Yellow
Push-Location $desktopDir
try {
    if ($DirOnly) {
        npx electron-builder --dir -c electron-builder.json5 @ExtraArgs
    } else {
        npx electron-builder --win -c electron-builder.json5 @ExtraArgs
    }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Otix Desktop Windows Packaging Complete!" -ForegroundColor Green
Write-Host "  Artifacts available in: $(Join-Path $repoRoot 'dist\desktop')" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Green

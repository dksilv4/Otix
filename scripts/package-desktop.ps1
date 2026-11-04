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
$nativeBinding = Join-Path $desktopDir "node_modules\better-sqlite3\build\Release\better_sqlite3.node"
if (Test-Path $nativeBinding) {
    Write-Host "    Using prebuilt native SQLite binding: $nativeBinding" -ForegroundColor Cyan
} else {
    Push-Location $desktopDir
    try {
        try { npx electron-builder install-app-deps } catch { Write-Host "    Notice: Native rebuild skipped or prebuilt bindings used." -ForegroundColor DarkYellow }
    } finally {
        Pop-Location
    }
}

# 4. Build embedded Otix Node sidecar binary if Go is available
Write-Host "==> [4/6] Checking for Otix Node companion binary..." -ForegroundColor Yellow
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

# 5. Ensure PresentMon binary is available for packaging
Write-Host "==> [5/6] Ensuring PresentMon binary is available for packaging..." -ForegroundColor Yellow
$pmTarget = Join-Path $desktopDir "bin\PresentMon.exe"
if (Test-Path $pmTarget) {
    Write-Host "    Found PresentMon binary: $pmTarget" -ForegroundColor Cyan
} else {
    Write-Host "    Downloading PresentMon from GitHub releases..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path (Join-Path $desktopDir "bin") | Out-Null
    $pmUrl = "https://github.com/GameTechDev/PresentMon/releases/download/v2.4.1/PresentMon-2.4.1-x64.exe"
    try {
        Invoke-WebRequest -Uri $pmUrl -OutFile $pmTarget -UseBasicParsing
        Write-Host "    Successfully downloaded PresentMon: $pmTarget" -ForegroundColor Green
    } catch {
        Write-Host "    Warning: Failed to download PresentMon: $_" -ForegroundColor DarkYellow
    }
}

# 6. Run electron-builder
Write-Host "==> [6/6] Running electron-builder..." -ForegroundColor Yellow
Push-Location $desktopDir
try {
    if ($DirOnly) {
        npx electron-builder --dir -c electron-builder.json5 --config.npmRebuild=false @ExtraArgs
    } else {
        npx electron-builder --win -c electron-builder.json5 --config.npmRebuild=false @ExtraArgs
    }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Otix Desktop Windows Packaging Complete!" -ForegroundColor Green
Write-Host "  Artifacts available in: $(Join-Path $repoRoot 'dist\desktop')" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Green

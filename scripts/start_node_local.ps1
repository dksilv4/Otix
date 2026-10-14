<#
.SYNOPSIS
    Runs the Otix Local Node daemon connected to localhost backend.

.DESCRIPTION
    Runs the primary otix-node instance connected to the local Otix development
    stack (http://127.0.0.1:8000) on default port 8090.

.PARAMETER Port
    The local HTTP port for the local node (default: 8090).

.PARAMETER Config
    Path to the local config file (default: .\node\config.yaml).

.PARAMETER Headless
    Run without opening the WebUI browser on startup.
#>
param(
    [int]$Port = 8090,
    [string]$Config = "",
    [switch]$Headless,
    [switch]$Background
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not $Config) {
    $appDataConfig = Join-Path $env:APPDATA "otix\config.yaml"
    if (Test-Path $appDataConfig) {
        $content = Get-Content $appDataConfig -Raw -ErrorAction SilentlyContinue
        if ($content -match 'claimed:\s*true' -or $content -match 'auth_token:\s*["''][a-zA-Z0-9_-]+["'']') {
            $Config = $appDataConfig
        }
    }
    if (-not $Config) {
        $Config = Join-Path $repoRoot "node\config.yaml"
    }
}

$nodeExe = Join-Path $repoRoot "node\otix-node.exe"
if (-not (Test-Path $nodeExe)) {
    $nodeExe = Join-Path $repoRoot "bin\otix-node.exe"
}
if (-not (Test-Path $nodeExe)) {
    Write-Host "Error: otix-node binary not found at $nodeExe" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "               OTIX LOCAL NODE DAEMON                     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Port:        $Port" -ForegroundColor Gray
Write-Host "  Config:      $Config" -ForegroundColor Gray
Write-Host "  Target:      http://127.0.0.1:8000 (Localhost API)" -ForegroundColor Gray
Write-Host "  Local WebUI: http://localhost:$Port" -ForegroundColor Gray
if ($Background) {
    Write-Host "  Mode:        Background Daemon (No CMD Window)" -ForegroundColor Gray
}
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

$argsList = @("-config", $Config, "-port", "$Port")
if ($Headless) {
    $argsList += "-headless"
}

if ($Background) {
    $proc = Start-Process -FilePath $nodeExe -ArgumentList $argsList -PassThru
    Write-Host "  Otix Node daemon started in background (PID: $($proc.Id))" -ForegroundColor Green
    Write-Host "  Control the node anytime via the Windows System Tray icon." -ForegroundColor Gray
    Write-Host ""
} else {
    & $nodeExe @argsList
}

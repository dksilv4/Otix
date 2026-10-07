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
    [switch]$Headless
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not $Config) {
    $Config = Join-Path $repoRoot "node\config.yaml"
}

$nodeExe = Join-Path $repoRoot "node\otix-node.exe"
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
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

$argsList = @("-config", $Config, "-port", $Port)
if ($Headless) {
    $argsList += "-headless"
}

& $nodeExe @argsList

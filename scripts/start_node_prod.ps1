<#
.SYNOPSIS
    Runs the Otix Production Node daemon connected to the production server.

.DESCRIPTION
    Runs an instance of otix-node that announces itself and communicates with the
    production Otix server (http://84.8.154.67:8000 by default) on port 8091,
    while leaving port 8090 free for the localhost development node.

.PARAMETER Port
    The local HTTP port for the production node (default: 8091).

.PARAMETER Config
    Path to the production config file (default: .\node\config.prod.yaml).

.PARAMETER Headless
    Run without opening the WebUI browser on startup.
#>
param(
    [int]$Port = 8091,
    [string]$Config = "",
    [switch]$Headless
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not $Config) {
    $Config = Join-Path $repoRoot "node\config.prod.yaml"
}

$nodeExe = Join-Path $repoRoot "node\otix-node.exe"
if (-not (Test-Path $nodeExe)) {
    Write-Host "Error: otix-node binary not found at $nodeExe" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host "             OTIX PRODUCTION NODE DAEMON                  " -ForegroundColor Magenta
Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host "  Port:        $Port" -ForegroundColor Gray
Write-Host "  Config:      $Config" -ForegroundColor Gray
Write-Host "  Target:      http://84.8.154.67:8000 (Production)" -ForegroundColor Gray
Write-Host "  Local WebUI: http://localhost:$Port" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host ""

$argsList = @("-config", $Config, "-port", $Port)
if ($Headless) {
    $argsList += "-headless"
}

& $nodeExe @argsList

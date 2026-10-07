<#
.SYNOPSIS
    Runs the Otix Admin Distributed Compute Worker locally to help the production server process heavy workloads.

.DESCRIPTION
    Offloads artwork evaluation, theme classification, WebP transcoding, and Wikidata/Wikipedia
    metadata enrichment from the production server to this local workstation.

.PARAMETER Server
    The target Otix production server URL (default: http://84.8.154.67:8000).

.PARAMETER Username
    The admin compute worker account username (default: worker).

.PARAMETER Password
    The admin compute worker account password (default: worker).

.PARAMETER Threads
    Number of worker threads (default: 16).

.PARAMETER BatchSize
    Number of media items to claim per batch (default: 300).

.PARAMETER Task
    Task mode: artwork, embeddings, or both (default: artwork).
#>
param(
    [string]$Server = "http://84.8.154.67:8000",
    [string]$Username = "worker",
    [string]$Password = "worker",
    [int]$Threads = 16,
    [int]$BatchSize = 500,
    [string]$Task = "artwork"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "        OTIX LOCAL WORKER -> PRODUCTION RUNNER            " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Server:     $Server" -ForegroundColor Gray
Write-Host "  Task:       $Task" -ForegroundColor Gray
Write-Host "  Threads:    $Threads" -ForegroundColor Gray
Write-Host "  Batch Size: $BatchSize" -ForegroundColor Gray
Write-Host ""

# Find Python 3.12+
$pythonExe = $null
if (Get-Command python3.12.exe -ErrorAction SilentlyContinue) {
    $pythonExe = "python3.12.exe"
} elseif (Get-Command python3.exe -ErrorAction SilentlyContinue) {
    $pythonExe = "python3.exe"
} elseif (Get-Command python.exe -ErrorAction SilentlyContinue) {
    $pythonExe = "python.exe"
}

if (-not $pythonExe) {
    Write-Host "Error: Python executable not found in PATH." -ForegroundColor Red
    exit 1
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $repoRoot "backend\scripts\admin_worker.py"
if (-not (Test-Path $scriptPath)) {
    Write-Host "Error: Worker script not found at $scriptPath" -ForegroundColor Red
    exit 1
}

& $pythonExe $scriptPath `
    --server $Server `
    --username $Username `
    --password $Password `
    --threads $Threads `
    --batch-size $BatchSize `
    --task $Task

<#
.SYNOPSIS
    Runs the Otix Distributed Compute Worker CLI on Windows.

.DESCRIPTION
    Launches the Otix worker engine for GPU semantic embeddings (BAAI/bge-m3),
    artwork transcoding, Wikidata/Wikipedia metadata offloading, or catalog hydration.
    Includes Smart Gaming Auto-Throttle (detects games on GPU and backs off automatically).

.EXAMPLE
    .\scripts\start_worker.ps1                    # Launches interactive Otix control menu
    .\scripts\start_worker.ps1 start              # Starts worker in dual mode (embeddings + artwork)
    .\scripts\start_worker.ps1 stats              # Shows live server status, catalog & storage telemetry
    .\scripts\start_worker.ps1 benchmark          # Benchmarks RTX GPU encoding speed & full catalog ETA
    .\scripts\start_worker.ps1 start -Workload 50 # Sets GPU workload slider to 50% (gaming friendly)
#>
[CmdletBinding(PositionalBinding = $false)]
param(
    [Parameter(Position = 0)]
    [string]$Command = "",

    [string]$Server = "http://84.8.154.67:8000",
    [string]$Username = "worker",
    [string]$Password = "worker",
    [int]$Threads = 16,
    [int]$BatchSize = 200,
    [int]$Workload = 85,
    [string]$Task = "both",
    [int]$MaxBatches = 0,
    [switch]$NoChat,
    [switch]$NoAutoThrottle,
    [switch]$LowPriority,
    [switch]$Benchmark,
    [switch]$Stats,
    [switch]$Hydrate,
    [switch]$Interactive,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RemainingArgs
)

$ErrorActionPreference = "Stop"

# Find best Python 3.12+ with CUDA/Torch
$pythonExe = $null
if (Get-Command python.exe -ErrorAction SilentlyContinue) {
    $pythonExe = "python.exe"
} elseif (Get-Command python3.12.exe -ErrorAction SilentlyContinue) {
    $pythonExe = "python3.12.exe"
} elseif (Get-Command python3.exe -ErrorAction SilentlyContinue) {
    $pythonExe = "python3.exe"
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

# Resolve flags / shortcuts
$pyArgs = @()
$subcommand = ""

if ($Benchmark -or $Command -in @("benchmark", "bench")) {
    $subcommand = "benchmark"
} elseif ($Stats -or $Command -in @("stats", "status")) {
    $subcommand = "stats"
} elseif ($Hydrate -or $Command -eq "hydrate") {
    $subcommand = "hydrate"
} elseif ($Interactive -or $Command -in @("interactive", "ui", "menu")) {
    $subcommand = "interactive"
} elseif ($Command -in @("start", "worker", "run")) {
    $subcommand = "start"
} elseif ($Command -ne "") {
    $subcommand = $Command
}

if ($subcommand) {
    $pyArgs += $subcommand
}

# Add server connection parameters for subcommands that accept them
if ($subcommand -ne "interactive") {
    if ($Server) { $pyArgs += @("--server", $Server) }
    if ($Username) { $pyArgs += @("--username", $Username) }
    if ($Password) { $pyArgs += @("--password", $Password) }
}

# Add worker-specific execution parameters only when starting a worker run
if ($subcommand -in @("", "start", "worker", "run")) {
    if ($Task) { $pyArgs += @("--task", $Task) }
    if ($BatchSize) { $pyArgs += @("--batch-size", $BatchSize) }
    if ($Threads) { $pyArgs += @("--threads", $Threads) }
    if ($Workload) { $pyArgs += @("--workload", $Workload) }
    if ($MaxBatches -gt 0) { $pyArgs += @("--max-batches", $MaxBatches) }
    if ($NoChat) { $pyArgs += "--no-chat" }
    if ($NoAutoThrottle) { $pyArgs += "--no-auto-throttle" }
    if ($LowPriority) { $pyArgs += "--low-priority" }
}

if ($RemainingArgs) {
    $pyArgs += $RemainingArgs
}

& $pythonExe $scriptPath @pyArgs


<#
.SYNOPSIS
    Runs Otix Node locally with hot reload / auto-recompile on file changes.

.DESCRIPTION
    Monitors node/ source files (*.go, *.yaml, *.json, *.html). Upon any modification,
    it re-compiles the development executable incrementally and seamlessly restarts
    the daemon while streaming real-time logs to the console.

.PARAMETER Port
    The local HTTP server port (default: 8090).

.PARAMETER Config
    Path to the local YAML configuration (default: node/config.yaml).

.PARAMETER Headless
    Run without auto-opening the browser.

.PARAMETER BuildOnly
    Run a single incremental build and exit immediately.

.EXAMPLE
    .\scripts\dev_node.ps1
    .\scripts\dev_node.ps1 -Port 8090 -Headless
#>
param(
    [int]$Port = 8090,
    [string]$Config = "",
    [switch]$Headless,
    [switch]$BuildOnly,
    [switch]$ForceDocker
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$nodeDir = Join-Path $repoRoot "node"
$devExe = Join-Path $nodeDir "otix-node-dev.exe"

if (-not $Config) {
    # Check if a persistent claimed config exists in AppData
    $appDataConfig = Join-Path $env:APPDATA "otix\config.yaml"
    $nodeConfig = Join-Path $nodeDir "config.yaml"
    if (Test-Path $appDataConfig) {
        $content = Get-Content $appDataConfig -Raw -ErrorAction SilentlyContinue
        if ($content -match 'claimed:\s*true' -or $content -match 'auth_token:\s*["''][a-zA-Z0-9_-]+["'']') {
            $Config = $appDataConfig
        }
    }
    if (-not $Config) {
        $Config = $nodeConfig
    }
}
if (-not (Test-Path $Config)) {
    if (Test-Path (Join-Path $nodeDir "config.example.yaml")) {
        Copy-Item (Join-Path $nodeDir "config.example.yaml") $Config
        Write-Host "[Dev] Created configuration from template: $Config" -ForegroundColor Yellow
    }
}

$hasNativeGo = (Get-Command go -ErrorAction SilentlyContinue) -ne $null
$hasDocker = (Get-Command docker -ErrorAction SilentlyContinue) -ne $null

if ($ForceDocker) {
    $hasNativeGo = $false
}

if (-not $hasNativeGo -and -not $hasDocker) {
    Write-Error "Neither native Go nor Docker was found. Install Go (winget install GoLang.Go) or start Docker."
    exit 1
}

$buildTool = if ($hasNativeGo) { "Native Go (host)" } else { "Docker golang:1.24-alpine (cached)" }

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "             OTIX NODE LOCAL AUTO-RELOAD RUNNER           " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Local Port:   $Port" -ForegroundColor Gray
Write-Host "  WebUI URL:    http://localhost:$Port" -ForegroundColor Green
Write-Host "  Config:       $Config" -ForegroundColor Gray
Write-Host "  Toolchain:    $buildTool" -ForegroundColor Gray
Write-Host "  Auto-Reload:  Active (watching node/ for changes)" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

function Build-NodeExecutable {
    param([ref]$compileDurationMs)

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $success = $false

    if ($hasNativeGo) {
        Push-Location $nodeDir
        try {
            $env:CGO_ENABLED = "0"
            $env:GOOS = "windows"
            $env:GOARCH = "amd64"
            $buildOut = & go build -o $devExe . 2>&1
            if ($LASTEXITCODE -eq 0) {
                $success = $true
            } else {
                Write-Host ""
                Write-Host "[Compilation Error]" -ForegroundColor Red
                $buildOut | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
                Write-Host ""
            }
        }
        finally {
            Pop-Location
        }
    } else {
        $dockerCmd = "CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -o /repo/node/otix-node-dev.exe ."
        $dockerRun = & docker run --rm `
            -v "${repoRoot}:/repo" `
            -v otix_go_mod:/go/pkg/mod `
            -v otix_go_cache:/root/.cache/go-build `
            -w /repo/node `
            golang:1.24-alpine `
            sh -c $dockerCmd 2>&1

        if ($LASTEXITCODE -eq 0) {
            $success = $true
        } else {
            Write-Host ""
            Write-Host "[Docker Compilation Error]" -ForegroundColor Red
            $dockerRun | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
            Write-Host ""
        }
    }

    $sw.Stop()
    $compileDurationMs.Value = $sw.ElapsedMilliseconds
    return $success
}

# 1. Initial build
Write-Host "[Dev] Running initial compilation..." -ForegroundColor Gray
$dur = 0
$ok = Build-NodeExecutable ([ref]$dur)
if (-not $ok) {
    Write-Error "Initial compilation failed. Please fix errors and try again."
    exit 1
}
Write-Host "  Initial build completed in ${dur}ms" -ForegroundColor Green

if ($BuildOnly) {
    Write-Host "[Dev] BuildOnly switch passed. Exiting." -ForegroundColor Cyan
    exit 0
}

# 2. Process Manager
$script:runningProcess = $null

function Start-DevNode {
    if ($script:runningProcess -and -not $script:runningProcess.HasExited) {
        Stop-DevNode
    }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $devExe
    $argsList = "-config `"$Config`" -port $Port"
    if ($Headless) {
        $argsList += " -headless"
    }
    $psi.Arguments = $argsList
    $psi.WorkingDirectory = $nodeDir
    $psi.UseShellExecute = $false

    try {
        $script:runningProcess = [System.Diagnostics.Process]::Start($psi)
        Write-Host "[Dev] Server started (PID: $($script:runningProcess.Id)) at http://localhost:$Port" -ForegroundColor Cyan
    } catch {
        Write-Host "[Dev] Failed to start process: $_" -ForegroundColor Red
    }
}

function Stop-DevNode {
    if ($script:runningProcess) {
        try {
            if (-not $script:runningProcess.HasExited) {
                $script:runningProcess.Kill()
                $script:runningProcess.WaitForExit(1500) | Out-Null
            }
        } catch {
            # Ignore exit race
        }
        $script:runningProcess = $null
    }

    # Ensure any lingering instance on the port is stopped
    Get-Process -Name "otix-node-dev" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

# Start the node initially
Start-DevNode

# 3. File System Watcher setup
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $nodeDir
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true
$watcher.NotifyFilter = [System.IO.NotifyFilters]::FileName -bor 
                        [System.IO.NotifyFilters]::LastWrite -bor 
                        [System.IO.NotifyFilters]::CreationTime

$isRelevant = {
    param([string]$path)
    if ([string]::IsNullOrWhiteSpace($path)) { return $false }
    $ext = [System.IO.Path]::GetExtension($path).ToLower()
    $validExts = @('.go', '.yaml', '.yml', '.json', '.html', '.svg', '.png', '.ico')
    if (-not ($validExts -contains $ext)) { return $false }

    $lower = $path.ToLower()
    if ($lower -match '\\dist\\' -or 
        $lower -match '\\storage\\' -or 
        $lower -match '\\logs\\' -or 
        $lower -match '\\bin\\' -or 
        $lower -match '\\\.git\\' -or
        $lower -match 'config.*\.ya?ml$' -or
        $lower -match 'otix-node-dev\.exe' -or
        $lower -match 'otix-node\.exe' -or
        $lower -match '\.syso$' -or
        $lower -match '\.tmp$') {
        return $false
    }
    return $true
}

$script:lastChangeTime = [DateTime]::MinValue
$script:changedFiles = [System.Collections.Generic.HashSet[string]]::new()
$script:changeLock = [object]::new()

$changeHandler = {
    param($source, $e)
    $path = $e.FullPath
    if (& $isRelevant $path) {
        [System.Threading.Monitor]::Enter($script:changeLock)
        try {
            $script:lastChangeTime = [DateTime]::UtcNow
            $rel = [System.IO.Path]::GetRelativePath($nodeDir, $path)
            [void]$script:changedFiles.Add($rel)
        }
        finally {
            [System.Threading.Monitor]::Exit($script:changeLock)
        }
    }
}

$subChanged = Register-ObjectEvent -InputObject $watcher -EventName "Changed" -Action $changeHandler
$subCreated = Register-ObjectEvent -InputObject $watcher -EventName "Created" -Action $changeHandler
$subRenamed = Register-ObjectEvent -InputObject $watcher -EventName "Renamed" -Action $changeHandler

Write-Host ""
Write-Host "[Dev] Watching for file changes in node/ ... Press Ctrl+C to terminate." -ForegroundColor DarkGray
Write-Host ""

try {
    while ($true) {
        Start-Sleep -Milliseconds 250

        $doReload = $false
        $filesToReport = @()

        [System.Threading.Monitor]::Enter($script:changeLock)
        try {
            if ($script:lastChangeTime -ne [DateTime]::MinValue) {
                $elapsed = ([DateTime]::UtcNow - $script:lastChangeTime).TotalMilliseconds
                if ($elapsed -ge 350) {
                    $doReload = $true
                    $filesToReport = @($script:changedFiles)
                    $script:changedFiles.Clear()
                    $script:lastChangeTime = [DateTime]::MinValue
                }
            }
        }
        finally {
            [System.Threading.Monitor]::Exit($script:changeLock)
        }

        if ($doReload) {
            $changedSummary = $filesToReport -join ", "
            Write-Host ""
            Write-Host "----------------------------------------------------------" -ForegroundColor Yellow
            Write-Host "[Auto-Reload] Change detected in: $changedSummary" -ForegroundColor Yellow
            Write-Host "  Recompiling Otix Node..." -ForegroundColor Gray

            $rebuildMs = 0
            $built = Build-NodeExecutable ([ref]$rebuildMs)
            if ($built) {
                Write-Host "  Recompile succeeded in ${rebuildMs}ms. Restarting daemon..." -ForegroundColor Green
                Start-DevNode
                Write-Host "----------------------------------------------------------" -ForegroundColor Yellow
            } else {
                Write-Host "  Build failed. Keeping previous server running until errors are fixed." -ForegroundColor Red
                Write-Host "----------------------------------------------------------" -ForegroundColor Yellow
            }
        }
    }
}
finally {
    Write-Host ""
    Write-Host "[Dev] Stopping Otix Node development daemon..." -ForegroundColor Yellow
    Stop-DevNode

    # Unregister watchers
    Unregister-Event -SourceIdentifier $subChanged.Name -ErrorAction SilentlyContinue
    Unregister-Event -SourceIdentifier $subCreated.Name -ErrorAction SilentlyContinue
    Unregister-Event -SourceIdentifier $subRenamed.Name -ErrorAction SilentlyContinue
    $watcher.Dispose()

    Write-Host "[Dev] Development server shut down cleanly." -ForegroundColor Green
}

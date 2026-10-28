<#
.SYNOPSIS
    Builds the production Windows executable (otix-node.exe) for Otix Node.

.DESCRIPTION
    Compiles a standalone, optimized Windows x64 binary with embedded application
    icon, PE version metadata, and production linker flags (-s -w).
    Automatically uses native Go if installed, or falls back to Docker (golang:1.24-alpine).

.PARAMETER Version
    The version string to embed in the binary (default: "0.1.0").

.PARAMETER OutputName
    The name of the executable to produce in dist\node\ (default: "otix-node-windows-amd64.exe").

.PARAMETER PackageZip
    When specified, creates a production distribution zip package in dist\node\.

.PARAMETER SyncRootExe
    When specified (or by default), copies the compiled executable to node\otix-node.exe.
#>
param(
    [string]$Version = "0.1.0",
    [string]$OutputName = "otix-node-windows-amd64.exe",
    [switch]$PackageZip,
    [bool]$SyncRootExe = $true,
    [bool]$NoConsole = $true
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeDir = Split-Path -Parent $scriptDir
$repoRoot = Split-Path -Parent $nodeDir
$distDir = Join-Path $repoRoot "dist\node"
$buildTime = (Get-Date).ToString("yyyy-MM-dd")

if (-not (Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir -Force | Out-Null
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       OTIX NODE WINDOWS PRODUCTION BUILD PIPELINE        " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Version:     $Version" -ForegroundColor Gray
Write-Host "  Build Date:  $buildTime" -ForegroundColor Gray
Write-Host "  Target OS:   windows/amd64" -ForegroundColor Gray
Write-Host "  Output:      $distDir\$OutputName" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

$hasNativeGo = (Get-Command go -ErrorAction SilentlyContinue) -ne $null
$hasDocker = (Get-Command docker -ErrorAction SilentlyContinue) -ne $null

if (-not $hasNativeGo -and -not $hasDocker) {
    Write-Error "Neither Go nor Docker is installed or available in PATH. Please install Go (winget install GoLang.Go) or start Docker."
    exit 1
}

$iconPath = Join-Path $repoRoot "desktop\assets\icon.ico"
$versionInfoJson = Join-Path $nodeDir "versioninfo.json"

if (-not (Test-Path $versionInfoJson)) {
    Write-Host "==> Creating versioninfo.json..." -ForegroundColor Yellow
    $vInfo = @{
        FixedFileInfo = @{
            FileVersion = @{ Major = 0; Minor = 1; Patch = 0; Build = 0 }
            ProductVersion = @{ Major = 0; Minor = 1; Patch = 0; Build = 0 }
            FileFlagsMask = "3f"
            FileFlags = "00"
            FileOS = "040004"
            FileType = "01"
            FileSubType = "00"
        }
        StringFileInfo = @{
            Comments = "Otix Node Game Host and Save Sync Daemon"
            CompanyName = "Otix"
            FileDescription = "Otix Node Daemon"
            FileVersion = "$Version.0"
            InternalName = "otix-node"
            LegalCopyright = "Copyright (c) 2026 Otix"
            LegalTrademarks = "Otix"
            OriginalFilename = "otix-node.exe"
            ProductName = "Otix Node"
            ProductVersion = $Version
        }
        VarFileInfo = @{
            Translation = @{
                LangID = "0409"
                CharsetID = "04B0"
            }
        }
        IconPath = "../desktop/assets/icon.ico"
    }
    $vInfo | ConvertTo-Json -Depth 5 | Set-Content -Path $versionInfoJson -Encoding UTF8
}

$targetOutFile = Join-Path $distDir $OutputName

if ($hasNativeGo) {
    Write-Host "==> Building using native Go..." -ForegroundColor Green
    Push-Location $nodeDir
    try {
        $gopath = (go env GOPATH).Trim()
        $goBinDir = Join-Path $gopath "bin"
        if ($env:PATH -notlike "*$goBinDir*") {
            $env:PATH = "$goBinDir;$env:PATH"
        }
        $hasGoVersionInfo = (Get-Command goversioninfo -ErrorAction SilentlyContinue) -ne $null
        if (-not $hasGoVersionInfo) {
            Write-Host "    Installing goversioninfo tool..." -ForegroundColor Yellow
            go install github.com/josephspurrier/goversioninfo/cmd/goversioninfo@latest
        }
        goversioninfo -platform-specific=true
        $guiFlag = if ($NoConsole) { "-H=windowsgui" } else { "" }
        $ldflags = "-s -w $guiFlag -X main.Version=$Version -X main.BuildTime=$buildTime".Trim()
        $env:CGO_ENABLED = "0"
        $env:GOOS = "windows"
        $env:GOARCH = "amd64"
        go build "-ldflags=$ldflags" -o $targetOutFile .
    }
    finally {
        Pop-Location
    }
} else {
    Write-Host "==> Building using Docker container (golang:1.24-alpine)..." -ForegroundColor Green
    $guiFlag = if ($NoConsole) { "-H=windowsgui" } else { "" }
    $dockerLdflags = "-s -w $guiFlag -X main.Version=$Version -X main.BuildTime=$buildTime".Trim()
    $dockerCmd = "go install github.com/josephspurrier/goversioninfo/cmd/goversioninfo@latest && goversioninfo -platform-specific=true && CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags='$dockerLdflags' -o /repo/dist/node/$OutputName ."
    
    docker run --rm `
        -v "${repoRoot}:/repo" `
        -w /repo/node `
        golang:1.24-alpine `
        sh -c $dockerCmd
        
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Docker Go compilation failed."
        exit $LASTEXITCODE
    }
}

if (-not (Test-Path $targetOutFile)) {
    Write-Error "Build failed: output binary not found at $targetOutFile"
    exit 1
}

$fileItem = Get-Item $targetOutFile
$sizeMB = [math]::Round($fileItem.Length / 1MB, 2)
Write-Host "    Successfully compiled: $targetOutFile ($sizeMB MB)" -ForegroundColor Green

if ($SyncRootExe) {
    # Synchronize to node local folder
    $rootExe = Join-Path $nodeDir "otix-node.exe"
    Copy-Item -Path $targetOutFile -Destination $rootExe -Force
    Write-Host "    Synchronized to: $rootExe" -ForegroundColor Green
}

Remove-Item (Join-Path $nodeDir "resource_windows_*.syso") -Force -ErrorAction SilentlyContinue

if ($PackageZip) {
    $zipPath = Join-Path $distDir "Otix-Node-Windows-x64.zip"
    if (Test-Path $zipPath) {
        Remove-Item $zipPath -Force
    }
    Write-Host "==> Packaging distribution zip archive: $zipPath..." -ForegroundColor Yellow
    
    $stagingDir = Join-Path $distDir "Otix-Node-Windows-x64"
    if (Test-Path $stagingDir) {
        Remove-Item $stagingDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $stagingDir | Out-Null
    
    Copy-Item -Path $targetOutFile -Destination (Join-Path $stagingDir "otix-node.exe")
    Copy-Item -Path (Join-Path $nodeDir "README.md") -Destination $stagingDir
    if (Test-Path (Join-Path $nodeDir "config.example.yaml")) {
        Copy-Item -Path (Join-Path $nodeDir "config.example.yaml") -Destination $stagingDir
    }
    if (Test-Path (Join-Path $nodeDir "config.prod.yaml")) {
        Copy-Item -Path (Join-Path $nodeDir "config.prod.yaml") -Destination $stagingDir
    }
    
    Compress-Archive -Path "$stagingDir\*" -DestinationPath $zipPath -Force
    Remove-Item $stagingDir -Recurse -Force
    
    $zipItem = Get-Item $zipPath
    $zipMB = [math]::Round($zipItem.Length / 1MB, 2)
    Write-Host "    Created zip archive: $zipPath ($zipMB MB)" -ForegroundColor Green

}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Binary Properties Verification:" -ForegroundColor Cyan
$info = (Get-Item $targetOutFile).VersionInfo
Write-Host "  Product Name:     $($info.ProductName)" -ForegroundColor Gray
Write-Host "  File Description: $($info.FileDescription)" -ForegroundColor Gray
Write-Host "  Company:          $($info.CompanyName)" -ForegroundColor Gray
Write-Host "  File Version:     $($info.FileVersion)" -ForegroundColor Gray
Write-Host "  Product Version:  $($info.ProductVersion)" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Production binary ready for deployment!" -ForegroundColor Green
Write-Host ""

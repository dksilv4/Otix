<#
.SYNOPSIS
    Registers Otix as a Media Player in Windows Default Apps and Default Programs.

.DESCRIPTION
    Configures Windows Registry entries so that Otix is recognized by Windows 10/11
    as a registered Media Player application. This allows Otix to appear in:
      - Windows Settings > Apps > Default apps
      - Default video player and music player selectors
      - "Open with" context menus for audio and video files
      - File type association pickers (.mp4, .mkv, .avi, .mp3, etc.)

.PARAMETER OtixPath
    Path to Otix.exe. If omitted, the script auto-detects installed instances.

.PARAMETER AllUsers
    Register machine-wide (HKLM). Requires Administrator privileges.
    If not specified, automatically uses HKLM if elevated, or HKCU if non-elevated.

.PARAMETER Unregister
    Removes Otix media player and file association registrations from Windows.

.PARAMETER OpenSettings
    Opens Windows Settings > Default Apps upon completion.

.EXAMPLE
    .\scripts\register-default-media-player.ps1
    .\scripts\register-default-media-player.ps1 -OpenSettings
    .\scripts\register-default-media-player.ps1 -Unregister
#>

[CmdletBinding()]
param(
    [string]$OtixPath,
    [switch]$AllUsers,
    [switch]$Unregister,
    [switch]$OpenSettings
)

$ErrorActionPreference = 'Stop'

function Test-IsAdmin {
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$isAdmin = Test-IsAdmin

# Determine hive
$hive = if ($AllUsers -or ($isAdmin -and !$PSBoundParameters.ContainsKey('AllUsers'))) {
    'HKLM'
} else {
    'HKCU'
}

$regHivePath = if ($hive -eq 'HKLM') { 'HKLM:' } else { 'HKCU:' }

Write-Host "=== Otix Windows Media Player Registration ===" -ForegroundColor Cyan
Write-Host "Target Registry Hive: $hive ($regHivePath)" -ForegroundColor Gray

# Extensions and MIME types to register for media playback
$mediaExtensions = @(
    # Video containers
    '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.3gp', '.ts',
    # Audio containers
    '.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.opus', '.wma'
)

$mimeAssociations = @{
    'video/mp4'        = 'Otix.AssocFile'
    'video/x-matroska' = 'Otix.AssocFile'
    'video/webm'       = 'Otix.AssocFile'
    'video/quicktime'  = 'Otix.AssocFile'
    'video/x-msvideo'  = 'Otix.AssocFile'
    'audio/mpeg'       = 'Otix.AssocFile'
    'audio/flac'       = 'Otix.AssocFile'
    'audio/wav'        = 'Otix.AssocFile'
    'audio/ogg'        = 'Otix.AssocFile'
    'audio/aac'        = 'Otix.AssocFile'
    'audio/mp4'        = 'Otix.AssocFile'
}

function Refresh-ShellIcons {
    try {
        $cSharpSource = 'using System; using System.Runtime.InteropServices; public class ShellNotifier { [DllImport("shell32.dll", CharSet = CharSet.Auto, SetLastError = true)] public static extern void SHChangeNotify(int wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2); }'
        Add-Type -TypeDefinition $cSharpSource -ErrorAction SilentlyContinue
        [ShellNotifier]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero) # SHCNE_ASSOCCHANGED
    } catch {
        # Fallback if shell32 P/Invoke is not accessible
    }
}

if ($Unregister) {
    Write-Host "Unregistering Otix Media Player registrations..." -ForegroundColor Yellow

    $keysToDelete = @(
        "$regHivePath\Software\Clients\Media\Otix",
        "$regHivePath\Software\Otix\Capabilities",
        "$regHivePath\Software\Classes\Otix.AssocFile",
        "$regHivePath\Software\Classes\Applications\Otix.exe"
    )

    foreach ($k in $keysToDelete) {
        if (Test-Path $k) {
            Remove-Item -Path $k -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "  Removed: $k" -ForegroundColor DarkGray
        }
    }

    $registeredAppsKey = "$regHivePath\Software\RegisteredApplications"
    if (Test-Path $registeredAppsKey) {
        Remove-ItemProperty -Path $registeredAppsKey -Name "Otix" -ErrorAction SilentlyContinue
        Write-Host "  Removed 'Otix' from RegisteredApplications" -ForegroundColor DarkGray
    }

    foreach ($ext in $mediaExtensions) {
        $openWithKey = "$regHivePath\Software\Classes\$ext\OpenWithProgids"
        if (Test-Path $openWithKey) {
            Remove-ItemProperty -Path $openWithKey -Name "Otix.AssocFile" -ErrorAction SilentlyContinue
        }
    }

    Refresh-ShellIcons
    Write-Host "Otix media player registration has been successfully removed." -ForegroundColor Green
    return
}

# ── Locate Otix.exe ──────────────────────────────────────────────────────────
if ([string]::IsNullOrWhiteSpace($OtixPath)) {
    $searchCandidates = @(
        "$env:LOCALAPPDATA\Programs\Otix\Otix.exe",
        "C:\Program Files\Otix\Otix.exe",
        "$PSScriptRoot\..\dist\desktop\win-unpacked\Otix.exe",
        "$PSScriptRoot\..\desktop\release\win-unpacked\Otix.exe",
        "$PSScriptRoot\..\desktop\dist\Otix.exe"
    )

    $existing = $searchCandidates | Where-Object { Test-Path $_ } | Sort-Object { (Get-Item $_).LastWriteTime } -Descending
    if ($existing.Count -gt 0) {
        $OtixPath = (Resolve-Path $existing[0]).Path
    }
}

if ([string]::IsNullOrWhiteSpace($OtixPath) -or !(Test-Path $OtixPath)) {
    Write-Error "Could not find Otix.exe. Please pass -OtixPath 'C:\path\to\Otix.exe'."
    return
}

$OtixPath = [System.IO.Path]::GetFullPath($OtixPath)
$otixDir = [System.IO.Path]::GetDirectoryName($OtixPath)
$iconPath = [System.IO.Path]::Combine($otixDir, "resources", "assets", "icon.ico")
if (!(Test-Path $iconPath)) {
    $iconPath = [System.IO.Path]::Combine($PSScriptRoot, "..", "desktop", "assets", "icon.ico")
    if (Test-Path $iconPath) {
        $iconPath = (Resolve-Path $iconPath).Path
    } else {
        $iconPath = $OtixPath
    }
}

Write-Host "Found executable : $OtixPath" -ForegroundColor Green
Write-Host "Using icon       : $iconPath" -ForegroundColor Gray

# ── Registry Helpers ────────────────────────────────────────────────────────
function Ensure-Key($path) {
    if (!(Test-Path $path)) {
        New-Item -Path $path -Force | Out-Null
    }
}

function Set-Value($path, $name, $value, $type = "String") {
    Ensure-Key $path
    Set-ItemProperty -Path $path -Name $name -Value $value -Type $type -Force | Out-Null
}

function Set-DefaultValue($path, $value) {
    Ensure-Key $path
    Set-Item -Path $path -Value $value -Force | Out-Null
}

# 1. Register under RegisteredApplications
Write-Host "Configuring RegisteredApplications..." -ForegroundColor Gray
Set-Value "$regHivePath\Software\RegisteredApplications" "Otix" "Software\Clients\Media\Otix\Capabilities"

# 2. Register under Clients\Media\Otix (Standard Windows Media Player Client)
Write-Host "Configuring Windows Media Client registration..." -ForegroundColor Gray
$mediaClientKey = "$regHivePath\Software\Clients\Media\Otix"
Set-DefaultValue $mediaClientKey "Otix"
Set-Value $mediaClientKey "LocalizedString" "Otix"

# Media Client Install Info
$installInfoKey = "$mediaClientKey\InstallInfo"
Set-Value $installInfoKey "IconsVisible" 1 "DWord"

$openWithFileCmd = '"{0}" "%1"' -f $OtixPath
$launchExeCmd = '"{0}"' -f $OtixPath

# Media Client Default Icon & Shell Open
Set-DefaultValue "$mediaClientKey\DefaultIcon" "$iconPath,0"
Set-DefaultValue "$mediaClientKey\shell\open\command" $launchExeCmd

# 3. Configure Capabilities (both under Clients\Media\Otix\Capabilities and Software\Otix\Capabilities)
$capabilityPaths = @(
    "$mediaClientKey\Capabilities",
    "$regHivePath\Software\Otix\Capabilities"
)

foreach ($capPath in $capabilityPaths) {
    Set-Value $capPath "ApplicationName" "Otix"
    Set-Value $capPath "ApplicationDescription" "Otix Media Player and Library"

    # FileAssociations
    $fileAssocKey = "$capPath\FileAssociations"
    foreach ($ext in $mediaExtensions) {
        Set-Value $fileAssocKey $ext "Otix.AssocFile"
    }

    # MIMEAssociations
    $mimeAssocKey = "$capPath\MIMEAssociations"
    foreach ($entry in $mimeAssociations.GetEnumerator()) {
        Set-Value $mimeAssocKey $entry.Key $entry.Value
    }
}

# 4. ProgID: Otix.AssocFile
Write-Host "Configuring Otix.AssocFile ProgID..." -ForegroundColor Gray
$progIdKey = "$regHivePath\Software\Classes\Otix.AssocFile"
Set-DefaultValue $progIdKey "Otix Media File"
Set-Value $progIdKey "FriendlyTypeName" "Otix Media File"
Set-DefaultValue "$progIdKey\DefaultIcon" "$iconPath,0"
Set-DefaultValue "$progIdKey\shell\open\command" $openWithFileCmd

# 5. Application registration: Software\Classes\Applications\Otix.exe
Write-Host "Configuring Applications\Otix.exe..." -ForegroundColor Gray
$appKey = "$regHivePath\Software\Classes\Applications\Otix.exe"
Set-Value $appKey "FriendlyAppName" "Otix"
Set-DefaultValue "$appKey\DefaultIcon" "$iconPath,0"
Set-DefaultValue "$appKey\shell\open\command" $openWithFileCmd

$supportedTypesKey = "$appKey\SupportedTypes"
foreach ($ext in $mediaExtensions) {
    Set-Value $supportedTypesKey $ext ""
}

# 6. Add OpenWithProgids to media extensions
Write-Host "Adding OpenWithProgids for media file extensions..." -ForegroundColor Gray
foreach ($ext in $mediaExtensions) {
    $openWithKey = "$regHivePath\Software\Classes\$ext\OpenWithProgids"
    Set-Value $openWithKey "Otix.AssocFile" ""
}

# 7. Notify Windows Shell of association updates
Write-Host "Broadcasting SHChangeNotify..." -ForegroundColor Gray
Refresh-ShellIcons

Write-Host ""
Write-Host "[OK] Otix is now registered as a Media Player in Windows!" -ForegroundColor Green
Write-Host "You can now select Otix in 'Settings > Apps > Default apps' under Video player, Music player, or file types." -ForegroundColor White

if ($OpenSettings) {
    Write-Host "Opening Windows Default Apps settings..." -ForegroundColor Cyan
    Start-Process "ms-settings:defaultapps"
}

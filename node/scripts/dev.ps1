<#
.SYNOPSIS
    Runs Otix Node locally with auto-reload (delegates to scripts/dev_node.ps1).
#>
param(
    [int]$Port = 8090,
    [string]$Config = "",
    [switch]$Headless,
    [switch]$BuildOnly,
    [switch]$ForceDocker
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeDir = Split-Path -Parent $scriptDir
$repoRoot = Split-Path -Parent $nodeDir
$devRunner = Join-Path $repoRoot "scripts\dev_node.ps1"

$params = @{}
if ($PSBoundParameters.ContainsKey('Port')) { $params['Port'] = $Port }
if ($PSBoundParameters.ContainsKey('Config')) { $params['Config'] = $Config }
if ($Headless) { $params['Headless'] = $true }
if ($BuildOnly) { $params['BuildOnly'] = $true }
if ($ForceDocker) { $params['ForceDocker'] = $true }

& $devRunner @params

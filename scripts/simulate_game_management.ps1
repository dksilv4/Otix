<#
.SYNOPSIS
    Runs the Otix Game Management Simulation CLI (Dry Run).

.DESCRIPTION
    Scans a real folder (or sample releases) to detect games, ISOs, installers,
    updates, and DLCs, applies Otix naming templates, and previews reorganization
    with ZERO disk modifications.

.PARAMETER Dir
    Path to real folder to scan (e.g. -Dir "D:\Games" or -Dir "C:\Downloads").

.PARAMETER Preset
    Naming template preset: standard, clean_game_folder, flat_title, scene_release, year_subfolder.

.PARAMETER Template
    Custom naming template string (e.g. "{Title} ({Year})/{Title}.{ext}").

.PARAMETER Sample
    Run in sample mode with simulated scene/repack releases.

.PARAMETER Json
    Output raw JSON for machine processing.

.EXAMPLE
    .\scripts\simulate_game_management.ps1 -Sample
    .\scripts\simulate_game_management.ps1 -Dir "D:\Games" -Preset clean_game_folder
#>
param(
    [string]$Dir = "",
    [string]$Preset = "standard",
    [string]$Template = "",
    [switch]$Sample,
    [switch]$Json,
    [int]$Depth = 4,
    [string]$ResolveConflicts = "",
    [int]$Scale = 0
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $PSScriptRoot "simulate-game-management.js"

$argsList = @($scriptPath)

if ($Dir) {
    $argsList += @("--dir", $Dir)
}
if ($Preset) {
    $argsList += @("--preset", $Preset)
}
if ($Template) {
    $argsList += @("--template", $Template)
}
if ($Sample) {
    $argsList += @("--sample")
}
if ($Scale -gt 0) {
    $argsList += @("--scale", "$Scale")
}
if ($Json) {
    $argsList += @("--json")
}
if ($Depth -ne 4) {
    $argsList += @("--depth", "$Depth")
}
if ($ResolveConflicts) {
    $argsList += @("--resolve-conflicts", "$ResolveConflicts")
}

node $argsList

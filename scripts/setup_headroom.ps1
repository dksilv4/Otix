#Requires -RunAsAdministrator
# ==============================================================================
# Headroom AI + DeepSeek Full Setup Script for Windows (Simplified)
# ==============================================================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Headroom AI Full Setup (Windows)    " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# STEP 1: Check and Install Rust
# ------------------------------------------------------------------------------
Write-Host "`n[1/3] Checking for Rust..." -ForegroundColor Yellow

if (!(Get-Command rustc -ErrorAction SilentlyContinue)) {
    Write-Host "Rust not found. Installing via winget..." -ForegroundColor Cyan
    winget install --id Rustlang.Rustup --silent --accept-package-agreements --accept-source-agreements
    
    # Dynamically refresh the PATH so we don't need to restart the terminal
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    Write-Host "Rust installed and PATH refreshed." -ForegroundColor Green
} else {
    Write-Host "Rust is already installed." -ForegroundColor Green
}

# ------------------------------------------------------------------------------
# STEP 2: Install Headroom AI
# ------------------------------------------------------------------------------
Write-Host "`n[2/3] Installing Headroom AI..." -ForegroundColor Yellow

python -m pip install --upgrade pip -q
pip install "headroom-ai[all]" --upgrade

Write-Host "Headroom AI installed successfully." -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 3: Configure & Launch
# ------------------------------------------------------------------------------
Write-Host "`n[3/3] Configuring DeepSeek V4 Pro and Launching..." -ForegroundColor Yellow

# Standard Anthropic SDK Auth Variable (Warning: careful hardcoding keys in plain text!)
$env:ANTHROPIC_API_KEY = "sk-78cd8c85b07443eb958307775a82abfb"

# Route traffic to DeepSeek's Anthropic compatibility layer
$env:ANTHROPIC_BASE_URL = "https://api.deepseek.com/anthropic"
$env:ANTHROPIC_TARGET_API_URL = "https://api.deepseek.com/anthropic" # Fallback for proxy routing

# Map DeepSeek V4 Pro/Flash models to Claude's internal subagent variables
$env:ANTHROPIC_DEFAULT_OPUS_MODEL = "deepseek-v4-pro[1m]"
$env:ANTHROPIC_DEFAULT_SONNET_MODEL = "deepseek-v4-pro[1m]"
$env:ANTHROPIC_DEFAULT_HAIKU_MODEL = "deepseek-v4-flash"
$env:CLAUDE_CODE_SUBAGENT_MODEL = "deepseek-v4-flash"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Launching Claude Code via Headroom  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Locate the explicit Python user/system Scripts path to bypass unconfigured environment PATHs
$pythonPath = (Get-Command python.exe).Source
$pythonDir = Split-Path $pythonPath -Parent
$headroomExe = Join-Path $pythonDir "Scripts\headroom.exe"

# Fallback check for Python base installation if it's in a different execution alias directory
if (!(Test-Path $headroomExe)) {
    $userScripts = Join-Path $env:APPDATA "Python\Python311\Scripts\headroom.exe" # common fallback location
    if (Test-Path $userScripts) { $headroomExe = $userScripts }
}

# Run it directly inside the terminal using the full absolute path
if (Test-Path $headroomExe) {
    & $headroomExe wrap claude
} else {
    # Absolute ultimate fallback if Windows path handling is completely blocked: 
    # invoke headroom directly as a Python module execution script
    python -m headroom.cli wrap claude
}
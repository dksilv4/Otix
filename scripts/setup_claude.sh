#!/bin/bash

# 1. Clean the slate of old variables
unset ANTHROPIC_API_KEY
unset ANTHROPIC_MODEL
unset CLAUDE_CODE_USE_FOUNDRY
unset ANTHROPIC_FOUNDRY_BASE_URL
unset ANTHROPIC_FOUNDRY_API_KEY

# 2. Setup your keys for Claude Code
export ANTHROPIC_AUTH_TOKEN="sk-78cd8c85b07443eb958307775a82abfb"

# 3. Explicitly tell Headroom's proxy where to route its traffic!
# (This replaces the broken CLI flag)
export ANTHROPIC_TARGET_API_URL="https://api.deepseek.com/anthropic"

# 4. Map the models
export ANTHROPIC_DEFAULT_OPUS_MODEL="deepseek-v4-pro[1m]"
export ANTHROPIC_DEFAULT_SONNET_MODEL="deepseek-v4-pro[1m]"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="deepseek-v4-flash"
export CLAUDE_CODE_SUBAGENT_MODEL="deepseek-v4-flash"

# 5. Launch cleanly!
headroom wrap claude
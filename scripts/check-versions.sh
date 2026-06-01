#!/usr/bin/env bash
# Pre-commit hook: require version bump only for areas that changed.
# - Backend files changed   → backend version must be bumped
# - Frontend src changed    → frontend version must be bumped
# - Electron files changed  → frontend version must be bumped (same package.json)
# - No relevant files changed → always allow
#
# Exits 0 (allow), 1 (block).

set -euo pipefail

# --- helpers ---

staged_files() {
    git diff --cached --name-only --diff-filter=ACMR
}

has_staged() {
    # Return 0 if any staged file matches the glob pattern.
    local pattern="$1"
    staged_files | grep -qE "$pattern" 2>/dev/null
}

get_version() {
    # Extract version from a staged file.
    local file="$1"
    git show ":$file" 2>/dev/null \
        | grep -E '^\s*"version"\s*[:=]|^version\s*=' \
        | head -1 \
        | sed -E 's/.*"version"\s*[:=]\s*"([^"]+)".*/\1/' \
        | sed -E 's/^version\s*=\s*"([^"]+)"/\1/'
}

check_version() {
    # Compare staged version vs HEAD version. Returns 0 if bumped or new, 1 if unchanged.
    local file="$1"
    local label="$2"

    local staged_version
    staged_version=$(get_version "$file")

    if [ -z "$staged_version" ]; then
        echo "  $label: WARNING — could not detect version in $file"
        return 1
    fi

    local head_version
    head_version=$(git show "HEAD:$file" 2>/dev/null | grep -E '^\s*"version"\s*[:=]|^version\s*=' | head -1 | sed -E 's/.*"version"\s*[:=]\s*"([^"]+)".*/\1/' | sed -E 's/^version\s*=\s*"([^"]+)"/\1/')

    if [ -z "$head_version" ]; then
        echo "  $label: $staged_version (new, allowing)"
        return 0
    fi

    if [ "$staged_version" != "$head_version" ]; then
        echo "  $label: $head_version → $staged_version [OK]"
        return 0
    else
        echo "  $label: $staged_version (unchanged) [FAIL]"
        return 1
    fi
}

# --- detect changed areas ---

backend_changed=false
frontend_changed=false
electron_changed=false

if has_staged '^backend/'; then
    backend_changed=true
fi

if has_staged '^frontend/src/'; then
    frontend_changed=true
fi

if has_staged '^frontend/electron/'; then
    electron_changed=true
fi

# --- if nothing relevant changed, allow ---

if ! $backend_changed && ! $frontend_changed && ! $electron_changed; then
    echo "Version check: no backend/frontend/electron changes detected — skipping."
    exit 0
fi

# --- check required bumps ---

echo "Checking version bumps..."
echo "  Backend files changed: $backend_changed"
echo "  Frontend src changed:  $frontend_changed"
echo "  Electron files changed: $electron_changed"
echo ""

block=0

if $backend_changed; then
    if ! check_version "backend/pyproject.toml" "backend"; then
        block=1
    fi
fi

# Frontend and Electron share package.json, so only check once.
if $frontend_changed || $electron_changed; then
    if ! check_version "frontend/package.json" "frontend"; then
        block=1
    fi
fi

if [ $block -eq 0 ]; then
    echo ""
    echo "Version check passed."
    exit 0
fi

echo ""
echo "COMMIT BLOCKED: version must be bumped for changed areas (see [FAIL] above)."
echo "Use --no-verify to bypass (not recommended)."
exit 1

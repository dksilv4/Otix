#!/bin/sh
set -e

# Sync new build files into the persistent html directory
# This preserves older hashed chunks while updating index.html and root files
if [ -d "/usr/share/nginx/html_dist" ]; then
    mkdir -p /usr/share/nginx/html/assets

    # Copy root files (index.html, robots.txt, favicon, etc.), replacing previous ones
    cp -f /usr/share/nginx/html_dist/* /usr/share/nginx/html/ 2>/dev/null || true

    # Copy new hashed assets into /assets, without deleting existing hashed assets
    cp -f /usr/share/nginx/html_dist/assets/* /usr/share/nginx/html/assets/ 2>/dev/null || true

    # Prune assets older than 14 days to keep volume size bounded
    find /usr/share/nginx/html/assets -type f -mtime +14 -delete 2>/dev/null || true
fi

exec "$@"

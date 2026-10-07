#!/bin/bash
# Batch convert a list of TSX files to use SCSS instead of inline Tailwind
# Usage: bash _batch-convert.sh <file1.tsx> <file2.tsx> ...
# Run from src/ directory

for file in "$@"; do
  # Skip if not a tsx file or doesn't exist
  [[ ! -f "$file" ]] && continue

  dir=$(dirname "$file")
  basename=$(basename "$file" .tsx)
  scss_file="$dir/$basename.scss"

  # Skip if SCSS already exists (already converted)
  [[ -f "$scss_file" ]] && continue

  echo "Processing: $file"

  # Calculate relative path to _tailwind-ref.css
  depth=$(echo "$dir" | tr '/' '\n' | wc -l)
  # Remove leading ./
  dir_clean="${dir#./}"
  dir_depth=$(echo "$dir_clean" | tr -cd '/' | wc -c)
  dir_depth=$((dir_depth + 1))

  ref_path=""
  for ((i=0; i<dir_depth; i++)); do
    ref_path="$ref_path../"
  done
  ref_path="${ref_path}_tailwind-ref.css"

  # Extract a component prefix from the filename
  # Remove common suffixes
  prefix=$(echo "$basename" | sed -E 's/-(page|section|panel|form|modal|card|button|input|field|badge|list|item|row|grid|detail|hero|menu|nav|search|tabs|bar|state|badge|renderer|display|showcase|timeline|filters|actions|composer|sync|profile|section|breakdown|distribution|achievements|hall-of-fame|streak|mood|library|rating|follow|button|inline|preview|heatmap)//g')
  prefix=$(echo "$prefix" | sed -E 's/^(about|admin|auth|browse|company|discover|downloads|experiments|game|interaction|library|list|media|navigation|notifications|person|review|settings|title-bar|user|workout)-//')

  echo "  -> Component prefix: $prefix, ref: $ref_path"
done

echo "Done"

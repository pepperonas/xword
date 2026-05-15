#!/usr/bin/env bash
# Build script: minify JS assets into dist/ for production deployment.
#
# Produces a parallel directory structure under dist/ that's drop-in
# compatible with the source layout — same paths, just smaller files.
# JS is minified, CSS/HTML/JSON/SVG/PNG are copied unchanged.
#
# Run BEFORE rsync to /var/www/xword.celox.io/.
set -euo pipefail

cd "$(dirname "$0")/.."

# Generate version.json so dist/ is shippable on its own.
bash scripts/bump-version.sh

DIST=dist
rm -rf "$DIST"
mkdir -p "$DIST"

echo "=== Copying static assets ==="
# Mirror everything we ship; rsync skips dev/repo plumbing.
rsync -a \
  --exclude='dist/' \
  --exclude='.git/' --exclude='.gitignore' --exclude='.github/' \
  --exclude='generator/' --exclude='tests/' --exclude='server/' \
  --exclude='scripts/' --exclude='node_modules/' \
  --exclude='CLAUDE.md' --exclude='README.md' \
  --exclude='package.json' --exclude='package-lock.json' \
  --exclude='.DS_Store' --exclude='.playwright-mcp/' \
  ./ "$DIST/"

echo "=== Minifying JS ==="
total_before=0
total_after=0
for src in "$DIST"/assets/*.js "$DIST"/sw.js; do
  [ -f "$src" ] || continue
  before=$(wc -c < "$src")
  total_before=$((total_before + before))
  # esbuild minify in-place
  npx --no-install esbuild "$src" --minify --target=es2020 --allow-overwrite --outfile="$src.min" >/dev/null
  mv "$src.min" "$src"
  after=$(wc -c < "$src")
  total_after=$((total_after + after))
  printf "  %-30s %7d → %7d bytes  (%2d%%)\n" "$(basename "$src")" "$before" "$after" "$((100 - 100 * after / before))"
done
echo
printf "  %-30s %7d → %7d bytes  (%2d%%)\n" "total" "$total_before" "$total_after" "$((100 - 100 * total_after / total_before))"

# Gzipped sizes for the wire metric
gz_total=0
for src in "$DIST"/assets/*.js; do
  [ -f "$src" ] || continue
  gz=$(gzip -c "$src" | wc -c | tr -d ' ')
  gz_total=$((gz_total + gz))
done
echo
echo "On-wire (gzip): ${gz_total} bytes total"
echo
echo "dist/ is ready. Deploy with:"
echo "  rsync -avz --delete dist/ root@69.62.121.168:/var/www/xword.celox.io/"

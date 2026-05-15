#!/usr/bin/env bash
# Generates version.json from the current Git state.
# Run before deploying so the frontend can display "Ver. N".
set -e

cd "$(dirname "$0")/.."

if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "warn: not in a git repo — using fallback version"
  COMMITS="0"
  COMMIT="dev"
else
  COMMITS=$(git rev-list --count HEAD)
  COMMIT=$(git rev-parse --short HEAD)
fi

DATE=$(date -u +%Y-%m-%d)

cat > version.json <<JSON
{
  "version": ${COMMITS},
  "commit": "${COMMIT}",
  "date": "${DATE}"
}
JSON

echo "version.json → Ver. ${COMMITS} (${COMMIT})"

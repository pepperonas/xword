#!/usr/bin/env bash
# Daily SQLite snapshot for xword-api.
# - Uses `.backup` (not cp) so we get a consistent file even under WAL load.
# - Compresses with gzip.
# - Keeps the last 14 days; older snapshots are pruned.
set -euo pipefail

DB="${DB_PATH:-/opt/xword-api/data/xword.db}"
DEST="${BACKUP_DIR:-/var/backups/xword}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
STAMP="$(date -u +%Y-%m-%d)"

mkdir -p "$DEST"

# Use sqlite3 .backup → consistent snapshot even with concurrent writers.
TMP="$DEST/.staging-$STAMP.db"
sqlite3 "$DB" ".backup '$TMP'"

# Compress and atomically rename.
gzip -9 "$TMP"
mv "$TMP.gz" "$DEST/xword-$STAMP.db.gz"

# Rotation: delete files older than RETAIN_DAYS days.
find "$DEST" -maxdepth 1 -type f -name 'xword-*.db.gz' -mtime "+$RETAIN_DAYS" -delete

# Print summary (captured by systemd journal).
echo "[$(date -u +%FT%TZ)] backup → $DEST/xword-$STAMP.db.gz"
ls -lh "$DEST" | tail -n +2 | head -20

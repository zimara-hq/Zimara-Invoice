#!/bin/sh
# Daily encrypted backup of the database. Invoices must be kept at least 6 years.
# Cron example: 0 3 * * * /opt/zimara/deploy/backup.sh
set -eu
STAMP=$(date +%Y%m%d-%H%M)
OUT=/opt/zimara/backups/zimara-$STAMP.sql.gz.gpg
mkdir -p /opt/zimara/backups
docker compose -f /opt/zimara/docker-compose.yml exec -T db pg_dump -U zimara zimara | gzip | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file /opt/zimara/.backup-pass -o "$OUT"
# Copy $OUT off the server (another KSA region or storage bucket) — a backup on the same disk is not a backup.

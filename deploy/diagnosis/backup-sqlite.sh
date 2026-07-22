#!/bin/bash
# =============================================================================
# Backup script for Enterprise Diagnosis SQLite database
# =============================================================================
set -e

SOURCE="/opt/xingmei/diagnosis/data/diagnosis.sqlite"
DEST_DIR="/opt/xingmei/diagnosis/backups"
TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
BACKUP_FILE="${DEST_DIR}/diagnosis-${TIMESTAMP}.sqlite"

# Create backup directory if not exists
mkdir -p "${DEST_DIR}"

# Check if source exists
if [ ! -f "${SOURCE}" ]; then
    echo "Source database not found at ${SOURCE}"
    exit 1
fi

# Use flock to prevent concurrent backups
(
    flock -x 200 || exit 1

    # Copy database
    cp "${SOURCE}" "${BACKUP_FILE}"

    # Run integrity check
    if ! sqlite3 "${BACKUP_FILE}" "PRAGMA integrity_check;" | grep -q "ok"; then
        echo "Integrity check failed for ${BACKUP_FILE}"
        rm -f "${BACKUP_FILE}"
        exit 1
    fi

    # Clean old backups (keep last 14)
    cd "${DEST_DIR}"
    ls -1t diagnosis-*.sqlite | tail -n +15 | xargs -r rm

    echo "Backup created: ${BACKUP_FILE}"
    echo "Integrity check: PASSED"
) 200>/var/lock/xingmei-diagnosis-backup.lock

exit 0

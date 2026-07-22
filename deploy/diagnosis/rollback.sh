#!/bin/bash
# =============================================================================
# Rollback script for Enterprise Diagnosis Agent
# =============================================================================

DEPLOY_ROOT="/opt/xingmei/diagnosis"
SHARED="${DEPLOY_ROOT}/shared"

# Read current and previous from state file
if [ -f "${SHARED}/deployment-state.json" ]; then
    PREVIOUS=$(cat "${SHARED}/deployment-state.json" | grep -oP '"previous_commit":\s*"\K[^"]+' || echo "")
    CURRENT=$(cat "${SHARED}/deployment-state.json" | grep -oP '"current_commit":\s*"\K[^"]+' || echo "")
else
    echo "No deployment state found"
    exit 1
fi

echo "=== ROLLBACK ==="
echo "Previous: ${PREVIOUS}"
echo "Current: ${CURRENT}"

# Stop current service
echo "Stopping xingmei-diagnosis..."
pm2 stop xingmei-diagnosis 2>/dev/null || true
pm2 delete xingmei-diagnosis 2>/dev/null || true

# Switch to previous release
if [ -n "${PREVIOUS}" ] && [ -d "${DEPLOY_ROOT}/releases/${PREVIOUS}" ]; then
    echo "Switching to previous release: ${PREVIOUS}"
    rm -f "${DEPLOY_ROOT}/current"
    ln -s "${DEPLOY_ROOT}/releases/${PREVIOUS}" "${DEPLOY_ROOT}/current"
    
    # Update symlink in state
    cat > "${SHARED}/deployment-state.json" << EOF
{
  "current_commit": "${PREVIOUS}",
  "previous_commit": "${CURRENT}",
  "deployed_at": "$(date -Iseconds)"
}
EOF
else
    echo "No previous release found. Just stopping service."
fi

# Restart with previous
echo "Starting xingmei-diagnosis..."
cd "${DEPLOY_ROOT}/current"
pm2 start ecosystem.config.js || pm2 restart xingmei-diagnosis

# Wait for ready
sleep 5
pm2 save

echo "=== ROLLBACK COMPLETE ==="

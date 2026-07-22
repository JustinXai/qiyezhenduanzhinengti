#!/bin/bash
# =============================================================================
# Start script for Enterprise Diagnosis Agent
# =============================================================================
set -a
source /opt/xingmei/diagnosis/shared/.env.production
set +a

cd /opt/xingmei/diagnosis/current

# Set PORT from env or use default
export PORT=${PORT:-3710}
export HOST=127.0.0.1

exec pnpm start

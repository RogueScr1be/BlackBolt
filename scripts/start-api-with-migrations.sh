#!/bin/bash
set -euo pipefail

echo "[api-boot] Applying pending database migrations..."
npm run prisma:migrate:deploy

echo "[api-boot] Database migrations complete. Starting API service..."
exec npm run api:start:prod

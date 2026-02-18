#!/usr/bin/env bash
set -euo pipefail

role="${SERVICE_ROLE:-api}"

# Railpack in this project shape does not always execute a workspace build step.
# Ensure runtime artifacts exist before launching either role.
npm run api:build

case "${role}" in
  api)
    exec npm run api:start:prod
    ;;
  worker)
    exec npm run worker:start:prod
    ;;
  *)
    echo "Unsupported SERVICE_ROLE='${role}'. Expected 'api' or 'worker'." >&2
    exit 1
    ;;
esac

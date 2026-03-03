#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/wpforms-db-forward-sync.env"
PHP_BIN="${PHP_BIN:-php}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}" >&2
  echo "Copy wpforms-db-forward-sync.env.example to wpforms-db-forward-sync.env and fill values." >&2
  exit 2
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

exec "${PHP_BIN}" "${SCRIPT_DIR}/wpforms-db-forward-sync.php" "$@"

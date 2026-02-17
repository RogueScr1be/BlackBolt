#!/usr/bin/env bash
set -euo pipefail

ALLOW_BEHIND=0
NO_FETCH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --allow-behind)
      ALLOW_BEHIND=1
      shift
      ;;
    --no-fetch)
      NO_FETCH=1
      shift
      ;;
    -h|--help)
      cat <<'EOF'
Usage: bash scripts/operator/open-latest.sh [--allow-behind] [--no-fetch]

Launches Operator from source (swift run) with a latest-build guard:
  - compares local HEAD to origin/main
  - blocks launch if behind main (unless --allow-behind)

Options:
  --allow-behind  Launch even when local HEAD != origin/main
  --no-fetch      Skip 'git fetch origin' before SHA comparison
EOF
      exit 0
      ;;
    *)
      echo "[operator-open] Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
APP_DIR="${REPO_ROOT}/clients/swift/BlackBoltOperator"

if [[ ! -d "${APP_DIR}" ]]; then
  echo "[operator-open] Missing app directory: ${APP_DIR}" >&2
  exit 1
fi

if [[ "${NO_FETCH}" -eq 0 ]]; then
  echo "[operator-open] Fetching origin/main..."
  git -C "${REPO_ROOT}" fetch origin --quiet
fi

LOCAL_SHA="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
REMOTE_SHA="$(git -C "${REPO_ROOT}" rev-parse origin/main)"

echo "[operator-open] local HEAD : ${LOCAL_SHA}"
echo "[operator-open] origin/main: ${REMOTE_SHA}"

if [[ "${LOCAL_SHA}" != "${REMOTE_SHA}" ]]; then
  echo "[operator-open] BEHIND_MAIN: local checkout is not latest main."
  if [[ "${ALLOW_BEHIND}" -ne 1 ]]; then
    echo "[operator-open] Refusing launch. Sync branch first, or rerun with --allow-behind."
    exit 3
  fi
  echo "[operator-open] Override enabled; continuing launch."
else
  echo "[operator-open] UP_TO_DATE"
fi

echo "[operator-open] Launching Operator from source..."
cd "${APP_DIR}"
swift run

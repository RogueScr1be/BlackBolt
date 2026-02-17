#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
APP_NAME="BlackBolt Operator.app"
SRC_APP="${ROOT_DIR}/dist/${APP_NAME}"
DEST_DIR="${HOME}/Applications"
DEST_APP="${DEST_DIR}/${APP_NAME}"
AUTO_OPEN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --open)
      AUTO_OPEN=1
      shift
      ;;
    -h|--help)
      cat <<'EOF'
Usage: bash scripts/operator/install-macos-app.sh [--open]

Builds and installs BlackBolt Operator.app into ~/Applications.
EOF
      exit 0
      ;;
    *)
      echo "[operator:install] Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

cd "${ROOT_DIR}"
npm run operator:package

if [[ ! -d "${SRC_APP}" ]]; then
  echo "[operator:install] Missing app bundle: ${SRC_APP}" >&2
  exit 1
fi

mkdir -p "${DEST_DIR}"
rm -rf "${DEST_APP}"
cp -R "${SRC_APP}" "${DEST_APP}"
echo "[operator:install] Installed ${DEST_APP}"

if [[ "${AUTO_OPEN}" -eq 1 ]]; then
  open "${DEST_APP}"
fi

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ALLOWLIST_FILE="${ROOT_DIR}/docs/soslactation/phase2-commit-allowlist.txt"

if [[ ! -f "${ALLOWLIST_FILE}" ]]; then
  echo "ERROR: allowlist file missing: ${ALLOWLIST_FILE}" >&2
  exit 1
fi

ALLOWLIST=()
while IFS= read -r line; do
  [[ -z "${line}" ]] && continue
  ALLOWLIST+=("${line}")
done < "${ALLOWLIST_FILE}"

for file in "${ALLOWLIST[@]}"; do
  if [[ ! -e "${ROOT_DIR}/${file}" ]]; then
    echo "ERROR: allowlist path does not exist: ${file}" >&2
    exit 1
  fi
done

cd "${ROOT_DIR}"

git add -- "${ALLOWLIST[@]}"

echo "Staged allowlist files:"
git diff --cached --name-only -- "${ALLOWLIST[@]}"

echo

echo "Unstaged non-allowlist changes remain untouched."

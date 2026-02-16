#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PKG_DIR="${ROOT_DIR}/clients/swift/BlackBoltOperator"
APP_NAME="BlackBolt Operator"
APP_BUNDLE="${ROOT_DIR}/dist/${APP_NAME}.app"
CONTENTS_DIR="${APP_BUNDLE}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
RESOURCES_DIR="${CONTENTS_DIR}/Resources"

mkdir -p "${ROOT_DIR}/dist"

cd "${PKG_DIR}"
swift build -c release
BIN_DIR="$(swift build -c release --show-bin-path)"
BINARY_PATH="${BIN_DIR}/BlackBoltOperator"

if [ ! -x "${BINARY_PATH}" ]; then
  echo "[operator:package] expected binary missing: ${BINARY_PATH}"
  exit 1
fi

rm -rf "${APP_BUNDLE}"
mkdir -p "${MACOS_DIR}" "${RESOURCES_DIR}"
cp "${BINARY_PATH}" "${MACOS_DIR}/BlackBoltOperator"

cat > "${CONTENTS_DIR}/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>BlackBoltOperator</string>
  <key>CFBundleIdentifier</key>
  <string>com.blackbolt.operator</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>BlackBolt Operator</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

ICON_PATH="${PKG_DIR}/Assets/AppIcon.icns"
if [ -f "${ICON_PATH}" ]; then
  cp "${ICON_PATH}" "${RESOURCES_DIR}/AppIcon.icns"
  /usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string AppIcon" "${CONTENTS_DIR}/Info.plist" >/dev/null 2>&1 || true
fi

echo "[operator:package] built ${APP_BUNDLE}"

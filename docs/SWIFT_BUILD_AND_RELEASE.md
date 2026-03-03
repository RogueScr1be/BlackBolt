# BlackBolt Operator Swift macOS Build and Release Guide

## Table of Contents
1. [Build Process Overview](#build-process-overview)
2. [Building for Development](#building-for-development)
3. [Building for Release](#building-for-release)
4. [Creating .app Bundle](#creating-app-bundle)
5. [Code Signing](#code-signing)
6. [Release Process Step-by-Step](#release-process-step-by-step)
7. [Versioning Strategy](#versioning-strategy)
8. [Automated Release](#automated-release)
9. [Distribution](#distribution)
10. [Rollback Procedure](#rollback-procedure)

## Build Process Overview

### Compilation and Linking

BlackBolt Operator uses Swift Package Manager for building:

```
Source Code (Swift)
    ↓
Swift Compiler (swiftc)
    ├─ Syntax analysis
    ├─ Type checking
    ├─ IR generation
    └─ LLVM compilation
    ↓
Object Files (.o)
    ↓
Linker (ld)
    ├─ Link dependencies
    ├─ Resolve symbols
    └─ Generate executable
    ↓
Executable (BlackBoltOperator)
    ↓
Asset bundling
    ├─ Copy resources
    ├─ Create .app structure
    └─ Code signing
    ↓
Distribution Package
```

### Dependency Resolution

Swift Package Manager resolves dependencies at build time:

```
Package.swift (Manifest)
    ↓
Dependency Resolution
    ├─ Local: BlackBoltAPI (../BlackBoltAPI)
    └─ Remote: swift-crypto (3.1.0+)
    ↓
Download/Link dependencies
    ↓
Generate build plan
    ↓
Compile all targets
```

### Asset Bundling

Resources included in build:

```
.build/[config]/BlackBoltOperator
├── Executable binary
└── Resources/
    ├── MockResponses.json (test fixtures)
    ├── SampleData.json (test data)
    ├── ConfigurationSamples.json (test configs)
    └── TestCertificates/ (test TLS certs)
```

### Bundle Structure

The .app bundle follows macOS standards:

```
BlackBoltOperator.app/
├── Contents/
│   ├── MacOS/
│   │   └── BlackBoltOperator (executable)
│   ├── Resources/
│   │   ├── (optional assets)
│   │   └── (application data)
│   ├── Frameworks/
│   │   └── (linked frameworks)
│   ├── _CodeSignature/
│   │   └── CodeResources (code signature manifest)
│   └── Info.plist (bundle configuration)
└── (macOS adds additional metadata)
```

## Building for Development

### Debug Build

Optimized for development with debugging symbols and no optimizations:

```bash
# Basic debug build
swift build

# Output: .build/debug/BlackBoltOperator
```

**Build time**: 30-60 seconds on first build, 5-15 seconds incremental

**Debug Features**:
- No optimizations (fast compilation)
- Full debugging symbols (DWARF format)
- Assertions enabled
- Logging enabled
- Memory sanitizers available

**Build output**:
```bash
Building BlackBoltOperator v1.0.0
Building for debugging...
Build complete! (XX seconds)
Product: '.build/debug/BlackBoltOperator'
```

### Debug Configuration

**Xcode Scheme Configuration** (if using Xcode):

```
Product > Scheme > Edit Scheme > Run
├─ Build Configuration: Debug
├─ Executable: BlackBoltOperator
├─ Arguments:
│   └─ Environment Variables:
│       ├─ LOG_LEVEL=debug
│       ├─ ENABLE_NETWORK_LOGGING=true
│       └─ API_BASE_URL=https://localhost:8443
└─ Diagnostics:
    ├─ Address Sanitizer: On
    ├─ Thread Sanitizer: Off
    └─ Memory Management: On
```

### Verbose Output

See what the compiler is doing:

```bash
swift build -v

# Output shows:
# - Dependency resolution
# - Compilation commands
# - Linking commands
# - Total build time
```

### Building with Strict Warnings

Enforce strict Swift compiler warnings:

```bash
swift build --strict-warnings

# Treats all warnings as errors
# Forces code quality during development
```

### Building with Sanitizers

Detect runtime issues:

```bash
# Address Sanitizer (memory errors)
swift build -Xswiftc -g -Xswiftc -sanitize=address

# Thread Sanitizer (data races)
swift build -Xswiftc -g -Xswiftc -sanitize=thread

# Undefined Behavior Sanitizer
swift build -Xswiftc -g -Xswiftc -sanitize=undefined
```

**Running with Address Sanitizer**:
```bash
swift run BlackBoltOperator
# Output shows memory issues if any:
# ==ASAN:DEADLYSIGNAL==
# ERROR: AddressSanitizer: heap-buffer-overflow
```

## Building for Release

### Release Build Command

Optimized for performance and size:

```bash
# Build release version
swift build -c release

# Output: .build/release/BlackBoltOperator
```

**Build time**: 2-5 minutes (includes optimizations)

**Release Features**:
- Full optimizations (-O)
- Symbols stripped (or kept in separate dSYM)
- Assertions disabled
- Logging potentially disabled
- Performance profiling enabled

**Build output**:
```bash
Building BlackBoltOperator v1.0.0
Building for release...
Optimizing...
Build complete! (XXX seconds)
Product: '.build/release/BlackBoltOperator'
```

### Optimization Levels

```bash
# No optimization (debug)
swift build -Xswiftc -Onone

# Optimize for speed (release)
swift build -c release  # Default: -O

# Optimize for size
swift build -c release -Xswiftc -Osize

# Full optimization with whole module optimization
swift build -c release -Xswiftc -O -Xswiftc -whole-module-optimization
```

### Symbol Stripping

**Keep symbols for debugging**:
```bash
# Build with symbols (larger binary)
swift build -c release

# Symbols location: .build/release/BlackBoltOperator.dSYM
```

**Strip symbols for distribution** (if needed):
```bash
# Remove debug symbols from release binary
strip .build/release/BlackBoltOperator

# Or strip selectively
dsymutil .build/release/BlackBoltOperator  # Extract symbols
strip -o .build/release/BlackBoltOperator.stripped \
      .build/release/BlackBoltOperator
```

### Code Signing Requirements

Release builds must be code signed before distribution:

```bash
# Self-signed (development)
codesign -s - .build/release/BlackBoltOperator

# Production certificate
codesign -s "Developer ID Application: Company Name" \
         --options runtime \
         .build/release/BlackBoltOperator

# Verify
codesign -v .build/release/BlackBoltOperator
```

## Creating .app Bundle

### macOS .app Bundle Structure

Create a proper macOS application bundle:

```bash
# 1. Build release executable
swift build -c release

# 2. Create bundle directories
mkdir -p BlackBoltOperator.app/Contents/MacOS
mkdir -p BlackBoltOperator.app/Contents/Resources
mkdir -p BlackBoltOperator.app/Contents/Frameworks

# 3. Copy executable
cp .build/release/BlackBoltOperator \
   BlackBoltOperator.app/Contents/MacOS/BlackBoltOperator

# 4. Make executable
chmod +x BlackBoltOperator.app/Contents/MacOS/BlackBoltOperator
```

### Info.plist Configuration

Create Info.plist with required keys:

```bash
cat > BlackBoltOperator.app/Contents/Info.plist << 'EOF'
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
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSPrincipalClass</key>
    <string>NSApplication</string>
</dict>
</plist>
EOF
```

### Resource Organization

Place resources in the correct location:

```bash
# Copy application resources
cp -r Resources/* BlackBoltOperator.app/Contents/Resources/

# Copy frameworks (if any)
cp -r /path/to/frameworks/* BlackBoltOperator.app/Contents/Frameworks/
```

### Bundle Packaging

Verify bundle is valid:

```bash
# Check bundle structure
ls -la BlackBoltOperator.app/Contents/

# Verify executable exists and is executable
file BlackBoltOperator.app/Contents/MacOS/BlackBoltOperator

# Test bundle can be executed
open BlackBoltOperator.app
```

### Manual vs Automated Bundling

**Manual Bundling** (described above):
- Full control over bundle structure
- Good for understanding macOS bundles
- Suitable for one-off builds

**Automated Bundling** (via script):

```bash
#!/bin/bash
# scripts/bundle-app.sh

set -e

VERSION="1.0.0"
APP_NAME="BlackBoltOperator"
BUNDLE_ID="com.blackbolt.operator"
EXECUTABLE_PATH=".build/release/BlackBoltOperator"
BUNDLE_PATH="${APP_NAME}.app"

echo "Building ${APP_NAME} v${VERSION}..."
swift build -c release

echo "Creating application bundle..."
rm -rf "${BUNDLE_PATH}"
mkdir -p "${BUNDLE_PATH}/Contents/MacOS"
mkdir -p "${BUNDLE_PATH}/Contents/Resources"

cp "${EXECUTABLE_PATH}" "${BUNDLE_PATH}/Contents/MacOS/${APP_NAME}"
chmod +x "${BUNDLE_PATH}/Contents/MacOS/${APP_NAME}"

# Create Info.plist
cat > "${BUNDLE_PATH}/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>${APP_NAME}</string>
    <key>CFBundleIdentifier</key>
    <string>${BUNDLE_ID}</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
</dict>
</plist>
EOF

echo "Bundle created: ${BUNDLE_PATH}"
```

## Code Signing

### Self-Signed Certificate Setup

For development, create a self-signed certificate:

```bash
# Generate self-signed certificate
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365

# Create PKCS12 certificate (for Keychain import)
openssl pkcs12 -export -in cert.pem -inkey key.pem -out certificate.p12

# Import into Keychain
security import certificate.p12 -k ~/Library/Keychains/login.keychain

# List available signing identities
security find-identity -v -p codesigning
```

### Certificate Installation in Keychain

```bash
# Import certificate
security import certificate.p12 \
  -k ~/Library/Keychains/login.keychain \
  -P password  # Password for PKCS12 file

# Verify installation
security find-identity -v -p codesigning | grep "Self"

# Output: "XXXX 123ABC... Self Signed Cert (Self Signed)"
```

### Code Signing Process

**Sign the executable**:

```bash
# Development signing (self-signed)
codesign -s "Self Signed Cert" \
         BlackBoltOperator.app/Contents/MacOS/BlackBoltOperator

# Production signing (Developer ID)
codesign -s "Developer ID Application: Company Name (XXXXXXXXXX)" \
         --options runtime \
         --entitlements entitlements.plist \
         BlackBoltOperator.app

# Sign the entire bundle
codesign -s "Developer ID Application: Company Name (XXXXXXXXXX)" \
         --options runtime \
         --entitlements entitlements.plist \
         BlackBoltOperator.app
```

### Signature Verification

```bash
# Verify signature
codesign -v BlackBoltOperator.app
# Output: valid on disk

# Display signature details
codesign -d -v BlackBoltOperator.app
# Shows: Identifier, Version, Authority, etc.

# Verify with requirements
codesign -d -v --requirements - BlackBoltOperator.app

# Check signature on macOS
spctl -a -v BlackBoltOperator.app
```

### Entitlements Configuration

Create `entitlements.plist` for release builds:

```bash
cat > entitlements.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Sandbox -->
    <key>com.apple.security.app-sandbox</key>
    <true/>
    
    <!-- Network -->
    <key>com.apple.security.network.client</key>
    <true/>
    
    <!-- Keychain -->
    <key>com.apple.security.keychain</key>
    <true/>
    
    <!-- Code signing hardening -->
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <false/>
    <key>com.apple.security.cs.allow-dyld-environment-variables</key>
    <false/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <false/>
</dict>
</plist>
EOF
```

## Release Process Step-by-Step

### 1. Version Bump

Update version numbers:

```bash
# Edit Package.swift
# Change version in package declaration

# Edit Info.plist
# Update CFBundleShortVersionString and CFBundleVersion

# Commit version change
git add Package.swift entitlements.plist
git commit -m "Bump version to 1.0.1"

# Create git tag
git tag -a v1.0.1 -m "Release version 1.0.1"
```

### 2. Build Release

```bash
# Clean build
swift build --clean

# Build release
swift build -c release

# Output location: .build/release/BlackBoltOperator
```

### 3. Create and Sign App Bundle

```bash
# Run bundling script
./scripts/bundle-app.sh

# Sign application
codesign -s "Developer ID Application: Company Name" \
         --options runtime \
         --entitlements entitlements.plist \
         BlackBoltOperator.app

# Verify signature
codesign -v BlackBoltOperator.app
```

### 4. Package Release

```bash
# Create DMG (Disk Image) for distribution
hdiutil create -format UDZO \
               -srcfolder BlackBoltOperator.app \
               -volname "BlackBolt Operator" \
               BlackBoltOperator-1.0.1.dmg

# Or create ZIP archive
ditto -c -k --keepParent BlackBoltOperator.app \
  BlackBoltOperator-1.0.1.zip

# Generate checksums
shasum -a 256 BlackBoltOperator-1.0.1.zip > SHA256SUMS
shasum -a 256 BlackBoltOperator-1.0.1.dmg >> SHA256SUMS
```

### 5. Validate Release

```bash
# Run validation script
./scripts/validate-build.sh

# Checks:
# - Bundle structure valid
# - Signature valid
# - Entitlements present
# - Minimum OS version met
# - All files present

# Test on clean system
# - Download DMG/ZIP
# - Extract and open
# - Run basic functionality test
```

### 6. Create GitHub Release

```bash
# Push tag to repository
git push origin v1.0.1

# Create GitHub release
gh release create v1.0.1 \
  BlackBoltOperator-1.0.1.zip \
  BlackBoltOperator-1.0.1.dmg \
  SHA256SUMS \
  --title "BlackBolt Operator v1.0.1" \
  --notes "Release notes here..."
```

## Versioning Strategy

### Semantic Versioning

Follow SemVer (MAJOR.MINOR.PATCH):

```
MAJOR.MINOR.PATCH
├─ MAJOR: Incompatible changes, major features
├─ MINOR: Backward-compatible features
└─ PATCH: Backward-compatible bug fixes

Examples:
1.0.0 → 1.0.1 (bug fix)
1.0.0 → 1.1.0 (new feature)
1.0.0 → 2.0.0 (breaking change)
```

### Version Bumping Procedures

**Patch Release** (bug fixes):
```bash
# Update version
VERSION="1.0.1"

# Update Package.swift
sed -i '' "s/version: .*/version: \"${VERSION}\"/" Package.swift

# Commit
git commit -am "Release v${VERSION}: Bug fixes"
git tag -a "v${VERSION}" -m "Release v${VERSION}"
```

**Minor Release** (new features):
```bash
VERSION="1.1.0"

# Reset patch version
# Update Package.swift with new version

git commit -am "Release v${VERSION}: New features"
git tag -a "v${VERSION}" -m "Release v${VERSION}"
```

**Major Release** (breaking changes):
```bash
VERSION="2.0.0"

# Update Package.swift with major version
# Update all documentation
# Create migration guide

git commit -am "Release v${VERSION}: Major update"
git tag -a "v${VERSION}" -m "Release v${VERSION}"
```

### Changelog Generation

```bash
# View commits since last release
git log v1.0.0...HEAD --oneline

# Output:
# abc1234 Add feature X
# def5678 Fix bug Y
# ghi9012 Improve performance Z

# Create CHANGELOG.md
cat > CHANGELOG.md << 'EOF'
# Changelog

## [1.1.0] - 2026-03-03
### Added
- New approval filtering system
- Campaign analytics dashboard
- Export reports to CSV

### Fixed
- Keychain timeout issue on system sleep
- Certificate pinning validation false positive
- Memory leak in approval list view

### Changed
- Improved request signing performance
- Updated security audit checks

## [1.0.0] - 2026-02-15
### Initial Release
EOF

git add CHANGELOG.md
git commit -m "Update CHANGELOG for v1.1.0"
```

### Release Notes Format

```markdown
# BlackBolt Operator v1.1.0

## Features
- New approval filtering system
- Campaign analytics dashboard
- Export reports to CSV

## Bug Fixes
- Fixed keychain timeout issue
- Fixed certificate pinning validation false positive

## Security Updates
- Enhanced request signing validation
- Improved memory safety in credential handling

## Installation
Download `BlackBoltOperator-1.1.0.zip` and extract to Applications folder.

## Upgrade Notes
- Existing configurations are automatically migrated
- No action required from users

## Known Issues
- None at this time

## Contributors
- John Doe (Developer)
- Jane Smith (QA)
```

## Automated Release

### GitHub Actions Workflow

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Swift
        uses: swift-actions/setup-swift@v1
        with:
          swift-version: '6.0'
      
      - name: Build Release
        run: |
          swift build -c release
          ./scripts/bundle-app.sh
      
      - name: Sign App
        run: |
          codesign -s - --options runtime BlackBoltOperator.app
      
      - name: Package Release
        run: |
          ditto -c -k --keepParent BlackBoltOperator.app \
            BlackBoltOperator-${GITHUB_REF#refs/tags/}.zip
          shasum -a 256 BlackBoltOperator-*.zip > SHA256SUMS
      
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            BlackBoltOperator-*.zip
            SHA256SUMS
          draft: false
          prerelease: ${{ contains(github.ref, 'alpha') || contains(github.ref, 'beta') }}
```

### Artifact Upload

Uploads signed binaries to GitHub:

```bash
gh release upload v1.1.0 \
  BlackBoltOperator-1.1.0.zip \
  SHA256SUMS
```

## Distribution

### GitHub Releases Download

```bash
# Users download from:
# https://github.com/yourorg/BlackBoltOperator/releases/download/v1.1.0/BlackBoltOperator-1.1.0.zip

# Or via command line
curl -L -o BlackBoltOperator-1.1.0.zip \
  https://github.com/yourorg/BlackBoltOperator/releases/download/v1.1.0/BlackBoltOperator-1.1.0.zip
```

### Installation Instructions

**For Users**:

```
1. Download BlackBoltOperator-1.1.0.zip
2. Extract the ZIP file
3. Open Applications folder
4. Drag BlackBoltOperator.app to Applications
5. Launch from Applications or Spotlight
6. Grant permissions when prompted
7. Configure credentials on first run
```

### Uninstallation Procedures

```bash
# Remove application
rm -rf /Applications/BlackBoltOperator.app

# Clear credentials (if user desires)
security find-identity -v -p codesigning | grep "BlackBolt"
# Delete certificate if needed

# Clear application data
rm -rf ~/Library/Application\ Support/BlackBoltOperator
rm -rf ~/Library/Caches/BlackBoltOperator
```

### Update Procedures

**Check for Updates**:
```bash
# In app or via script
LATEST=$(curl -s https://api.github.com/repos/yourorg/BlackBoltOperator/releases/latest | jq -r '.tag_name')

CURRENT=$(./BlackBoltOperator.app/Contents/MacOS/BlackBoltOperator --version)

if [ "$LATEST" != "$CURRENT" ]; then
    echo "Update available: $LATEST"
fi
```

**Update Installation**:
```bash
# 1. Download new version
# 2. Backup current version
cp -r /Applications/BlackBoltOperator.app \
      /Applications/BlackBoltOperator-backup.app

# 3. Replace with new version
rm -rf /Applications/BlackBoltOperator.app
unzip BlackBoltOperator-${LATEST}.zip
mv BlackBoltOperator.app /Applications/

# 4. Verify update
open /Applications/BlackBoltOperator.app

# 5. If issues, restore backup
# rm -rf /Applications/BlackBoltOperator.app
# mv /Applications/BlackBoltOperator-backup.app \
#    /Applications/BlackBoltOperator.app
```

## Rollback Procedure

### Reverting Releases

If a release has critical issues:

```bash
# 1. Identify previous stable version
git tag -l | sort -V

# Output: v1.0.0, v1.0.1, v1.1.0, v1.1.1

# 2. Mark new release as bad
gh release edit v1.1.1 --draft

# 3. Announce rollback
# Notify users to use previous version

# 4. Checkout previous version
git checkout v1.1.0
git checkout -b hotfix/revert-1.1.1

# 5. Fix issue
# (edit files)

# 6. Bump version for patch
# 1.1.1 → 1.1.2

# 7. Release patch
git commit -am "Release v1.1.2: Fix critical issue"
git tag -a v1.1.2 -m "Emergency patch"
git push origin v1.1.2
```

### Re-releasing Previous Version

If reverting to previous version:

```bash
# 1. Delete the problematic release
gh release delete v1.1.1

# 2. Create re-release of previous version
gh release create v1.1.0-re \
  BlackBoltOperator-1.1.0.zip \
  --title "v1.1.0 (Re-release)" \
  --notes "Previous stable version re-released due to issues in v1.1.1"

# 3. Update documentation to point to this version

# 4. After fixing issue, release proper patch
# v1.1.2 with the fix and new tag
```

---

This build and release guide covers the complete lifecycle from development to distribution. For development instructions, see SWIFT_DEVELOPMENT_GUIDE.md. For security considerations, see SWIFT_SECURITY_GUIDE.md.

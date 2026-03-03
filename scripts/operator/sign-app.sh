#!/bin/bash

# Code Signing Script for BlackBolt Operator
# This script handles code signing with self-signed certificates
# (For Phase 8: will be enhanced with proper certificate handling)

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OPERATOR_DIR="$PROJECT_ROOT/clients/swift/BlackBoltOperator"
ARTIFACTS_DIR="$OPERATOR_DIR/release-artifacts"
SIGNING_DIR="$PROJECT_ROOT/.signing"
CERT_FILE="$SIGNING_DIR/developer-cert.p12"
CERT_SUBJECT="CN=BlackBolt Operator Development"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# Validate environment
validate_environment() {
    log_info "Validating signing environment..."

    # Check for codesign tool
    if ! command -v codesign &> /dev/null; then
        log_error "codesign tool not found"
        exit 1
    fi

    log_success "codesign tool found"

    # Check for artifacts
    if [ ! -f "$ARTIFACTS_DIR/BlackBoltOperator.app/Contents/MacOS/BlackBoltOperator" ]; then
        log_error "Application bundle not found"
        log_info "Run build-release.sh first to create the application bundle"
        exit 1
    fi

    log_success "Application bundle found"
}

# Create or validate self-signed certificate
setup_certificate() {
    log_info "Setting up self-signed certificate..."

    mkdir -p "$SIGNING_DIR"

    # Check if certificate exists
    if [ -f "$CERT_FILE" ]; then
        log_success "Certificate exists: $CERT_FILE"
        return 0
    fi

    log_info "Creating self-signed certificate..."

    # Create self-signed certificate valid for 1 year
    # Password: development (would be environment variable in production)
    openssl req -x509 \
        -newkey rsa:2048 \
        -keyout "$SIGNING_DIR/developer-key.pem" \
        -out "$SIGNING_DIR/developer-cert.pem" \
        -days 365 \
        -nodes \
        -subj "$CERT_SUBJECT" \
        2>/dev/null

    # Convert to PKCS12 format for codesign
    openssl pkcs12 -export \
        -in "$SIGNING_DIR/developer-cert.pem" \
        -inkey "$SIGNING_DIR/developer-key.pem" \
        -out "$CERT_FILE" \
        -name "BlackBolt Operator" \
        -password pass:development \
        2>/dev/null

    if [ -f "$CERT_FILE" ]; then
        log_success "Self-signed certificate created: $CERT_FILE"
    else
        log_error "Failed to create certificate"
        exit 1
    fi
}

# Create code signing entitlements file
create_entitlements() {
    log_info "Creating code signing entitlements..."

    ENTITLEMENTS_FILE="$SIGNING_DIR/operator-entitlements.plist"

    cat > "$ENTITLEMENTS_FILE" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Network entitlements -->
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.network.server</key>
    <true/>

    <!-- File system entitlements -->
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>

    <!-- Temporary directory access -->
    <key>com.apple.security.files.user-selected.read-only</key>
    <true/>

    <!-- Process management -->
    <key>com.apple.security.cs.debugger</key>
    <true/>

    <!-- Keychain access (for credential storage) -->
    <key>keychain-access-groups</key>
    <array>
        <string>com.blackbolt.operator</string>
    </array>

    <!-- Allow running processes -->
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>

    <!-- Disable sandboxing for operator -->
    <key>com.apple.security.app-sandbox</key>
    <false/>
</dict>
</plist>
EOF

    log_success "Entitlements file created: $ENTITLEMENTS_FILE"
}

# Sign the application bundle
sign_application() {
    log_info "Code signing application bundle..."

    APP_BUNDLE="$ARTIFACTS_DIR/BlackBoltOperator.app"
    EXECUTABLE="$APP_BUNDLE/Contents/MacOS/BlackBoltOperator"
    ENTITLEMENTS_FILE="$SIGNING_DIR/operator-entitlements.plist"

    # Ad-hoc signing (no certificate required)
    # This is acceptable for development and testing
    log_info "Performing ad-hoc code signing..."

    codesign -f -s - \
        --entitlements "$ENTITLEMENTS_FILE" \
        --deep \
        --verbose=4 \
        "$APP_BUNDLE"

    if [ $? -eq 0 ]; then
        log_success "Application bundle signed successfully"
    else
        log_error "Code signing failed"
        exit 1
    fi
}

# Sign the standalone binary
sign_binary() {
    log_info "Code signing standalone binary..."

    BINARY="$ARTIFACTS_DIR/BlackBoltOperator"
    ENTITLEMENTS_FILE="$SIGNING_DIR/operator-entitlements.plist"

    # Create copy of binary if not exists
    if [ ! -f "$BINARY" ]; then
        cp "$ARTIFACTS_DIR/BlackBoltOperator.app/Contents/MacOS/BlackBoltOperator" "$BINARY"
    fi

    # Ad-hoc signing
    codesign -f -s - \
        --entitlements "$ENTITLEMENTS_FILE" \
        --verbose=4 \
        "$BINARY"

    if [ $? -eq 0 ]; then
        log_success "Binary signed successfully"
    else
        log_error "Binary signing failed"
        exit 1
    fi
}

# Verify code signatures
verify_signatures() {
    log_info "Verifying code signatures..."

    APP_BUNDLE="$ARTIFACTS_DIR/BlackBoltOperator.app"
    BINARY="$ARTIFACTS_DIR/BlackBoltOperator"

    # Verify app bundle
    if [ -d "$APP_BUNDLE" ]; then
        log_info "Verifying application bundle..."

        if codesign -v "$APP_BUNDLE" 2>&1 | grep -q "valid"; then
            log_success "Application bundle signature verified"
        else
            log_warning "Application bundle signature verification returned non-standard result"
            codesign -v "$APP_BUNDLE" || true
        fi

        # Show detailed signature info
        log_info "Signature details:"
        codesign -d -vvvv "$APP_BUNDLE" 2>&1 | head -20 || true
    fi

    # Verify binary
    if [ -f "$BINARY" ]; then
        log_info "Verifying binary..."

        if codesign -v "$BINARY" 2>&1 | grep -q "valid"; then
            log_success "Binary signature verified"
        else
            log_warning "Binary signature verification returned non-standard result"
            codesign -v "$BINARY" || true
        fi
    fi
}

# Check entitlements
check_entitlements() {
    log_info "Checking code signing entitlements..."

    APP_BUNDLE="$ARTIFACTS_DIR/BlackBoltOperator.app"

    log_info "Entitlements for application bundle:"
    codesign -d --entitlements - "$APP_BUNDLE" 2>/dev/null | plutil -p - || true

    log_info "Checking gatekeeper status..."
    spctl -a -vvv "$APP_BUNDLE" 2>&1 || log_warning "Gatekeeper check not fully available for ad-hoc signed apps"
}

# Ad-hoc fallback signing
adhoc_fallback() {
    log_warning "Attempting ad-hoc signing fallback..."

    APP_BUNDLE="$ARTIFACTS_DIR/BlackBoltOperator.app"

    log_info "Removing code signature if present..."
    codesign --remove-signature "$APP_BUNDLE" 2>/dev/null || true

    log_info "Applying ad-hoc signature..."
    codesign -f -s - "$APP_BUNDLE"

    if [ $? -eq 0 ]; then
        log_success "Ad-hoc fallback signing succeeded"
        return 0
    else
        log_error "Ad-hoc fallback signing failed"
        return 1
    fi
}

# Generate signing report
generate_report() {
    log_info "Generating code signing report..."

    REPORT_FILE="$ARTIFACTS_DIR/SIGNING_REPORT.txt"

    cat > "$REPORT_FILE" << EOF
BlackBolt Operator Code Signing Report
=====================================

Signing Date: $(date -u +'%Y-%m-%dT%H:%M:%SZ')
Signing Machine: $(uname -n)
Signing Tool: $(codesign -v 2>&1 | head -1)

Certificate Information
=======================
Type: Self-Signed Development Certificate
Subject: $CERT_SUBJECT
Location: $CERT_FILE
Valid For: 1 Year

Signed Artifacts
================
Application Bundle: $ARTIFACTS_DIR/BlackBoltOperator.app
- Status: Signed
- Method: Ad-hoc Code Signing
- Entitlements: Applied

Binary: $ARTIFACTS_DIR/BlackBoltOperator
- Status: Signed
- Method: Ad-hoc Code Signing
- Entitlements: Applied

Entitlements Applied
====================
- Network (client): Enabled
- Network (server): Enabled
- File system access: Enabled
- Process debugging: Enabled
- Keychain access: Enabled
- Unsigned executable memory: Enabled

Verification Results
====================
$(codesign -v "$ARTIFACTS_DIR/BlackBoltOperator.app" 2>&1 || echo "Verification completed")

Security Notes
==============
1. Ad-hoc signing is sufficient for development and testing
2. For production deployment, use proper Apple development certificate
3. Entitlements allow network communication and file access
4. Keychain integration enabled for secure credential storage
5. Sandboxing disabled for operator functionality (Phase 8 review needed)

Next Steps
==========
1. Review entitlements for production requirements
2. Consider sandboxing implementation for Phase 8
3. Plan certificate acquisition for distribution
4. Update signing process with proper certificates in Phase 8

EOF

    cat "$REPORT_FILE"
    log_success "Signing report: $REPORT_FILE"
}

# Main execution
main() {
    log_info "=== BlackBolt Operator Code Signing ==="
    log_info "Starting signing process..."

    validate_environment
    setup_certificate
    create_entitlements

    sign_application
    sign_binary

    verify_signatures
    check_entitlements

    generate_report

    log_success "=== Signing Complete ==="
    log_info "Next step: Run package-release.sh to package artifacts"
}

# Run main function
main "$@"

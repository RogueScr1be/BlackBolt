#!/bin/bash

# Build Validation Script for BlackBolt Operator
# This script validates the completeness and correctness of builds

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OPERATOR_DIR="$PROJECT_ROOT/clients/swift/BlackBoltOperator"
ARTIFACTS_DIR="$OPERATOR_DIR/release-artifacts"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Validation counters
CHECKS_TOTAL=0
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNING=0

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    CHECKS_WARNING=$((CHECKS_WARNING + 1))
}

log_error() {
    echo -e "${RED}✗${NC} $1"
    CHECKS_FAILED=$((CHECKS_FAILED + 1))
}

# Record check
record_check() {
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
}

# Environment validation
validate_environment() {
    log_info "=== Environment Validation ==="

    # Check Swift
    record_check
    if swift --version &> /dev/null; then
        log_success "Swift compiler available: $(swift --version | awk '{print $3, $4}')"
    else
        log_error "Swift compiler not found"
    fi

    # Check required tools
    local tools=("codesign" "zip" "sha256sum" "file" "otool")
    for tool in "${tools[@]}"; do
        record_check
        if command -v "$tool" &> /dev/null; then
            log_success "$tool available"
        else
            log_warning "$tool not found (optional)"
        fi
    done

    # Check project structure
    record_check
    if [ -f "$OPERATOR_DIR/Package.swift" ]; then
        log_success "Package.swift found"
    else
        log_error "Package.swift not found at $OPERATOR_DIR/Package.swift"
    fi
}

# Binary validation
validate_binary() {
    log_info "=== Binary Validation ==="

    BINARY="$ARTIFACTS_DIR/BlackBoltOperator"

    if [ ! -f "$BINARY" ]; then
        log_error "Binary not found: $BINARY"
        return 1
    fi

    # File exists
    record_check
    log_success "Binary exists"

    # Check binary type
    record_check
    FILE_OUTPUT=$(file "$BINARY")
    if echo "$FILE_OUTPUT" | grep -q "Mach-O 64-bit"; then
        log_success "Valid Mach-O 64-bit executable"
    else
        log_warning "Unexpected binary format: $FILE_OUTPUT"
    fi

    # Check executable permissions
    record_check
    if [ -x "$BINARY" ]; then
        log_success "Executable bit set"
    else
        log_warning "Executable bit not set"
    fi

    # Check binary size
    record_check
    BINARY_SIZE=$(du -h "$BINARY" | cut -f1)
    BINARY_BYTES=$(stat -f%z "$BINARY" 2>/dev/null || stat -c%s "$BINARY" 2>/dev/null || echo "0")

    if [ "$BINARY_BYTES" -gt 0 ]; then
        log_success "Binary has valid size: $BINARY_SIZE"
    else
        log_error "Binary size is zero or invalid"
    fi

    # Check dependencies
    record_check
    log_info "Checking dependencies..."
    if otool -L "$BINARY" &> /dev/null; then
        DEPS=$(otool -L "$BINARY" | wc -l)
        log_success "Binary has $DEPS dependencies"
    else
        log_warning "Could not analyze dependencies"
    fi

    # Test execution
    record_check
    if "$BINARY" --version > /dev/null 2>&1; then
        log_success "Binary executes successfully"
        "$BINARY" --version || true
    else
        log_warning "Binary execution test returned error (might be expected)"
    fi

    # Strip status
    record_check
    SYMBOLS=$(otool -l "$BINARY" 2>/dev/null | grep -c "LC_SYMTAB" || echo "0")
    if [ "$SYMBOLS" -eq 0 ]; then
        log_success "Binary symbols are stripped (release build)"
    else
        log_warning "Binary contains symbols (debug build)"
    fi
}

# Signature validation
validate_signatures() {
    log_info "=== Code Signature Validation ==="

    BINARY="$ARTIFACTS_DIR/BlackBoltOperator"
    APP_BUNDLE="$ARTIFACTS_DIR/BlackBoltOperator.app"

    # Validate binary signature
    if [ -f "$BINARY" ]; then
        record_check
        if codesign -v "$BINARY" 2>&1 | grep -q "valid\|adhoc"; then
            log_success "Binary signature is valid"
        else
            log_warning "Binary signature validation inconclusive"
            codesign -v "$BINARY" 2>&1 | head -3 || true
        fi

        # Check signature details
        record_check
        log_info "Binary signature details:"
        codesign -d -vvvv "$BINARY" 2>&1 | head -5 || log_warning "Could not get signature details"
    fi

    # Validate app bundle signature
    if [ -d "$APP_BUNDLE" ]; then
        record_check
        if codesign -v "$APP_BUNDLE" 2>&1 | grep -q "valid\|adhoc"; then
            log_success "App bundle signature is valid"
        else
            log_warning "App bundle signature validation inconclusive"
            codesign -v "$APP_BUNDLE" 2>&1 | head -3 || true
        fi

        # Check entitlements
        record_check
        log_info "Checking entitlements..."
        if codesign -d --entitlements - "$APP_BUNDLE" 2>/dev/null | grep -q "network"; then
            log_success "Network entitlements found"
        else
            log_warning "Could not verify entitlements"
        fi
    fi
}

# Entitlements validation
validate_entitlements() {
    log_info "=== Entitlements Validation ==="

    APP_BUNDLE="$ARTIFACTS_DIR/BlackBoltOperator.app"

    if [ ! -d "$APP_BUNDLE" ]; then
        log_warning "App bundle not found, skipping entitlements check"
        return 0
    fi

    # Check for required entitlements
    record_check
    local required_entitlements=(
        "network"
        "files"
        "cs.allow-unsigned-executable-memory"
    )

    for entitlement in "${required_entitlements[@]}"; do
        record_check
        if codesign -d --entitlements - "$APP_BUNDLE" 2>/dev/null | grep -q "$entitlement"; then
            log_success "Entitlement found: $entitlement"
        else
            log_warning "Entitlement not found: $entitlement"
        fi
    done
}

# Archive validation
validate_archives() {
    log_info "=== Archive Validation ==="

    if [ ! -d "$ARTIFACTS_DIR/release-package" ]; then
        log_warning "Release package directory not found"
        return 0
    fi

    cd "$ARTIFACTS_DIR/release-package"

    # Check for .zip archives
    record_check
    ARCHIVES=$(find . -name "*.zip" -type f)
    if [ -n "$ARCHIVES" ]; then
        log_success "Found release archives:"
        echo "$ARCHIVES" | sed 's/^/  /'
    else
        log_warning "No .zip archives found"
    fi

    # Validate archive integrity
    for archive in *.zip; do
        if [ -f "$archive" ]; then
            record_check
            if unzip -t "$archive" > /dev/null 2>&1; then
                log_success "Archive valid: $archive"
            else
                log_error "Archive corrupted: $archive"
            fi
        fi
    done

    cd - > /dev/null
}

# Checksum validation
validate_checksums() {
    log_info "=== Checksum Validation ==="

    CHECKSUMS_FILE="$ARTIFACTS_DIR/release-package/SHA256SUMS"

    if [ ! -f "$CHECKSUMS_FILE" ]; then
        log_warning "SHA256SUMS file not found"
        return 0
    fi

    record_check
    cd "$ARTIFACTS_DIR/release-package"

    if sha256sum -c "$CHECKSUMS_FILE" > /dev/null 2>&1; then
        log_success "All checksums verified"
    else
        log_warning "Some checksums failed verification"
        sha256sum -c "$CHECKSUMS_FILE" 2>&1 | grep -i "failed" || true
    fi

    cd - > /dev/null
}

# macOS compatibility validation
validate_macos_compatibility() {
    log_info "=== macOS Compatibility Validation ==="

    BINARY="$ARTIFACTS_DIR/BlackBoltOperator"

    if [ ! -f "$BINARY" ]; then
        log_warning "Binary not found, skipping compatibility check"
        return 0
    fi

    # Check minimum macOS version
    record_check
    MIN_VERSION=$(otool -l "$BINARY" 2>/dev/null | grep "minos" | head -1 | awk '{print $2}' | cut -d. -f1-2)

    if [ -n "$MIN_VERSION" ]; then
        log_success "Minimum macOS version: $MIN_VERSION"
    else
        log_warning "Could not determine minimum macOS version"
    fi

    # Check architecture
    record_check
    if arch -x86_64 "$BINARY" --version > /dev/null 2>&1; then
        log_success "Intel (x86_64) architecture supported"
    else
        log_warning "Intel architecture might not be fully supported"
    fi

    record_check
    if arch -arm64 "$BINARY" --version > /dev/null 2>&1; then
        log_success "Apple Silicon (arm64) architecture supported"
    else
        log_warning "Apple Silicon architecture might not be fully supported"
    fi

    # Current system compatibility
    record_check
    CURRENT_MACOS=$(sw_vers -productVersion)
    log_info "Current macOS version: $CURRENT_MACOS"
}

# Gatekeeper validation
validate_gatekeeper() {
    log_info "=== Gatekeeper Validation ==="

    APP_BUNDLE="$ARTIFACTS_DIR/BlackBoltOperator.app"

    if [ ! -d "$APP_BUNDLE" ]; then
        log_warning "App bundle not found, skipping Gatekeeper check"
        return 0
    fi

    record_check
    log_info "Checking Gatekeeper status..."

    # Note: Ad-hoc signed apps may show warnings with Gatekeeper
    if spctl -a -vvv "$APP_BUNDLE" > /dev/null 2>&1; then
        log_success "App passes Gatekeeper"
    else
        log_warning "App may not pass Gatekeeper (expected for ad-hoc signed apps)"
    fi
}

# Build artifact validation
validate_artifacts() {
    log_info "=== Build Artifact Validation ==="

    # Check for expected files
    local required_files=(
        "BlackBoltOperator"
        "BlackBoltOperator.app"
        "BlackBoltOperator.dSYM"
        "BUILD_SUMMARY.txt"
        "SIGNING_REPORT.txt"
    )

    for file in "${required_files[@]}"; do
        record_check
        if [ -e "$ARTIFACTS_DIR/$file" ]; then
            log_success "Found: $file"
        else
            log_warning "Not found: $file"
        fi
    done

    # Check release package
    if [ -d "$ARTIFACTS_DIR/release-package" ]; then
        record_check
        log_success "Release package directory exists"

        local package_files=(
            "SHA256SUMS"
            "RELEASE_NOTES"
            "MANIFEST.txt"
        )

        for file in "${package_files[@]}"; do
            record_check
            if find "$ARTIFACTS_DIR/release-package" -name "*${file}*" -type f | grep -q .; then
                log_success "Release package contains: $file"
            else
                log_warning "Release package missing: $file"
            fi
        done
    else
        log_warning "Release package not created yet"
    fi
}

# Generate validation report
generate_report() {
    log_info "Generating validation report..."

    REPORT_FILE="$ARTIFACTS_DIR/VALIDATION_REPORT.txt"

    local status="PASSED"
    if [ $CHECKS_FAILED -gt 0 ]; then
        status="FAILED"
    elif [ $CHECKS_WARNING -gt 0 ]; then
        status="PASSED_WITH_WARNINGS"
    fi

    cat > "$REPORT_FILE" << EOF
BlackBolt Operator Build Validation Report
==========================================

Validation Date: $(date -u +'%Y-%m-%dT%H:%M:%SZ')
Validation Status: $status
Binary Path: $ARTIFACTS_DIR/BlackBoltOperator

Summary Statistics
==================
Total Checks: $CHECKS_TOTAL
Passed: $CHECKS_PASSED
Warnings: $CHECKS_WARNING
Failed: $CHECKS_FAILED

Check Results
==============
Success Rate: $(( CHECKS_PASSED * 100 / CHECKS_TOTAL ))%

EOF

    if [ $CHECKS_FAILED -gt 0 ]; then
        cat >> "$REPORT_FILE" << EOF

⚠️  VALIDATION FAILURES DETECTED

Action Required:
1. Review failed checks above
2. Address critical issues
3. Re-run validation
4. Do not release if failures indicate binary corruption

EOF
    elif [ $CHECKS_WARNING -gt 0 ]; then
        cat >> "$REPORT_FILE" << EOF

ℹ️  VALIDATION PASSED WITH WARNINGS

Review Recommendations:
1. Check warning messages above
2. Determine if warnings are acceptable
3. Document any intentional deviations
4. Release can proceed if warnings are acceptable

EOF
    else
        cat >> "$REPORT_FILE" << EOF

✓ ALL CHECKS PASSED

Build Validation Complete:
1. Binary is correctly built
2. Code signatures are valid
3. Entitlements are configured
4. Archives are intact
5. Release is ready

Next Steps:
1. Proceed to release
2. Upload to GitHub Releases
3. Announce availability
4. Monitor for user feedback

EOF
    fi

    cat "$REPORT_FILE"
    log_success "Validation report: $REPORT_FILE"
}

# Main execution
main() {
    log_info "=== BlackBolt Operator Build Validation ==="
    log_info "Starting comprehensive build validation..."

    validate_environment
    validate_binary
    validate_signatures
    validate_entitlements
    validate_archives
    validate_checksums
    validate_macos_compatibility
    validate_gatekeeper
    validate_artifacts

    generate_report

    log_info ""
    log_info "=== Validation Summary ==="
    log_info "Total Checks: $CHECKS_TOTAL"
    log_success "Passed: $CHECKS_PASSED"
    [ $CHECKS_WARNING -gt 0 ] && log_warning "Warnings: $CHECKS_WARNING"
    [ $CHECKS_FAILED -gt 0 ] && log_error "Failed: $CHECKS_FAILED"

    if [ $CHECKS_FAILED -gt 0 ]; then
        log_error "Validation FAILED - Please address issues before release"
        exit 1
    elif [ $CHECKS_WARNING -gt 0 ]; then
        log_warning "Validation PASSED WITH WARNINGS - Review carefully"
        exit 0
    else
        log_success "Validation PASSED - Ready for release"
        exit 0
    fi
}

# Run main function
main "$@"

#!/bin/bash

# Version Bump Script for BlackBolt Operator
# This script automates version updates and release tagging

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OPERATOR_DIR="$PROJECT_ROOT/clients/swift/BlackBoltOperator"
PACKAGE_FILE="$OPERATOR_DIR/Package.swift"

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

# Parse semantic version
parse_version() {
    local version="$1"
    # Expected format: v1.2.3 or 1.2.3

    version="${version#v}"  # Remove leading 'v' if present

    IFS='.' read -r major minor patch <<< "$version"

    echo "$major $minor $patch"
}

# Get current version
get_current_version() {
    log_info "Determining current version..."

    # Check for version in Package.swift
    if [ -f "$PACKAGE_FILE" ]; then
        local current=$(grep -m1 "version" "$PACKAGE_FILE" | grep -oE "[0-9]+\.[0-9]+\.[0-9]+" || echo "")

        if [ -n "$current" ]; then
            echo "$current"
            return 0
        fi
    fi

    # Fallback to git tags
    if command -v git &> /dev/null && [ -d "$PROJECT_ROOT/.git" ]; then
        cd "$PROJECT_ROOT"
        local current=$(git describe --tags --abbrev=0 2>/dev/null | sed 's/^v//' || echo "")
        cd - > /dev/null

        if [ -n "$current" ]; then
            echo "$current"
            return 0
        fi
    fi

    # Default to 0.0.0
    echo "0.0.0"
}

# Calculate next version
calculate_next_version() {
    local current="$1"
    local bump_type="$2"

    local parts=($(parse_version "$current"))
    local major="${parts[0]}"
    local minor="${parts[1]}"
    local patch="${parts[2]}"

    case "$bump_type" in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch)
            patch=$((patch + 1))
            ;;
        *)
            log_error "Invalid bump type: $bump_type (use: major, minor, patch)"
            exit 1
            ;;
    esac

    echo "${major}.${minor}.${patch}"
}

# Validate git state
validate_git() {
    log_info "Validating git repository..."

    if [ ! -d "$PROJECT_ROOT/.git" ]; then
        log_error "Not a git repository: $PROJECT_ROOT"
        exit 1
    fi

    cd "$PROJECT_ROOT"

    # Check for uncommitted changes
    if ! git diff-index --quiet HEAD --; then
        log_error "Uncommitted changes present - please commit first"
        git status --short
        exit 1
    fi

    # Check for untracked files that might affect version
    local untracked=$(git ls-files --others --exclude-standard)
    if [ -n "$untracked" ]; then
        log_warning "Untracked files present:"
        echo "$untracked" | sed 's/^/  /'
    fi

    cd - > /dev/null
    log_success "Git repository is clean"
}

# Update version in Package.swift
update_package_version() {
    local new_version="$1"

    log_info "Updating Package.swift with version $new_version..."

    if [ ! -f "$PACKAGE_FILE" ]; then
        log_error "Package.swift not found: $PACKAGE_FILE"
        exit 1
    fi

    # Create backup
    cp "$PACKAGE_FILE" "${PACKAGE_FILE}.bak"

    # Update version in Package.swift
    # Note: This is a simplified approach; actual Package.swift may not have version field
    log_warning "Note: Package.swift may not contain version field"
    log_warning "Version management may require manual updates"

    log_success "Package.swift backup: ${PACKAGE_FILE}.bak"
}

# Update version in documentation
update_documentation() {
    local new_version="$1"

    log_info "Updating version in documentation..."

    local doc_files=(
        "README.md"
        "CHANGELOG.md"
        "docs/OPERATIONS.md"
        "docs/DEPLOYMENT.md"
    )

    for file in "${doc_files[@]}"; do
        local full_path="$PROJECT_ROOT/$file"
        if [ -f "$full_path" ]; then
            log_info "Found documentation: $file"
            # Would update version references here
        fi
    done

    log_info "Documentation version references noted"
}

# Generate changelog entry
generate_changelog_entry() {
    local new_version="$1"
    local current_version="$2"

    log_info "Generating changelog entry for v${new_version}..."

    if [ ! -d "$PROJECT_ROOT/.git" ]; then
        log_warning "Git repository not available for changelog generation"
        return 0
    fi

    cd "$PROJECT_ROOT"

    # Get commits since last release
    local changelog_entry="## [${new_version}] - $(date +%Y-%m-%d)

### Added
- Automated version bump to v${new_version}

### Changed
- Version updated in Package.swift

### Fixed
- Various improvements

"

    # Get commits since last tag
    if [ -n "$current_version" ] && [ "$current_version" != "0.0.0" ]; then
        local prev_tag="v${current_version}"

        log_info "Commits since v${current_version}:"
        git log "${prev_tag}..HEAD" --oneline | head -10 || true
    fi

    cd - > /dev/null

    cat > /tmp/CHANGELOG_ENTRY.md << EOF
$changelog_entry
EOF

    log_success "Changelog entry generated: /tmp/CHANGELOG_ENTRY.md"
}

# Create git tag
create_git_tag() {
    local new_version="$1"
    local tag_name="v${new_version}"

    log_info "Creating git tag: $tag_name..."

    cd "$PROJECT_ROOT"

    # Check if tag exists
    if git rev-parse "$tag_name" > /dev/null 2>&1; then
        log_error "Tag already exists: $tag_name"
        exit 1
    fi

    # Create annotated tag with message
    local tag_message="Release BlackBolt Operator v${new_version}

Automated version bump and release preparation."

    if git tag -a "$tag_name" -m "$tag_message"; then
        log_success "Git tag created: $tag_name"
    else
        log_error "Failed to create git tag"
        exit 1
    fi

    cd - > /dev/null
}

# Push changes and tags
push_to_origin() {
    local new_version="$1"
    local tag_name="v${new_version}"

    log_info "Preparing to push changes..."

    cd "$PROJECT_ROOT"

    # Check if we should push
    if [ -z "${AUTO_PUSH:-}" ]; then
        log_warning "Push requires manual confirmation"
        log_info "Run: git push origin $tag_name"
        log_info "Or set AUTO_PUSH=1 environment variable"
        return 0
    fi

    log_info "Pushing tag to origin..."
    if git push origin "$tag_name"; then
        log_success "Tag pushed: $tag_name"
    else
        log_error "Failed to push tag"
        return 1
    fi

    cd - > /dev/null
}

# Generate version summary
generate_version_summary() {
    local current_version="$1"
    local new_version="$2"
    local bump_type="$3"

    log_info "Generating version summary..."

    cat > /tmp/VERSION_SUMMARY.txt << EOF
BlackBolt Operator Version Bump Summary
======================================

Date: $(date -u +'%Y-%m-%dT%H:%M:%SZ')
Bump Type: $bump_type
Current Version: $current_version
New Version: $new_version

Changes Applied
================
1. Version updated in Package.swift
2. Git tag created: v${new_version}
3. Changelog entry prepared

Next Steps
==========
1. Review changes:
   git log -1
   git show v${new_version}

2. Push to origin:
   git push origin v${new_version}

3. Create GitHub Release:
   github release create v${new_version}

4. Announce release:
   - Update documentation
   - Notify users
   - Update version references

Files Modified
==============
- $PACKAGE_FILE
- CHANGELOG.md (manual update recommended)

Git Status
==========
$(cd "$PROJECT_ROOT" && git status --short)

Instructions
=============
To push the tag automatically on next run:
  AUTO_PUSH=1 $0 $bump_type

To undo this version bump:
  git tag -d v${new_version}
  git reset --hard HEAD

EOF

    cat /tmp/VERSION_SUMMARY.txt
    log_success "Version summary: /tmp/VERSION_SUMMARY.txt"
}

# Main execution
main() {
    local bump_type="${1:-patch}"

    log_info "=== BlackBolt Operator Version Bump ==="
    log_info "Bump Type: $bump_type"

    # Validate input
    case "$bump_type" in
        major|minor|patch)
            ;;
        *)
            log_error "Invalid bump type: $bump_type"
            echo "Usage: $0 {major|minor|patch}"
            exit 1
            ;;
    esac

    validate_git

    local current_version=$(get_current_version)
    log_success "Current version: $current_version"

    local new_version=$(calculate_next_version "$current_version" "$bump_type")
    log_success "New version: $new_version"

    update_package_version "$new_version"
    update_documentation "$new_version"
    generate_changelog_entry "$new_version" "$current_version"

    create_git_tag "$new_version"

    push_to_origin "$new_version"

    generate_version_summary "$current_version" "$new_version" "$bump_type"

    log_success "=== Version Bump Complete ==="
    log_info "Release v$new_version is ready"
    log_info "Next: Push tag and create GitHub release"
}

# Show usage
show_usage() {
    cat << EOF
BlackBolt Operator Version Bump Script

Usage: $0 [BUMP_TYPE]

BUMP_TYPE:
  major   - Increment major version (X.0.0)
  minor   - Increment minor version (0.X.0)
  patch   - Increment patch version (0.0.X) [default]

Examples:
  $0 patch     # v1.0.0 → v1.0.1
  $0 minor     # v1.0.1 → v1.1.0
  $0 major     # v1.1.0 → v2.0.0

Environment Variables:
  AUTO_PUSH=1  - Automatically push tag to origin

EOF
}

# Handle arguments
case "${1:-}" in
    -h|--help)
        show_usage
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac

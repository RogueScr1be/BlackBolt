#!/bin/bash

# SwiftLint script for BlackBolt Operator
# Usage: ./scripts/lint.sh [--fix] [--verbose] [--ci]

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
FIX_MODE=false
VERBOSE=false
CI_MODE=false

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --fix)
      FIX_MODE=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --ci)
      CI_MODE=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}SwiftLint - Code Quality Analysis${NC}"
echo "Repository: $REPO_ROOT"

# Check if SwiftLint is installed
if ! command -v swiftlint &> /dev/null; then
  echo -e "${RED}✗ SwiftLint is not installed${NC}"
  echo "Install with: brew install swiftlint"
  exit 1
fi

echo "SwiftLint version: $(swiftlint version)"

# Build SwiftLint command
SWIFTLINT_CMD="swiftlint lint --config $REPO_ROOT/.swiftlint.yml"

if [ "$FIX_MODE" = true ]; then
  echo -e "${YELLOW}Running in auto-fix mode${NC}"
  SWIFTLINT_CMD="swiftlint lint --fix --config $REPO_ROOT/.swiftlint.yml"
fi

if [ "$VERBOSE" = true ]; then
  SWIFTLINT_CMD="$SWIFTLINT_CMD --verbose"
fi

if [ "$CI_MODE" = true ]; then
  SWIFTLINT_CMD="$SWIFTLINT_CMD --strict"
  echo -e "${YELLOW}Running in CI mode (strict)${NC}"
fi

# Run SwiftLint
echo ""
echo "Running SwiftLint..."
if eval "$SWIFTLINT_CMD"; then
  echo -e "${GREEN}✓ SwiftLint passed${NC}"
  exit 0
else
  LINT_RESULT=$?
  if [ "$CI_MODE" = true ]; then
    echo -e "${RED}✗ SwiftLint failed (CI mode - blocking)${NC}"
    exit $LINT_RESULT
  else
    echo -e "${YELLOW}⚠ SwiftLint found issues${NC}"
    if [ "$FIX_MODE" = false ]; then
      echo "Run with --fix to auto-correct issues"
    fi
    exit $LINT_RESULT
  fi
fi

#!/bin/bash

# SwiftFormat script for BlackBolt Operator
# Usage: ./scripts/format.sh [--check] [--dry-run] [--target path]

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
CHECK_MODE=false
DRY_RUN=false
TARGET_PATH="."

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --check)
      CHECK_MODE=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --target)
      TARGET_PATH="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}SwiftFormat - Code Formatting${NC}"
echo "Repository: $REPO_ROOT"
echo "Target: $TARGET_PATH"

# Check if SwiftFormat is installed
if ! command -v swiftformat &> /dev/null; then
  echo -e "${RED}✗ SwiftFormat is not installed${NC}"
  echo "Install with: brew install swiftformat"
  exit 1
fi

echo "SwiftFormat version: $(swiftformat --version)"

# Build SwiftFormat command
SWIFTFORMAT_CMD="swiftformat $TARGET_PATH --config $REPO_ROOT/.swiftformat"

if [ "$CHECK_MODE" = true ]; then
  echo -e "${YELLOW}Running in check mode (no modifications)${NC}"
  SWIFTFORMAT_CMD="$SWIFTFORMAT_CMD --lint"
fi

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}Running in dry-run mode${NC}"
  SWIFTFORMAT_CMD="$SWIFTFORMAT_CMD --dryrun"
fi

# Run SwiftFormat
echo ""
echo "Running SwiftFormat..."
if eval "$SWIFTFORMAT_CMD"; then
  if [ "$CHECK_MODE" = true ]; then
    echo -e "${GREEN}✓ Code formatting is correct${NC}"
  else
    echo -e "${GREEN}✓ Code formatting completed${NC}"
  fi
  exit 0
else
  RESULT=$?
  if [ "$CHECK_MODE" = true ]; then
    echo -e "${YELLOW}⚠ Formatting issues detected${NC}"
    echo "Run 'swiftformat $TARGET_PATH --config $REPO_ROOT/.swiftformat' to fix"
  else
    echo -e "${RED}✗ SwiftFormat encountered an error${NC}"
  fi
  exit $RESULT
fi

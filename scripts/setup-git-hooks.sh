#!/bin/bash

# Git hooks setup script for BlackBolt Operator
# Installs and configures git hooks for code quality

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.githooks"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Setting up Git Hooks${NC}"
echo "Repository: $REPO_ROOT"

# Check if .githooks directory exists
if [ ! -d "$HOOKS_DIR" ]; then
  echo -e "${RED}✗ .githooks directory not found at $HOOKS_DIR${NC}"
  exit 1
fi

# Configure git to use custom hooks directory
echo "Configuring git to use .githooks directory..."
git config core.hooksPath "$HOOKS_DIR"

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Git configured to use custom hooks${NC}"
else
  echo -e "${RED}✗ Failed to configure git hooks path${NC}"
  exit 1
fi

# Verify hook files exist and are executable
HOOKS=("pre-commit" "commit-msg" "pre-push")

for hook in "${HOOKS[@]}"; do
  HOOK_FILE="$HOOKS_DIR/$hook"
  if [ ! -f "$HOOK_FILE" ]; then
    echo -e "${YELLOW}⚠ Hook file not found: $HOOK_FILE${NC}"
  elif [ ! -x "$HOOK_FILE" ]; then
    echo -e "${YELLOW}Making hook executable: $hook${NC}"
    chmod +x "$HOOK_FILE"
  else
    echo -e "${GREEN}✓ Hook verified: $hook${NC}"
  fi
done

# Check for pre-commit framework
echo ""
echo "Checking for pre-commit framework..."
if command -v pre-commit &> /dev/null; then
  echo -e "${GREEN}✓ pre-commit framework installed${NC}"
  echo "Installing pre-commit hooks..."
  cd "$REPO_ROOT"
  pre-commit install
  echo -e "${GREEN}✓ pre-commit hooks installed${NC}"
else
  echo -e "${YELLOW}⚠ pre-commit framework not installed${NC}"
  echo "Install with: pip install pre-commit"
  echo "Then run: pre-commit install"
fi

# Verify hook installation
echo ""
echo "Verifying hook installation..."
if git config core.hooksPath > /dev/null; then
  HOOKS_PATH=$(git config core.hooksPath)
  echo -e "${GREEN}✓ Git hooks path configured: $HOOKS_PATH${NC}"
else
  echo -e "${RED}✗ Git hooks path not configured${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}✓ Git hooks setup completed${NC}"
echo ""
echo "Documentation:"
echo "  - Bypass hooks with: git commit --no-verify"
echo "  - Bypass pre-push with: git push --no-verify"
echo "  - View hooks: ls -la $HOOKS_DIR"
echo ""
echo "Available hooks:"
echo "  1. pre-commit: Validates Swift code (lint & format)"
echo "  2. commit-msg: Validates commit message format"
echo "  3. pre-push: Checks for uncommitted changes & runs tests"

exit 0
